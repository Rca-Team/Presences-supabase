import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Clock, BookOpen, Calendar, ChevronRight, User } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';

interface TimetablePeriodWidgetProps {
  widget: AndroidWidgetItem;
  classNameStr?: string;
}

const SCHOOL_PERIODS = [
  { num: 1, start: '08:00', end: '08:45', name: 'Assembly & Homeroom', subject: 'Class Homeroom', teacher: 'Class Teacher' },
  { num: 2, start: '08:45', end: '09:30', name: 'Period 1', subject: 'Mathematics', teacher: 'Mr. Sharma' },
  { num: 3, start: '09:30', end: '10:15', name: 'Period 2', subject: 'Science & Lab', teacher: 'Dr. Priya V.' },
  { num: 4, start: '10:15', end: '10:35', name: 'Recess Break', subject: 'Snack & Nutrition', teacher: 'Duty Faculty' },
  { num: 5, start: '10:35', end: '11:20', name: 'Period 3', subject: 'English Literature', teacher: 'Ms. Ananya' },
  { num: 6, start: '11:20', end: '12:05', name: 'Period 4', subject: 'Social Science', teacher: 'Mr. Verma' },
  { num: 7, start: '12:05', end: '12:50', name: 'Period 5', subject: 'Computer Science', teacher: 'Tech Faculty' },
  { num: 8, start: '12:50', end: '01:30', name: 'Period 6', subject: 'Physical Education', teacher: 'Coach Rajesh' },
];

export const TimetablePeriodWidget: React.FC<TimetablePeriodWidgetProps> = ({
  widget,
  classNameStr = '10-A',
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-amber'];
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const periodData = useMemo(() => {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMin = hours * 60 + minutes;

    let current = null;
    let next = null;
    let progress = 0;
    let remainingMinutes = 0;

    for (let i = 0; i < SCHOOL_PERIODS.length; i++) {
      const p = SCHOOL_PERIODS[i];
      const [sh, sm] = p.start.split(':').map(Number);
      const [eh, em] = p.end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      if (totalMin >= startMin && totalMin < endMin) {
        current = p;
        next = SCHOOL_PERIODS[i + 1] || null;
        const elapsed = totalMin - startMin;
        const duration = endMin - startMin;
        progress = Math.min(100, Math.round((elapsed / duration) * 100));
        remainingMinutes = endMin - totalMin;
        break;
      }
    }

    if (!current) {
      current = {
        num: 0,
        start: '08:00',
        end: '01:30',
        name: 'School Shift',
        subject: 'General Session',
        teacher: 'Faculty Active',
      };
      next = SCHOOL_PERIODS[0];
    }

    return { current, next, progress, remainingMinutes };
  }, [now]);

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (widget.size === '2x1') {
    return (
      <div className="flex items-center justify-between gap-3 h-full">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              {periodData.current.name}
            </span>
          </div>
          <p className="text-lg font-black text-foreground truncate mt-0.5">
            {periodData.current.subject}
          </p>
        </div>

        <div className="text-right">
          <span className="text-sm font-black font-mono text-foreground">{timeStr}</span>
          <p className="text-[10px] text-muted-foreground font-medium">
            {periodData.remainingMinutes > 0 ? `${periodData.remainingMinutes}m left` : 'Active'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      {/* Top row with Live Digital Clock and Status */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              {periodData.current.name}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              ({periodData.current.start} - {periodData.current.end})
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1 tracking-tight">
            {periodData.current.subject}
          </h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 font-medium">
            <User className="h-3 w-3 text-primary" /> {periodData.current.teacher} • Class {classNameStr}
          </p>
        </div>

        <div className="p-2.5 rounded-2xl bg-card/70 border border-border/80 text-right shrink-0">
          <span className="text-sm sm:text-base font-black font-mono text-foreground block">
            {timeStr}
          </span>
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block mt-0.5">
            {periodData.remainingMinutes > 0 ? `${periodData.remainingMinutes} min left` : 'Active'}
          </span>
        </div>
      </div>

      {/* Material Progress Pill */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
          <span>Period Progress</span>
          <span className="font-mono font-bold text-foreground">{periodData.progress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${periodData.progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
          />
        </div>
      </div>

      {/* Next Period Pill */}
      {periodData.next && (
        <div className="p-2 px-3 rounded-2xl bg-muted/40 border border-border/60 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-primary" /> Next:
          </span>
          <span className="font-bold text-foreground truncate ml-1">
            {periodData.next.subject} ({periodData.next.start})
          </span>
        </div>
      )}
    </div>
  );
};
