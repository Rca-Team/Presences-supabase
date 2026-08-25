import React, { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RegisteredStudent {
  user_id: string | null;
  device_info: any;
  category: string | null;
}

interface AttendanceMark {
  user_id: string | null;
  status: string;
  timestamp: string;
  device_info: any;
}

interface ClassSummary {
  className: string;
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
}

const extractClass = (departmentOrClass: string | null | undefined): string => {
  if (!departmentOrClass) return 'Unassigned';
  const text = departmentOrClass.trim();
  const classMatch = text.match(/(?:class|grade)\s*(\d+)/i);
  if (classMatch?.[1]) return `Class ${classMatch[1]}`;
  const sectionMatch = text.match(/section\s*([a-z])/i);
  if (sectionMatch?.[1]) return `Section ${sectionMatch[1].toUpperCase()}`;
  return text;
};

const getEmployeeId = (deviceInfo: any): string => {
  return String(
    deviceInfo?.metadata?.employee_id ||
    deviceInfo?.employee_id ||
    deviceInfo?.employeeId ||
    ''
  ).trim();
};

const getClassFromStudent = (student: RegisteredStudent): string => {
  const metadata = student.device_info?.metadata || {};
  return extractClass(metadata.department || metadata.class || student.category || 'Unassigned');
};

const AttendanceExport: React.FC = () => {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState<'csv' | 'pdf' | null>(null);

  const buildTodayClassSummary = useCallback(async (): Promise<ClassSummary[]> => {
    const today = format(new Date(), 'yyyy-MM-dd');

    const { data: registered, error: regError } = await supabase
      .from('attendance_records')
      .select('user_id, device_info, category')
      .eq('status', 'registered');

    if (regError) throw regError;

    const { data: marks, error: marksError } = await supabase
      .from('attendance_records')
      .select('user_id, status, timestamp, device_info')
      .in('status', ['present', 'late', 'unauthorized'])
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`);

    if (marksError) throw marksError;

    const uniqueStudents = new Map<string, RegisteredStudent>();
    (registered || []).forEach((student: RegisteredStudent) => {
      const employeeId = getEmployeeId(student.device_info);
      const key = employeeId || student.user_id || Math.random().toString(36);
      if (!uniqueStudents.has(key)) uniqueStudents.set(key, student);
    });

    const attendanceByStudent = new Map<string, 'present' | 'late'>();
    (marks || []).forEach((mark: AttendanceMark) => {
      const employeeId = getEmployeeId(mark.device_info);
      const key = employeeId || mark.user_id || '';
      if (!key) return;

      const status = mark.status === 'late' ? 'late' : 'present';
      const previous = attendanceByStudent.get(key);
      if (previous === 'present') return;
      attendanceByStudent.set(key, status);
    });

    const summaryByClass = new Map<string, ClassSummary>();

    uniqueStudents.forEach((student, key) => {
      const className = getClassFromStudent(student);
      if (!summaryByClass.has(className)) {
        summaryByClass.set(className, {
          className,
          totalStudents: 0,
          present: 0,
          late: 0,
          absent: 0,
        });
      }

      const summary = summaryByClass.get(className)!;
      summary.totalStudents += 1;

      const mark = attendanceByStudent.get(key);
      if (mark === 'present') summary.present += 1;
      else if (mark === 'late') summary.late += 1;
      else summary.absent += 1;
    });

    return Array.from(summaryByClass.values()).sort((a, b) =>
      a.className.localeCompare(b.className, undefined, { numeric: true })
    );
  }, []);

  const downloadTodayCSV = useCallback(async () => {
    setIsExporting('csv');
    try {
      const summary = await buildTodayClassSummary();
      const today = format(new Date(), 'yyyy-MM-dd');

      const header = ['Class', 'Total Students', 'Present', 'Late', 'Absent', 'Attendance %'];
      const rows = summary.map((item) => {
        const attendancePct = item.totalStudents
          ? Math.round(((item.present + item.late) / item.totalStudents) * 100)
          : 0;
        return [
          item.className,
          item.totalStudents,
          item.present,
          item.late,
          item.absent,
          `${attendancePct}%`,
        ];
      });

      const csv = [
        header.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `attendance_today_by_class_${today}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV exported', description: 'Today\'s class-wise attendance downloaded.' });
    } catch (error) {
      console.error('CSV export failed:', error);
      toast({ title: 'Export failed', description: 'Unable to export CSV.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  }, [buildTodayClassSummary, toast]);

  const downloadTodayPDF = useCallback(async () => {
    setIsExporting('pdf');
    try {
      const summary = await buildTodayClassSummary();
      const today = format(new Date(), 'yyyy-MM-dd');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      pdf.setFontSize(16);
      pdf.text('Today Attendance Summary (By Class)', 40, 48);
      pdf.setFontSize(10);
      pdf.text(`Date: ${today}`, 40, 66);

      const body = summary.map((item) => {
        const attendancePct = item.totalStudents
          ? Math.round(((item.present + item.late) / item.totalStudents) * 100)
          : 0;
        return [
          item.className,
          String(item.totalStudents),
          String(item.present),
          String(item.late),
          String(item.absent),
          `${attendancePct}%`,
        ];
      });

      autoTable(pdf, {
        startY: 84,
        head: [['Class', 'Total', 'Present', 'Late', 'Absent', 'Attendance %']],
        body,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185] },
      });

      pdf.save(`attendance_today_by_class_${today}.pdf`);
      toast({ title: 'PDF exported', description: 'Today\'s class-wise attendance downloaded.' });
    } catch (error) {
      console.error('PDF export failed:', error);
      toast({ title: 'Export failed', description: 'Unable to export PDF.', variant: 'destructive' });
    } finally {
      setIsExporting(null);
    }
  }, [buildTodayClassSummary, toast]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={isExporting !== null}>
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Today Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={downloadTodayCSV} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Export Today CSV (By Class)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadTodayPDF} className="gap-2">
          <FileText className="h-4 w-4" />
          Export Today PDF (By Class)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AttendanceExport;
