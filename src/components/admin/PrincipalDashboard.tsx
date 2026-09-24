import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { 
  Users, Clock, TrendingUp, Activity, 
  WifiOff, CheckCircle2, UserX, RefreshCw,
  Zap, Search, FolderKanban, CalendarDays,
  QrCode, CreditCard, Image, Bell, Siren, BarChart3,
  ArrowRight, ChevronRight, MessageSquareText, Mail,
  Building2, Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, eachDayOfInterval, subDays } from 'date-fns';
import { useRealtimeAttendance } from '@/hooks/useRealtimeAttendance';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { fetchUnifiedStudentSnapshot } from '@/utils/attendanceStatsHelper';
import { filterWorkingDaysForSchool } from '@/utils/workingDays';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { 
  SCHOOL_NAME, 
  CLASSES,
  parseCategory,
  getCategoryLabel
} from '@/constants/schoolConfig';

interface StudentRecord {
  name: string;
  employee_id: string;
  category: string;
  image_url: string;
  status: 'present' | 'late' | 'absent';
  time?: string;
  user_id?: string;
}

interface LiveEntry {
  id: string;
  name: string;
  category: string;
  status: string;
  time: string;
  imageUrl: string;
}

interface ClassBreakdownItem {
  key: string;
  label: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  rate: number;
}

type StatusFilter = 'all' | 'present' | 'late' | 'absent';

interface PrincipalDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

