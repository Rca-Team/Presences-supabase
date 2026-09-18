import React from 'react';
import { motion } from 'framer-motion';
import { Users, CheckCircle2, XCircle, Clock, RefreshCw, ArrowUpRight } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';
import { ClassStudent } from '@/components/teacher/TeacherAdminWorkspace';

interface AttendanceKpiWidgetProps {
  widget: AndroidWidgetItem;
  students: ClassStudent[];
  activeClassName?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const AttendanceKpiWidget: React.FC<AttendanceKpiWidgetProps> = ({
  widget,
  students,
  activeClassName = 'Class',
  onRefresh,
  isRefreshing = false,
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-blue'];

  const stats = React.useMemo(() => {
    const total = students.length;
    const present = students.filter((s) => s.today_status === 'present').length;
    const late = students.filter((s) => s.today_status === 'late').length;
    const absent = students.filter((s) => s.today_status === 'absent').length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { total, present, late, absent, rate };
  }, [students]);

  // Donut SVG circumference calculation
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (stats.rate / 100) * circumference;

  if (widget.size === '2x1') {
    return (
      <div className="flex items-center justify-between gap-3 h-full">
        <div className="space-y-0.5">
          <p className="text-2xl sm:text-3xl font-black tracking-tight text-foreground font-mono">
            {stats.present + stats.late} <span className="text-xs text-muted-foreground font-normal">/ {stats.total}</span>
          </p>
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {stats.rate}% Present Today
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="h-10 w-10 rounded-2xl border bg-card/80 hover:bg-card flex items-center justify-center text-primary shadow-xs transition-transform active:scale-95"
          title="Refresh Attendance"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      {/* Top row with Circular Donut & Headline Rate */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <span className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-mono block">
            {stats.rate}%
          </span>
          <span className="text-xs font-bold text-muted-foreground block truncate">
            {activeClassName} • Live Attendance
          </span>
        </div>

        {/* Donut Progress Ring */}
        <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
          <svg className="h-16 w-16 -rotate-90 transform" viewBox="0 0 70 70">
            <circle
              cx="35"
              cy="35"
              r={radius}
              className="stroke-muted/40"
              strokeWidth="6"
              fill="transparent"
            />
            <circle
              cx="35"
              cy="35"
              r={radius}
              className="stroke-emerald-500 transition-all duration-700 ease-out"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </div>

      {/* 3 Material Chips (Present, Late, Absent) */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        <div className="p-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center">
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 block uppercase">
            Present
          </span>
          <span className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
            {stats.present}
          </span>
        </div>

        <div className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center">
          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 block uppercase">
            Late
          </span>
          <span className="text-base sm:text-lg font-black font-mono text-amber-600 dark:text-amber-400">
            {stats.late}
          </span>
        </div>

        <div className="p-2 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-center">
          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 block uppercase">
            Absent
          </span>
          <span className="text-base sm:text-lg font-black font-mono text-rose-600 dark:text-rose-400">
            {stats.absent}
          </span>
        </div>
      </div>
    </div>
  );
};
