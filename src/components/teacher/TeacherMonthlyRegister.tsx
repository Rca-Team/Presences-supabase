import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Calendar, Printer, Loader2, CheckCircle2, UserX } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  classNameNumber: string;
  section: string;
  category: string;
  students: Array<{ id: string; user_id?: string; name: string; roll_number?: string; admission_number?: string }>;
}

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
  const [attendanceData, setAttendanceData] = useState<Record<string, Record<number, 'P' | 'A' | 'L'>>>({});

  // Days in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  const daysArray = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }, [daysInMonth]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  useEffect(() => {
    const fetchMonthlyData = async () => {
      setLoading(true);
      try {
        const startDate = new Date(selectedYear, selectedMonth, 1).toISOString();
        const endDate = new Date(selectedYear, selectedMonth, daysInMonth, 23, 59, 59).toISOString();

        const { data: records, error } = await supabase
          .from('attendance_records')
          .select('id, user_id, student_name, status, timestamp')
          .or(`and(class.eq.${classNameNumber},section.eq.${section}),category.eq.${category}`)
          .gte('timestamp', startDate)
          .lte('timestamp', endDate);

        if (error) throw error;

        // Map data: student_identifier -> dayOfMonth -> 'P' | 'A' | 'L'
        const grid: Record<string, Record<number, 'P' | 'A' | 'L'>> = {};

        (records || []).forEach((r) => {
          const day = new Date(r.timestamp).getDate();
          const sName = (r.student_name || '').trim().toLowerCase();
          const uId = r.user_id;
          const statusChar: 'P' | 'A' | 'L' = r.status?.toLowerCase().includes('late')
            ? 'L'
            : r.status?.toLowerCase().includes('absent')
            ? 'A'
            : 'P';

          // Match with student
          const matched = students.find((s) => s.user_id === uId || s.name.trim().toLowerCase() === sName);
          if (matched) {
            if (!grid[matched.id]) grid[matched.id] = {};
            grid[matched.id][day] = statusChar;
          }
        });

        setAttendanceData(grid);
      } catch (err: any) {
        console.error('Failed to load monthly attendance:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthlyData();
  }, [selectedMonth, selectedYear, classNameNumber, section, category, students, daysInMonth]);

  const calculateStudentStats = (studentId: string) => {
    const records = attendanceData[studentId] || {};
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    Object.values(records).forEach((st) => {
      if (st === 'P') presentCount++;
      if (st === 'L') {
        lateCount++;
        presentCount += 0.5; // KVS standard half-credit or counted present
      }
      if (st === 'A') absentCount++;
    });

    const totalMarked = Object.keys(records).length;
    const pct = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

    return { present: presentCount, late: lateCount, absent: absentCount, totalMarked, pct };
  };

  const handleExportExcel = () => {
    try {
      const headerRow = ['Roll No', 'Student Name', 'Admission No', ...daysArray.map((d) => `Day ${d}`), 'Total Present', 'Total Absent', 'Attendance %'];
      
      const rows = students.map((s, idx) => {
        const stats = calculateStudentStats(s.id);
        const dayValues = daysArray.map((d) => (attendanceData[s.id]?.[d] || '-'));
        return [
          s.roll_number || idx + 1,
          s.name,
          s.admission_number || '-',
          ...dayValues,
          stats.present,
          stats.absent,
          `${stats.pct}%`,
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([
        [`PM Shri Kendriya Vidyalaya — Monthly Attendance Register`],
        [`Class: ${category} | Month: ${monthNames[selectedMonth]} ${selectedYear}`],
        [],
        headerRow,
        ...rows,
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Attendance_${category}`);
      XLSX.writeFile(wb, `Monthly_Register_Class_${category}_${monthNames[selectedMonth]}_${selectedYear}.xlsx`);

      toast({ title: 'Export Successful', description: `Downloaded monthly register for Class ${category}` });
    } catch (e: any) {
      toast({ title: 'Export Failed', description: e.message, variant: 'destructive' });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Card className="rounded-3xl border shadow-lg overflow-hidden">
      <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-card to-muted/30 border-b">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base sm:text-lg font-extrabold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Monthly Attendance Register · Class {category}
            </CardTitle>
            <CardDescription className="text-xs">
              CBSE Official Day-by-Day Attendance Matrix ({students.length} Enrolled Students)
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] text-xs rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNames.map((name, idx) => (
                  <SelectItem key={name} value={String(idx)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="h-8 w-[95px] text-xs rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs rounded-xl gap-1.5 hidden md:inline-flex">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>

            <Button size="sm" onClick={handleExportExcel} className="h-8 text-xs rounded-xl font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <FileDown className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center p-12 space-y-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground ml-2">Loading register matrix...</span>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/70 text-[11px] font-bold text-foreground sticky top-0 z-10 backdrop-blur">
                <tr className="border-b border-border/80">
                  <th className="p-2.5 w-12 text-center sticky left-0 bg-muted/90 z-20">#</th>
                  <th className="p-2.5 min-w-[150px] sticky left-12 bg-muted/90 z-20">Student Name</th>
                  {daysArray.map((d) => (
                    <th key={d} className="p-1 w-7 text-center font-mono border-x border-border/40">
                      {d}
                    </th>
                  ))}
                  <th className="p-2.5 w-16 text-center text-emerald-600 dark:text-emerald-400">P</th>
                  <th className="p-2.5 w-16 text-center text-rose-600 dark:text-rose-400">A</th>
                  <th className="p-2.5 w-20 text-center font-bold">Monthly %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {students.map((student, idx) => {
                  const stats = calculateStudentStats(student.id);
                  return (
                    <tr key={student.id} className="hover:bg-muted/30 transition">
                      <td className="p-2 text-center font-mono text-muted-foreground sticky left-0 bg-card z-10">
                        {student.roll_number || idx + 1}
                      </td>
                      <td className="p-2 font-semibold text-foreground sticky left-12 bg-card z-10 truncate max-w-[180px]">
                        {student.name}
                      </td>
                      {daysArray.map((d) => {
                        const mark = attendanceData[student.id]?.[d];
                        return (
                          <td
                            key={d}
                            className={`p-1 text-center font-mono text-[11px] font-bold border-x border-border/30 ${
                              mark === 'P'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : mark === 'A'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : mark === 'L'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground/30'
                            }`}
                          >
                            {mark || '-'}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {stats.present}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-rose-600 dark:text-rose-400">
                        {stats.absent}
                      </td>
                      <td className="p-2 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            stats.pct >= 75
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                          }`}
                        >
                          {stats.pct}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
export default TeacherMonthlyRegister;
