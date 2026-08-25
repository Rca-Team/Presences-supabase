import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceGaugeProps {
  presentCount: number;
  totalCount: number;
  lateCount?: number;
  absentCount?: number;
  previousRate?: number;
  className?: string;
}

export const AttendanceGauge: React.FC<AttendanceGaugeProps> = ({
  presentCount,
  totalCount,
  lateCount = 0,
  absentCount = 0,
  previousRate,
  className
}) => {
  const rate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;
  const lateRate = totalCount > 0 ? Math.round((lateCount / totalCount) * 100) : 0;
  const absentRate = totalCount > 0 ? Math.round((absentCount / totalCount) * 100) : 0;
  
  const trend = previousRate !== undefined ? rate - previousRate : 0;
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  
  const getColor = (r: number): 'success' | 'warning' | 'destructive' => {
    if (r >= 80) return 'success';
    if (r >= 60) return 'warning';
    return 'destructive';
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Today's Attendance</span>
          {previousRate !== undefined && (
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              trend > 0 && 'text-green-500',
              trend < 0 && 'text-red-500',
              trend === 0 && 'text-muted-foreground'
            )}>
              <TrendIcon className="h-4 w-4" />
              <span>{Math.abs(trend)}%</span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-4">
          <ProgressRing
            value={rate}
            size="xl"
            thickness={8}
            color={getColor(rate)}
          >
            <div className="text-center">
              <span className="text-3xl font-bold">{rate}%</span>
              <p className="text-xs text-muted-foreground mt-1">Rate</p>
            </div>
          </ProgressRing>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-lg font-semibold">{presentCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Present</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-lg font-semibold">{lateCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Late</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-lg font-semibold">{absentCount}</span>
            </div>
            <p className="text-xs text-muted-foreground">Absent</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
