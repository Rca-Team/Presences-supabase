import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  Calendar, 
  BarChart3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, subWeeks, subMonths, addWeeks, addMonths } from 'date-fns';
import { isWorkingDayForSchool } from '@/utils/workingDays';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend
} from 'recharts';

interface AttendanceTrendsChartProps {
  category?: string;
  showAllCategories?: boolean;
}

interface DayData {
  day: string;
  date: string;
  present: number;
  late: number;
  absent: number;
  total: number;
  rate: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'A': '#3b82f6',
  'B': '#22c55e',
  'C': '#eab308',
  'D': '#f97316',
  'Teacher': '#a855f7',
};

const AttendanceTrendsChart: React.FC<AttendanceTrendsChartProps> = ({ 
  category, 
  showAllCategories = false 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trendData, setTrendData] = useState<DayData[]>([]);
  const [categoryTrends, setCategoryTrends] = useState<Record<string, DayData[]>>({});
  const [stats, setStats] = useState({
    avgAttendance: 0,
    bestDay: '',
    worstDay: '',
    trend: 'stable' as 'up' | 'down' | 'stable'
  });

  useEffect(() => {
    fetchTrendData();
  }, [viewMode, currentDate, category]);

  const fetchTrendData = async () => {
    setIsLoading(true);
    try {
      let start: Date, end: Date;
      
      if (viewMode === 'weekly') {
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
      } else {
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
      }

      // Get all days in range (excluding weekends for workdays)
      const allDays = eachDayOfInterval({ start, end })
        .filter(day => isWorkingDayForSchool(day) && day <= new Date());

      // Fetch registered users count by category from attendance_records (canonical registration source)
      const { data: registeredUsers } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, category')
        .eq('status', 'registered');

      const usersByCategory: Record<string, Set<string>> = {};
      const seenReg = new Set<string>();
      (registeredUsers || []).forEach(r => {
        const m = (r.device_info as any)?.metadata || {};
        const cat = r.category || 'A';
        const empId = m.employee_id || r.user_id || r.id;
        if (!empId || seenReg.has(empId)) return;
        seenReg.add(empId);
        if (!usersByCategory[cat]) usersByCategory[cat] = new Set();
        usersByCategory[cat].add(empId);
      });

      // Fetch attendance records in range
      const { data: attendanceRecords } = await supabase
        .from('attendance_records')
        .select('timestamp, status, category, device_info, user_id')
        .in('status', ['present', 'late'])
        .gte('timestamp', format(start, 'yyyy-MM-dd'))
        .lte('timestamp', format(end, "yyyy-MM-dd'T'23:59:59"));
      const { data: gateEntries } = await supabase
        .from('gate_entries')
        .select('entry_time, student_id, is_recognized')
        .eq('is_recognized', true)
        .gte('entry_time', format(start, 'yyyy-MM-dd'))
        .lte('entry_time', format(end, "yyyy-MM-dd'T'23:59:59"));

      // Group attendance by date and category
      const dailyAttendance: Record<string, Record<string, { present: Set<string>; late: Set<string> }>> = {};
      
      (attendanceRecords || []).forEach(record => {
        const dateStr = format(new Date(record.timestamp), 'yyyy-MM-dd');
        const cat = record.category || 'A';
        const empId = (record.device_info as any)?.metadata?.employee_id || record.user_id;
        
        if (!dailyAttendance[dateStr]) dailyAttendance[dateStr] = {};
        if (!dailyAttendance[dateStr][cat]) {
          dailyAttendance[dateStr][cat] = { present: new Set(), late: new Set() };
        }
        
        if (empId) {
          if (record.status === 'present') {
            dailyAttendance[dateStr][cat].present.add(empId);
          } else if (record.status === 'late') {
            dailyAttendance[dateStr][cat].late.add(empId);
          }
        }
      });
      (gateEntries || []).forEach((record: any) => {
        const dateStr = format(new Date(record.entry_time), 'yyyy-MM-dd');
        const cat = category || 'A';
        if (!dailyAttendance[dateStr]) dailyAttendance[dateStr] = {};
        if (!dailyAttendance[dateStr][cat]) dailyAttendance[dateStr][cat] = { present: new Set(), late: new Set() };
        if (record.student_id) dailyAttendance[dateStr][cat].present.add(record.student_id);
      });

      // Build trend data
      if (showAllCategories) {
        const trends: Record<string, DayData[]> = {};
        const categories = ['A', 'B', 'C', 'D'];
        
        categories.forEach(cat => {
          trends[cat] = allDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = dailyAttendance[dateStr]?.[cat];
            const total = usersByCategory[cat]?.size || 0;
            const present = dayData?.present.size || 0;
            const late = dayData?.late.size || 0;
            
            return {
              day: format(day, viewMode === 'weekly' ? 'EEE' : 'dd'),
              date: dateStr,
              present,
              late,
              absent: Math.max(0, total - present - late),
              total,
              rate: total > 0 ? Math.round((present + late) / total * 100) : 0
            };
          });
        });
        
        setCategoryTrends(trends);
      } else {
        const targetCategory = category || 'A';
        const total = usersByCategory[targetCategory]?.size || 0;
        
        const data: DayData[] = allDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayData = dailyAttendance[dateStr]?.[targetCategory];
          const present = dayData?.present.size || 0;
          const late = dayData?.late.size || 0;
          
          return {
            day: format(day, viewMode === 'weekly' ? 'EEE' : 'dd'),
            date: dateStr,
            present,
            late,
            absent: Math.max(0, total - present - late),
            total,
            rate: total > 0 ? Math.round((present + late) / total * 100) : 0
          };
        });

        setTrendData(data);

        // Calculate stats
        const rates = data.filter(d => d.total > 0).map(d => d.rate);
        const avgAttendance = rates.length > 0 
          ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) 
          : 0;
        
        const maxRate = Math.max(...rates, 0);
        const minRate = Math.min(...rates, 100);
        const bestDayData = data.find(d => d.rate === maxRate);
        const worstDayData = data.find(d => d.rate === minRate);

        // Determine trend
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (rates.length >= 3) {
          const firstHalf = rates.slice(0, Math.floor(rates.length / 2));
          const secondHalf = rates.slice(Math.floor(rates.length / 2));
          const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
          const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
          
          if (secondAvg - firstAvg > 5) trend = 'up';
          else if (firstAvg - secondAvg > 5) trend = 'down';
        }

        setStats({
          avgAttendance,
          bestDay: bestDayData?.day || 'N/A',
          worstDay: worstDayData?.day || 'N/A',
          trend
        });
      }
    } catch (error) {
      console.error('Error fetching trend data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const navigatePeriod = (direction: 'prev' | 'next') => {
    if (viewMode === 'weekly') {
      setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else {
      setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  const getPeriodLabel = () => {
    if (viewMode === 'weekly') {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, 'MMM dd')} - ${format(end, 'MMM dd, yyyy')}`;
    }
    return format(currentDate, 'MMMM yyyy');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Attendance Trends
              {category && (
                <Badge 
                  variant="secondary"
                  style={{ backgroundColor: `${CATEGORY_COLORS[category]}20`, color: CATEGORY_COLORS[category] }}
                >
                  Category {category}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Track attendance patterns over time
            </CardDescription>
          </div>
          
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'weekly' | 'monthly')}>
              <TabsList className="h-8">
                <TabsTrigger value="weekly" className="text-xs px-3">Weekly</TabsTrigger>
                <TabsTrigger value="monthly" className="text-xs px-3">Monthly</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        
        {/* Period Navigation */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="ghost" size="icon" onClick={() => navigatePeriod('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {getPeriodLabel()}
          </span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigatePeriod('next')}
            disabled={currentDate >= new Date()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="pt-4">
        {/* Stats Summary */}
        {!showAllCategories && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 rounded-lg bg-primary/5">
              <p className="text-2xl font-bold text-primary">{stats.avgAttendance}%</p>
              <p className="text-xs text-muted-foreground">Avg Attendance</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10">
              <p className="text-lg font-semibold text-green-600">{stats.bestDay}</p>
              <p className="text-xs text-muted-foreground">Best Day</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10">
              <p className="text-lg font-semibold text-red-500">{stats.worstDay}</p>
              <p className="text-xs text-muted-foreground">Lowest Day</p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="h-64">
          {showAllCategories ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={categoryTrends['A'] || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                {['A', 'B', 'C', 'D'].map(cat => (
                  <Line 
                    key={cat}
                    type="monotone" 
                    dataKey="rate"
                    data={categoryTrends[cat]}
                    name={`Cat ${cat}`}
                    stroke={CATEGORY_COLORS[cat]} 
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="presentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  formatter={(value, name) => [
                    name === 'rate' ? `${value}%` : value,
                    name === 'rate' ? 'Attendance Rate' : name
                  ]}
                />
                <Area 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="hsl(var(--primary))" 
                  fill="url(#presentGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AttendanceTrendsChart;
