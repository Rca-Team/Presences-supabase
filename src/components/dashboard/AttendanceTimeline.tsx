import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Sun, Sunset, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimelineSlot {
  time: string;
  label: string;
  count: number;
  peak?: boolean;
}

interface AttendanceTimelineProps {
  slots: TimelineSlot[];
  className?: string;
}

const getTimeIcon = (time: string) => {
  const hour = parseInt(time.split(':')[0]);
  if (hour >= 6 && hour < 12) return Sun;
  if (hour >= 12 && hour < 18) return Sunset;
  return Moon;
};

export const AttendanceTimeline: React.FC<AttendanceTimelineProps> = ({
  slots,
  className
}) => {
  const maxCount = Math.max(...slots.map(s => s.count), 1);

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Check-in Timeline
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            Today
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-1 h-32">
          {slots.map((slot, index) => {
            const heightPercent = (slot.count / maxCount) * 100;
            const TimeIcon = getTimeIcon(slot.time);
            
            return (
              <div
                key={slot.time}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-xs font-medium tabular-nums">
                  {slot.count}
                </span>
                <div className="w-full relative flex items-end justify-center h-20">
                  <div
                    className={cn(
                      'w-full max-w-8 rounded-t-md transition-all duration-500',
                      slot.peak
                        ? 'bg-gradient-to-t from-primary to-primary/60'
                        : 'bg-muted hover:bg-primary/30'
                    )}
                    style={{
                      height: `${Math.max(heightPercent, 4)}%`,
                      animationDelay: `${index * 50}ms`,
                    }}
                  />
                  {slot.peak && (
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <Badge className="text-[10px] px-1 py-0 bg-primary">
                        Peak
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <TimeIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {slot.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