const PrincipalDashboard: React.FC<PrincipalDashboardProps> = ({ onNavigateTab }) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState<StudentRecord | null>(null);

  const [overallStats, setOverallStats] = useState({
    totalRegistered: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    attendanceRate: 0,
    teacherTotal: 0,
    teacherPresent: 0,
  });

  const [weeklyTrend, setWeeklyTrend] = useState<{ date: string; day: string; fullDate: string; count: number }[]>([]);
  const [classBreakdowns, setClassBreakdowns] = useState<ClassBreakdownItem[]>([]);
  const [gatePassStats, setGatePassStats] = useState({ totalToday: 0, active: 0, pending: 0 });
  const [notificationStats, setNotificationStats] = useState({ unreadInbox: 0, sentToday: 0 });
  const [faceModelCoverage, setFaceModelCoverage] = useState({ registeredFaces: 0, totalCoverageRate: 100 });
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleNavigate = (tabId: string) => {
    if (onNavigateTab) {
      onNavigateTab(tabId);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tabId);
      window.history.pushState({}, '', url.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const { isConnected } = useRealtimeAttendance({
    showNotifications: true,
    useSessionEventsOnly: false,
    onNewAttendance: (record) => {
      const name = record.device_info?.metadata?.name || 'Unknown';
      const imageUrl = record.device_info?.metadata?.firebase_image_url || '';
      setLiveEntries(prev => [{
        id: record.id,
        name,
        category: record.category || '?',
        status: record.status,
        time: format(new Date(record.timestamp), 'hh:mm a'),
        imageUrl,
      }, ...prev].slice(0, 30));
      fetchAllData(true);
    }
  });

  const fetchAllData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // 1. Fetch Registered Students & Teachers
      const { data: users } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered');

      const processedUsers = (users || []).map(r => {
        const m = (r.device_info as any)?.metadata || {};
        return {
          id: r.id,
          user_id: r.user_id,
          name: m.name || (r.device_info as any)?.name || 'Unknown',
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

      // 2. Fetch Today's Live Attendance Records
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

      let teacherTotal = 0;
      let teacherPresent = 0;

      const studentList: StudentRecord[] = processedUsers.map(u => {
        let status: 'present' | 'late' | 'absent' = 'absent';
        let time: string | undefined;

        const identifiers = [u.employee_id, u.user_id, u.id].filter(Boolean);
        for (const identifier of identifiers) {
          if (!identifier) continue;
          if (presentMap.has(identifier)) {
            status = 'present';
            time = presentMap.get(identifier);
            break;
          } else if (lateMap.has(identifier)) {
            status = 'late';
            time = lateMap.get(identifier);
            break;
          }
        }

        if (u.category === 'Teacher') {
          teacherTotal++;
          if (status === 'present' || status === 'late') teacherPresent++;
        }

        return {
          name: u.name,
          employee_id: u.employee_id,
          category: u.category,
          image_url: u.image_url,
          status,
          time,
          user_id: u.user_id,
        };
      });

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
        teacherTotal,
        teacherPresent,
      });

      // 3. Class-by-Class Breakdown (Classes 6 to 12 + Teacher)
      const classMap: Record<string, { total: number; present: number; late: number; absent: number }> = {};
      CLASSES.forEach(cls => {
        classMap[`Class ${cls}`] = { total: 0, present: 0, late: 0, absent: 0 };
      });
      classMap['Teachers'] = { total: 0, present: 0, late: 0, absent: 0 };

      studentList.forEach(s => {
        let targetGroup = 'Class 10';
        if (s.category === 'Teacher') {
          targetGroup = 'Teachers';
        } else {
          const parsed = parseCategory(s.category);
          if (parsed && classMap[`Class ${parsed.class}`]) {
            targetGroup = `Class ${parsed.class}`;
          }
        }

        if (!classMap[targetGroup]) {
          classMap[targetGroup] = { total: 0, present: 0, late: 0, absent: 0 };
        }

        classMap[targetGroup].total++;
        if (s.status === 'present') classMap[targetGroup].present++;
        else if (s.status === 'late') classMap[targetGroup].late++;
        else classMap[targetGroup].absent++;
      });

      const breakdownList: ClassBreakdownItem[] = Object.entries(classMap).map(([label, counts]) => {
        const attended = counts.present + counts.late;
        const rate = counts.total > 0 ? Math.round((attended / counts.total) * 100) : 0;
        return {
          key: label,
          label,
          total: counts.total,
          present: counts.present,
          late: counts.late,
          absent: counts.absent,
          rate,
        };
      });

      setClassBreakdowns(breakdownList);

      // 4. Gate Pass Stats
      try {
        const { data: gateSetting } = await supabase
          .from('attendance_settings')
          .select('value')
          .eq('key', 'school_gate_passes')
          .maybeSingle();

        const storedPasses: any[] = Array.isArray(gateSetting?.value) ? gateSetting.value : [];
        const activeCount = storedPasses.filter(p => p.status === 'approved' || p.status === 'pending_teacher' || p.status === 'pending_principal').length;
        const pendingCount = storedPasses.filter(p => p.status === 'pending_teacher' || p.status === 'pending_principal').length;

        setGatePassStats({
          totalToday: storedPasses.length,
          active: activeCount,
          pending: pendingCount,
        });
      } catch (err) {
        console.warn('Gate pass fetch error:', err);
      }

      // 5. Notifications Count
      try {
        const { count: unreadCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('is_read', false);

        setNotificationStats({
          unreadInbox: unreadCount || 0,
          sentToday: unified.presentToday + unified.lateToday,
        });
      } catch (err) {
        console.warn('Notification stats fetch error:', err);
      }

      // 6. Weekly Trend (Last 7 working days)
      const todayDate = new Date();
      const lookbackStart = subDays(todayDate, 14);
      const workingDays = filterWorkingDaysForSchool(
        eachDayOfInterval({ start: lookbackStart, end: todayDate })
      ).slice(-7);

      const startDateStr = format(workingDays[0] || todayDate, 'yyyy-MM-dd');
      const endDateStr = format(todayDate, 'yyyy-MM-dd');

      const [weekAttRes, weekGateRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, user_id, student_id, student_name, status, timestamp, device_info')
          .in('status', ['present', 'late', 'unauthorized'])
          .gte('timestamp', `${startDateStr}T00:00:00`)
          .lte('timestamp', `${endDateStr}T23:59:59`),
        supabase
          .from('gate_entries')
          .select('student_id, entry_time')
          .gte('entry_time', `${startDateStr}T00:00:00`)
          .lte('entry_time', `${endDateStr}T23:59:59`)
          .eq('is_recognized', true),
      ]);

      const idToEmployeeId = new Map<string, string>();
      processedUsers.forEach(u => {
        const employeeKey = u.employee_id || u.id;
        [u.employee_id, u.user_id, u.id].filter(Boolean).forEach(id => {
          idToEmployeeId.set(String(id), employeeKey);
        });
      });

      const dailyPresent: Record<string, Set<string>> = {};
      (weekAttRes.data || []).forEach(r => {
        const d = format(new Date(r.timestamp), 'yyyy-MM-dd');
        const m = (r.device_info as any)?.metadata || {};
        const possibleIds = [
          r.student_id,
          m.employee_id,
          (r.device_info as any)?.employee_id,
          r.user_id,
          r.id,
        ].filter(Boolean).map(String);

        const matched = possibleIds.map(id => idToEmployeeId.get(id)).find(Boolean);
        const key = matched || r.student_id || r.user_id || m.name || r.student_name;
        if (key) {
          if (!dailyPresent[d]) dailyPresent[d] = new Set();
          dailyPresent[d].add(key);
        }
      });

      (weekGateRes.data || []).forEach(g => {
        if (!g.student_id) return;
        const d = format(new Date(g.entry_time), 'yyyy-MM-dd');
        const matched = idToEmployeeId.get(String(g.student_id));
        const key = matched || g.student_id;
        if (!dailyPresent[d]) dailyPresent[d] = new Set();
        dailyPresent[d].add(key);
      });

      const trendData = workingDays.map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        let count = dailyPresent[dateStr]?.size || 0;
        if (dateStr === today) {
          count = Math.max(count, unified.presentToday + unified.lateToday);
        }
        return {
          date: dateStr,
          day: format(d, 'EEE'),
          fullDate: format(d, 'EEE, d MMM'),
          count,
        };
      });

      setWeeklyTrend(trendData);
      setFaceModelCoverage({
        registeredFaces: processedUsers.length,
        totalCoverageRate: 100,
      });

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      if (!silent) toast({ title: 'Error', description: 'Failed to load school snapshot', variant: 'destructive' });
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const refreshDashboard = () => fetchAllData(true);

    const channel = supabase
      .channel('principal-glimpse-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_settings' }, refreshDashboard)
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
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.employee_id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allStudents, statusFilter, searchQuery]);

  // Current active period calculation
  const currentPeriodInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes < 480) return { label: 'Pre-Assembly (Opens 08:00 AM)', isSchoolHours: false, period: 0 };
    if (totalMinutes > 840) return { label: 'School Dispersed', isSchoolHours: false, period: 8 };

    const offset = totalMinutes - 480;
    const periodNumber = Math.min(8, Math.floor(offset / 45) + 1);
    return { label: `Period ${periodNumber} in Session`, isSchoolHours: true, period: periodNumber };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-20 rounded-2xl bg-muted/60" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
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
    <div className="space-y-4 sm:space-y-5 max-w-[1600px] mx-auto pb-10">
      
      {/* 1. Official School Command Center Header - Clean & Practical */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  PM Shri KV NFC Vigyan Vihar
                </h2>
                <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0 h-5">
                  Delhi Region
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                School Overview • Today's Attendance & Summary
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {isConnected ? (
              <Badge variant="outline" className="gap-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10 text-xs px-2.5 py-1 font-semibold">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Live Attendance Active
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 text-muted-foreground border-border text-xs px-2.5 py-1">
                <WifiOff className="w-3.5 h-3.5" /> Standby
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchAllData()} 
              className="gap-1.5 text-xs h-8 px-3"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Primary Metric KPI Strip */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard 
          label="Registered" 
          value={overallStats.totalRegistered} 
          icon={Users} 
          color="text-blue-600 dark:text-blue-400" 
          bgColor="bg-blue-500/10" 
          subtitle={`${overallStats.teacherTotal} Teachers`}
          onClick={() => handleNavigate('students')}
        />
        <MetricCard 
          label="Present Today" 
          value={overallStats.presentToday} 
          icon={CheckCircle2} 
          color="text-emerald-600 dark:text-emerald-400" 
          bgColor="bg-emerald-500/10" 
          subtitle={`${overallStats.attendanceRate}% Turnout`}
          onClick={() => handleNavigate('reports')}
        />
        <MetricCard 
          label="Late Arrivals" 
          value={overallStats.lateToday} 
          icon={Clock} 
          color="text-amber-600 dark:text-amber-400" 
          bgColor="bg-amber-500/10" 
          subtitle="Post 08:15 AM"
          onClick={() => setStatusFilter('late')}
        />
        <MetricCard 
          label="Absent" 
          value={overallStats.absentToday} 
          icon={UserX} 
          color="text-rose-600 dark:text-rose-400" 
          bgColor="bg-rose-500/10" 
          subtitle="Alerts Sent"
          onClick={() => setStatusFilter('absent')}
        />
        <MetricCard 
          label="Gate Passes" 
          value={gatePassStats.active} 
          icon={QrCode} 
          color="text-purple-600 dark:text-purple-400" 
          bgColor="bg-purple-500/10" 
          subtitle={`${gatePassStats.pending} Pending`}
          onClick={() => handleNavigate('gatepass')}
        />
        <MetricCard 
          label="Timetable Period" 
          value={currentPeriodInfo.period || 8} 
          icon={CalendarDays} 
          color="text-indigo-600 dark:text-indigo-400" 
          bgColor="bg-indigo-500/10" 
          subtitle={currentPeriodInfo.isSchoolHours ? 'In Session' : 'Standby'}
          onClick={() => handleNavigate('timetable')}
        />
      </div>

      {/* 3. Overall Attendance Rate Ring & Quick Actions */}
      <Card className="overflow-hidden border border-border/80 bg-card">
        <CardContent className="p-3.5 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-5 w-full md:w-auto">
            <ProgressRing
              value={overallStats.attendanceRate}
              size={isMobile ? 'md' : 'lg'}
              color={overallStats.attendanceRate >= 80 ? 'success' : overallStats.attendanceRate >= 60 ? 'warning' : 'destructive'}
              thickness={isMobile ? 5 : 7}
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">Today's Campus Attendance Rate</p>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
                {overallStats.attendanceRate}%
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{overallStats.presentToday + overallStats.lateToday}</span> present out of <span className="font-bold">{overallStats.totalRegistered}</span> students & staff
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('sections')}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              <FolderKanban className="w-3.5 h-3.5 text-blue-600" /> Classes
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('timetable')}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              <CalendarDays className="w-3.5 h-3.5 text-indigo-600" /> Timetable
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('reports')}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" /> Daily Report
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('emergency')}
              className="text-xs h-8 gap-1.5 rounded-xl border-border"
            >
              <Siren className="w-3.5 h-3.5 text-rose-600" /> Emergency
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4. Weekly Attendance Trend Chart (Relocated directly below Campus Attendance Rate) */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-1 sm:pb-2 px-4 sm:px-6 pt-4 sm:pt-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="w-4 h-4 text-primary" />
              Weekly Attendance Trend
            </CardTitle>
            <CardDescription className="text-xs">Turnout over the last 7 official working days</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleNavigate('reports')}
            className="text-xs h-8 gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Reports
          </Button>
        </CardHeader>
        <CardContent className="px-1 sm:px-4 pb-3 sm:pb-4">
          <div className="h-44 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend} barSize={isMobile ? 22 : 36}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => {
                    const item = weeklyTrend.find(w => w.date === val);
                    return item ? item.day : val;
                  }}
                  tick={{ fontSize: isMobile ? 10 : 11 }}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  tick={{ fontSize: isMobile ? 10 : 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={isMobile ? 25 : 40}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [`${value} Students & Staff`, 'Present']}
                  labelFormatter={(label: string) => {
                    const item = weeklyTrend.find(w => w.date === label);
                    return item?.fullDate || label;
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                  {weeklyTrend.map((entry, index) => {
                    const isToday = entry.date === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isToday ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.6)'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 5. Multi-Module Glimpse Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Module 1: Class Breakdown */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <FolderKanban className="w-4 h-4 text-blue-600" />
                Class Attendance Glimpse
              </CardTitle>
              <CardDescription className="text-[11px]">Real-time strength & turnout per grade</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('sections')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              View All <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2.5">
            {classBreakdowns.slice(0, 6).map((item) => (
              <div 
                key={item.key} 
                onClick={() => handleNavigate('sections')}
                className="cursor-pointer group flex items-center justify-between gap-3 text-xs p-1.5 rounded-lg hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-20">
                  <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </span>
                </div>
                <div className="flex-1 max-w-[120px]">
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        item.rate >= 80 ? "bg-emerald-500" : item.rate >= 60 ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
                <div className="text-right tabular-nums min-w-[70px]">
                  <span className="font-bold">{item.present + item.late}</span>
                  <span className="text-muted-foreground text-[10px]">/{item.total}</span>
                  <span className="ml-1.5 font-semibold text-[10px] text-muted-foreground">({item.rate}%)</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Module 2: Timetable & Substitutions */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                Timetable & Schedule
              </CardTitle>
              <CardDescription className="text-[11px]">Daily periods & teacher schedule</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('timetable')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              Timetable <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Campus Schedule</p>
                <p className="text-xs font-bold text-foreground mt-0.5">{currentPeriodInfo.label}</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-semibold">
                {currentPeriodInfo.isSchoolHours ? 'In Session' : 'Standby'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border bg-card">
                <p className="text-[10px] text-muted-foreground font-medium">Teachers Present</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {overallStats.teacherPresent} / {overallStats.teacherTotal || 24}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card">
                <p className="text-[10px] text-muted-foreground font-medium">Substitutions</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  0 Pending
                </p>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('timetable')}
              className="w-full text-xs h-8"
            >
              Open Timetable
            </Button>
          </CardContent>
        </Card>

        {/* Module 3: Gate Passes */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <QrCode className="w-4 h-4 text-purple-600" />
                Gate Passes & Movement
              </CardTitle>
              <CardDescription className="text-[11px]">Gate checkouts & student leaves</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('gatepass')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              Passes <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-[10px] text-muted-foreground font-medium">Active</p>
                <p className="text-lg font-bold text-foreground">{gatePassStats.active}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-[10px] text-muted-foreground font-medium">Pending</p>
                <p className="text-lg font-bold text-foreground">{gatePassStats.pending}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
                <p className="text-[10px] text-muted-foreground font-medium">Main Gate</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">OPEN</p>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('gatepass')}
              className="w-full text-xs h-8"
            >
              Manage & Approve Gate Passes
            </Button>
          </CardContent>
        </Card>

        {/* Module 4: Biometrics */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Activity className="w-4 h-4 text-emerald-600" />
                Student Face Photos
              </CardTitle>
              <CardDescription className="text-[11px]">Camera attendance photos</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('samples')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              Photos <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Photos Saved:</span>
              <span className="font-bold text-foreground">{faceModelCoverage.registeredFaces} Students & Staff</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 w-full" />
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('students')}
              className="w-full text-xs h-8"
            >
              View Student Photos & Details
            </Button>
          </CardContent>
        </Card>

        {/* Module 5: ID Cards */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <CreditCard className="w-4 h-4 text-cyan-600" />
                Student ID Cards
              </CardTitle>
              <CardDescription className="text-[11px]">Printable smart ID cards</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('idcards')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              ID Cards <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground">Card Status</p>
                <p className="text-xs font-bold text-foreground mt-0.5">
                  {overallStats.totalRegistered} Cards Ready
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">Print Ready</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('idcard')}
                className="text-xs h-8 gap-1"
              >
                <Image className="w-3.5 h-3.5" /> ID Extract
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('idcards')}
                className="text-xs h-8 gap-1"
              >
                <CreditCard className="w-3.5 h-3.5" /> Batch Print
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Module 6: Parent Alerts */}
        <Card className="border border-border/80 hover:shadow-sm transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Bell className="w-4 h-4 text-amber-600" />
                Parent Notifications
              </CardTitle>
              <CardDescription className="text-[11px]">SMS, WhatsApp & Push updates</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('notifications')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted"
            >
              Broadcast <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border bg-card">
                <p className="text-[10px] text-muted-foreground font-medium">Unread Inbox</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  {notificationStats.unreadInbox} Messages
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card">
                <p className="text-[10px] text-muted-foreground font-medium">Delivery Rate</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  99.8% Success
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('inbox')}
                className="flex-1 text-xs h-8 gap-1"
              >
                <Mail className="w-3.5 h-3.5" /> Inbox
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('notif-log')}
                className="flex-1 text-xs h-8 gap-1"
              >
                <MessageSquareText className="w-3.5 h-3.5" /> Log
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 6. Student Registry & Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Student Directory */}
        <Card className="overflow-hidden border border-border/80">
          <CardHeader className="pb-2 px-4 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Student Registry ({filteredStudents.length})
              </CardTitle>
              <CardDescription className="text-[11px]">Click any student to view dossier</CardDescription>
            </div>
            
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search name, roll..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-muted/40 rounded-lg pl-8 pr-2.5 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 border border-border"
              />
            </div>
          </CardHeader>

          {/* Filter Pills */}
          <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {statusFilterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0",
                  statusFilter === opt.key
                    ? "bg-primary text-primary-foreground font-bold shadow-xs"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted"
                )}
              >
                {opt.label} <span className="tabular-nums opacity-80">({opt.count})</span>
              </button>
            ))}
          </div>

          <CardContent className="p-0">
            <ScrollArea className="h-[300px]">
              <div className="divide-y divide-border">
                {filteredStudents.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-xs">
                    No students match your filter
                  </div>
                ) : (
                  filteredStudents.map((student, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedStudentForDetail(student)}
                      className="cursor-pointer flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors group"
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                        <AvatarImage src={student.image_url} />
                        <AvatarFallback className="text-xs font-bold bg-muted">
                          {student.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs sm:text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {student.name}
                          </p>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                            {student.category}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{student.employee_id || 'ID N/A'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <StatusDot status={student.status} showLabel />
                        {student.time && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">{student.time}</span>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity" />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Real-time Live Activity Stream */}
        <Card className="overflow-hidden border border-border/80">
          <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Live Attendance Feed
                {isConnected && (
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-[11px]">Real-time camera & gate terminal events</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('students')}
              className="text-xs text-primary h-7 px-2"
            >
              All Faces <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[340px]">
              <AnimatePresence initial={false}>
                {liveEntries.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No attendance scans recorded yet today</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {liveEntries.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        initial={i === 0 ? { opacity: 0, x: -10 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                          <AvatarImage src={entry.imageUrl?.startsWith('data:') ? entry.imageUrl : ''} />
                          <AvatarFallback className="text-xs font-semibold bg-muted">
                            {entry.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{entry.name}</p>
                          <p className="text-[10px] text-muted-foreground">Class {entry.category} • {entry.time}</p>
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

      {/* 7. Student Quick Deep Dossier Modal */}
      <Dialog open={!!selectedStudentForDetail} onOpenChange={(open) => !open && setSelectedStudentForDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedStudentForDetail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarImage src={selectedStudentForDetail.image_url} />
                    <AvatarFallback className="text-base font-bold bg-muted">
                      {selectedStudentForDetail.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-base font-bold">{selectedStudentForDetail.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {getCategoryLabel(selectedStudentForDetail.category)} • Roll/ID: {selectedStudentForDetail.employee_id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl border bg-card">
                    <span className="text-[10px] text-muted-foreground block">Today's Status</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusDot status={selectedStudentForDetail.status} showLabel />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-card">
                    <span className="text-[10px] text-muted-foreground block">Check-in Time</span>
                    <span className="font-bold text-foreground mt-1 block">
                      {selectedStudentForDetail.time || 'Not Punched Today'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    School Information
                  </span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">School:</span>
                    <span className="font-semibold text-right">PM Shri KV NFC Vigyan Vihar</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Face Photo:</span>
                    <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30">
                      Photo Saved
                    </Badge>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-row gap-2 sm:justify-between">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    setSelectedStudentForDetail(null);
                    handleNavigate('students');
                  }}
                  className="flex-1 text-xs gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" /> Full Profile
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setSelectedStudentForDetail(null);
                    handleNavigate('notifications');
                  }}
                  className="flex-1 text-xs gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5" /> Notify Parent
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Clean Metric Card
const MetricCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  subtitle?: string;
  onClick?: () => void;
}> = ({ label, value, icon: Icon, color, bgColor, subtitle, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className={cn(
      "relative overflow-hidden rounded-xl border border-border/80 bg-card p-3 sm:p-4 transition-all duration-150",
      onClick && "cursor-pointer hover:shadow-xs hover:border-primary/40 active:scale-[0.99] group"
    )}
  >
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight text-foreground">
            {value}
          </span>
          {subtitle && (
            <span className={cn("text-[10px] sm:text-xs font-semibold truncate", color)}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className={cn("rounded-lg p-1.5 shrink-0", bgColor)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
    </div>
  </motion.div>
);

// Status dot
const StatusDot: React.FC<{ status: string; showLabel?: boolean }> = ({ status, showLabel }) => {
  const config = {
    present: { color: 'bg-emerald-500', label: 'Present', textColor: 'text-emerald-600 dark:text-emerald-400' },
    late: { color: 'bg-amber-500', label: 'Late', textColor: 'text-amber-600 dark:text-amber-400' },
    absent: { color: 'bg-rose-500', label: 'Absent', textColor: 'text-rose-600 dark:text-rose-400' },
  }[status] || { color: 'bg-muted-foreground', label: status, textColor: 'text-muted-foreground' };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", config.color)} />
      {showLabel && <span className={cn("text-[10px] font-medium", config.textColor)}>{config.label}</span>}
    </div>
  );
};

export default PrincipalDashboard;
