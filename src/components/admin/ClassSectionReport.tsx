import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileDown, FileSpreadsheet, Printer, Users, Calendar as CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getCategoryLabel, ALL_CATEGORIES } from '@/constants/schoolConfig';
import { isWorkingDayForSchool } from '@/utils/workingDays';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, subDays, startOfMonth, startOfDay, endOfDay } from 'date-fns';

interface StudentRow {
  name: string;
  employeeId: string;
  category: string;
  present: number;
  late: number;
  absent: number;
  /** dateKey (yyyy-MM-dd) -> P / L / A for the traditional register */
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

const normalizeCategory = (cat: string) => {
  return (cat || '')
    .toLowerCase()
    .replace(/class|grade|section|sec|th|st|nd|rd/g, '')
    .replace(/[\s\-_]/g, '');
};

const ClassSectionReport: React.FC<ClassSectionReportProps> = ({ allowedCategories }) => {
  const { toast } = useToast();
  const categoryOptions = allowedCategories && allowedCategories.length > 0 ? allowedCategories : ALL_CATEGORIES;
  const [selectedCategory, setSelectedCategory] = useState<string>(
    allowedCategories && allowedCategories.length > 0 ? allowedCategories[0] : (categoryOptions[0] || 'all')
  );
  const [dateRangeOption, setDateRangeOption] = useState<'today' | '7days' | '30days' | 'month'>('30days');
  const [busy, setBusy] = useState<'pdf' | 'csv' | 'print' | null>(null);

  const getDateRange = () => {
    const today = new Date();
    switch (dateRangeOption) {
      case 'today':
        return { start: startOfDay(today), end: endOfDay(today) };
      case '7days':
        return { start: startOfDay(subDays(today, 7)), end: endOfDay(today) };
      case 'month':
        return { start: startOfMonth(today), end: endOfDay(today) };
      case '30days':
      default:
        return { start: startOfDay(subDays(today, 30)), end: endOfDay(today) };
    }
  };

  const buildReport = async (): Promise<ReportData | null> => {
    const { start, end } = getDateRange();
    const isAllClasses = selectedCategory === 'all' || !selectedCategory;
    const targetNorm = normalizeCategory(selectedCategory);

    // Fetch registrations, attendance records, and gate entries in parallel
    const [registeredRes, attendanceRes, gateRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered'),
      supabase
        .from('attendance_records')
        .select('id, user_id, device_info, status, timestamp, category')
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .in('status', ['present', 'late', 'unauthorized']),
      supabase
        .from('gate_entries')
        .select('student_id, student_name, entry_time')
        .gte('entry_time', start.toISOString())
        .lte('entry_time', end.toISOString())
        .eq('is_recognized', true),
    ]);

    const seen = new Set<string>();
    const studentMap = new Map<string, StudentRow>();

    (registeredRes.data || []).forEach((record: any) => {
      const di = record.device_info || {};
      const metadata = di.metadata || {};
      const name = metadata.name || di.name || '';
      const employeeId = metadata.employee_id || di.employee_id || 'N/A';
      const studentClass = record.category || metadata.class_section || metadata.department || di.department || 'General';
      const key = record.user_id || employeeId || record.id;

      if (!name || name === 'Unknown' || name.toLowerCase().includes('unknown') || name === 'User' || seen.has(key)) {
        return;
      }

      // Filter by selected class if not "all"
      if (!isAllClasses) {
        const studentNorm = normalizeCategory(studentClass);
        if (studentNorm !== targetNorm && !studentClass.toLowerCase().includes(selectedCategory.toLowerCase())) {
          return;
        }
      }

      seen.add(key);
      studentMap.set(key, { 
        name, 
        employeeId, 
        category: studentClass,
        present: 0, 
        late: 0, 
        absent: 0, 
        days: {} 
      });
    });

    if (studentMap.size === 0) {
      toast({
        title: 'No Students Found',
        description: `No students registered under ${isAllClasses ? 'the school roster' : getCategoryLabel(selectedCategory)}.`,
        variant: 'destructive',
      });
      return null;
    }

    // Determine working days in selected range
    const workingDays: Date[] = [];
    const curr = new Date(start);
    while (curr <= end) {
      if (isWorkingDayForSchool(curr)) {
        workingDays.push(new Date(curr));
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (workingDays.length === 0) {
      workingDays.push(new Date(end));
    }
    const totalWorkDays = workingDays.length;

    // Track check-ins per student per day
    const attendanceByStudent = new Map<string, Map<string, 'present' | 'late'>>();

    (attendanceRes.data || []).forEach((record: any) => {
      const di = record.device_info || {};
      const employeeId = di?.metadata?.employee_id || di?.employee_id;
      const recordName = di?.metadata?.name || di?.name;
      const userId = record.user_id;

      let matchedKey: string | null = null;
      for (const [key, student] of studentMap) {
        if (userId && key === userId) { matchedKey = key; break; }
        if (employeeId && student.employeeId === employeeId) { matchedKey = key; break; }
        if (recordName && student.name.toLowerCase() === recordName.toLowerCase()) { matchedKey = key; break; }
      }

      if (matchedKey) {
        if (!attendanceByStudent.has(matchedKey)) attendanceByStudent.set(matchedKey, new Map());
        const dateKey = format(new Date(record.timestamp), 'yyyy-MM-dd');
        const existing = attendanceByStudent.get(matchedKey)!.get(dateKey);
        const status = (record.status === 'late') ? 'late' : 'present';
        if (!existing || (existing === 'late' && status === 'present')) {
          attendanceByStudent.get(matchedKey)!.set(dateKey, status);
        }
      }
    });

    (gateRes.data || []).forEach((gate: any) => {
      const dateKey = format(new Date(gate.entry_time), 'yyyy-MM-dd');
      let matchedKey: string | null = null;
      for (const [key, student] of studentMap) {
        if (gate.student_id && (key === gate.student_id || student.employeeId === gate.student_id)) {
          matchedKey = key;
          break;
        }
      }
      if (matchedKey) {
        if (!attendanceByStudent.has(matchedKey)) attendanceByStudent.set(matchedKey, new Map());
        if (!attendanceByStudent.get(matchedKey)!.has(dateKey)) {
          attendanceByStudent.get(matchedKey)!.set(dateKey, 'present');
        }
      }
    });

    workingDays.sort((a, b) => a.getTime() - b.getTime());

    // Compute totals per student
    for (const [key, student] of studentMap) {
      const dayMap = attendanceByStudent.get(key);
      let present = 0;
      let late = 0;

      workingDays.forEach(d => {
        const dateKey = format(d, 'yyyy-MM-dd');
        const s = dayMap?.get(dateKey);
        if (s === 'present') { present++; student.days[dateKey] = 'P'; }
        else if (s === 'late') { late++; student.days[dateKey] = 'L'; }
        else { student.days[dateKey] = 'A'; }
      });

      student.present = present;
      student.late = late;
      student.absent = Math.max(0, totalWorkDays - present - late);
    }

    const students = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const totalPresent = students.reduce((s, st) => s + st.present, 0);
    const totalLate = students.reduce((s, st) => s + st.late, 0);
    const totalAbsent = students.reduce((s, st) => s + st.absent, 0);
    const totalPossible = students.length * totalWorkDays;
    const overallRate = totalPossible > 0
      ? (((totalPresent + totalLate) / totalPossible) * 100).toFixed(1)
      : '0.0';

    return { 
      students, 
      totalWorkDays, 
      totalPresent, 
      totalLate, 
      totalAbsent, 
      overallRate, 
      startDate: start, 
      endDate: end, 
      workingDays 
    };
  };

  const fmt = (d: Date) => format(d, 'MMM dd, yyyy');
  const safeName = () => (selectedCategory === 'all' ? 'All_Classes' : getCategoryLabel(selectedCategory)).replace(/[^a-z0-9]+/gi, '_');

  // ── CSV Export ─────────────────────────────────────────────────────────────
  const downloadCSV = async () => {
    setBusy('csv');
    try {
      const r = await buildReport();
      if (!r) return;

      const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;

      const lines: string[] = [];
      lines.push(`School,${esc('PM Shri Kendriya Vidyalaya NFC Vigyan Vihar')}`);
      lines.push(`Class,${esc(selectedCategory === 'all' ? 'All Classes' : getCategoryLabel(selectedCategory))}`);
      lines.push(`Period,${esc(fmt(r.startDate) + ' to ' + fmt(r.endDate))}`);
      lines.push(`Working Days,${r.totalWorkDays}`);
      lines.push(`Total Students,${r.students.length}`);
      lines.push(`Total Present,${r.totalPresent}`);
      lines.push(`Total Late,${r.totalLate}`);
      lines.push(`Total Absent,${r.totalAbsent}`);
      lines.push(`Overall Attendance Rate,${r.overallRate}%`);
      lines.push('');
      lines.push(['#', 'Name', 'Admission No.', 'Class', 'Present Days', 'Late Days', 'Absent Days', 'Rate %'].map(esc).join(','));

      r.students.forEach((s, i) => {
        const rate = r.totalWorkDays ? (((s.present + s.late) / r.totalWorkDays) * 100).toFixed(1) : '0.0';
        lines.push([i + 1, s.name, s.employeeId, s.category, s.present, s.late, s.absent, rate].map(esc).join(','));
      });

      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName()}_attendance_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV Downloaded', description: `${r.students.length} student records exported.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: 'Could not generate CSV.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const downloadPDF = async () => {
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
      doc.setFontSize(16);
      doc.text('PM Shri Kendriya Vidyalaya NFC Vigyan Vihar', 40, 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(190, 215, 250);
      doc.text(`Class Attendance Report — ${selectedCategory === 'all' ? 'All Classes' : getCategoryLabel(selectedCategory)}`, 40, 56);
      doc.setFontSize(9);
      doc.text(`Period: ${fmt(r.startDate)} to ${fmt(r.endDate)}`, 40, 74);
      doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth - 40, 74, { align: 'right' });

      // Stats row
      const statsY = 110;
      const stats = [
        ['STUDENTS', String(r.students.length)],
        ['WORKING DAYS', String(r.totalWorkDays)],
        ['TOTAL PRESENT', String(r.totalPresent)],
        ['TOTAL LATE', String(r.totalLate)],
        ['OVERALL RATE', `${r.overallRate}%`],
      ];
      const boxW = (pageWidth - 80 - (stats.length - 1) * 8) / stats.length;
      stats.forEach(([label, val], i) => {
        const x = 40 + i * (boxW + 8);
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, statsY, boxW, 50, 6, 6, 'FD');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text(label, x + boxW / 2, statsY + 16, { align: 'center' });
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(14);
        doc.text(val, x + boxW / 2, statsY + 38, { align: 'center' });
      });

      // Student table
      autoTable(doc, {
        startY: statsY + 68,
        head: [['#', 'Student Name', 'Admission No.', 'Class', 'Present', 'Late', 'Absent', 'Rate']],
        body: r.students.map((s, i) => {
          const rate = r.totalWorkDays ? (((s.present + s.late) / r.totalWorkDays) * 100).toFixed(1) : '0.0';
          return [i + 1, s.name, s.employeeId, s.category, s.present, s.late, s.absent, `${rate}%`];
        }),
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 25 },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' },
          7: { halign: 'center', fontStyle: 'bold' },
        },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
          const pageNum = doc.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Presence AI · PM Shri KV NFC Vigyan Vihar · Page ${pageNum}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 20,
            { align: 'center' },
          );
        },
      });

      doc.save(`${safeName()}_attendance_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF Downloaded', description: `${r.students.length} students exported.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: 'Could not generate PDF.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // ── Traditional Printable Register ─────────────────────────────────────────
  const printRegister = async () => {
    setBusy('print');
    try {
      const r = await buildReport();
      if (!r) return;

      const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text('PM Shri Kendriya Vidyalaya NFC Vigyan Vihar', pageWidth / 2, 30, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`OFFICIAL ATTENDANCE REGISTER — ${selectedCategory === 'all' ? 'ALL CLASSES' : getCategoryLabel(selectedCategory).toUpperCase()}`, pageWidth / 2, 48, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Period: ${fmt(r.startDate)} to ${fmt(r.endDate)}   |   Working Days: ${r.totalWorkDays}   |   P = Present, L = Late, A = Absent`,
        pageWidth / 2,
        64,
        { align: 'center' },
      );

      const dayLabel = (d: Date) => format(d, 'dd/MM');

      const CHUNK = 20;
      const chunks: Date[][] = [];
      for (let i = 0; i < r.workingDays.length; i += CHUNK) {
        chunks.push(r.workingDays.slice(i, i + CHUNK));
      }
      if (chunks.length === 0) chunks.push([]);

      const cursorY = 78;
      chunks.forEach((days, chunkIndex) => {
        const head = [['#', 'Student Name', 'Admission No.', ...days.map(dayLabel), 'P', 'L', 'A']];
        const body = r.students.map((s, i) => [
          i + 1,
          s.name,
          s.employeeId,
          ...days.map((d) => s.days[format(d, 'yyyy-MM-dd')] || 'A'),
          s.present,
          s.late,
          s.absent,
        ]);

        const dayCols: Record<number, any> = {};
        days.forEach((_, i) => {
          dayCols[i + 3] = { halign: 'center', cellWidth: 20 };
        });

        autoTable(doc, {
          startY: chunkIndex === 0 ? cursorY : 40,
          head,
          body,
          theme: 'grid',
          styles: { fontSize: 7.5, cellPadding: 3, lineColor: [148, 163, 184], lineWidth: 0.4, textColor: [15, 23, 42] },
          headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center', fontSize: 7 },
          columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { cellWidth: 110, fontStyle: 'bold' },
            2: { cellWidth: 65, fontStyle: 'normal' },
            ...dayCols,
            [days.length + 3]: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
            [days.length + 4]: { halign: 'center', cellWidth: 22 },
            [days.length + 5]: { halign: 'center', cellWidth: 22 },
          },
          margin: { left: 24, right: 24, top: 40 },
          didParseCell: (data: any) => {
            if (data.section !== 'body') return;
            const raw = String(data.cell.raw ?? '');
            if (data.column.index >= 3 && data.column.index < days.length + 3) {
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
              `Presence AI · PM Shri KV NFC Vigyan Vihar · Signature of Class Teacher: ____________________`,
              pageWidth / 2,
              doc.internal.pageSize.getHeight() - 16,
              { align: 'center' },
            );
          },
        });

        if (chunkIndex < chunks.length - 1) doc.addPage('a4', 'landscape');
      });

      const blobUrl = doc.output('bloburl');
      const printWindow = window.open(blobUrl as unknown as string, '_blank');
      if (!printWindow) {
        doc.save(`${safeName()}_register_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      }
      toast({ title: 'Register Generated', description: `${r.students.length} students across ${r.totalWorkDays} school days.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Print failed', description: 'Could not generate register.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="bg-card border-border shadow-lg">
      <CardHeader className="pb-4 border-b border-border bg-gradient-to-r from-indigo-600 to-violet-600">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">Class-Wise Attendance Register</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                PM Shri KV
              </span>
            </div>
            <p className="text-xs font-normal text-white/80 mt-0.5">
              Printable P / L / A matrix register and class-level analytics
            </p>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Class & Section</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="rounded-xl h-11 border-border/70">
                <SelectValue placeholder="Choose class-section..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes (Entire School)</SelectItem>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat} value={cat}>{getCategoryLabel(cat)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Date Horizon</Label>
            <Select value={dateRangeOption} onValueChange={(val: any) => setDateRangeOption(val)}>
              <SelectTrigger className="rounded-xl h-11 border-border/70">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today (Live)</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days (Standard)</SelectItem>
                <SelectItem value="month">Current Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Button
            onClick={downloadPDF}
            disabled={!!busy}
            className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 font-bold shadow-md shadow-indigo-500/20 btn-spring"
          >
            {busy === 'pdf' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating PDF…</>
            ) : (
              <><FileDown className="w-4 h-4 mr-2" /> Download Class PDF Report</>
            )}
          </Button>

          <Button
            onClick={downloadCSV}
            disabled={!!busy}
            variant="outline"
            className="w-full h-11 rounded-xl font-bold border-border/80 btn-spring"
          >
            {busy === 'csv' ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating CSV…</>
            ) : (
              <><FileSpreadsheet className="w-4 h-4 mr-2" /> Download Excel / CSV</>
            )}
          </Button>
        </div>

        <Button
          onClick={printRegister}
          disabled={!!busy}
          variant="secondary"
          className="w-full h-11 rounded-xl font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 btn-spring"
        >
          {busy === 'print' ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Compiling Matrix Register…</>
          ) : (
            <><Printer className="w-4 h-4 mr-2" /> Print Official Attendance Register (P / L / A Matrix Grid)</>
          )}
        </Button>

        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Printer className="w-3.5 h-3.5 text-primary shrink-0" />
          Official printable format matching CBSE/Kendriya Vidyalaya registers with teacher signature footer and daily presence matrix.
        </p>
      </CardContent>
    </Card>
  );
};

export default ClassSectionReport;
