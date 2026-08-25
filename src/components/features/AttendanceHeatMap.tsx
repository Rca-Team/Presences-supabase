import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GradientCard } from '@/components/ui/gradient-card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth,
  isToday,
  isWeekend,
  addMonths,
  subMonths,
  getDay
} from 'date-fns';

interface HeatMapData {
  date: string;
  count: number;
  percentage: number;
}

interface AttendanceHeatMapProps {
  userId?: string;
  category?: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AttendanceHeatMap: React.FC<AttendanceHeatMapProps> = ({ userId, category }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [heatMapData, setHeatMapData] = useState<Record<string, HeatMapData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [stats, setStats] = useState({ avg: 0, best: 0, worst: 100 });

  useEffect(() => {
    fetchHeatMapData();
  }, [currentMonth, userId, category]);

  const fetchHeatMapData = async () => {
    setIsLoading(true);
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      // Get total registered users
      let usersQuery = supabase
        .from('attendance_records')
        .select('id')
        .eq('status', 'registered');
      
      if (category) {
        usersQuery = usersQuery.eq('category', category);
      }

      const { data: users } = await usersQuery;
      const total = users?.length || 1;
      setTotalUsers(total);

      // Get attendance for the month
      let attendanceQuery = supabase
        .from('attendance_records')
        .select('timestamp, device_info, category')
        .in('status', ['present', 'late'])
        .gte('timestamp', format(monthStart, 'yyyy-MM-dd'))
        .lte('timestamp', format(monthEnd, 'yyyy-MM-dd'));

      if (category) {
        attendanceQuery = attendanceQuery.eq('category', category);
      }

      const { data: attendance } = await attendanceQuery;

      // Group by date and count unique users
      const dailyData: Record<string, Set<string>> = {};
      (attendance || []).forEach(record => {
        const dateStr = format(new Date(record.timestamp), 'yyyy-MM-dd');
        const empId = (record.device_info as any)?.employee_id || (record.device_info as any)?.metadata?.employee_id;
        if (!dailyData[dateStr]) dailyData[dateStr] = new Set();
        if (empId) dailyData[dateStr].add(empId);
      });

      // Calculate percentages
      const heatMap: Record<string, HeatMapData> = {};
      let totalPercentage = 0;
      let bestDay = 0;
      let worstDay = 100;
      let workingDays = 0;

      eachDayOfInterval({ start: monthStart, end: new Date() > monthEnd ? monthEnd : new Date() })
        .filter(day => !isWeekend(day))
        .forEach(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const count = dailyData[dateStr]?.size || 0;
          const percentage = Math.round((count / total) * 100);
          
          heatMap[dateStr] = { date: dateStr, count, percentage };
          
          if (day <= new Date()) {
            totalPercentage += percentage;
            bestDay = Math.max(bestDay, percentage);
            worstDay = Math.min(worstDay, percentage);
            workingDays++;
          }
        });

      setHeatMapData(heatMap);
      setStats({
        avg: workingDays > 0 ? Math.round(totalPercentage / workingDays) : 0,
        best: bestDay,
        worst: workingDays > 0 ? worstDay : 0,
      });
    } catch (error) {
      console.error('Error fetching heat map data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getHeatColor = (percentage: number): string => {
    if (percentage === 0) return 'bg-muted';
    if (percentage < 25) return 'bg-red-500';
    if (percentage < 50) return 'bg-orange-500';
    if (percentage < 75) return 'bg-yellow-500';
    if (percentage < 90) return 'bg-green-400';
    return 'bg-green-500';
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  // Get the starting day of the month to align with weekdays
  const startDay = getDay(startOfMonth(currentMonth));

  const renderCalendar = () => {
    const cells = [];
    
    // Empty cells for days before the month starts
    for (let i = 0; i < startDay; i++) {
      cells.push(
        <div key={`empty-${i}`} className="aspect-square" />
      );
    }

    // Days of the month
    days.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const data = heatMapData[dateStr];
      const isWeekendDay = isWeekend(day);
      const isFuture = day > new Date();
      const todayClass = isToday(day) ? 'ring-2 ring-primary ring-offset-2' : '';

      cells.push(
        <div
          key={dateStr}
          className={`
            aspect-square rounded-md flex flex-col items-center justify-center text-xs
            transition-all hover:scale-105 cursor-pointer relative group
            ${isWeekendDay ? 'bg-muted/50' : isFuture ? 'bg-muted/30' : getHeatColor(data?.percentage || 0)}
            ${todayClass}
          `}
          title={`${format(day, 'MMM d')}: ${data?.count || 0} present (${data?.percentage || 0}%)`}
        >
          <span className={`font-medium ${isWeekendDay || isFuture ? 'text-muted-foreground' : 'text-white'}`}>
            {format(day, 'd')}
          </span>
          {!isWeekendDay && !isFuture && data && (
            <span className="text-[8px] text-white/80">{data.percentage}%</span>
          )}
          
          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
            <p className="font-medium">{format(day, 'MMM d, yyyy')}</p>
            {data && (
              <p className="text-xs">{data.count} present ({data.percentage}%)</p>
            )}
          </div>
        </div>
      );
    });

    return cells;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              Attendance Heat Map
            </CardTitle>
            <CardDescription>
              Visual overview of daily attendance patterns
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
              disabled={isSameMonth(currentMonth, new Date())}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Stats with GradientCard */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 from-blue-500/20 via-blue-400/10 to-transparent border-blue-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 via-blue-400/10 to-transparent opacity-50" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Attendance</p>
                <p className="text-2xl font-bold mt-1">{stats.avg}%</p>
              </div>
              <ProgressRing value={stats.avg} size="sm" color="primary" showValue={false}>
                <Minus className="h-3 w-3 text-blue-500" />
              </ProgressRing>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 from-green-500/20 via-green-400/10 to-transparent border-green-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 via-green-400/10 to-transparent opacity-50" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Best Day</p>
                <p className="text-2xl font-bold mt-1">{stats.best}%</p>
              </div>
              <ProgressRing value={stats.best} size="sm" color="success" showValue={false}>
                <TrendingUp className="h-3 w-3 text-green-500" />
              </ProgressRing>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border bg-card p-4 transition-all duration-300 hover:-translate-y-1 from-red-500/20 via-red-400/10 to-transparent border-red-500/30">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-red-400/10 to-transparent opacity-50" />
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Lowest Day</p>
                <p className="text-2xl font-bold mt-1">{stats.worst}%</p>
              </div>
              <ProgressRing value={stats.worst} size="sm" color="destructive" showValue={false}>
                <TrendingDown className="h-3 w-3 text-red-500" />
              </ProgressRing>
            </div>
          </div>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(day => (
            <div 
              key={day} 
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {renderCalendar()}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-2 mt-6">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-1">
            {['bg-muted', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-400', 'bg-green-500'].map((color, i) => (
              <div 
                key={i} 
                className={`w-4 h-4 rounded ${color}`} 
                title={['0%', '<25%', '<50%', '<75%', '<90%', '≥90%'][i]}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceHeatMap;
