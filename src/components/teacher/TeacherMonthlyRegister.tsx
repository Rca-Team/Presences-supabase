import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileDown,
  Calendar,
  Printer,
  Loader2,
  CheckCircle2,
  UserX,
  Clock,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Zap,
  Award,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { matchesClassAndSection, normalizeCategory } from '@/utils/teacherAccess';

interface ClassStudentProp {
  id: string;
  user_id?: string;
  name: string;
  roll_number?: string;
  admission_number?: string;
  photo_url?: string;
  has_face_descriptor?: boolean;
  today_status?: 'present' | 'late' | 'absent' | 'unmarked';
  today_time?: string;
}

interface Props {
  classNameNumber: string;
  section: string;
  category: string;
  students: ClassStudentProp[];
}

type AttendanceStatus = 'P' | 'A' | 'L' | null;

export const TeacherMonthlyRegister: React.FC<Props> = ({
  classNameNumber,
  section,
  category,
  students,
}) => {
  const { toast } = useToast();
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<number, AttendanceStatus>>>({});
  const [isUpdatingCell, setIsUpdatingCell] = useState(false);

  // Calculate days in the selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  // Days array 1..31
  const daysArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  // Check if a day is Sunday
  const isSunday = useCallback((day: number) => {
    const d = new Date(selectedYear, selectedMonth, day);
    return d.getDay() === 0;
  }, [selectedMonth, selectedYear]);

  // Working days count in this month (non-Sundays)
  const totalWorkingDaysInMonth = useMemo(() => {
    return daysArray.filter(d => !isSunday(d)).length;
  }, [daysArray, isSunday]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Fetch all attendance records for selected month
  const fetchMonthlyData = useCallback(async () => {
    if (students.length === 0) return;
    setLoading(true);
    try {
      const startDate = new Date(selectedYear, selectedMonth, 1, 0, 0, 0).toISOString();
      const endDate = new Date(selectedYear, selectedMonth, daysInMonth, 23, 59, 59).toISOString();

      // Query attendance records for the month
      const { data: records, error } = await supabase
        .from('attendance_records')
        .select('id, user_id, student_id, student_name, class, section, category, status, timestamp, device_info')
        .gte('timestamp', startDate)
        .lte('timestamp', endDate)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Map helper
      const grid: Record<string, Record<number, AttendanceStatus>> = {};

      const norm = (v: any) => (v == null ? '' : String(v).trim().toLowerCase());

      // Index students by id, userId, admission_number, and name
      const studentLookup = new Map<string, string>(); // aliasKey -> student.id
      students.forEach(s => {
        studentLookup.set(s.id, s.id);
        if (s.user_id) studentLookup.set(norm(s.user_id), s.id);
        if (s.admission_number) studentLookup.set(norm(s.admission_number), s.id);
        if (s.roll_number) studentLookup.set(norm(s.roll_number), s.id);
        if (s.name) studentLookup.set(norm(s.name), s.id);
      });

      (records || []).forEach((r: any) => {
        // Skip registration rows, only process actual attendance marks
        if (r.status === 'registered') return;

        const dateObj = new Date(r.timestamp);
        const day = dateObj.getDate();

        const sName = norm(r.student_name || r.device_info?.metadata?.name || r.device_info?.name);
        const uId = norm(r.user_id);
        const sId = norm(r.student_id || r.device_info?.metadata?.employee_id || r.device_info?.employee_id);
        const roll = norm(r.device_info?.metadata?.roll_number);

        // Find matching student
        const targetStudentId =
          studentLookup.get(uId) ||
          studentLookup.get(sId) ||
          studentLookup.get(roll) ||
          studentLookup.get(sName);

        if (targetStudentId) {
          const rawStatus = (r.status || '').toLowerCase();
          const statusChar: AttendanceStatus = rawStatus.includes('late')
            ? 'L'
            : rawStatus.includes('absent')
            ? 'A'
            : 'P';

          if (!grid[targetStudentId]) grid[targetStudentId] = {};
          grid[targetStudentId][day] = statusChar;
        }
      });

      setAttendanceData(grid);
    } catch (err: any) {
      console.error('Failed to load monthly attendance:', err);
      toast({ title: 'Failed to load attendance', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear, daysInMonth, students, toast]);

  useEffect(() => {
    fetchMonthlyData();

    // Supabase Realtime subscription for instant live attendance sync
    const channel = supabase
      .channel('attendance_records_monthly_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          fetchMonthlyData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMonthlyData]);

  // Per-student monthly calculation
  const calculateStudentStats = useCallback((studentId: string) => {
    const records = attendanceData[studentId] || {};
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    Object.entries(records).forEach(([dayStr, st]) => {
      const dayNum = Number(dayStr);
      if (isSunday(dayNum)) return; // Exclude Sundays from academic totals

      if (st === 'P') presentCount++;
      if (st === 'L') {
        lateCount++;
        presentCount += 1; // Counted as present in CBSE with late flag
      }
      if (st === 'A') absentCount++;
    });

    const totalDaysRecorded = Object.keys(records).filter(d => !isSunday(Number(d))).length;
    // Calculate percentage based on recorded days, or working days
    const divisor = totalDaysRecorded > 0 ? totalDaysRecorded : 1;
    const pct = totalDaysRecorded > 0 ? Math.round((presentCount / divisor) * 100) : 0;

    return {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      totalMarked: totalDaysRecorded,
      pct,
    };
  }, [attendanceData, isSunday]);

  // Overall Class Realtime Summary Metrics
  const classSummary = useMemo(() => {
    let totalPresentsAcrossClass = 0;
    let totalAbsentsAcrossClass = 0;
    let totalLatesAcrossClass = 0;
    let studentsWith100Pct = 0;
    let studentsBelow75Pct = 0;
    let sumPercentages = 0;

    students.forEach(s => {
      const stats = calculateStudentStats(s.id);
      totalPresentsAcrossClass += stats.present;
      totalAbsentsAcrossClass += stats.absent;
      totalLatesAcrossClass += stats.late;
      sumPercentages += stats.pct;

      if (stats.totalMarked > 0 && stats.pct === 100) studentsWith100Pct++;
      if (stats.totalMarked > 0 && stats.pct < 75) studentsBelow75Pct++;
    });

    const avgAttendancePct = students.length > 0 ? Math.round(sumPercentages / students.length) : 0;

    return {
      avgAttendancePct,
      totalPresentsAcrossClass,
      totalAbsentsAcrossClass,
      totalLatesAcrossClass,
      studentsWith100Pct,
      studentsBelow75Pct,
    };
  }, [students, calculateStudentStats]);

  // Daily Class Attendance Counts (Column totals)
  const dayTotals = useMemo(() => {
    const map: Record<number, { present: number; absent: number; late: number }> = {};
    daysArray.forEach(d => {
      let p = 0;
      let a = 0;
      let l = 0;
      students.forEach(s => {
        const st = attendanceData[s.id]?.[d];
        if (st === 'P') p++;
        else if (st === 'L') l++;
        else if (st === 'A') a++;
      });
      map[d] = { present: p, absent: a, late: l };
    });
    return map;
  }, [daysArray, students, attendanceData]);

  // Interactive 1-Tap Cell Toggle Handler (— -> P -> L -> A -> —)
  const handleToggleCell = async (student: ClassStudentProp, day: number) => {
    if (isSunday(day)) {
      toast({ title: 'Sunday', description: 'Sundays are official school holidays.', variant: 'default' });
      return;
    }

    const current = attendanceData[student.id]?.[day] || null;
    let nextStatus: AttendanceStatus = 'P';
    if (current === 'P') nextStatus = 'L';
    else if (current === 'L') nextStatus = 'A';
    else if (current === 'A') nextStatus = null;
    else nextStatus = 'P';

    // Optimistically update local grid
    setAttendanceData(prev => ({
      ...prev,
      [student.id]: {
        ...(prev[student.id] || {}),
        [day]: nextStatus,
      },
    }));

    // Persist to Supabase
    try {
      const targetDate = new Date(selectedYear, selectedMonth, day, 9, 0, 0);
      const startOfDay = new Date(selectedYear, selectedMonth, day, 0, 0, 0).toISOString();
      const endOfDay = new Date(selectedYear, selectedMonth, day, 23, 59, 59).toISOString();

      // Clear existing record for this student on that day if any
      let delQuery = supabase.from('attendance_records').delete().gte('timestamp', startOfDay).lte('timestamp', endOfDay);
      if (student.user_id) delQuery = delQuery.eq('user_id', student.user_id);
      else delQuery = delQuery.eq('student_name', student.name);
      await delQuery;

      // If nextStatus is not null, insert new record
      if (nextStatus !== null) {
        const dbStatus = nextStatus === 'P' ? 'present' : nextStatus === 'L' ? 'late' : 'absent';
        await supabase.from('attendance_records').insert({
          user_id: student.user_id || null,
          student_id: student.admission_number || student.roll_number || null,
          student_name: student.name,
          class: classNameNumber,
          section: section,
          category: category,
          status: dbStatus,
          timestamp: targetDate.toISOString(),
          device_info: {
            metadata: {
              name: student.name,
              roll_number: student.roll_number,
              class: classNameNumber,
              section: section,
              department: category,
            },
          },
        });
      }
    } catch (err: any) {
      console.error('Error saving attendance mark:', err);
      toast({ title: 'Sync error', description: err.message, variant: 'destructive' });
      fetchMonthlyData();
    }
  };

  // 1-Click Fast Action: Mark All Present For Today
  const handleMarkAllPresentToday = async () => {
    const today = new Date();
    if (today.getMonth() !== selectedMonth || today.getFullYear() !== selectedYear) {
      setSelectedMonth(today.getMonth());
      setSelectedYear(today.getFullYear());
    }

    const todayDay = today.getDate();
    if (isSunday(todayDay)) {
      toast({ title: 'Sunday', description: 'Cannot mark attendance on Sunday.', variant: 'destructive' });
      return;
    }

    setIsUpdatingCell(true);
    try {
      const startOfDay = new Date(selectedYear, selectedMonth, todayDay, 0, 0, 0).toISOString();
      const endOfDay = new Date(selectedYear, selectedMonth, todayDay, 23, 59, 59).toISOString();

      // Clear today's old marks for this class
      await supabase
        .from('attendance_records')
        .delete()
        .or(`and(class.eq.${classNameNumber},section.eq.${section}),category.eq.${category}`)
        .gte('timestamp', startOfDay)
        .lte('timestamp', endOfDay);

      // Insert present rows for all students
      const newRows = students.map(s => ({
        user_id: s.user_id || null,
        student_id: s.admission_number || s.roll_number || null,
        student_name: s.name,
        class: classNameNumber,
        section: section,
        category: category,
        status: 'present',
        timestamp: today.toISOString(),
        device_info: {
          metadata: {
            name: s.name,
            roll_number: s.roll_number,
            class: classNameNumber,
            section: section,
            department: category,
          },
        },
      }));

      await supabase.from('attendance_records').insert(newRows);

      toast({
        title: '✅ Marked All Present for Today',
        description: `Successfully logged present status for all ${students.length} students on Day ${todayDay}.`,
      });

      fetchMonthlyData();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsUpdatingCell(false);
    }
  };

  // Excel Exporter
  const handleExportExcel = () => {
    try {
      const headerRow = [
        'Roll No',
        'Student Name',
        'Admission No',
        ...daysArray.map((d) => `Day ${d}${isSunday(d) ? ' (Sun)' : ''}`),
        'Total Present (P)',
        'Total Absent (A)',
        'Total Late (L)',
        'Monthly Attendance %',
        'CBSE Status',
      ];

      const rows = students.map((s, idx) => {
        const stats = calculateStudentStats(s.id);
        const dayValues = daysArray.map((d) => {
          if (isSunday(d)) return 'SUN';
          return attendanceData[s.id]?.[d] || '—';
        });

        return [
          s.roll_number || idx + 1,
          s.name,
          s.admission_number || '—',
          ...dayValues,
          stats.present,
          stats.absent,
          stats.late,
          `${stats.pct}%`,
          stats.pct >= 75 ? 'ELIGIBLE' : 'DEFAULTER (<75%)',
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([
        [`PM Shri Kendriya Vidyalaya NFC Vigyan Vihar`],
        [`Official CBSE Monthly Attendance Register — Class ${category}`],
        [`Month: ${monthNames[selectedMonth]} ${selectedYear} | Total Enrolled: ${students.length} Students | Working Days: ${totalWorkingDaysInMonth}`],
        [],
        headerRow,
        ...rows,
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Register_${category}`);
      XLSX.writeFile(wb, `CBSE_Monthly_Register_Class_${category}_${monthNames[selectedMonth]}_${selectedYear}.xlsx`);

      toast({
        title: 'Excel Exported',
        description: `Downloaded official register for Class ${category}.`,
      });
    } catch (err: any) {
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    }
  };

  // Printable Noticeboard HTML
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Monthly Attendance Register - Class ${category}</title>
          <style>
            @page { size: landscape; margin: 8mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 15px; background: #fff; }
            .header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
            .title { font-size: 20px; font-weight: bold; color: #1e3a8a; margin: 0; }
            .subtitle { font-size: 13px; color: #475569; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 5px 3px; text-align: center; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .th-name { text-align: left; width: 140px; }
            .sun-cell { background-color: #fee2e2; color: #b91c1c; font-weight: bold; }
            .p-cell { color: #15803d; font-weight: bold; }
            .a-cell { color: #b91c1c; font-weight: bold; }
            .l-cell { color: #b45309; font-weight: bold; }
            .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 11px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">PM Shri Kendriya Vidyalaya NFC Vigyan Vihar</div>
            <div class="subtitle">Official CBSE Monthly Attendance Register • Class ${category} • ${monthNames[selectedMonth]} ${selectedYear}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th class="th-name">Student Name</th>
                ${daysArray.map(d => `<th class="${isSunday(d) ? 'sun-cell' : ''}">${d}</th>`).join('')}
                <th>P</th>
                <th>A</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              ${students.map((s, idx) => {
                const stats = calculateStudentStats(s.id);
                return `<tr>
                  <td>${s.roll_number || idx + 1}</td>
                  <td class="th-name" style="text-align: left; font-weight: 600;">${s.name}</td>
                  ${daysArray.map(d => {
                    if (isSunday(d)) return `<td class="sun-cell">S</td>`;
                    const st = attendanceData[s.id]?.[d];
                    if (st === 'P') return `<td class="p-cell">P</td>`;
                    if (st === 'L') return `<td class="l-cell">L</td>`;
                    if (st === 'A') return `<td class="a-cell">A</td>`;
                    return `<td>—</td>`;
                  }).join('')}
                  <td><strong>${stats.present}</strong></td>
                  <td><strong style="color: #b91c1c;">${stats.absent}</strong></td>
                  <td><strong>${stats.pct}%</strong></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div class="footer">
            <div>Class Teacher Signature: ____________________</div>
            <div>Time Table In-Charge: ____________________</div>
            <div>Principal Signature: ____________________</div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <Card className="rounded-3xl border shadow-xl bg-card/70 backdrop-blur-xl overflow-hidden">
      <CardHeader className="pb-3 border-b bg-gradient-to-r from-muted/50 via-muted/20 to-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <CardTitle className="text-base sm:text-lg font-extrabold flex items-center gap-2 text-foreground">
              <Calendar className="h-5 w-5 text-primary" />
              Monthly Attendance Register • Class {category}
            </CardTitle>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs font-bold">
              {students.length} Enrolled Students
            </Badge>
          </div>
          <CardDescription className="text-xs mt-0.5">
            Official CBSE day-by-day attendance matrix with real-time statistics & 1-tap fast mark
          </CardDescription>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
            <SelectTrigger className="h-8 text-xs w-32 rounded-xl bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((name, i) => (
                <SelectItem key={name} value={String(i)} className="text-xs">{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
            <SelectTrigger className="h-8 text-xs w-24 rounded-xl bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2025, 2026, 2027].map((yr) => (
                <SelectItem key={yr} value={String(yr)} className="text-xs">{yr}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            onClick={handleMarkAllPresentToday}
            disabled={isUpdatingCell}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-emerald-600/20"
            title="Mark all enrolled students present for today"
          >
            {isUpdatingCell ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Mark Today (All Present)
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="h-8 px-3 text-xs rounded-xl gap-1.5 font-semibold"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>

          <Button
            size="sm"
            onClick={handleExportExcel}
            className="h-8 px-3.5 text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl gap-1.5 shadow-md shadow-emerald-600/20"
          >
            <FileDown className="h-3.5 w-3.5" /> Export Excel
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-4 space-y-4">
        {/* Real-time Summary Cards Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-2xl bg-primary/5 border border-primary/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Class Average Attendance</p>
              <p className={`text-xl font-extrabold mt-0.5 ${classSummary.avgAttendancePct >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}>
                {classSummary.avgAttendancePct}%
              </p>
            </div>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Total Present Sessions</p>
              <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {classSummary.totalPresentsAcrossClass}
              </p>
            </div>
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-rose-500/5 border border-rose-500/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Absent Instances</p>
              <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
                {classSummary.totalAbsentsAcrossClass}
              </p>
            </div>
            <div className="h-8 w-8 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
              <UserX className="h-4 w-4" />
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Below 75% Cutoff</p>
              <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">
                {classSummary.studentsBelow75Pct} Defaulter(s)
              </p>
            </div>
            <div className="h-8 w-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Matrix Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Loading realtime monthly attendance records…</p>
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-xs">
            No students found in Class {category}.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-background/50 shadow-inner">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 border-b">
                  <th className="p-2.5 text-center font-bold text-muted-foreground w-10">#</th>
                  <th className="p-2.5 text-left font-extrabold text-foreground min-w-[170px] sticky left-0 bg-muted/80 backdrop-blur z-10 border-r">
                    Student Name
                  </th>
                  {daysArray.map((day) => {
                    const isSun = isSunday(day);
                    return (
                      <th
                        key={day}
                        className={`p-1.5 text-center font-bold min-w-[28px] border-r ${
                          isSun
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'text-muted-foreground'
                        }`}
                        title={isSun ? `Day ${day} (Sunday)` : `Day ${day}`}
                      >
                        <div className="text-[11px] font-mono">{day}</div>
                        <div className="text-[9px] font-normal uppercase opacity-70">
                          {isSun ? 'Sun' : ''}
                        </div>
                      </th>
                    );
                  })}
                  <th className="p-2 text-center font-extrabold text-emerald-600 dark:text-emerald-400 min-w-[36px] bg-emerald-500/10 border-l">
                    P
                  </th>
                  <th className="p-2 text-center font-extrabold text-rose-600 dark:text-rose-400 min-w-[36px] bg-rose-500/10 border-l">
                    A
                  </th>
                  <th className="p-2 text-center font-extrabold text-foreground min-w-[65px] bg-muted/70 border-l">
                    Monthly %
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60">
                {students.map((student, sIdx) => {
                  const stats = calculateStudentStats(student.id);

                  return (
                    <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2 text-center font-mono text-muted-foreground text-[11px]">
                        {student.roll_number || sIdx + 1}
                      </td>

                      <td className="p-2.5 font-extrabold text-foreground sticky left-0 bg-background/95 backdrop-blur z-10 border-r">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{student.name}</span>
                        </div>
                      </td>

                      {daysArray.map((day) => {
                        const isSun = isSunday(day);
                        if (isSun) {
                          return (
                            <td
                              key={day}
                              className="p-1 text-center bg-rose-500/5 text-rose-400/60 font-bold border-r text-[10px] select-none"
                              title="Sunday"
                            >
                              •
                            </td>
                          );
                        }

                        const status = attendanceData[student.id]?.[day] || null;

                        return (
                          <td key={day} className="p-1 text-center border-r">
                            <button
                              type="button"
                              onClick={() => handleToggleCell(student, day)}
                              className={`w-6 h-6 mx-auto rounded-lg text-[10px] font-extrabold flex items-center justify-center transition-all ${
                                status === 'P'
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20 hover:scale-110'
                                  : status === 'L'
                                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20 hover:scale-110'
                                  : status === 'A'
                                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20 hover:scale-110'
                                  : 'text-muted-foreground/30 hover:bg-muted/80 hover:text-foreground'
                              }`}
                              title={`Day ${day}: ${status ? (status === 'P' ? 'Present' : status === 'L' ? 'Late' : 'Absent') : 'Unmarked'}. Tap to toggle.`}
                            >
                              {status || '—'}
                            </button>
                          </td>
                        );
                      })}

                      <td className="p-2 text-center font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-l font-mono">
                        {stats.present}
                      </td>

                      <td className="p-2 text-center font-extrabold text-rose-600 dark:text-rose-400 bg-rose-500/5 border-l font-mono">
                        {stats.absent}
                      </td>

                      <td className="p-2 text-center border-l bg-muted/20">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-extrabold ${
                            stats.pct >= 75
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : stats.pct >= 60
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : stats.totalMarked > 0
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'text-muted-foreground/60'
                          }`}
                        >
                          {stats.pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {/* Day-by-Day Summary Totals Row */}
                <tr className="bg-muted/70 font-extrabold border-t-2">
                  <td className="p-2 text-center text-muted-foreground text-[10px]">TOT</td>
                  <td className="p-2.5 text-foreground sticky left-0 bg-muted/90 backdrop-blur z-10 border-r text-xs">
                    Class Present / Day
                  </td>
                  {daysArray.map((day) => {
                    const isSun = isSunday(day);
                    if (isSun) {
                      return <td key={day} className="p-1 text-center bg-rose-500/10 text-[10px] border-r">—</td>;
                    }
                    const totals = dayTotals[day] || { present: 0, absent: 0, late: 0 };
                    const activeCount = totals.present + totals.late;

                    return (
                      <td
                        key={day}
                        className={`p-1 text-center text-[10px] font-mono border-r ${
                          activeCount > 0 ? 'text-emerald-600 font-extrabold' : 'text-muted-foreground/40'
                        }`}
                        title={`Present: ${totals.present}, Late: ${totals.late}, Absent: ${totals.absent}`}
                      >
                        {activeCount > 0 ? activeCount : '—'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center text-emerald-600 font-mono text-xs border-l">
                    {classSummary.totalPresentsAcrossClass}
                  </td>
                  <td className="p-2 text-center text-rose-600 font-mono text-xs border-l">
                    {classSummary.totalAbsentsAcrossClass}
                  </td>
                  <td className="p-2 text-center text-primary font-mono text-xs border-l">
                    {classSummary.avgAttendancePct}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-muted-foreground pt-1">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500/50" /> <strong>P</strong>: Present
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-amber-500/20 border border-amber-500/50" /> <strong>L</strong>: Late
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500/20 border border-rose-500/50" /> <strong>A</strong>: Absent
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-rose-500/10" /> <strong>Sun</strong>: Sunday Holiday
            </span>
          </div>
          <div>💡 Tap any cell to cycle status (— ➔ P ➔ L ➔ A ➔ —) with instant realtime saving</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeacherMonthlyRegister;
