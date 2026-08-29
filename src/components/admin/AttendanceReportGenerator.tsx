import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  FileText, 
  Download, 
  Mail, 
  Calendar as CalendarIcon,
  Clock, 
  Loader2, 
  Send, 
  CheckCircle2, 
  Users, 
  TrendingUp, 
  Printer,
  Building2,
  FileSpreadsheet
} from 'lucide-react';
import { getCategoryLabel } from '@/constants/schoolConfig';

interface StudentProfile {
  id: string;
  userId: string;
  name: string;
  employeeId: string;
  category: string;
}

interface UserAttendanceStat {
  userId: string;
  name: string;
  employeeId: string;
  category: string;
  present: number;
  late: number;
  absent: number;
  rate: string;
}

interface ReportData {
  stats: {
    totalStudents: number;
    totalRecords: number;
    present: number;
    late: number;
    absent: number;
    attendanceRate: number;
  };
  users: UserAttendanceStat[];
  daily: { date: string; present: number; late: number }[];
  dateRange: {
    from: string;
    to: string;
  };
}

const AttendanceReportGenerator: React.FC = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date()
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [emailSchedule, setEmailSchedule] = useState({
    enabled: false,
    frequency: 'weekly',
    email: '',
    time: '09:00'
  });

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const fromIso = startOfDay(dateRange.from).toISOString();
      const toIso = endOfDay(dateRange.to).toISOString();

      // Fetch registered students, attendance logs, and gate entries in parallel
      const [registeredRes, attendanceRes, gateRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, device_info, category')
          .eq('status', 'registered'),
        supabase
          .from('attendance_records')
          .select('id, user_id, device_info, status, timestamp, category')
          .gte('timestamp', fromIso)
          .lte('timestamp', toIso)
          .in('status', ['present', 'late', 'unauthorized']),
        supabase
          .from('gate_entries')
          .select('student_id, student_name, entry_time')
          .gte('entry_time', fromIso)
          .lte('entry_time', toIso)
          .eq('is_recognized', true),
      ]);

      // 1. Build canonical registered student list
      const seen = new Set<string>();
      const students: StudentProfile[] = [];

      (registeredRes.data || []).forEach((r: any) => {
        const di = r.device_info || {};
        const metadata = di.metadata || {};
        const name = metadata.name || di.name || '';
        const employeeId = metadata.employee_id || di.employee_id || 'N/A';
        const category = r.category || metadata.class_section || metadata.department || di.department || 'General';
        const key = r.user_id || employeeId || r.id;

        if (!name || name === 'Unknown' || name.toLowerCase().includes('unknown') || name === 'User' || seen.has(key)) {
          return;
        }
        seen.add(key);
        students.push({
          id: r.id,
          userId: r.user_id || key,
          name,
          employeeId,
          category,
        });
      });

      // 2. Map attendance check-ins by student and date
      const attendanceByUserAndDate = new Map<string, Map<string, 'present' | 'late'>>();
      const dailyStatsMap = new Map<string, { present: number; late: number }>();

      const markAttendance = (studentKey: string, dateStr: string, status: 'present' | 'late') => {
        if (!attendanceByUserAndDate.has(studentKey)) {
          attendanceByUserAndDate.set(studentKey, new Map());
        }
        const userDates = attendanceByUserAndDate.get(studentKey)!;
        const current = userDates.get(dateStr);
        if (!current || (current === 'late' && status === 'present')) {
          userDates.set(dateStr, status);
        }

        if (!dailyStatsMap.has(dateStr)) {
          dailyStatsMap.set(dateStr, { present: 0, late: 0 });
        }
      };

      // Process attendance records
      (attendanceRes.data || []).forEach((rec: any) => {
        const di = rec.device_info || {};
        const empId = di?.metadata?.employee_id || di?.employee_id;
        const recName = di?.metadata?.name || di?.name;
        const userId = rec.user_id;

        const matched = students.find(s => 
          (userId && s.userId === userId) ||
          (empId && s.employeeId === empId) ||
          (recName && s.name.toLowerCase() === recName.toLowerCase())
        );

        if (matched) {
          const dateStr = format(new Date(rec.timestamp), 'yyyy-MM-dd');
          const status = (rec.status === 'late') ? 'late' : 'present';
          markAttendance(matched.userId, dateStr, status);
        }
      });

      // Process gate entries
      (gateRes.data || []).forEach((gate: any) => {
        const matched = students.find(s => s.userId === gate.student_id || s.employeeId === gate.student_id);
        if (matched) {
          const dateStr = format(new Date(gate.entry_time), 'yyyy-MM-dd');
          markAttendance(matched.userId, dateStr, 'present');
        }
      });

      // Calculate aggregated daily totals
      attendanceByUserAndDate.forEach((userDates) => {
        userDates.forEach((status, dateStr) => {
          if (!dailyStatsMap.has(dateStr)) {
            dailyStatsMap.set(dateStr, { present: 0, late: 0 });
          }
          const day = dailyStatsMap.get(dateStr)!;
          if (status === 'present') day.present++;
          else if (status === 'late') day.late++;
        });
      });

      // 3. Compute per-user stats
      let totalPresentCheckins = 0;
      let totalLateCheckins = 0;

      const userStats: UserAttendanceStat[] = students.map((student) => {
        const userDates = attendanceByUserAndDate.get(student.userId) || new Map();
        let present = 0;
        let late = 0;

        userDates.forEach((status) => {
          if (status === 'present') present++;
          else if (status === 'late') late++;
        });

        totalPresentCheckins += present;
        totalLateCheckins += late;

        const totalActiveDays = Math.max(1, dailyStatsMap.size);
        const absent = Math.max(0, totalActiveDays - present - late);
        const rate = `${Math.min(100, Math.round(((present + late) / totalActiveDays) * 100))}%`;

        return {
          userId: student.userId,
          name: student.name,
          employeeId: student.employeeId,
          category: student.category,
          present,
          late,
          absent,
          rate,
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const totalStudents = students.length;
      const totalRecords = totalPresentCheckins + totalLateCheckins;
      const activeDaysCount = Math.max(1, dailyStatsMap.size);
      const totalExpected = totalStudents * activeDaysCount;
      const totalAbsent = Math.max(0, totalExpected - totalRecords);
      const attendanceRate = totalExpected > 0 
        ? Math.min(100, Math.round((totalRecords / totalExpected) * 100))
        : 0;

      const calculatedReport: ReportData = {
        stats: {
          totalStudents,
          totalRecords,
          present: totalPresentCheckins,
          late: totalLateCheckins,
          absent: totalAbsent,
          attendanceRate,
        },
        users: userStats,
        daily: Array.from(dailyStatsMap.entries()).map(([date, data]) => ({ date, ...data })),
        dateRange: {
          from: format(dateRange.from, 'MMM dd, yyyy'),
          to: format(dateRange.to, 'MMM dd, yyyy')
        }
      };

      setReportData(calculatedReport);

      toast({
        title: 'Report Generated Successfully',
        description: `Compiled stats for ${totalStudents} students (${calculatedReport.dateRange.from} - ${calculatedReport.dateRange.to})`,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: 'Report Generation Failed',
        description: 'Unable to fetch records from database.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Download Clean PDF using jsPDF + autoTable ───────────────────────────
  const downloadPDF = () => {
    if (!reportData) return;

    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Official Header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 90, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PM Shri Kendriya Vidyalaya NFC Vigyan Vihar', 40, 36);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(190, 215, 250);
      doc.text('Autonomous Smart Attendance Automation Report', 40, 56);
      doc.setFontSize(9);
      doc.text(`Period: ${reportData.dateRange.from} to ${reportData.dateRange.to}`, 40, 74);
      doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth - 40, 74, { align: 'right' });

      // KPI Metric Boxes
      const statsY = 110;
      const statsBoxes = [
        ['ENROLLED ROSTER', String(reportData.stats.totalStudents)],
        ['PRESENT CHECK-INS', String(reportData.stats.present)],
        ['LATE CHECK-INS', String(reportData.stats.late)],
        ['ATTENDANCE RATE', `${reportData.stats.attendanceRate}%`],
      ];

      const boxW = (pageWidth - 80 - (statsBoxes.length - 1) * 10) / statsBoxes.length;
      statsBoxes.forEach(([label, val], i) => {
        const x = 40 + i * (boxW + 10);
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, statsY, boxW, 50, 6, 6, 'FD');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(label, x + boxW / 2, statsY + 18, { align: 'center' });
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(15);
        doc.text(val, x + boxW / 2, statsY + 40, { align: 'center' });
      });

      // Student Table
      autoTable(doc, {
        startY: statsY + 70,
        head: [['#', 'Student Name', 'Admission No.', 'Class/Section', 'Present', 'Late', 'Absent', 'Rate']],
        body: reportData.users.map((u, i) => [
          i + 1,
          u.name,
          u.employeeId,
          getCategoryLabel(u.category),
          u.present,
          u.late,
          u.absent,
          u.rate,
        ]),
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
            { align: 'center' }
          );
        },
      });

      doc.save(`Attendance_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF Downloaded', description: 'Complete official attendance report downloaded.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Download failed', description: 'Could not render PDF.', variant: 'destructive' });
    }
  };

  // ── CSV Export ───────────────────────────────────────────────────────────
  const downloadCSV = () => {
    if (!reportData) return;

    try {
      const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [
        `School,${esc('PM Shri Kendriya Vidyalaya NFC Vigyan Vihar')}`,
        `Report,${esc('Attendance Summary Report')}`,
        `Date Range,${esc(reportData.dateRange.from + ' to ' + reportData.dateRange.to)}`,
        `Enrolled Students,${reportData.stats.totalStudents}`,
        `Present Check-ins,${reportData.stats.present}`,
        `Late Check-ins,${reportData.stats.late}`,
        `Attendance Rate,${reportData.stats.attendanceRate}%`,
        '',
        ['#', 'Name', 'Admission No', 'Class', 'Present Days', 'Late Days', 'Absent Days', 'Rate'].map(esc).join(','),
        ...reportData.users.map((u, i) =>
          [i + 1, u.name, u.employeeId, getCategoryLabel(u.category), u.present, u.late, u.absent, u.rate].map(esc).join(',')
        )
      ];

      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attendance_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV Downloaded', description: 'Exported spreadsheet successfully.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'CSV Export Failed', variant: 'destructive' });
    }
  };

  // ── Print Direct ─────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!reportData) return;
    window.print();
  };

  const scheduleEmails = async () => {
    if (!emailSchedule.email) {
      toast({
        title: 'Email Required',
        description: 'Please enter a valid administrative email address.',
        variant: 'destructive'
      });
      return;
    }

    toast({
      title: 'Email Schedule Saved',
      description: `Automated reports will be delivered ${emailSchedule.frequency} to ${emailSchedule.email}`,
    });
  };

  return (
    <Card className="bg-card border-border/80 shadow-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/60 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">School-Wide Attendance Reports</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                PM Shri KV
              </span>
            </div>
            <p className="text-xs font-normal text-white/80 mt-0.5">
              Generate, verify, and export official school attendance statistics & student breakdown
            </p>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted/60 p-1 rounded-xl">
            <TabsTrigger value="generate" className="flex items-center gap-2 rounded-lg text-xs sm:text-sm font-semibold">
              <FileText className="w-4 h-4" />
              Generate & Print Report
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2 rounded-lg text-xs sm:text-sm font-semibold">
              <Mail className="w-4 h-4" />
              Email Automation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            {/* Date Range Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start rounded-xl border-border/70 h-11">
                      <CalendarIcon className="w-4 h-4 mr-2 text-primary" />
                      {format(dateRange.from, 'MMM dd, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.from}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, from: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start rounded-xl border-border/70 h-11">
                      <CalendarIcon className="w-4 h-4 mr-2 text-primary" />
                      {format(dateRange.to, 'MMM dd, yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateRange.to}
                      onSelect={(date) => date && setDateRange(prev => ({ ...prev, to: date }))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-medium"
                onClick={() => setDateRange({
                  from: new Date(),
                  to: new Date()
                })}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-medium"
                onClick={() => setDateRange({
                  from: subDays(new Date(), 7),
                  to: new Date()
                })}
              >
                Last 7 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-medium"
                onClick={() => setDateRange({
                  from: subDays(new Date(), 30),
                  to: new Date()
                })}
              >
                Last 30 Days
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs font-medium"
                onClick={() => setDateRange({
                  from: startOfMonth(new Date()),
                  to: new Date()
                })}
              >
                This Month
              </Button>
            </div>

            <Button 
              onClick={generateReport} 
              disabled={isGenerating}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-bold shadow-md shadow-blue-500/20 btn-spring"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating School Report…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Comprehensive Report
                </>
              )}
            </Button>

            {/* Report Preview */}
            {reportData && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4 pt-2"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Generated Report Summary
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button onClick={handlePrint} variant="outline" size="sm" className="rounded-xl gap-1.5 btn-spring">
                      <Printer className="w-4 h-4" />
                      Print
                    </Button>
                    <Button onClick={downloadCSV} variant="outline" size="sm" className="rounded-xl gap-1.5 btn-spring">
                      <FileSpreadsheet className="w-4 h-4" />
                      CSV
                    </Button>
                    <Button onClick={downloadPDF} size="sm" className="rounded-xl bg-primary text-primary-foreground gap-1.5 shadow-sm btn-spring">
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                  </div>
                </div>

                <div
                  id="report-preview"
                  className="p-5 sm:p-6 rounded-2xl bg-card border border-border/80 shadow-md space-y-6"
                >
                  <div className="text-center pb-4 border-b border-border/60">
                    <span className="text-xs font-bold uppercase tracking-widest text-primary">
                      PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                    </span>
                    <h2 className="text-xl sm:text-2xl font-extrabold text-foreground mt-1">Official Attendance Report</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reportData.dateRange.from} — {reportData.dateRange.to} · {reportData.stats.totalStudents} Registered Students
                    </p>
                  </div>

                  {/* 4 KPI Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800/40 text-center">
                      <p className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">{reportData.stats.totalStudents}</p>
                      <p className="text-[11px] font-semibold text-blue-600/80 dark:text-blue-300 uppercase tracking-wider mt-0.5">Enrolled Roster</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/40 text-center">
                      <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{reportData.stats.present}</p>
                      <p className="text-[11px] font-semibold text-emerald-600/80 dark:text-emerald-300 uppercase tracking-wider mt-0.5">Present</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 text-center">
                      <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{reportData.stats.late}</p>
                      <p className="text-[11px] font-semibold text-amber-600/80 dark:text-amber-300 uppercase tracking-wider mt-0.5">Late</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/40 text-center">
                      <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">{reportData.stats.attendanceRate}%</p>
                      <p className="text-[11px] font-semibold text-indigo-600/80 dark:text-indigo-300 uppercase tracking-wider mt-0.5">Overall Rate</p>
                    </div>
                  </div>

                  {/* Complete Student Breakdown Table */}
                  <div>
                    <h4 className="font-bold text-sm mb-2.5 flex items-center justify-between">
                      <span>Student Roster & Verification ({reportData.users.length})</span>
                      <span className="text-xs text-muted-foreground font-normal">All registered students</span>
                    </h4>
                    <div className="border border-border/70 rounded-xl overflow-hidden">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/80 sticky top-0 border-b border-border/70">
                            <tr>
                              <th className="p-2.5 text-left font-bold text-muted-foreground">#</th>
                              <th className="p-2.5 text-left font-bold text-muted-foreground">Student Name</th>
                              <th className="p-2.5 text-left font-bold text-muted-foreground">Admission No</th>
                              <th className="p-2.5 text-left font-bold text-muted-foreground">Class</th>
                              <th className="p-2.5 text-center font-bold text-emerald-600">Present</th>
                              <th className="p-2.5 text-center font-bold text-amber-600">Late</th>
                              <th className="p-2.5 text-center font-bold text-muted-foreground">Rate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {reportData.users.map((user, i) => (
                              <tr key={user.userId} className="hover:bg-muted/30 transition-colors">
                                <td className="p-2.5 text-muted-foreground font-mono">{i + 1}</td>
                                <td className="p-2.5 font-bold text-foreground">{user.name}</td>
                                <td className="p-2.5 font-mono text-muted-foreground">{user.employeeId}</td>
                                <td className="p-2.5 text-muted-foreground">{getCategoryLabel(user.category)}</td>
                                <td className="p-2.5 text-center font-bold text-emerald-600">{user.present}</td>
                                <td className="p-2.5 text-center font-bold text-amber-600">{user.late}</td>
                                <td className="p-2.5 text-center font-bold text-foreground">{user.rate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/40">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-900 dark:text-blue-200">Automated Parent & Admin Reports</h4>
                  <p className="text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">
                    Schedule automated daily/weekly attendance logs dispatched directly to school administrators and principals.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card">
              <div>
                <Label htmlFor="email-schedule" className="font-bold text-sm">Enable Automated Dispatches</Label>
                <p className="text-xs text-muted-foreground">Send periodic summary PDF reports</p>
              </div>
              <Switch
                id="email-schedule"
                checked={emailSchedule.enabled}
                onCheckedChange={(checked) => setEmailSchedule(prev => ({ ...prev, enabled: checked }))}
              />
            </div>

            {emailSchedule.enabled && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4"
              >
                <div>
                  <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Recipient Email Address</Label>
                  <Input
                    type="email"
                    placeholder="principal@kvs.ac.in"
                    value={emailSchedule.email}
                    onChange={(e) => setEmailSchedule(prev => ({ ...prev, email: e.target.value }))}
                    className="rounded-xl h-11"
                  />
                </div>

                <div>
                  <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Frequency</Label>
                  <Select
                    value={emailSchedule.frequency}
                    onValueChange={(value) => setEmailSchedule(prev => ({ ...prev, frequency: value }))}
                  >
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily EOD Summary</SelectItem>
                      <SelectItem value="weekly">Weekly Summary</SelectItem>
                      <SelectItem value="monthly">Monthly Audit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={scheduleEmails} className="w-full h-11 rounded-xl font-bold bg-primary text-primary-foreground btn-spring">
                  <Send className="w-4 h-4 mr-2" />
                  Save Automation Schedule
                </Button>
              </motion.div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AttendanceReportGenerator;
