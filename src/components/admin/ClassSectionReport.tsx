import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileDown, FileSpreadsheet, Printer, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryLabel, ALL_CATEGORIES } from '@/constants/schoolConfig';
import { isWorkingDayForSchool } from '@/utils/workingDays';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StudentRow {
  name: string;
  employeeId: string;
  present: number;
  late: number;
  absent: number;
  /** dateKey (toDateString) -> P / L / A for the traditional register */
  days: Record<string, 'P' | 'L' | 'A'>;
}

interface ReportData {
  students: StudentRow[];
  totalWorkDays: number;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  overallRate: string;
  startDate: Date;
  endDate: Date;
  workingDays: Date[];
}

interface ClassSectionReportProps {
  allowedCategories?: string[];
}

const ClassSectionReport: React.FC<ClassSectionReportProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CATEGORIES;
  const [selectedCategory, setSelectedCategory] = useState<string>(
    allowedCategories && allowedCategories.length > 0 ? allowedCategories[0] : ''
  );
  const [busy, setBusy] = useState<'pdf' | 'csv' | 'print' | null>(null);

  const buildReport = async (): Promise<ReportData | null> => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const [registeredRes, attendanceRes, gateRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered'),
      supabase
        .from('attendance_records')
        .select('id, user_id, device_info, status, timestamp, category')
        .gte('timestamp', thirtyDaysAgo.toISOString())
        .lte('timestamp', today.toISOString())
        .in('status', ['present', 'late', 'unauthorized'])
        .eq('category', selectedCategory),
      supabase
        .from('gate_entries')
        .select('student_id, student_name, entry_time')
        .gte('entry_time', thirtyDaysAgo.toISOString())
        .lte('entry_time', today.toISOString())
        .eq('is_recognized', true),
    ]);

    const seen = new Set<string>();
    const registered = (registeredRes.data || []).filter((r: any) => (r.category || '') === selectedCategory);

    if (!registered.length) {
      toast({
        title: 'No students',
        description: `No students found in ${getCategoryLabel(selectedCategory)}.`,
        variant: 'destructive',
      });
      return null;
    }

    const workingDays: Date[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (isWorkingDayForSchool(d)) workingDays.push(d);
    }
    const totalWorkDays = workingDays.length;

    const studentMap = new Map<string, StudentRow>();
    registered.forEach((record: any) => {
      const di = record.device_info || {};
      const metadata = di.metadata || {};
      const name = metadata.name || di.name || 'Unknown';
      const employeeId = metadata.employee_id || di.employee_id || 'N/A';
      const key = record.user_id || employeeId || record.id;
      if (!name || name === 'Unknown' || seen.has(key)) return;
      seen.add(key);
      studentMap.set(key, { name, employeeId, present: 0, late: 0, absent: totalWorkDays, days: {} });
    });

    const attendanceByStudent = new Map<string, Map<string, string>>();
    (attendanceRes.data || []).forEach((record: any) => {
      const di = record.device_info || {};
      const employeeId = di?.metadata?.employee_id;
      const recordName = di?.metadata?.name;
      const userId = record.user_id;

      let matched: string | null = null;
      for (const [key, student] of studentMap) {
        if (userId && key === userId) { matched = key; break; }
        if (employeeId && student.employeeId === employeeId) { matched = key; break; }
        if (recordName && student.name.toLowerCase() === recordName.toLowerCase()) { matched = key; break; }
      }
      if (matched) {
        if (!attendanceByStudent.has(matched)) attendanceByStudent.set(matched, new Map());
        const dateKey = new Date(record.timestamp).toDateString();
        const existing = attendanceByStudent.get(matched)!.get(dateKey);
        if (!existing || (existing === 'late' && record.status === 'present')) {
          attendanceByStudent.get(matched)!.set(dateKey, record.status === 'unauthorized' ? 'present' : record.status!);
        }
      }
    });

    (gateRes.data || []).forEach((gate: any) => {
      const dateKey = new Date(gate.entry_time).toDateString();
      const matched = Array.from(studentMap.keys()).find(k => k === gate.student_id);
      if (matched) {
        if (!attendanceByStudent.has(matched)) attendanceByStudent.set(matched, new Map());
        if (!attendanceByStudent.get(matched)!.has(dateKey)) {
          attendanceByStudent.get(matched)!.set(dateKey, 'present');
        }
      }
    });

    workingDays.sort((a, b) => a.getTime() - b.getTime());

    for (const [key, student] of studentMap) {
      const dayMap = attendanceByStudent.get(key);
      let present = 0, late = 0;
      workingDays.forEach(d => {
        const dateKey = d.toDateString();
        const s = dayMap?.get(dateKey);
        if (s === 'present') { present++; student.days[dateKey] = 'P'; }
        else if (s === 'late') { late++; student.days[dateKey] = 'L'; }
        else { student.days[dateKey] = 'A'; }
      });
      student.present = present;
      student.late = late;
      student.absent = totalWorkDays - present - late;
    }

    const students = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const totalPresent = students.reduce((s, st) => s + st.present, 0);
    const totalLate = students.reduce((s, st) => s + st.late, 0);
    const totalAbsent = students.reduce((s, st) => s + st.absent, 0);
    const overallRate = students.length && totalWorkDays
      ? (((totalPresent + totalLate) / (students.length * totalWorkDays)) * 100).toFixed(1)
      : '0.0';

    return { students, totalWorkDays, totalPresent, totalLate, totalAbsent, overallRate, startDate: thirtyDaysAgo, endDate: today, workingDays };
  };

  const guardCategory = () => {
    if (!selectedCategory) {
      toast({ title: 'Select a class', description: 'Please select a class & section first.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const safeName = () => getCategoryLabel(selectedCategory).replace(/[^a-z0-9]+/gi, '_');

  // ── CSV ───────────────────────────────────────────────────────────────────
  const downloadCSV = async () => {
    if (!guardCategory()) return;
    setBusy('csv');
    try {
      const r = await buildReport();
      if (!r) return;

      const esc = (v: string | number) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const lines: string[] = [];
      lines.push(`Class,${esc(getCategoryLabel(selectedCategory))}`);
      lines.push(`Period,${esc(fmt(r.startDate))} to ${esc(fmt(r.endDate))}`);
      lines.push(`Working Days,${r.totalWorkDays}`);
      lines.push(`Total Students,${r.students.length}`);
      lines.push(`Total Present,${r.totalPresent}`);
      lines.push(`Total Late,${r.totalLate}`);
      lines.push(`Total Absent,${r.totalAbsent}`);
      lines.push(`Overall Attendance Rate,${r.overallRate}%`);
      lines.push('');
      lines.push(['#', 'Name', 'Employee ID', 'Present', 'Late', 'Absent', 'Rate %'].join(','));

      r.students.forEach((s, i) => {
        const rate = r.totalWorkDays ? (((s.present + s.late) / r.totalWorkDays) * 100).toFixed(1) : '0.0';
        lines.push([i + 1, esc(s.name), esc(s.employeeId), s.present, s.late, s.absent, rate].join(','));
      });

      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName()}_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV downloaded', description: `${r.students.length} students exported.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: 'Could not generate CSV.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // ── PDF ───────────────────────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (!guardCategory()) return;
    setBusy('pdf');
    try {
      const r = await buildReport();
      if (!r) return;

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header band
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 90, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(getCategoryLabel(selectedCategory), 40, 40);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(203, 213, 225);
      doc.text('Class Attendance Report — Last 30 Working Days', 40, 60);
      doc.setFontSize(9);
      doc.text(`${fmt(r.startDate)} — ${fmt(r.endDate)}`, 40, 76);
      doc.setFontSize(9);
      doc.text(`Generated ${fmt(new Date())}`, pageWidth - 40, 76, { align: 'right' });

      // Stats row
      const statsY = 115;
      const stats = [
        ['Students', String(r.students.length)],
        ['Working Days', String(r.totalWorkDays)],
        ['Avg Present', r.students.length ? (r.totalPresent / r.students.length).toFixed(1) : '0'],
        ['Avg Late', r.students.length ? (r.totalLate / r.students.length).toFixed(1) : '0'],
        ['Overall Rate', `${r.overallRate}%`],
      ];
      const boxW = (pageWidth - 80 - (stats.length - 1) * 10) / stats.length;
      stats.forEach(([label, val], i) => {
        const x = 40 + i * (boxW + 10);
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, statsY, boxW, 60, 6, 6, 'FD');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(label.toUpperCase(), x + boxW / 2, statsY + 18, { align: 'center' });
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(16);
        doc.text(val, x + boxW / 2, statsY + 44, { align: 'center' });
      });

      // Student table
      autoTable(doc, {
        startY: statsY + 80,
        head: [['#', 'Student', 'Employee ID', 'Present', 'Late', 'Absent', 'Rate']],
        body: r.students.map((s, i) => {
          const rate = r.totalWorkDays ? (((s.present + s.late) / r.totalWorkDays) * 100).toFixed(1) : '0.0';
          return [i + 1, s.name, s.employeeId, s.present, s.late, s.absent, `${rate}%`];
        }),
        styles: { fontSize: 9, cellPadding: 6 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 30 },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          const pageNum = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Presence System · ${getCategoryLabel(selectedCategory)} · Page ${pageNum}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 20,
            { align: 'center' },
          );
        },
      });

      doc.save(`${safeName()}_attendance_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast({ title: 'PDF downloaded', description: `${r.students.length} students exported.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: 'Could not generate PDF.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // ── Traditional printable register (dates horizontal, names vertical) ─────
  const printRegister = async () => {
    if (!guardCategory()) return;
    setBusy('print');
    try {
      const r = await buildReport();
      if (!r) return;

      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('ATTENDANCE REGISTER', pageWidth / 2, 34, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        `${getCategoryLabel(selectedCategory)}   |   ${fmt(r.startDate)} - ${fmt(r.endDate)}   |   Working days: ${r.totalWorkDays}`,
        pageWidth / 2,
        52,
        { align: 'center' },
      );
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('P = Present    L = Late    A = Absent', pageWidth / 2, 66, { align: 'center' });

      const dayLabel = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

      // Split days into chunks so every column stays readable on A4 landscape.
      const CHUNK = 20;
      const chunks: Date[][] = [];
      for (let i = 0; i < r.workingDays.length; i += CHUNK) {
        chunks.push(r.workingDays.slice(i, i + CHUNK));
      }
      if (chunks.length === 0) chunks.push([]);

      let cursorY = 84;
      chunks.forEach((days, chunkIndex) => {
        const head = [['#', 'Student Name', ...days.map(dayLabel), 'P', 'L', 'A']];
        const body = r.students.map((s, i) => [
          i + 1,
          s.name,
          ...days.map((d) => s.days[d.toDateString()] || 'A'),
          s.present,
          s.late,
          s.absent,
        ]);

        const dayCols: Record<number, any> = {};
        days.forEach((_, i) => {
          dayCols[i + 2] = { halign: 'center', cellWidth: 22 };
        });

        autoTable(doc, {
          startY: chunkIndex === 0 ? cursorY : 40,
          head,
          body,
          theme: 'grid',
          styles: { fontSize: 7.5, cellPadding: 3, lineColor: [148, 163, 184], lineWidth: 0.4, textColor: [15, 23, 42] },
          headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center', fontSize: 7 },
          columnStyles: {
            0: { halign: 'center', cellWidth: 22 },
            1: { cellWidth: 130, fontStyle: 'bold' },
            ...dayCols,
            [days.length + 2]: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
            [days.length + 3]: { halign: 'center', cellWidth: 24 },
            [days.length + 4]: { halign: 'center', cellWidth: 24 },
          },
          margin: { left: 24, right: 24, top: 40 },
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            const raw = String(data.cell.raw ?? '');
            if (data.column.index >= 2 && data.column.index < days.length + 2) {
              if (raw === 'A') data.cell.styles.textColor = [190, 18, 60];
              else if (raw === 'L') data.cell.styles.textColor = [180, 83, 9];
              else data.cell.styles.textColor = [21, 128, 61];
              data.cell.styles.fontStyle = 'bold';
            }
          },
          didDrawPage: () => {
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(
              `Presence System · ${getCategoryLabel(selectedCategory)} · Signature of Class Teacher: ______________`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 16,
              { align: 'center' },
            );
          },
        });

        if (chunkIndex < chunks.length - 1) doc.addPage('a4', 'landscape');
      });

      // Summary footer table
      doc.addPage('a4', 'landscape');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('SUMMARY', pageWidth / 2, 36, { align: 'center' });
      autoTable(doc, {
        startY: 52,
        theme: 'grid',
        head: [['#', 'Student Name', 'ID', 'Present', 'Late', 'Absent', 'Rate %']],
        body: r.students.map((s, i) => [
          i + 1,
          s.name,
          s.employeeId,
          s.present,
          s.late,
          s.absent,
          r.totalWorkDays ? (((s.present + s.late) / r.totalWorkDays) * 100).toFixed(1) : '0.0',
        ]),
        styles: { fontSize: 8.5, cellPadding: 4, lineColor: [148, 163, 184], lineWidth: 0.4 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
        margin: { left: 24, right: 24 },
      });

      const blobUrl = doc.output('bloburl');
      const printWindow = window.open(blobUrl as unknown as string, '_blank');
      if (!printWindow) {
        doc.save(`${safeName()}_register_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
      toast({ title: 'Register ready', description: `${r.students.length} students × ${r.totalWorkDays} days.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Print failed', description: 'Could not generate the register.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="bg-card border-border shadow-lg">
      <CardHeader className="pb-4 border-b border-border bg-gradient-to-r from-indigo-600 to-violet-600">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span>Class-wise Report</span>
            <p className="text-sm font-normal text-white/70">Export attendance stats by class & section</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div>
          <Label className="mb-2 block">Select Class & Section</Label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Choose class-section..." />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(cat => (
                <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            onClick={downloadPDF}
            disabled={!!busy || !selectedCategory}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700"
          >
            {busy === 'pdf' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF…</>
            ) : (
              <><FileDown className="w-4 h-4 mr-2" /> Download PDF</>
            )}
          </Button>

          <Button
            onClick={downloadCSV}
            disabled={!!busy || !selectedCategory}
            variant="outline"
            className="w-full"
          >
            {busy === 'csv' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating CSV…</>
            ) : (
              <><FileSpreadsheet className="w-4 h-4 mr-2" /> Download CSV</>
            )}
          </Button>
        </div>

        <Button
          onClick={printRegister}
          disabled={!!busy || !selectedCategory}
          variant="secondary"
          className="w-full"
        >
          {busy === 'print' ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Building register…</>
          ) : (
            <><Printer className="w-4 h-4 mr-2" /> Print Register (P / A grid)</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Printer className="w-3 h-3" />
          Register prints dates across the top and student names down the side with P / L / A per day, plus a summary page. CSV opens in Excel/Sheets.
        </p>
      </CardContent>
    </Card>
  );
};

export default ClassSectionReport;
