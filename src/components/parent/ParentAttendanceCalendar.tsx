import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  UserX,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Info,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AttendanceItem, ParentSummaryStats } from '@/hooks/useParentPortal';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWeekend,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';

interface ParentAttendanceCalendarProps {
  attendance: AttendanceItem[];
  summary: ParentSummaryStats;
}

export const ParentAttendanceCalendar: React.FC<ParentAttendanceCalendarProps> = ({
  attendance,
  summary,
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Map attendance records by day key (YYYY-MM-DD)
  const attendanceDayMap = useMemo(() => {
    const map: Record<string, { status: 'present' | 'late' | 'absent'; time?: string; image?: string }> = {};
    attendance.forEach((r) => {
      const key = format(new Date(r.timestamp), 'yyyy-MM-dd');
      const s = (r.status || '').toLowerCase();
      const normalized: 'present' | 'late' | 'absent' =
        s === 'unauthorized' || s.includes('present')
          ? 'present'
          : s.includes('late')
          ? 'late'
          : 'absent';

      if (!map[key] || normalized === 'present') {
        const di = (r.device_info as any) || {};
        map[key] = {
          status: normalized,
          time: format(new Date(r.timestamp), 'hh:mm a'),
          image: di.image_url || di.photo_url || null,
        };
      }
    });
    return map;
  }, [attendance]);

  // Calendar days grid calculation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad leading days for Monday start
    const startDayOfWeek = (monthStart.getDay() + 6) % 7; // 0 for Monday
    const leadingBlanks = Array.from({ length: startDayOfWeek }, (_, i) => i);

    return { days, leadingBlanks };
  }, [currentMonth]);

  const selectedDayRecord = useMemo(() => {
    if (!selectedDay) return null;
    const key = format(selectedDay, 'yyyy-MM-dd');
    const isWk = isWeekend(selectedDay);
    const data = attendanceDayMap[key];
    const isPast = selectedDay < new Date() && !isToday(selectedDay);

    let status: 'present' | 'late' | 'absent' | 'weekend' | 'future' = 'future';
    if (isWk) status = 'weekend';
    else if (data) status = data.status;
    else if (isPast) status = 'absent';

    return {
      date: selectedDay,
      status,
      time: data?.time || null,
      image: data?.image || null,
    };
  }, [selectedDay, attendanceDayMap]);

  return (
    <Card className="rounded-3xl border-border/80 bg-card shadow-sm">
      <CardHeader className="p-4 sm:p-6 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black text-foreground flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" /> Monthly Attendance Sheet
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Tap any date to view arrival timings and verification photos.
            </CardDescription>
          </div>

          {/* Month Switcher */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-bold text-foreground px-2 min-w-[100px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl"
              onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 75% CBSE Attendance Meter */}
        <div className="mt-4 p-3.5 rounded-2xl bg-muted/40 border border-border/60">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" /> CBSE 75% Attendance Minimum Requirement
            </span>
            <span
              className={`font-black text-xs ${
                summary.attendanceRate >= 75
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {summary.attendanceRate}% {summary.attendanceRate >= 75 ? '✅ Eligible' : '⚠️ Shortage Risk'}
            </span>
          </div>
          <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                summary.attendanceRate >= 75
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                  : 'bg-gradient-to-r from-amber-500 to-rose-500'
              }`}
              style={{ width: `${Math.min(100, summary.attendanceRate)}%` }}
            />
            {/* 75% marker line */}
            <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-foreground/50 z-10" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 pt-2 space-y-4">
        {/* Calendar Grid */}
        <div className="border border-border/70 rounded-2xl p-3 bg-background/50">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-[11px] font-extrabold text-muted-foreground mb-2">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div className="text-muted-foreground/60">Sat</div>
            <div className="text-muted-foreground/60">Sun</div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarDays.leadingBlanks.map((b) => (
              <div key={`blank-${b}`} className="aspect-square" />
            ))}

            {calendarDays.days.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const isWk = isWeekend(day);
              const rec = attendanceDayMap[dayKey];
              const isPast = day < new Date() && !isToday(day);
              const isCurrentDay = isToday(day);

              let bgClass = 'bg-muted/30 text-muted-foreground border-transparent';
              let dotClass = '';

              if (isWk) {
                bgClass = 'bg-muted/20 text-muted-foreground/40 border-transparent';
              } else if (rec?.status === 'present') {
                bgClass = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25';
                dotClass = 'bg-emerald-500';
              } else if (rec?.status === 'late') {
                bgClass = 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/25';
                dotClass = 'bg-amber-500';
              } else if (isPast) {
                bgClass = 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 hover:bg-rose-500/20';
                dotClass = 'bg-rose-500';
              }

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`aspect-square rounded-xl border flex flex-col items-center justify-center relative transition-all active:scale-95 ${bgClass} ${
                    isCurrentDay ? 'ring-2 ring-primary ring-offset-1 ring-offset-background font-black' : ''
                  }`}
                >
                  <span className="text-xs sm:text-sm font-bold">{format(day, 'd')}</span>
                  {dotClass && <span className={`h-1.5 w-1.5 rounded-full mt-0.5 ${dotClass}`} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span>Present ({summary.presentDays})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span>Late ({summary.lateDays})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span>Absent ({summary.absentDays})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
            <span>Weekend</span>
          </div>
        </div>
      </CardContent>

      {/* Day Details Modal */}
      <Dialog open={Boolean(selectedDay)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          {selectedDayRecord && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-base font-bold flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  {format(selectedDayRecord.date, 'EEEE, dd MMMM yyyy')}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Daily presence and gate verification details
                </DialogDescription>
              </DialogHeader>

              <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Attendance Status</span>
                  <Badge
                    className={`text-xs font-bold uppercase rounded-full ${
                      selectedDayRecord.status === 'present'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : selectedDayRecord.status === 'late'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                        : selectedDayRecord.status === 'weekend'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {selectedDayRecord.status}
                  </Badge>
                </div>

                {selectedDayRecord.time && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Gate Check-in Time</span>
                    <span className="text-xs font-bold text-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3 text-primary" /> {selectedDayRecord.time}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Official School Start</span>
                  <span className="text-xs font-mono text-muted-foreground">07:20 AM</span>
                </div>
              </div>

              {selectedDayRecord.image && (
                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-primary" /> Gate Camera Snapshot
                  </span>
                  <div className="rounded-2xl border border-border overflow-hidden max-h-48 bg-black/40 flex items-center justify-center">
                    <img
                      src={selectedDayRecord.image}
                      alt="Gate verification"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
