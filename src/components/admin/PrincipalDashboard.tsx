import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Users, UserCheck, Clock, TrendingUp, Activity, 
  Wifi, WifiOff, CheckCircle2, UserX, RefreshCw,
  Zap, Search, Filter
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, eachDayOfInterval } from 'date-fns';
import { useRealtimeAttendance } from '@/hooks/useRealtimeAttendance';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { fetchUnifiedStudentSnapshot } from '@/utils/attendanceStatsHelper';
import { filterWorkingDaysForSchool } from '@/utils/workingDays';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  'A': '#3b82f6', 'B': '#22c55e', 'C': '#eab308', 'D': '#f97316', 'Teacher': '#a855f7',
};

interface StudentRecord {
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
  status: 'present' | 'late' | 'absent';
  time?: string;
}

interface LiveEntry {
  id: string;
  name: string;
  category: string;
  status: string;
  time: string;
  imageUrl: string;
}

type StatusFilter = 'all' | 'present' | 'late' | 'absent';

const PrincipalDashboard: React.FC = () => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [overallStats, setOverallStats] = useState({
    totalRegistered: 0, presentToday: 0, lateToday: 0, absentToday: 0, attendanceRate: 0,
  });
  const [weeklyTrend, setWeeklyTrend] = useState<{ day: string; count: number }[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const { isConnected } = useRealtimeAttendance({
    showNotifications: true,
    useSessionEventsOnly: false,
    onNewAttendance: (record) => {
      const name = record.device_info?.metadata?.name || 'Unknown';
      const imageUrl = record.device_info?.metadata?.firebase_image_url || '';
      setLiveEntries(prev => [{
        id: record.id, name, category: record.category || '?',
        status: record.status, time: format(new Date(record.timestamp), 'hh:mm a'), imageUrl,
      }, ...prev].slice(0, 30));
      fetchAllData(true);
    }
  });

  const fetchAllData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data: users } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered');

      const processedUsers = (users || []).map(r => {
        const m = (r.device_info as any)?.metadata || {};
        return {
          id: r.id, user_id: r.user_id, name: m.name || (r.device_info as any)?.name || 'Unknown',
          category: r.category || 'A',
          employee_id: m.employee_id || (r.device_info as any)?.employee_id || '',
          image_url: r.image_url || m.firebase_image_url || '',
        };
      }).filter(u => u.name !== 'Unknown' && u.name !== 'User' && !!u.name);

      const unified = await fetchUnifiedStudentSnapshot();

      const presentMap = new Map<string, string | undefined>();
      const lateMap = new Map<string, string | undefined>();
      const entries: LiveEntry[] = [];

      Object.entries(unified.statusesByEmployeeId).forEach(([employeeId, snapshot]) => {
        const time = snapshot.time ? format(new Date(snapshot.time), 'hh:mm a') : undefined;
        if (snapshot.status === 'present') presentMap.set(employeeId, time);
        else if (snapshot.status === 'late') lateMap.set(employeeId, time);
      });

      const { data: todayData } = await supabase
        .from('attendance_records')
        .select('id, status, timestamp, category, image_url, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
        .order('timestamp', { ascending: false })
        .limit(30);

      (todayData || []).forEach(r => {
        const m = (r.device_info as any)?.metadata || {};
        const normalized = (r.status || '').toLowerCase().includes('late') ? 'late' : 'present';
        entries.push({
          id: r.id,
          name: m.name || 'Unknown',
          category: r.category || '?',
          status: normalized,
          time: format(new Date(r.timestamp), 'hh:mm a'),
          imageUrl: r.image_url || m.firebase_image_url || '',
        });
      });

      entries.sort((a, b) => b.time.localeCompare(a.time));
      setLiveEntries(entries.slice(0, 30));

      // Build student list with status
      const studentList: StudentRecord[] = processedUsers.map(u => {
        let status: 'present' | 'late' | 'absent' = 'absent';
        let time: string | undefined;

        // Check all possible identifiers: employee_id, user_id, registration id
        const identifiers = [u.employee_id, u.user_id, u.id].filter(Boolean);
        for (const identifier of identifiers) {
          if (!identifier) continue;
          if (presentMap.has(identifier)) {
            status = 'present'; time = presentMap.get(identifier); break;
          } else if (lateMap.has(identifier)) {
            status = 'late'; time = lateMap.get(identifier);
          }
        }
        return { name: u.name, employee_id: u.employee_id, category: u.category, image_url: u.image_url, status, time };
      });

      // Sort: present first, then late, then absent
      studentList.sort((a, b) => {
        const order = { present: 0, late: 1, absent: 2 };
        return order[a.status] - order[b.status];
      });

      setAllStudents(studentList);

      setOverallStats({
        totalRegistered: unified.totalRegistered,
        presentToday: unified.presentToday,
        lateToday: unified.lateToday,
        absentToday: unified.absentToday,
        attendanceRate: unified.attendanceRate,
      });

      // Weekly trend
      const monthStart = startOfMonth(new Date());
      const workingDays = filterWorkingDaysForSchool(
        eachDayOfInterval({ start: monthStart, end: new Date() })
      ).slice(-7);

      const { data: weekData } = await supabase
        .from('attendance_records')
        .select('timestamp, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', format(workingDays[0] || new Date(), 'yyyy-MM-dd'))
        .lte('timestamp', format(new Date(), "yyyy-MM-dd'T'23:59:59"));

      const daily: Record<string, Set<string>> = {};
      (weekData || []).forEach(r => {
        const d = format(new Date(r.timestamp), 'yyyy-MM-dd');
        const e = (r.device_info as any)?.employee_id || (r.device_info as any)?.metadata?.employee_id;
        if (!daily[d]) daily[d] = new Set();
        if (e) daily[d].add(e);
      });

      setWeeklyTrend(workingDays.map(d => ({
        day: format(d, 'EEE'), count: daily[format(d, 'yyyy-MM-dd')]?.size || 0,
      })));

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      if (!silent) toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const refreshDashboard = () => {
      fetchAllData(true);
    };

    const channel = supabase
      .channel('principal-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        refreshDashboard
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gate_entries' },
        refreshDashboard
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAllData]);

  const filteredStudents = useMemo(() => {
    let list = allStudents;
    if (statusFilter !== 'all') list = list.filter(s => s.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.employee_id.toLowerCase().includes(q));
    }
    return list;
  }, [allStudents, statusFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const statusFilterOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allStudents.length },
    { key: 'present', label: 'Present', count: overallStats.presentToday },
    { key: 'late', label: 'Late', count: overallStats.lateToday },
    { key: 'absent', label: 'Absent', count: overallStats.absentToday },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Connection Status & Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="gap-1.5 text-green-600 border-green-500/30 bg-green-500/10 text-[10px] sm:text-xs">
              <Wifi className="w-3 h-3" /> Live
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-muted-foreground text-[10px] sm:text-xs">
              <WifiOff className="w-3 h-3" /> Offline
            </Badge>
          )}
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {format(lastRefreshed, 'hh:mm a')}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fetchAllData()} className="gap-1.5 text-[10px] sm:text-xs h-7 sm:h-8 px-2 sm:px-3">
          <RefreshCw className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Refresh
        </Button>
      </div>

      {/* Key Metrics — 2x2 grid on mobile */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
        <MetricCard label="Registered" value={overallStats.totalRegistered} icon={Users} color="text-primary" bgColor="bg-primary/10" />
        <MetricCard label="Present" value={overallStats.presentToday} icon={CheckCircle2} color="text-green-600 dark:text-green-400" bgColor="bg-green-500/10" subtitle={`${overallStats.attendanceRate}%`} />
        <MetricCard label="Late" value={overallStats.lateToday} icon={Clock} color="text-orange-600 dark:text-orange-400" bgColor="bg-orange-500/10" />
        <MetricCard label="Absent" value={overallStats.absentToday} icon={UserX} color="text-red-600 dark:text-red-400" bgColor="bg-red-500/10" />
      </div>

      {/* Attendance Rate Ring - Mobile Friendly */}
      <Card className="overflow-hidden">
        <CardContent className="p-3 sm:p-5 flex items-center gap-4 sm:gap-5">
          <ProgressRing
            value={overallStats.attendanceRate}
            size={isMobile ? 'md' : 'lg'}
            color={overallStats.attendanceRate >= 80 ? 'success' : overallStats.attendanceRate >= 60 ? 'warning' : 'destructive'}
            thickness={isMobile ? 5 : 7}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">Today's Rate</p>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums">{overallStats.attendanceRate}%</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
              {overallStats.presentToday + overallStats.lateToday} of {overallStats.totalRegistered} present
            </p>
          </div>

          {/* Status filter chips on mobile */}
          <div className="hidden sm:flex flex-col gap-1">
            {statusFilterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(statusFilter === opt.key ? 'all' : opt.key)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors",
                  statusFilter === opt.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status filter pills - mobile only */}
      {isMobile && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {statusFilterOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(statusFilter === opt.key ? 'all' : opt.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0",
                "active:scale-95",
                statusFilter === opt.key
                  ? opt.key === 'present' ? "bg-green-500/15 text-green-700 dark:text-green-400"
                    : opt.key === 'late' ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : opt.key === 'absent' ? "bg-red-500/15 text-red-700 dark:text-red-400"
                    : "bg-primary/15 text-primary"
                  : "bg-muted/60 text-muted-foreground"
              )}
            >
              {opt.label} <span className="font-bold tabular-nums">{opt.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Weekly Trend Chart */}
      <Card>
        <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
          <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
            This Week's Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="px-1 sm:px-4 pb-3 sm:pb-4">
          <div className="h-36 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend} barSize={isMobile ? 18 : 32}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: isMobile ? 10 : 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: isMobile ? 10 : 11 }} stroke="hsl(var(--muted-foreground))" width={isMobile ? 25 : 40} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px', fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Filtered Student List + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Filtered Students */}
        {filteredStudents.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader className="pb-1 px-3 sm:px-4 pt-3 sm:pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                  Students ({filteredStudents.length})
                </CardTitle>
                <div className="relative w-32 sm:w-40">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full text-[10px] sm:text-xs bg-muted/40 rounded-lg pl-6 pr-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[280px] sm:h-[360px]">
                <div className="divide-y divide-border">
                  {filteredStudents.map((student, i) => (
                    <div key={i} className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 active:bg-muted/60 sm:hover:bg-muted/40 transition-colors">
                      <div className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[10px] sm:text-xs font-bold shrink-0",
                        student.status === 'present' ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : student.status === 'late' ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-red-500/10 text-red-500 dark:text-red-400"
                      )}>
                        {student.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium truncate">{student.name}</p>
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground">{student.employee_id}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <StatusDot status={student.status} showLabel />
                        {student.time && (
                          <span className="text-[9px] text-muted-foreground tabular-nums">{student.time}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Live Activity */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-1 px-3 sm:px-4 pt-3 sm:pt-4">
            <CardTitle className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
              Live Activity
              {isConnected && (
                <span className="relative flex h-2 w-2 ml-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[280px] sm:h-[360px]">
              <AnimatePresence initial={false}>
                {liveEntries.length === 0 ? (
                  <div className="p-6 sm:p-8 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-2 sm:mb-3 opacity-40" />
                    <p className="text-xs sm:text-sm">No attendance yet today</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {liveEntries.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        initial={i === 0 ? { opacity: 0, x: -20 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4 }}
                        className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 active:bg-muted/60 sm:hover:bg-muted/50 transition-colors"
                      >
                        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                          <AvatarImage src={entry.imageUrl?.startsWith('data:') ? entry.imageUrl : ''} />
                          <AvatarFallback className="text-[10px] sm:text-xs font-medium bg-muted">{entry.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium truncate">{entry.name}</p>
                          <span className="text-[9px] sm:text-[10px] text-muted-foreground">{entry.time}</span>
                        </div>
                        <StatusDot status={entry.status} showLabel />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Metric card
const MetricCard: React.FC<{
  label: string; value: number; icon: React.ElementType;
  color: string; bgColor: string; subtitle?: string;
}> = ({ label, value, icon: Icon, color, bgColor, subtitle }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
    className="relative overflow-hidden rounded-xl border bg-card p-4 hover:shadow-md transition-all"
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-2xl font-bold tabular-nums">{value}</span>
          {subtitle && <span className={cn("text-xs font-medium", color)}>{subtitle}</span>}
        </div>
      </div>
      <div className={cn("rounded-lg p-2", bgColor)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
    </div>
  </motion.div>
);

// Status dot with optional label
const StatusDot: React.FC<{ status: string; showLabel?: boolean }> = ({ status, showLabel }) => {
  const config = {
    present: { color: 'bg-green-500', label: 'Present', textColor: 'text-green-600' },
    late: { color: 'bg-orange-500', label: 'Late', textColor: 'text-orange-600' },
    absent: { color: 'bg-red-500', label: 'Absent', textColor: 'text-red-600' },
  }[status] || { color: 'bg-muted-foreground', label: status, textColor: 'text-muted-foreground' };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", config.color)} />
      {showLabel && <span className={cn("text-[10px] font-medium", config.textColor)}>{config.label}</span>}
    </div>
  );
};

export default PrincipalDashboard;
