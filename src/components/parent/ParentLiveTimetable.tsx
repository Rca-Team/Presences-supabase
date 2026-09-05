import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  BookOpen,
  Users,
  Calendar,
  Sparkles,
  ChevronRight,
  Coffee,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ChildProfile } from '@/hooks/useParentPortal';
import { getSubjectTheme } from '@/components/admin/TimetableManager';

interface ParentLiveTimetableProps {
  child: ChildProfile;
}

interface PeriodSlot {
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
  subject_name: string;
  teacher_name: string;
  room?: string;
  is_break?: boolean;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_SCHEDULE: { period: number; start: string; end: string; defaultSubject: string }[] = [
  { period: 1, start: '07:20', end: '07:55', defaultSubject: 'English' },
  { period: 2, start: '07:55', end: '08:30', defaultSubject: 'Mathematics' },
  { period: 3, start: '08:30', end: '09:05', defaultSubject: 'Science' },
  { period: 4, start: '09:05', end: '09:40', defaultSubject: 'Social Science' },
  { period: 0, start: '09:40', end: '10:00', defaultSubject: '🥪 Lunch / Recess Break' },
  { period: 5, start: '10:00', end: '10:35', defaultSubject: 'Hindi' },
  { period: 6, start: '10:35', end: '11:10', defaultSubject: 'Computer Science' },
  { period: 7, start: '11:10', end: '11:45', defaultSubject: 'Sanskrit' },
  { period: 8, start: '11:45', end: '12:15', defaultSubject: 'Physical Education / Sports' },
];

export const ParentLiveTimetable: React.FC<ParentLiveTimetableProps> = ({ child }) => {
  const currentDayIndex = Math.min(5, Math.max(0, new Date().getDay() - 1)); // 0 = Mon, 5 = Sat
  const [selectedDay, setSelectedDay] = useState<number>(currentDayIndex + 1);
  const [timetableSlots, setTimetableSlots] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch published timetable records for this child's class
  useEffect(() => {
    async function loadTimetable() {
      setIsLoading(true);
      try {
        const cat = child.category || '6-A';
        const [cls, sec] = cat.split('-');

        const { data } = await supabase
          .from('timetable')
          .select('*')
          .or(`category.eq.${cat},and(class.eq.${cls},section.eq.${sec})`);

        const slotMap: Record<string, any> = {};
        (data || []).forEach((row: any) => {
          const dayNum = Number(row.day_of_week) || 1;
          const pNum = Number(row.period_number) || 1;
          const key = `${dayNum}-${pNum}`;
          slotMap[key] = row;
        });

        setTimetableSlots(slotMap);
      } catch (err) {
        console.warn('Error loading parent timetable:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadTimetable();
  }, [child.category]);

  // Compute active ongoing period right now (based on 07:20 - 12:15 schedule)
  const activePeriodInfo = useMemo(() => {
    const now = new Date();
    const curHours = now.getHours();
    const curMins = now.getMinutes();
    const curTotalMins = curHours * 60 + curMins;

    for (const slot of DEFAULT_SCHEDULE) {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      if (curTotalMins >= startMins && curTotalMins < endMins) {
        return {
          slot,
          remainingMins: endMins - curTotalMins,
          isOngoing: true,
        };
      }
    }

    return null;
  }, []);

  return (
    <Card className="rounded-3xl border-border/80 bg-card shadow-sm overflow-hidden">
      <CardHeader className="p-4 sm:p-6 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Class Schedule & Timetable
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Official school hours: 07:20 AM – 12:15 PM • Class {child.category}
            </CardDescription>
          </div>

          {/* Day Selector Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {DAYS.map((dName, idx) => {
              const dayNum = idx + 1;
              const isSelected = selectedDay === dayNum;
              const isTodayDay = currentDayIndex + 1 === dayNum;

              return (
                <Button
                  key={dName}
                  type="button"
                  size="sm"
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => setSelectedDay(dayNum)}
                  className={`text-xs rounded-xl h-8 px-2.5 font-bold transition-all ${
                    isSelected ? 'shadow-xs' : 'border-border/60 text-muted-foreground'
                  }`}
                >
                  {dName.slice(0, 3)}
                  {isTodayDay && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Live "Happening Right Now" Notification Card */}
        {activePeriodInfo && (
          <div className="mt-3 p-3.5 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <p className="text-xs font-black text-foreground">
                  {activePeriodInfo.slot.period === 0
                    ? '🥪 Recess / Lunch Break'
                    : `Now: Period ${activePeriodInfo.slot.period} (${activePeriodInfo.slot.start} - ${activePeriodInfo.slot.end})`}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {activePeriodInfo.slot.period === 0
                    ? 'Students are having lunch in campus'
                    : `${timetableSlots[`${currentDayIndex + 1}-${activePeriodInfo.slot.period}`]?.teacher_name || 'Faculty'} • Class ${child.category}`}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-bold border-primary/30 bg-background text-primary">
              {activePeriodInfo.remainingMins} mins left
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-1 space-y-2.5">
        {DEFAULT_SCHEDULE.map((sched) => {
          if (sched.period === 0) {
            // Lunch Break Banner (09:40 - 10:00)
            return (
              <div
                key="recess-break"
                className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between my-2"
              >
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-extrabold text-xs">
                  <Coffee className="h-4 w-4" /> 🥪 RECESS & LUNCH BREAK (20 MIN)
                </div>
                <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">
                  09:40 AM – 10:00 AM
                </span>
              </div>
            );
          }

          const slotKey = `${selectedDay}-${sched.period}`;
          const customSlot = timetableSlots[slotKey];
          const subjectName = customSlot?.metadata?.subject_name || customSlot?.subject_id || sched.defaultSubject;
          const teacherName = customSlot?.teacher_name || customSlot?.metadata?.teacher_name || 'Subject Faculty';
          const room = customSlot?.room || `Class ${child.category}`;
          const theme = getSubjectTheme(subjectName);

          return (
            <div
              key={sched.period}
              className={`p-3 sm:p-3.5 rounded-2xl border transition-all hover:bg-muted/30 flex items-center justify-between gap-3 ${
                theme.bg
              } ${theme.border}`}
            >
              {/* Period Number & Time */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-background/80 border border-border/60 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] text-muted-foreground font-bold leading-tight">P</span>
                  <span className="text-sm font-black text-foreground leading-tight">{sched.period}</span>
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-black tracking-tight ${theme.text}`}>
                      {subjectName}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <Users className="h-3 w-3 shrink-0 opacity-70" /> {teacherName}
                    {room && <span className="opacity-60">• Room: {room}</span>}
                  </p>
                </div>
              </div>

              {/* Timing Badge */}
              <Badge variant="outline" className="text-xs font-mono text-muted-foreground bg-background/60 rounded-xl shrink-0">
                {sched.start} – {sched.end}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
