import React from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface AttendanceRecord {
  name?: string;
  timestamp: string;
  status: string;
  source?: string;
  capture_mode?: string;
  period_key?: string;
  class_name?: string;
  section?: string;
  subject?: string;
}

interface AttendanceCalendarViewProps {
  selectedDate: Date | undefined;
  setSelectedDate: (date: Date | undefined) => void;
  visibleMonth: Date;
  setVisibleMonth: (date: Date) => void;
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  attendanceRecords?: Record<string, AttendanceRecord[]>;
}

const AttendanceCalendarView: React.FC<AttendanceCalendarViewProps> = ({
  selectedDate,
  setSelectedDate,
  visibleMonth,
  setVisibleMonth,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  attendanceRecords = {}
}) => {
  const today = new Date();

  const presentCount = attendanceDays.length;
  const lateCount = lateAttendanceDays.length;
  const absentCount = absentDays.length;
  const markedDaysCount = presentCount + lateCount + absentCount;
  
  return (
    <Card className="overflow-hidden h-full min-w-0">
      <CardContent className="p-0">
        <div className="border-b px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4">
            <LegendItem color="bg-green-500" label="Present" count={presentCount} />
            <LegendItem color="bg-amber-500" label="Late" count={lateCount} />
            <LegendItem color="bg-red-400" label="Absent" count={absentCount} />
          </div>
          <p className="mt-1.5 text-[10px] sm:text-xs text-muted-foreground">
            {markedDaysCount} marked day{markedDaysCount === 1 ? '' : 's'} in {format(visibleMonth, 'MMMM yyyy')}
          </p>
        </div>

        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          className={cn("p-2 sm:p-3 pointer-events-auto w-full")}
          modifiers={{
            present: attendanceDays || [],
            late: lateAttendanceDays || [],
            absent: absentDays || [],
            today: [today]
          }}
          modifiersClassNames={{
            present: "relative after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-1 after:w-1.5 after:h-1.5 after:rounded-full after:bg-green-500",
            late: "relative after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-1 after:w-1.5 after:h-1.5 after:rounded-full after:bg-amber-500",
            absent: "relative after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-1 after:w-1.5 after:h-1.5 after:rounded-full after:bg-red-400"
          }}
          classNames={{
            months: "w-full",
            month: "w-full space-y-3",
            caption_label: "text-base sm:text-[1.65rem] font-semibold tracking-normal",
            nav_button: "h-8 w-8 sm:h-9 sm:w-9 bg-transparent hover:bg-accent rounded-lg",
            table: "w-full border-separate border-spacing-y-1",
            head_row: "grid grid-cols-7",
            row: "grid grid-cols-7 mt-0",
            head_cell: "text-muted-foreground text-xs sm:text-sm font-medium text-center",
            cell: "text-center p-0.5",
            day: "relative h-9 sm:h-11 w-full rounded-md transition-colors hover:bg-accent",
            day_selected: "bg-accent text-accent-foreground",
            day_today: "ring-1 ring-primary/40",
          }}
        />
      </CardContent>
    </Card>
  );
};

const LegendItem: React.FC<{ color: string; label: string; count: number }> = ({ color, label, count }) => (
  <div className="flex items-center gap-1 sm:gap-1.5 whitespace-nowrap">
    <span className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", color)} />
    <span className="text-[10px] sm:text-[11px] text-muted-foreground">{label}</span>
    <span className="text-[10px] sm:text-[11px] font-bold tabular-nums">{count}</span>
  </div>
);

export default AttendanceCalendarView;
