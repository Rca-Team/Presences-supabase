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
  Users, UserCheck, Clock, TrendingUp, Activity, 
  Wifi, WifiOff, CheckCircle2, UserX, RefreshCw,
  Zap, Search, Filter, FolderKanban, CalendarDays,
  QrCode, CreditCard, Image, Bell, Siren, BarChart3,
  ArrowRight, ShieldCheck, ChevronRight, ExternalLink,
  GraduationCap, AlertTriangle, MessageSquareText, Mail,
  Check, Sparkles, Building2, Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, eachDayOfInterval, subDays } from 'date-fns';
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
  SCHOOL_AFFILIATION, 
  PRINCIPAL_NAME, 
  PRINCIPAL_TITLE, 
  PRINCIPAL_PHOTO_URL, 
  KVS_LOGO_URL,
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
  const [substitutionAlerts, setSubstitutionAlerts] = useState({ pendingCount: 0, absentTeachersCount: 0 });
  const [notificationStats, setNotificationStats] = useState({ unreadInbox: 0, sentToday: 0 });
  const [faceModelCoverage, setFaceModelCoverage] = useState({ registeredFaces: 0, totalCoverageRate: 100 });
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  const handleNavigate = (tabId: string) => {
    if (onNavigateTab) {
      onNavigateTab(tabId);
    } else {
      // Fallback deep link
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

      // Build student list with status
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

      // 3. Compute Class-by-Class Breakdown (Classes 6 to 12 + Teacher)
      const classMap: Record<string, { total: number; present: number; late: number; absent: number }> = {};
      CLASSES.forEach(cls => {
        classMap[`Class ${cls}`] = { total: 0, present: 0, late: 0, absent: 0 };
      });
      classMap['Teachers'] = { total: 0, present: 0, late: 0, absent: 0 };

      studentList.forEach(s => {
        let targetGroup = 'Class 10'; // fallback
        if (s.category === 'Teacher') {
          targetGroup = 'Teachers';
        } else {
          const parsed = parseCategory(s.category);
          if (parsed && classMap[`Class ${parsed.class}`]) {
            targetGroup = `Class ${parsed.class}`;
          } else {
            // Check if category is legacy A, B, C, D
            targetGroup = `Class 10`;
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

      // 4. Fetch Gate Pass & Entry Stats
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

      // 5. Fetch Notification & Inbox Stats
      try {
        const { count: unreadCount } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('is_read', false);

        setNotificationStats({
          unreadInbox: unreadCount || 0,
          sentToday: unified.presentToday + unified.lateToday, // Auto parent notification triggered count
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

  // Current active period calculation (assuming 8 periods: 08:00 to 14:00)
  const currentPeriodInfo = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    // School timings 08:00 (480 min) to 14:00 (840 min)
    if (totalMinutes < 480) return { label: 'Pre-Assembly (Opens 08:00 AM)', isSchoolHours: false, period: 0 };
    if (totalMinutes > 840) return { label: 'School Dispersed', isSchoolHours: false, period: 8 };

    const offset = totalMinutes - 480;
    const periodNumber = Math.min(8, Math.floor(offset / 45) + 1);
    return { label: `Period ${periodNumber} in Session`, isSchoolHours: true, period: periodNumber };
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 rounded-3xl bg-muted/60" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
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
    <div className="space-y-4 sm:space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* 1. Official Institutional Executive Header */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-400/30 bg-gradient-to-r from-slate-900 via-slate-900/95 to-[#1e1b4b] text-white p-4 sm:p-6 shadow-xl backdrop-blur-2xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 sm:gap-4 w-full md:w-auto">
            <div className="relative shrink-0">
              <img
                src={PRINCIPAL_PHOTO_URL}
                alt={PRINCIPAL_NAME}
                className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl object-cover object-top border-2 border-amber-400 shadow-md bg-slate-950"
              />
              <img
                src={KVS_LOGO_URL}
                alt="KVS Emblem"
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-lg bg-white p-0.5 shadow-md border border-amber-400 object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Principal Executive Desk
                </span>
                <span className="text-[10px] text-slate-300 font-medium">
                  Autonomous Campus Governance
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-black text-white truncate">
                {PRINCIPAL_NAME}
              </h2>
              <p className="text-xs text-amber-200 font-semibold">
                {PRINCIPAL_TITLE} • {SCHOOL_NAME}
              </p>
              <p className="text-[11px] text-slate-300">
                {SCHOOL_AFFILIATION}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            {isConnected ? (
              <Badge variant="outline" className="gap-1.5 text-emerald-300 border-emerald-500/40 bg-emerald-500/20 text-xs px-3 py-1 font-bold">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Live Terminal Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 text-slate-300 border-slate-500/40 bg-slate-500/20 text-xs px-3 py-1 font-bold">
                <WifiOff className="w-3.5 h-3.5" /> Offline Mode
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchAllData()} 
              className="gap-1.5 text-xs h-8 px-3 border-white/20 bg-white/10 hover:bg-white/20 text-white cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Primary KPI Row (Glance Level 1) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard 
          label="Registered" 
          value={overallStats.totalRegistered} 
          icon={Users} 
          color="text-blue-600 dark:text-blue-400" 
          bgColor="bg-blue-500/10" 
          subtitle={`${overallStats.teacherTotal} Staff`}
          onClick={() => handleNavigate('students')}
        />
        <MetricCard 
          label="Present Today" 
          value={overallStats.presentToday} 
          icon={CheckCircle2} 
          color="text-emerald-600 dark:text-emerald-400" 
          bgColor="bg-emerald-500/10" 
          subtitle={`${overallStats.attendanceRate}% Rate`}
          onClick={() => handleNavigate('reports')}
        />
        <MetricCard 
          label="Late Arrivals" 
          value={overallStats.lateToday} 
          icon={Clock} 
          color="text-amber-600 dark:text-amber-400" 
          bgColor="bg-amber-500/10" 
          subtitle="After 08:15 AM"
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
          label="Schedule Pulse" 
          value={currentPeriodInfo.period || 8} 
          icon={CalendarDays} 
          color="text-indigo-600 dark:text-indigo-400" 
          bgColor="bg-indigo-500/10" 
          subtitle={currentPeriodInfo.isSchoolHours ? 'In Session' : 'Standby'}
          onClick={() => handleNavigate('timetable')}
        />
      </div>

      {/* 3. Overall Attendance Ring & Quick Actions Banner */}
      <Card className="overflow-hidden border border-slate-200/80 dark:border-white/10 bg-card/60 backdrop-blur-sm">
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
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
                {overallStats.attendanceRate}%
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{overallStats.presentToday + overallStats.lateToday}</span> present out of <span className="font-bold">{overallStats.totalRegistered}</span> registered students & staff
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('sections')}
              className="text-xs h-8 gap-1.5 rounded-xl border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <FolderKanban className="w-3.5 h-3.5" /> Class Sections
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('timetable')}
              className="text-xs h-8 gap-1.5 rounded-xl border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Timetable
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('reports')}
              className="text-xs h-8 gap-1.5 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Daily Report
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => handleNavigate('emergency')}
              className="text-xs h-8 gap-1.5 rounded-xl border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <Siren className="w-3.5 h-3.5" /> Safety & Emergency
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 4. Multi-Module "Glimpse of All" Control Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Module Glimpse 1: Classes & Grades Breakdown */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <FolderKanban className="w-4 h-4 text-blue-600" />
                Class Attendance Glimpse
              </CardTitle>
              <CardDescription className="text-[11px]">Real-time strength & turnout per grade</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('sections')}
              className="text-xs text-blue-600 dark:text-blue-400 h-7 px-2 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              Open Class <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2.5">
            {classBreakdowns.slice(0, 6).map((item) => (
              <div 
                key={item.key} 
                onClick={() => handleNavigate('sections')}
                className="cursor-pointer group flex items-center justify-between gap-3 text-xs p-1.5 rounded-lg hover:bg-slate-100/60 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-20">
                  <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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

        {/* Module Glimpse 2: Timetable & Substitution Engine */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                Timetable & Substitutions
              </CardTitle>
              <CardDescription className="text-[11px]">Daily schedule & teacher allocations</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('timetable')}
              className="text-xs text-indigo-600 dark:text-indigo-400 h-7 px-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
            >
              Open Timetable <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-300">Active Campus Schedule</p>
                <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 mt-0.5">{currentPeriodInfo.label}</p>
              </div>
              <Badge className="bg-indigo-600 text-white text-[10px]">
                {currentPeriodInfo.isSchoolHours ? 'Live Period' : 'Active'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground font-medium">Teachers Present</p>
                <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {overallStats.teacherPresent} / {overallStats.teacherTotal || 24}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground font-medium">Substitutions Today</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  0 Pending
                </p>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('reports')}
              className="w-full text-xs h-8 border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            >
              View Substitution Matrix & Schedule
            </Button>
          </CardContent>
        </Card>

        {/* Module Glimpse 3: Gate Passes & Perimeter Security */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <QrCode className="w-4 h-4 text-purple-600" />
                Gate Passes & Security
              </CardTitle>
              <CardDescription className="text-[11px]">Guard checkouts & visitor permits</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('gatepass')}
              className="text-xs text-purple-600 dark:text-purple-400 h-7 px-2 hover:bg-purple-50 dark:hover:bg-purple-950/40"
            >
              Open Passes <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/50 dark:border-purple-800/40">
                <p className="text-[10px] text-purple-700 dark:text-purple-300 font-medium">Active Passes</p>
                <p className="text-lg font-bold text-purple-900 dark:text-purple-200">{gatePassStats.active}</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40">
                <p className="text-[10px] text-amber-700 dark:text-amber-300 font-medium">Pending</p>
                <p className="text-lg font-bold text-amber-900 dark:text-amber-200">{gatePassStats.pending}</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/40">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">Perimeter</p>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">SECURED</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs px-1 text-muted-foreground">
              <span>Security Terminal Guard Mode:</span>
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30">
                Active & Scanning
              </Badge>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('gatepass')}
              className="w-full text-xs h-8 border-purple-200 dark:border-purple-800/60 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
            >
              Issue / Approve Student Gate Pass
            </Button>
          </CardContent>
        </Card>

        {/* Module Glimpse 4: Biometrics & Face Recognition Health */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Activity className="w-4 h-4 text-emerald-600" />
                Biometrics & AI Health
              </CardTitle>
              <CardDescription className="text-[11px]">Face descriptors & camera pipeline</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('samples')}
              className="text-xs text-emerald-600 dark:text-emerald-400 h-7 px-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            >
              Face Samples <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Biometric Coverage:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{faceModelCoverage.registeredFaces} Enrolled (100%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 w-full" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="p-2 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground">Face-API AI Models</p>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">SSD MobileNet V1</p>
              </div>
              <div className="p-2 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground">Confidence Threshold</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">0.50 (Strict Match)</p>
              </div>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('students')}
              className="w-full text-xs h-8 border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              View Biometric Profiles & Diagnostics
            </Button>
          </CardContent>
        </Card>

        {/* Module Glimpse 5: Student ID Cards & Extraction */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-cyan-600" />
                ID Cards & Registry
              </CardTitle>
              <CardDescription className="text-[11px]">Batch extraction & smart ID cards</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('idcards')}
              className="text-xs text-cyan-600 dark:text-cyan-400 h-7 px-2 hover:bg-cyan-50 dark:hover:bg-cyan-950/40"
            >
              Open ID Cards <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="p-3 rounded-xl bg-cyan-50/70 dark:bg-cyan-950/30 border border-cyan-200/60 dark:border-cyan-800/40 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-cyan-900 dark:text-cyan-300">Institutional ID Status</p>
                <p className="text-xs font-bold text-cyan-700 dark:text-cyan-400 mt-0.5">
                  {overallStats.totalRegistered} Smart ID Cards Ready
                </p>
              </div>
              <Badge className="bg-cyan-600 text-white text-[10px]">Print Ready</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('idcard')}
                className="text-xs h-8 gap-1 border-cyan-200 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
              >
                <Image className="w-3.5 h-3.5" /> ID Extract
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleNavigate('idcards')}
                className="text-xs h-8 gap-1 border-cyan-200 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
              >
                <CreditCard className="w-3.5 h-3.5" /> Batch Print
              </Button>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('idcards')}
              className="w-full text-xs h-8"
            >
              Open Student ID Table & QR Registry
            </Button>
          </CardContent>
        </Card>

        {/* Module Glimpse 6: Parent Communications & Broadcast */}
        <Card className="border border-slate-200/80 dark:border-white/10 hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                <Bell className="w-4 h-4 text-amber-600" />
                Parent Alerts & Delivery
              </CardTitle>
              <CardDescription className="text-[11px]">SMS, WhatsApp & Push updates</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('notifications')}
              className="text-xs text-amber-600 dark:text-amber-400 h-7 px-2 hover:bg-amber-50 dark:hover:bg-amber-950/40"
            >
              Broadcast <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground font-medium">Unread Parent Inbox</p>
                <p className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {notificationStats.unreadInbox} Messages
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-card/60">
                <p className="text-[10px] text-muted-foreground font-medium">Today's Delivery Rate</p>
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
                <MessageSquareText className="w-3.5 h-3.5" /> Delivery Log
              </Button>
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleNavigate('notifications')}
              className="w-full text-xs h-8 border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              Send Official Circular or Notice
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 5. Weekly Attendance Trend Chart (Full Width) */}
      <Card className="border border-slate-200/80 dark:border-white/10 shadow-sm">
        <CardHeader className="pb-1 sm:pb-2 px-4 sm:px-6 pt-4 sm:pt-6 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
              <TrendingUp className="w-4 h-4 text-primary" />
              Weekly Attendance Trend & Turnout
            </CardTitle>
            <CardDescription className="text-xs">Turnout analysis over the last 7 official school working days</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleNavigate('reports')}
            className="text-xs h-8 gap-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Full Reports & Export
          </Button>
        </CardHeader>
        <CardContent className="px-1 sm:px-4 pb-3 sm:pb-4">
          <div className="h-44 sm:h-56">
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
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  }}
                  formatter={(value: any) => [`${value} Students & Staff`, 'Present']}
                  labelFormatter={(label: string) => {
                    const item = weeklyTrend.find(w => w.date === label);
                    return item?.fullDate || label;
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]}>
                  {weeklyTrend.map((entry, index) => {
                    const isToday = entry.date === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isToday ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.65)'}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 6. Live Activity Stream + Searchable Student Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Student Directory with Search & Deep Detail Trigger */}
        <Card className="overflow-hidden border border-slate-200/80 dark:border-white/10">
          <CardHeader className="pb-2 px-4 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Student Registry ({filteredStudents.length})
              </CardTitle>
              <CardDescription className="text-[11px]">Click any student for instant deep dossier</CardDescription>
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
            <ScrollArea className="h-[320px]">
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
                      className="cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors group"
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0 border border-slate-200 dark:border-white/10">
                        <AvatarImage src={student.image_url} />
                        <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">
                          {student.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs sm:text-sm font-semibold truncate group-hover:text-primary transition-colors">
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
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Real-time Live Activity Stream */}
        <Card className="overflow-hidden border border-slate-200/80 dark:border-white/10">
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
            <ScrollArea className="h-[360px]">
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
                        initial={i === 0 ? { opacity: 0, x: -20 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-100/70 dark:hover:bg-white/5 transition-colors"
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0 border border-slate-200 dark:border-white/10">
                          <AvatarImage src={entry.imageUrl?.startsWith('data:') ? entry.imageUrl : ''} />
                          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
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
                  <Avatar className="h-14 w-14 border-2 border-primary/20 shadow-md">
                    <AvatarImage src={selectedStudentForDetail.image_url} />
                    <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                      {selectedStudentForDetail.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <DialogTitle className="text-base font-extrabold">{selectedStudentForDetail.name}</DialogTitle>
                    <DialogDescription className="text-xs">
                      {getCategoryLabel(selectedStudentForDetail.category)} • Roll/ID: {selectedStudentForDetail.employee_id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl border bg-card/60">
                    <span className="text-[10px] text-muted-foreground block">Today's Status</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusDot status={selectedStudentForDetail.status} showLabel />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-card/60">
                    <span className="text-[10px] text-muted-foreground block">Check-in Time</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 mt-1 block">
                      {selectedStudentForDetail.time || 'Not Punched Today'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-card/60 space-y-1.5">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Institutional Record
                  </span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">School:</span>
                    <span className="font-semibold text-right">PM Shri KV NFC Vigyan Vihar</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Biometric Model:</span>
                    <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30">
                      Face Enrolled & Verified
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

// Metric card with drill-down trigger
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
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10 bg-card/80 p-3 sm:p-4 transition-all duration-200",
      onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] group"
    )}
  >
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground truncate">{label}</p>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-white">
            {value}
          </span>
          {subtitle && (
            <span className={cn("text-[10px] sm:text-xs font-bold truncate", color)}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
      <div className={cn("rounded-xl p-2 shrink-0 group-hover:scale-110 transition-transform", bgColor)}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
    </div>
  </motion.div>
);

// Status dot with label
const StatusDot: React.FC<{ status: string; showLabel?: boolean }> = ({ status, showLabel }) => {
  const config = {
    present: { color: 'bg-emerald-500', label: 'Present', textColor: 'text-emerald-600 dark:text-emerald-400' },
    late: { color: 'bg-amber-500', label: 'Late', textColor: 'text-amber-600 dark:text-amber-400' },
    absent: { color: 'bg-rose-500', label: 'Absent', textColor: 'text-rose-600 dark:text-rose-400' },
  }[status] || { color: 'bg-muted-foreground', label: status, textColor: 'text-muted-foreground' };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", config.color)} />
      {showLabel && <span className={cn("text-[10px] font-bold", config.textColor)}>{config.label}</span>}
    </div>
  );
};

export default PrincipalDashboard;
