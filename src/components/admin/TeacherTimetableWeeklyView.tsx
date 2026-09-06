import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CalendarDays,
  Clock,
  GraduationCap,
  Users,
  Sparkles,
  BookOpen,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Coffee,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSubjectTheme, STANDARD_8_PERIODS } from './TimetableManager';
import { cn } from '@/lib/utils';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface PeriodTiming {
  id?: string;
  period_number: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
  label: string | null;
}

interface TeacherOption {
  id: string;
  name: string;
  specialization?: string;
  role?: string;
}

interface TeacherSlotInfo {
  dayOfWeek: number;
  periodNumber: number;
  subjectName: string;
  className: string;
  section: string;
  room?: string;
  isSubstitution?: boolean;
  notes?: string;
}

interface TeacherTimetableWeeklyViewProps {
  teachers: TeacherOption[];
  periods?: PeriodTiming[];
  initialTeacherId?: string;
}

const db = supabase as any;

export const TeacherTimetableWeeklyView: React.FC<TeacherTimetableWeeklyViewProps> = ({
  teachers,
  periods = STANDARD_8_PERIODS,
  initialTeacherId,
}) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    initialTeacherId || (teachers.length > 0 ? teachers[0].id : '')
  );
  const [scheduleSlots, setScheduleSlots] = useState<Record<string, TeacherSlotInfo>>({});
  const [substitutions, setSubstitutions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Sync initialTeacherId if changed from parent
  useEffect(() => {
    if (initialTeacherId && initialTeacherId !== selectedTeacherId) {
      setSelectedTeacherId(initialTeacherId);
    } else if (!selectedTeacherId && teachers.length > 0) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [initialTeacherId, teachers, selectedTeacherId]);

  const activeTeacher = useMemo(() => {
    return teachers.find(t => t.id === selectedTeacherId) || null;
  }, [teachers, selectedTeacherId]);

  // Clean periods: strictly deduplicate by period_number 1 to 8
  const cleanPeriods = useMemo(() => {
    const map = new Map<number, PeriodTiming>();
    periods.forEach(p => {
      const num = Number(p.period_number);
      if (num > 0 && !p.is_break && !map.has(num)) {
        map.set(num, p);
      }
    });

    if (map.size === 0) {
      STANDARD_8_PERIODS.forEach(p => map.set(p.period_number, p));
    }

    return Array.from(map.values()).sort((a, b) => a.period_number - b.period_number);
  }, [periods]);

  // Fetch all timetable slots and substitutions across all classes for this teacher
  useEffect(() => {
    if (!selectedTeacherId) return;

    let isMounted = true;
    setIsLoading(true);

    const fetchTeacherSchedule = async () => {
      try {
        const teacherName = activeTeacher?.name?.toLowerCase().trim() || '';

        // 1. Fetch timetable slots where teacher_id matches or teacher_name matches
        const [ttRes, subRes] = await Promise.all([
          db.from('timetable').select('*'),
          db.from('substitutions').select('*').eq('status', 'active'),
        ]);

        if (!isMounted) return;

        const allSlots = ttRes.data || [];
        const activeSubs = subRes.data || [];

        const slotMap: Record<string, TeacherSlotInfo> = {};

        allSlots.forEach((slot: any) => {
          const tId = slot.teacher_id || slot.teacher_record_id || slot.metadata?.teacher_record_id;
          const tName = (slot.teacher_name || slot.metadata?.teacher_name || '').toLowerCase().trim();

          const isMatch =
            (tId && tId === selectedTeacherId) ||
            (teacherName && tName && (teacherName.includes(tName) || tName.includes(teacherName)));

          if (isMatch) {
            const day = Number(slot.day_of_week);
            const period = Number(slot.period_number);
            if (!day || !period) return;

            const key = `${day}-${period}`;
            const className = slot.class || slot.metadata?.class || (slot.category ? slot.category.split('-')[0] : '');
            const section = slot.section || slot.metadata?.section || (slot.category && slot.category.includes('-') ? slot.category.split('-')[1] : '');
            const subjectName = slot.subject_name || slot.subject || slot.metadata?.subject_name || 'Class Subject';

            slotMap[key] = {
              dayOfWeek: day,
              periodNumber: period,
              subjectName,
              className: className ? `Class ${className}` : (slot.category || 'Class'),
              section,
              room: slot.room || slot.metadata?.room || '',
              isSubstitution: false,
              notes: slot.notes || '',
            };
          }
        });

        // 2. Overlay substitutions where this teacher is assigned as the substitute
        activeSubs.forEach((sub: any) => {
          const subId = sub.substitute_teacher_id;
          const subName = (sub.substitute_teacher_name || '').toLowerCase().trim();

          const isSubMatch =
            (subId && subId === selectedTeacherId) ||
            (teacherName && subName && (teacherName.includes(subName) || subName.includes(teacherName)));

          if (isSubMatch) {
            const day = Number(sub.day_of_week || 1);
            const period = Number(sub.period_number);
            if (!day || !period) return;

            const key = `${day}-${period}`;
            slotMap[key] = {
              dayOfWeek: day,
              periodNumber: period,
              subjectName: sub.subject_name || 'Substitution Duty',
              className: sub.class_name ? `Class ${sub.class_name}` : 'Class',
              section: sub.section || '',
              room: sub.room || '',
              isSubstitution: true,
              notes: `Covering for ${sub.original_teacher_name || 'Faculty'}`,
            };
          }
        });

        setScheduleSlots(slotMap);
        setSubstitutions(activeSubs);
      } catch (err) {
        console.error('Error fetching teacher weekly schedule:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTeacherSchedule();

    return () => {
      isMounted = false;
    };
  }, [selectedTeacherId, activeTeacher]);

  // Compute workload statistics
  const stats = useMemo(() => {
    const totalPeriodsPerWeek = cleanPeriods.length * 6; // 6 working days (Mon-Sat)
    const slotList = Object.values(scheduleSlots);
    const teachingPeriods = slotList.length;
    const substitutionCount = slotList.filter(s => s.isSubstitution).length;
    const freePeriods = Math.max(0, totalPeriodsPerWeek - teachingPeriods);

    const classesSet = new Set<string>();
    slotList.forEach(s => {
      if (s.className) {
        classesSet.add(s.section ? `${s.className}-${s.section}` : s.className);
      }
    });

    const subjectsSet = new Set<string>();
    slotList.forEach(s => {
      if (s.subjectName) subjectsSet.add(s.subjectName);
    });

    // Busy days count
    const activeDaysSet = new Set<number>();
    slotList.forEach(s => activeDaysSet.add(s.dayOfWeek));

    return {
      teachingPeriods,
      substitutionCount,
      freePeriods,
      totalPeriodsPerWeek,
      classesHandled: Array.from(classesSet),
      subjectsTaught: Array.from(subjectsSet),
      activeDaysCount: activeDaysSet.size,
    };
  }, [cleanPeriods, scheduleSlots]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card/60 backdrop-blur-md p-4 rounded-3xl border border-border/60 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold tracking-tight">Faculty Personal Timetable</h3>
            <Badge variant="outline" className="text-[11px] font-mono border-primary/30 text-primary bg-primary/5">
              Weekly Schedule
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            View individual weekly schedule, assigned classes, room allocations, and free periods for any teacher.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="w-full sm:w-64">
            <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger className="h-10 rounded-2xl bg-background border-border/70 font-medium text-xs">
                <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select Faculty Teacher" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl max-h-72">
                {teachers.map(teacher => (
                  <SelectItem key={teacher.id} value={teacher.id} className="text-xs font-medium">
                    <span className="font-semibold">{teacher.name}</span>
                    {teacher.specialization && (
                      <span className="text-muted-foreground text-[10px] ml-1.5 font-normal">
                        ({teacher.specialization})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="rounded-2xl text-xs gap-1.5 border-border/70 hover:bg-muted/80"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Timetable
          </Button>
        </div>
      </div>

      {/* Teacher Profile & Workload Overview Banner */}
      {activeTeacher && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-background to-background border border-indigo-500/20 space-y-1">
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Teacher Profile
            </span>
            <div className="font-extrabold text-sm truncate">{activeTeacher.name}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className="font-medium text-foreground/80">{activeTeacher.specialization || 'General Faculty'}</span>
              <span>•</span>
              <span>{activeTeacher.role || 'Teacher'}</span>
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-500/10 via-background to-background border border-emerald-500/20 space-y-1">
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Weekly Load
            </span>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {stats.teachingPeriods} <span className="text-xs font-semibold text-muted-foreground">/ {stats.totalPeriodsPerWeek} periods</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {Math.round((stats.teachingPeriods / Math.max(1, stats.totalPeriodsPerWeek)) * 100)}% weekly capacity utilized
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-gradient-to-br from-amber-500/10 via-background to-background border border-amber-500/20 space-y-1">
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Coffee className="h-3.5 w-3.5" /> Free Periods
            </span>
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300">
              {stats.freePeriods} <span className="text-xs font-semibold text-muted-foreground">free slots</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Eligible for substitute assignments
            </div>
          </div>

          <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-500/10 via-background to-background border border-purple-500/20 space-y-1">
            <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Classes Handled
            </span>
            <div className="text-2xl font-black text-purple-700 dark:text-purple-300">
              {stats.classesHandled.length} <span className="text-xs font-semibold text-muted-foreground">sections</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {stats.classesHandled.join(', ') || 'None assigned yet'}
            </div>
          </div>
        </div>
      )}

      {/* Weekly Grid Table */}
      <Card className="rounded-3xl border border-border/70 overflow-hidden shadow-sm">
        <CardHeader className="bg-muted/20 border-b border-border/60 py-3.5 px-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Schedule: {activeTeacher?.name || 'Selected Teacher'}
              </CardTitle>
              <CardDescription className="text-xs">
                Monday to Saturday 8-period teaching routine
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-primary inline-block" /> Regular Class
              </span>
              <span className="flex items-center gap-1 ml-2">
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> Substitution
              </span>
              <span className="flex items-center gap-1 ml-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500/60 inline-block" /> Free Period
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60">
                  <th className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider w-36 border-r border-border/40">
                    Period / Time
                  </th>
                  {DAYS.map((day, idx) => (
                    <th
                      key={day}
                      className={cn(
                        "p-3 text-xs font-bold text-center tracking-wide border-r border-border/40",
                        idx === 5 ? "bg-muted/60 text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-xs">
                {cleanPeriods.map((period) => {
                  return (
                    <React.Fragment key={period.period_number}>
                      <tr className="hover:bg-muted/10 transition-colors">
                        {/* Period Column */}
                        <td className="p-2.5 bg-muted/20 border-r border-border/40 font-medium">
                          <div className="font-extrabold text-foreground text-xs">
                            {period.label || `Period ${period.period_number}`}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                            {period.start_time} – ${period.end_time}
                          </div>
                        </td>

                        {/* 6 Day Columns (Mon-Sat, 1 to 6) */}
                        {DAYS.map((dayName, dIdx) => {
                          const dayNum = dIdx + 1;
                          const key = `${dayNum}-${period.period_number}`;
                          const slot = scheduleSlots[key];

                          if (slot) {
                            const theme = getSubjectTheme(slot.subjectName);
                            return (
                              <td key={dayName} className="p-1.5 border-r border-border/40 align-top">
                                <div
                                  className={cn(
                                    "p-2.5 rounded-2xl border transition-all space-y-1",
                                    slot.isSubstitution
                                      ? "bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/40 text-amber-900 dark:text-amber-200"
                                      : `${theme.bg} ${theme.border}`
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={cn(
                                        "font-extrabold text-xs truncate",
                                        slot.isSubstitution ? "text-amber-800 dark:text-amber-200" : theme.text
                                      )}
                                    >
                                      {slot.subjectName}
                                    </span>
                                    {slot.isSubstitution && (
                                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-amber-500 text-white shrink-0">
                                        SUB
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] font-semibold text-foreground/90">
                                    <span className="truncate">
                                      {slot.className} {slot.section ? `(${slot.section})` : ''}
                                    </span>
                                    {slot.room && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        Rm {slot.room}
                                      </span>
                                    )}
                                  </div>

                                  {slot.notes && (
                                    <div className="text-[9px] text-muted-foreground/80 italic truncate">
                                      {slot.notes}
                                    </div>
                                  )}
                                </div>
                              </td>
                            );
                          }

                          // Free Period Cell
                          return (
                            <td key={dayName} className="p-1.5 border-r border-border/40 align-middle text-center">
                              <div className="py-2.5 px-2 rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.02] text-[10px] text-emerald-600/70 dark:text-emerald-400/70 flex items-center justify-center gap-1 font-medium">
                                <Sparkles className="h-3 w-3 opacity-60 shrink-0" />
                                <span>Free</span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Recess / Lunch Break Banner between Period 4 and Period 5 */}
                      {period.period_number === 4 && (
                        <tr className="bg-amber-500/10 dark:bg-amber-500/15 border-y-2 border-amber-500/30">
                          <td className="p-2.5 font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 border-r border-amber-500/30">
                            <div className="text-xs font-extrabold flex items-center gap-1">
                              🥪 Lunch Break
                            </div>
                            <div className="text-[10px] text-amber-700 dark:text-amber-300 font-mono font-semibold mt-0.5">
                              09:40 – 10:00
                            </div>
                          </td>
                          <td colSpan={6} className="p-2.5 text-center font-extrabold tracking-widest text-amber-700 dark:text-amber-300 text-xs bg-amber-500/5">
                            🥪 RECESS & LUNCH BREAK • 09:40 AM – 10:00 AM (20 MIN)
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
