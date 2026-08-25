import React from 'react';
import { cn } from '@/lib/utils';

// Legacy component - legend is now inline in AttendanceCalendarView
// Kept for backwards compatibility if imported elsewhere
const CalendarLegend: React.FC = () => {
  return (
    <div className="flex gap-4 justify-center mb-3">
      {[
        { label: 'Present', color: 'bg-green-500' },
        { label: 'Late', color: 'bg-amber-500' },
        { label: 'Absent', color: 'bg-red-400' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={cn("w-2 h-2 rounded-full", item.color)} />
          <span className="text-xs text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

export default CalendarLegend;
