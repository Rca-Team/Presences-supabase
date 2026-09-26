import React, { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Calendar,
  Layers,
  FileDown,
  Loader2,
  CheckCircle2,
  Table,
  ListOrdered,
  Sparkles,
  Filter,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isWorkingDayForSchool } from '@/utils/workingDays';
import { matchesClassAndSection } from '@/utils/teacherAccess';
import * as XLSX from 'xlsx';
import { shareOrDownloadFile } from '@/utils/nativeShare';
import { format, subDays, startOfWeek, startOfMonth, subMonths, endOfMonth, parseISO, isAfter } from 'date-fns';

export interface ExportStudent {
  id: string;
  user_id?: string;
  name: string;
  roll_number?: string;
  admission_number?: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  today_status?: 'present' | 'late' | 'absent' | 'unmarked';
  today_time?: string;
}

export interface TeacherAttendanceExporterProps {
  isOpen: boolean;
  onClose: () => void;
  activeClass: { class: string; section: string; category: string };
  students: ExportStudent[];
}

export type ExportFormat = 'pa_matrix' | 'standard_log';
export type DateDuration = 'today' | 'yesterday' | 'this_week' | 'last_7_days' | 'this_month' | 'last_month' | 'custom';

export const TeacherAttendanceExporter: React.FC<TeacherAttendanceExporterProps> = ({
  isOpen,
  onClose,
  activeClass,
  students,
}) => {
  const { toast } = useToast();

  const [exportFormat, setExportFormat] = useState<ExportFormat>('pa_matrix');
  const [duration, setDuration] = useState<DateDuration>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'absent'>('all');
  const [includeSundays, setIncludeSundays] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<'excel' | 'csv' | 'print' | null>(null);

  // Compute calculated start and end date based on duration
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    switch (duration) {
      case 'today': {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return { start, end: today, label: `Today (${format(today, 'dd MMM yyyy')})` };
      }
      case 'yesterday': {
        const d = subDays(today, 1);
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d);
        end.setHours(23, 59, 59, 999);
        return { start, end, label: `Yesterday (${format(d, 'dd MMM yyyy')})` };
      }
      case 'this_week': {
        const start = startOfWeek(today, { weekStartsOn: 1 });
        start.setHours(0, 0, 0, 0);
        return { start, end: today, label: `This Week (${format(start, 'dd MMM')} - ${format(today, 'dd MMM yyyy')})` };
      }
      case 'last_7_days': {
        const start = subDays(today, 6);
        start.setHours(0, 0, 0, 0);
        return { start, end: today, label: `Last 7 Days (${format(start, 'dd MMM')} - ${format(today, 'dd MMM yyyy')})` };
      }
      case 'this_month': {
        const start = startOfMonth(today);
        start.setHours(0, 0, 0, 0);
        return { start, end: today, label: `This Month (${format(today, 'MMMM yyyy')})` };
      }
      case 'last_month': {
        const lastMonthDate = subMonths(today, 1);
        const start = startOfMonth(lastMonthDate);
        start.setHours(0, 0, 0, 0);
        const end = endOfMonth(lastMonthDate);
        end.setHours(23, 59, 59, 999);
        return { start, end, label: `Last Month (${format(lastMonthDate, 'MMMM yyyy')})` };
      }
      case 'custom':
      default: {
        const start = parseISO(customStartDate);
        start.setHours(0, 0, 0, 0);
        const end = parseISO(customEndDate);
        end.setHours(23, 59, 59, 999);
        return {
          start,
          end,
          label: `Custom: ${format(start, 'dd MMM yyyy')} to ${format(end, 'dd MMM yyyy')}`,
        };
      }
    }
  }, [duration, customStartDate, customEndDate]);

  // Generate day sequence array for the date range
  const daysList = useMemo(() => {
    const list: { dateObj: Date; dateStr: string; dayNumber: number; isSun: boolean; isWorkDay: boolean }[] = [];
    const cur = new Date(dateRange.start);
    while (cur <= dateRange.end) {
      const isSun = cur.getDay() === 0;
      const isWork = isWorkingDayForSchool(cur);
      list.push({
        dateObj: new Date(cur),
        dateStr: format(cur, 'yyyy-MM-dd'),
        dayNumber: cur.getDate(),
        isSun,
        isWorkDay: isWork,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [dateRange]);

  // Fetch complete attendance records for active class within date range
  const fetchAttendanceRecords = useCallback(async () => {
    const startIso = dateRange.start.toISOString();
    const endIso = dateRange.end.toISOString();

    const { data, error } = await supabase
      .from('attendance_records')
      .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info, capture_mode, source, metadata')
      .gte('timestamp', startIso)
      .lte('timestamp', endIso)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // Filter to active class
    const matching = (data || []).filter((r: any) => {
      if (r.status === 'registered') return false;
      return matchesClassAndSection(r, activeClass.class, activeClass.section);
    });

    return matching;
  }, [dateRange, activeClass]);

  // ─── 1. BUILD PA MATRIX DATA ──────────────────────────────────────────────
  const buildPAMatrixData = async () => {
    const records = await fetchAttendanceRecords();

    const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

    // Student Lookup table
    const studentLookup = new Map<string, string>(); // alias -> student.id
    students.forEach(s => {
      studentLookup.set(s.id, s.id);
      if (s.user_id) studentLookup.set(norm(s.user_id), s.id);
      if (s.admission_number) studentLookup.set(norm(s.admission_number), s.id);
      if (s.roll_number) studentLookup.set(norm(s.roll_number), s.id);
      if (s.name) studentLookup.set(norm(s.name), s.id);
    });

    // Grid: studentId -> dateStr (yyyy-MM-dd) -> 'P' | 'A' | 'L'
    const grid: Record<string, Record<string, 'P' | 'A' | 'L'>> = {};

    records.forEach((r: any) => {
      const dateKey = format(new Date(r.timestamp), 'yyyy-MM-dd');
      const sName = norm(r.student_name || r.device_info?.metadata?.name || r.device_info?.name);
      const uId = norm(r.user_id);
      const sId = norm(r.student_id || r.device_info?.metadata?.employee_id || r.device_info?.employee_id);
      const roll = norm(r.device_info?.metadata?.roll_number);

      const targetStudentId =
        studentLookup.get(uId) ||
        studentLookup.get(sId) ||
        studentLookup.get(roll) ||
        studentLookup.get(sName);

      if (targetStudentId) {
        const rawStatus = (r.status || '').toLowerCase();
        const statusChar = rawStatus.includes('late') ? 'L' : rawStatus.includes('absent') ? 'A' : 'P';
        if (!grid[targetStudentId]) grid[targetStudentId] = {};
        grid[targetStudentId][dateKey] = statusChar;
      }
    });

    // Filter working days if includeSundays is false
    const activeDays = includeSundays ? daysList : daysList.filter(d => !d.isSun);

    // Compute Student Summary Rows
    const rows = (students || []).map((s, idx) => {
      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      const dayValues: Record<string, string> = {};

      activeDays.forEach(d => {
        if (d.isSun) {
          dayValues[d.dateStr] = 'SUN';
          return;
        }

        const mark = grid[s.id]?.[d.dateStr];
        if (mark === 'P') {
          presentCount++;
          dayValues[d.dateStr] = 'P';
        } else if (mark === 'L') {
          lateCount++;
          presentCount++; // Counted as present for aggregate
          dayValues[d.dateStr] = 'L';
        } else if (mark === 'A') {
          absentCount++;
          dayValues[d.dateStr] = 'A';
        } else {
          dayValues[d.dateStr] = '—';
        }
      });

      const totalWorkDays = activeDays.filter(d => !d.isSun).length;
      const recordedDays = Object.keys(grid[s.id] || {}).length;
      const divisor = totalWorkDays > 0 ? totalWorkDays : 1;
      const pct = Math.round((presentCount / divisor) * 100);

      return {
        sNo: idx + 1,
        rollNo: s.roll_number || `${idx + 1}`,
        studentName: s.name,
        admissionNo: s.admission_number || '—',
        dayValues,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        totalWorkDays,
        recordedDays,
        pct: Math.min(100, pct),
        eligibility: pct >= 75 ? 'ELIGIBLE' : 'DEFAULTER (<75%)',
      };
    });

    return { rows, activeDays };
  };

  // ─── 2. BUILD STANDARD AUDIT LOG DATA ─────────────────────────────────────
  const buildStandardLogData = async () => {
    const records = await fetchAttendanceRecords();

    const formattedRecords = records.map((r: any, idx: number) => {
      const dateObj = new Date(r.timestamp);
      const dateFormatted = format(dateObj, 'yyyy-MM-dd');
      const timeFormatted = format(dateObj, 'hh:mm:ss a');
      const rawStatus = (r.status || '').toLowerCase();
      const statusNormalized = rawStatus.includes('late')
        ? 'Late'
        : rawStatus.includes('absent')
        ? 'Absent'
        : 'Present';

      const devInfo = (r.device_info as any) || {};
      const meta = (r.metadata as any) || devInfo.metadata || {};

      const source =
        r.source ||
        devInfo.source ||
        (r.capture_mode === 'manual' ? 'Teacher Portal (Manual)' : 'Spotlight Gate AI');

      const markedBy =
        devInfo.marked_by ||
        meta.marked_by ||
        (r.capture_mode === 'manual' ? 'Class Teacher' : 'Gate AI Terminal');

      return {
        sNo: idx + 1,
        date: dateFormatted,
        time: timeFormatted,
        studentName: r.student_name || meta.name || 'Student',
        rollNo: meta.roll_number || r.roll_number || '—',
        admissionNo: r.student_id || meta.employee_id || '—',
        class: activeClass.class,
        section: activeClass.section,
        status: statusNormalized,
        source: source,
        captureMode: r.capture_mode || 'ai-gate',
        verifiedBy: markedBy,
        timestamp: r.timestamp,
      };
    });

    // Apply status filter if set
    if (statusFilter !== 'all') {
      return formattedRecords.filter(
        (rec: any) => rec.status.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    return formattedRecords;
  };

  // ─── EXPORT TO EXCEL (.xlsx) ──────────────────────────────────────────────
  const handleExportExcel = async () => {
    setIsExporting('excel');
    try {
      if (exportFormat === 'pa_matrix') {
        const { rows, activeDays } = await buildPAMatrixData();

        // Build Excel Headers
        const headerRow = [
          'S.No',
          'Roll No',
          'Student Name',
          'Admission No',
          ...activeDays.map(d => `${format(d.dateObj, 'dd/MM')}${d.isSun ? ' (Sun)' : ''}`),
          'Total Present (P)',
          'Total Absent (A)',
          'Total Late (L)',
          'Total Working Days',
          'Attendance %',
          'CBSE Status',
        ];

        const dataRows = rows.map(r => [
          r.sNo,
          r.rollNo,
          r.studentName,
          r.admissionNo,
          ...activeDays.map(d => r.dayValues[d.dateStr] || '—'),
          r.present,
          r.absent,
          r.late,
          r.totalWorkDays,
          `${r.pct}%`,
          r.eligibility,
        ]);

        const titleRows = [
          ['PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR'],
          [`OFFICIAL ATTENDANCE REGISTER (PA MATRIX) — CLASS ${activeClass.category}`],
          [`Duration: ${dateRange.label} | Total Students: ${students.length} | Generated: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`],
          [],
        ];

        const ws = XLSX.utils.aoa_to_sheet([...titleRows, headerRow, ...dataRows]);

        // Auto-fit column widths
        ws['!cols'] = [
          { wch: 6 },  // S.No
          { wch: 8 },  // Roll No
          { wch: 22 }, // Student Name
          { wch: 14 }, // Admission No
          ...activeDays.map(() => ({ wch: 8 })),
          { wch: 16 }, // Present
          { wch: 15 }, // Absent
          { wch: 14 }, // Late
          { wch: 18 }, // Working Days
          { wch: 14 }, // %
          { wch: 20 }, // Status
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `PA_Register_${activeClass.category}`);
        const fileName = `Attendance_PA_Matrix_Class_${activeClass.category}_${format(dateRange.start, 'yyyyMMdd')}_to_${format(dateRange.end, 'yyyyMMdd')}.xlsx`;
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const shared = await shareOrDownloadFile({
          file: blob,
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          title: `Attendance PA Register (${activeClass.category})`,
          text: `Official PA attendance register for Class ${activeClass.category} from Presences Smart School.`,
        });

        toast({
          title: shared ? '📤 Shared Successfully' : '✅ PA Matrix Excel Exported',
          description: `Attendance register for Class ${activeClass.category} (${rows.length} students).`,
        });
      } else {
        // Standard Audit Log Excel
        const records = await buildStandardLogData();

        const headers = [
          'S.No',
          'Date',
          'Time',
          'Student Name',
          'Roll No',
          'Admission No',
          'Class',
          'Section',
          'Status',
          'Source',
          'Capture Mode',
          'Verified By',
        ];

        const dataRows = records.map((r: any) => [
          r.sNo,
          r.date,
          r.time,
          r.studentName,
          r.rollNo,
          r.admissionNo,
          r.class,
          r.section,
          r.status.toUpperCase(),
          r.source,
          r.captureMode,
          r.verifiedBy,
        ]);

        const titleRows = [
          ['PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR'],
          [`DETAILED ATTENDANCE AUDIT LOGS — CLASS ${activeClass.category}`],
          [`Duration: ${dateRange.label} | Total Records: ${records.length} | Generated: ${format(new Date(), 'dd-MMM-yyyy hh:mm a')}`],
          [],
        ];

        const ws = XLSX.utils.aoa_to_sheet([...titleRows, headers, ...dataRows]);
        ws['!cols'] = [
          { wch: 6 },
          { wch: 12 },
          { wch: 12 },
          { wch: 22 },
          { wch: 10 },
          { wch: 14 },
          { wch: 8 },
          { wch: 8 },
          { wch: 12 },
          { wch: 24 },
          { wch: 15 },
          { wch: 20 },
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, `Audit_Logs_${activeClass.category}`);
        const fileName = `Attendance_Standard_Log_Class_${activeClass.category}_${format(dateRange.start, 'yyyyMMdd')}_to_${format(dateRange.end, 'yyyyMMdd')}.xlsx`;
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const shared = await shareOrDownloadFile({
          file: blob,
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          title: `Attendance Audit Logs (${activeClass.category})`,
          text: `Detailed attendance audit records for Class ${activeClass.category}.`,
        });

        toast({
          title: shared ? '📤 Shared Successfully' : '✅ Standard Log Excel Exported',
          description: `Attendance records for Class ${activeClass.category} (${records.length} logs).`,
        });
      }
    } catch (err: any) {
      console.error('Export Error:', err);
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  // ─── EXPORT TO CSV (.csv) ────────────────────────────────────────────────
  const handleExportCSV = async () => {
    setIsExporting('csv');
    try {
      if (exportFormat === 'pa_matrix') {
        const { rows, activeDays } = await buildPAMatrixData();

        const headers = [
          'S.No',
          'Roll No',
          'Student Name',
          'Admission No',
          ...activeDays.map(d => `${format(d.dateObj, 'dd/MM')}${d.isSun ? ' (Sun)' : ''}`),
          'Present',
          'Absent',
          'Late',
          'Total Working Days',
          'Attendance %',
          'CBSE Status',
        ];

        const csvRows = [
          headers.join(','),
          ...rows.map(r =>
            [
              r.sNo,
              `"${r.rollNo}"`,
              `"${r.studentName}"`,
              `"${r.admissionNo}"`,
              ...activeDays.map(d => `"${r.dayValues[d.dateStr] || '—'}"`),
              r.present,
              r.absent,
              r.late,
              r.totalWorkDays,
              `"${r.pct}%"`,
              `"${r.eligibility}"`,
            ].join(',')
          ),
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const fileName = `Attendance_PA_Matrix_${activeClass.category}_${format(dateRange.start, 'yyyyMMdd')}_${format(dateRange.end, 'yyyyMMdd')}.csv`;
        const shared = await shareOrDownloadFile({
          file: blob,
          fileName,
          mimeType: 'text/csv',
          title: `Attendance PA CSV (${activeClass.category})`,
          text: `Class ${activeClass.category} PA attendance register CSV.`,
        });

        toast({
          title: shared ? '📤 Shared Successfully' : '✅ CSV Exported',
          description: `Exported attendance in CSV format for Class ${activeClass.category}.`,
        });
      } else {
        const records = await buildStandardLogData();

        const headers = [
          'S.No',
          'Date',
          'Time',
          'Student Name',
          'Roll No',
          'Admission No',
          'Class',
          'Section',
          'Status',
          'Source',
          'Verified By',
        ];

        const csvRows = [
          headers.join(','),
          ...records.map((r: any) =>
            [
              r.sNo,
              `"${r.date}"`,
              `"${r.time}"`,
              `"${r.studentName}"`,
              `"${r.rollNo}"`,
              `"${r.admissionNo}"`,
              `"${r.class}"`,
              `"${r.section}"`,
              `"${r.status}"`,
              `"${r.source}"`,
              `"${r.verifiedBy}"`,
            ].join(',')
          ),
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const fileName = `Attendance_Standard_Logs_${activeClass.category}_${format(dateRange.start, 'yyyyMMdd')}_${format(dateRange.end, 'yyyyMMdd')}.csv`;
        const shared = await shareOrDownloadFile({
          file: blob,
          fileName,
          mimeType: 'text/csv',
          title: `Attendance Log CSV (${activeClass.category})`,
          text: `Class ${activeClass.category} detailed attendance audit log CSV.`,
        });

        toast({
          title: shared ? '📤 Shared Successfully' : '✅ CSV Exported',
          description: `Exported attendance in CSV format for Class ${activeClass.category}.`,
        });
      }
    } catch (err: any) {
      console.error('CSV Error:', err);
      toast({ title: 'CSV Export Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  // ─── PRINT / PDF NOTICEBOARD REGISTER ───────────────────────────────────
  const handlePrintReport = async () => {
    setIsExporting('print');
    try {
      if (exportFormat === 'pa_matrix') {
        const { rows, activeDays } = await buildPAMatrixData();
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          toast({ title: 'Pop-up Blocked', description: 'Please allow popups to print report', variant: 'destructive' });
          return;
        }

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>PA Register - Class ${activeClass.category}</title>
              <style>
                @page { size: landscape; margin: 8mm; }
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 12px; background: #fff; }
                .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
                .title { font-size: 18px; font-weight: bold; color: #1e3a8a; margin: 0; }
                .subtitle { font-size: 12px; color: #475569; margin-top: 3px; }
                table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9.5px; }
                th, td { border: 1px solid #cbd5e1; padding: 4px 2px; text-align: center; }
                th { background-color: #f1f5f9; font-weight: bold; }
                .th-name { text-align: left; width: 130px; font-weight: 600; padding-left: 4px; }
                .sun-cell { background-color: #fee2e2; color: #b91c1c; font-weight: bold; }
                .p-cell { color: #15803d; font-weight: bold; }
                .a-cell { color: #b91c1c; font-weight: bold; }
                .l-cell { color: #b45309; font-weight: bold; }
                .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; }
              </style>
            </head>
            <body>
              <div class="header">
                <div class="title">PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR</div>
                <div class="subtitle">Official PA Attendance Register • Class ${activeClass.category} • ${dateRange.label}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th class="th-name">Student Name</th>
                    <th>Adm No</th>
                    ${activeDays.map(d => `<th class="${d.isSun ? 'sun-cell' : ''}">${format(d.dateObj, 'dd')}</th>`).join('')}
                    <th>P</th>
                    <th>A</th>
                    <th>L</th>
                    <th>%</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(r => `
                    <tr>
                      <td>${r.rollNo}</td>
                      <td class="th-name">${r.studentName}</td>
                      <td>${r.admissionNo}</td>
                      ${activeDays.map(d => {
                        if (d.isSun) return `<td class="sun-cell">S</td>`;
                        const mark = r.dayValues[d.dateStr];
                        if (mark === 'P') return `<td class="p-cell">P</td>`;
                        if (mark === 'A') return `<td class="a-cell">A</td>`;
                        if (mark === 'L') return `<td class="l-cell">L</td>`;
                        return `<td>—</td>`;
                      }).join('')}
                      <td style="font-weight: bold; color: #15803d;">${r.present}</td>
                      <td style="font-weight: bold; color: #b91c1c;">${r.absent}</td>
                      <td style="font-weight: bold; color: #b45309;">${r.late}</td>
                      <td style="font-weight: bold;">${r.pct}%</td>
                      <td style="font-weight: bold; color: ${r.pct >= 75 ? '#15803d' : '#b91c1c'};">${r.pct >= 75 ? 'Eligible' : '<75%'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div class="footer">
                <div>Total Enrolled: <strong>${students.length}</strong></div>
                <div>Class Teacher Signature: ______________________</div>
                <div>Principal Signature: ______________________</div>
              </div>
            </body>
          </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      } else {
        // Standard Log Print
        const records = await buildStandardLogData();
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Audit Logs - Class ${activeClass.category}</title>
              <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 15px; }
                .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 6px; }
                .title { font-size: 18px; font-weight: bold; color: #1e3a8a; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; }
                .status-present { color: #15803d; font-weight: bold; }
                .status-absent { color: #b91c1c; font-weight: bold; }
                .status-late { color: #b45309; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="header">
                <div class="title">PM SHRI KENDRIYA VIDYALAYA NFC VIGYAN VIHAR</div>
                <div>Attendance Audit Log • Class ${activeClass.category} • ${dateRange.label}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Student Name</th>
                    <th>Roll No</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Verified By</th>
                  </tr>
                </thead>
                <tbody>
                  ${records.map((r: any) => `
                    <tr>
                      <td>${r.sNo}</td>
                      <td>${r.date}</td>
                      <td>${r.time}</td>
                      <td style="font-weight: 600;">${r.studentName}</td>
                      <td>${r.rollNo}</td>
                      <td class="status-${r.status.toLowerCase()}">${r.status.toUpperCase()}</td>
                      <td>${r.source}</td>
                      <td>${r.verifiedBy}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </body>
          </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    } catch (err: any) {
      console.error('Print error:', err);
      toast({ title: 'Print Failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl sm:rounded-2xl shadow-2xl border bg-background/95 backdrop-blur-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>Export Class Attendance</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-bold">
                  Class {activeClass.category}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Export comprehensive student attendance in both <strong>PA Register Matrix</strong> and <strong>Standard Audit Log</strong> forms for any duration.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 1. Format Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-blue-500" />
              Select Report Format
            </Label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setExportFormat('pa_matrix')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  exportFormat === 'pa_matrix'
                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20 text-foreground'
                    : 'border-slate-200 dark:border-white/10 hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === 'pa_matrix' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  <Table className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center gap-1">
                    PA Register Matrix
                    {exportFormat === 'pa_matrix' && <CheckCircle2 className="h-3 w-3 text-blue-500" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    Traditional calendar grid with daily 'P'/'A'/'L' markers, total present/absent counts, and CBSE %.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('standard_log')}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  exportFormat === 'standard_log'
                    ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/20 text-foreground'
                    : 'border-slate-200 dark:border-white/10 hover:bg-muted/50 text-muted-foreground'
                }`}
              >
                <div className={`p-2 rounded-lg ${exportFormat === 'standard_log' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                  <ListOrdered className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-xs text-foreground flex items-center gap-1">
                    Standard Audit Log
                    {exportFormat === 'standard_log' && <CheckCircle2 className="h-3 w-3 text-blue-500" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                    Detailed tabular records with date, timestamps, source (Gate AI vs Manual), roll numbers, and verifier info.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Duration Preset Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              Time Duration
            </Label>
            <Select value={duration} onValueChange={v => setDuration(v as DateDuration)}>
              <SelectTrigger className="h-9 text-xs rounded-xl font-medium">
                <SelectValue placeholder="Select Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today ({format(new Date(), 'dd MMM yyyy')})</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week (Monday to Today)</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="this_month">This Month ({format(new Date(), 'MMMM yyyy')})</SelectItem>
                <SelectItem value="last_month">Last Month ({format(subMonths(new Date(), 1), 'MMMM yyyy')})</SelectItem>
                <SelectItem value="custom">📅 Custom Date Range (Start Date → End Date)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 3. Custom Date Range Pickers (shown when custom is selected) */}
          {duration === 'custom' && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border bg-muted/30">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">From (Start Date)</Label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="h-8 text-xs rounded-lg"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">To (End Date)</Label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="h-8 text-xs rounded-lg"
                />
              </div>
            </div>
          )}

          {/* 4. Additional Options */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border bg-muted/20 text-xs">
            {exportFormat === 'standard_log' ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground font-medium">Filter Status:</Label>
                <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
                  <SelectTrigger className="h-7 text-xs w-32 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Records</SelectItem>
                    <SelectItem value="present">Present Only</SelectItem>
                    <SelectItem value="late">Late Only</SelectItem>
                    <SelectItem value="absent">Absent Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground font-medium select-none">
                <input
                  type="checkbox"
                  checked={includeSundays}
                  onChange={e => setIncludeSundays(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Include Sundays in register matrix
              </label>
            )}

            <div className="text-[11px] text-muted-foreground font-medium">
              Target Roster: <strong>{students.length} Students</strong>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t flex flex-col sm:flex-row items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs h-9 rounded-xl">
            Cancel
          </Button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              disabled={isExporting !== null}
              onClick={handlePrintReport}
              className="text-xs h-9 rounded-xl gap-1.5 flex-1 sm:flex-initial"
            >
              {isExporting === 'print' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5 text-indigo-500" />}
              Print / PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={isExporting !== null}
              onClick={handleExportCSV}
              className="text-xs h-9 rounded-xl gap-1.5 flex-1 sm:flex-initial"
            >
              {isExporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-emerald-500" />}
              Export CSV
            </Button>

            <Button
              size="sm"
              disabled={isExporting !== null}
              onClick={handleExportExcel}
              className="text-xs h-9 rounded-xl gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold shadow-md flex-1 sm:flex-initial"
            >
              {isExporting === 'excel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              Export Excel (.xlsx)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TeacherAttendanceExporter;
