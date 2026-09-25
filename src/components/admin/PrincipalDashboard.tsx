import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Users, Clock, TrendingUp, CheckCircle2, UserX, RefreshCw,
  Search, FolderKanban, CalendarDays,
  QrCode, Bell, BarChart3,
  ArrowRight, ChevronRight, Mail,
  Building2, Eye, ShieldCheck, Sparkles, Send
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
import {
  prefetchStudentIdentities,
  resolveStudentAdmissionId,
  resolveStudentClass,
  registerStudentIdentity,
} from '@/utils/studentIdentityResolver';
import { getCutoffTime, updateCutoffTime } from '@/services/attendance/AttendanceSettingsService';

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
  studentId?: string;
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
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [cutoffTime, setCutoffTime] = useState<string>('08:00');
  const [isCutoffModalOpen, setIsCutoffModalOpen] = useState(false);
  const [customCutoffInput, setCustomCutoffInput] = useState('08:00');
  const [isUpdatingCutoff, setIsUpdatingCutoff] = useState(false);

  const format12Hour = (time24: string) => {
    if (!time24) return '8:00 AM';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return '8:00 AM';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minuteStr = m < 10 ? `0${m}` : `${m}`;
    return `${hour12}:${minuteStr} ${period}`;
  };

  useEffect(() => {
    let isMounted = true;
    getCutoffTime().then(time => {
      if (isMounted && time) {
        setCutoffTime(time);
        setCustomCutoffInput(time);
      }
    });

    const handleCutoffChange = (e: Event) => {
      const custom = e as CustomEvent<{ time?: string }>;
      if (custom.detail?.time) {
        setCutoffTime(custom.detail.time);
        setCustomCutoffInput(custom.detail.time);
      }
    };

    window.addEventListener('presence:cutoff-time-changed', handleCutoffChange);
    return () => {
      isMounted = false;
      window.removeEventListener('presence:cutoff-time-changed', handleCutoffChange);
    };
  }, []);

  const handleSetCutoff = async (newTime: string) => {
    try {
      setIsUpdatingCutoff(true);
      await updateCutoffTime(newTime);
      setCutoffTime(newTime);
      setCustomCutoffInput(newTime);
      toast({
        title: 'Cutoff Time Updated',
        description: `School attendance cutoff updated to ${format12Hour(newTime)}. All kiosks & dashboards synchronized.`,
      });
      setIsCutoffModalOpen(false);
    } catch (error) {
      console.error('Failed to update cutoff time:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not update cutoff time. Please try again.',
      });
    } finally {
      setIsUpdatingCutoff(false);
    }
  };

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

  const dashboardDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchAllDataRef = useRef<(silent?: boolean) => Promise<void>>(() => Promise.resolve());

  const debouncedRefresh = useCallback(() => {
    if (dashboardDebounceRef.current) {
      clearTimeout(dashboardDebounceRef.current);
    }
    dashboardDebounceRef.current = setTimeout(() => {
      fetchAllDataRef.current(true);
      dashboardDebounceRef.current = null;
    }, 2500);
  }, []);

  const { isConnected } = useRealtimeAttendance({
    showNotifications: true,
    useSessionEventsOnly: false,
    onNewAttendance: (record) => {
      const name = record.student_name || record.device_info?.metadata?.name || 'Student';
      const studentId = resolveStudentAdmissionId(record);
      const category = resolveStudentClass(record) || record.category || '';
      const imageUrl = record.device_info?.metadata?.firebase_image_url || record.image_url || '';
      if (studentId || category) {
        registerStudentIdentity({
          userId: record.user_id,
          name,
          studentId,
          classSection: category,
        });
      }
      setLiveEntries(prev => [{
        id: record.id,
        name,
        studentId: studentId || undefined,
        category: category && category !== '—' && category !== '?' ? category : '',
        status: record.status,
        time: format(new Date(record.timestamp), 'hh:mm a'),
        imageUrl,
      }, ...prev].slice(0, 30));
      debouncedRefresh();
    }
  });

  useEffect(() => {
    const handleIdentitiesLoaded = () => {
      debouncedRefresh();
    };
    window.addEventListener('presence:student-identities-loaded', handleIdentitiesLoaded);
    return () => window.removeEventListener('presence:student-identities-loaded', handleIdentitiesLoaded);
  }, [debouncedRefresh]);

  const fetchAllData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    await prefetchStudentIdentities().catch(() => undefined);
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
        .select('id, user_id, student_id, student_name, class, section, status, timestamp, category, image_url, device_info')
        .in('status', ['present', 'late', 'unauthorized'])
        .gte('timestamp', `${today}T00:00:00`)
        .lte('timestamp', `${today}T23:59:59`)
        .order('timestamp', { ascending: false })
        .limit(30);

      (todayData || []).forEach(r => {
        const m = (r.device_info as any)?.metadata || {};
        const normalized = (r.status || '').toLowerCase().includes('late') ? 'late' : 'present';
        const studentId = resolveStudentAdmissionId(r);
        const resolvedCls = resolveStudentClass(r) || r.category || '';
        entries.push({
          id: r.id,
          name: r.student_name || m.name || (r.device_info as any)?.name || 'Student',
          studentId: studentId || undefined,
          category: resolvedCls && resolvedCls !== '—' && resolvedCls !== '?' ? resolvedCls : '',
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

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      if (!silent) toast({ title: 'Error', description: 'Failed to load school snapshot', variant: 'destructive' });
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [toast]);

  fetchAllDataRef.current = fetchAllData;

  const fetchWeeklyTrend = useCallback(async () => {
    try {
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

      const dailyPresent: Record<string, Set<string>> = {};
      (weekAttRes.data || []).forEach(r => {
        const d = format(new Date(r.timestamp), 'yyyy-MM-dd');
        const m = (r.device_info as any)?.metadata || {};
        const key = r.student_id || m.employee_id || r.user_id || m.name || r.student_name;
        if (key) {
          if (!dailyPresent[d]) dailyPresent[d] = new Set();
          dailyPresent[d].add(String(key));
        }
      });

      (weekGateRes.data || []).forEach(g => {
        if (!g.student_id) return;
        const d = format(new Date(g.entry_time), 'yyyy-MM-dd');
        if (!dailyPresent[d]) dailyPresent[d] = new Set();
        dailyPresent[d].add(String(g.student_id));
      });

      const trendData = workingDays.map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        let count = dailyPresent[dateStr]?.size || 0;
        return {
          date: dateStr,
          day: format(d, 'EEE'),
          fullDate: format(d, 'EEE, d MMM'),
          count,
        };
      });

      setWeeklyTrend(trendData);
    } catch (err) {
      console.warn('Weekly trend fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    fetchWeeklyTrend();
  }, [fetchAllData, fetchWeeklyTrend]);

  useEffect(() => {
    const channel = supabase
      .channel('principal-glimpse-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_settings' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (dashboardDebounceRef.current) {
        clearTimeout(dashboardDebounceRef.current);
        dashboardDebounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [debouncedRefresh]);

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

  const [studentDisplayLimit, setStudentDisplayLimit] = useState(30);

  useEffect(() => {
    setStudentDisplayLimit(30);
  }, [searchQuery, statusFilter]);

  const displayedStudents = useMemo(() => {
    return filteredStudents.slice(0, studentDisplayLimit);
  }, [filteredStudents, studentDisplayLimit]);

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
      <div className="space-y-4 animate-pulse p-2">
        <div className="h-16 rounded-2xl bg-muted/60" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <div className="h-44 rounded-2xl bg-muted/50" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  const statusFilterOptions: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All Students & Staff', count: allStudents.length },
    { key: 'present', label: 'Present Today', count: overallStats.presentToday },
    { key: 'late', label: 'Late Arrivals', count: overallStats.lateToday },
    { key: 'absent', label: 'Absent Today', count: overallStats.absentToday },
  ];

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto pb-12">
      
      {/* 1. Welcoming School Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Building2 className="w-4 h-4" />
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground">
              PM Shri KV NFC Vigyan Vihar
            </h2>
            <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5">
              Delhi Region
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            School Attendance Overview • {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCutoffModalOpen(true)}
            className="h-8 px-2.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 gap-1.5 transition-all shadow-xs cursor-pointer"
            title="Click to adjust attendance cutoff time for whole school"
          >
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Cutoff: {format12Hour(cutoffTime)}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 font-mono font-bold">Adjust</span>
          </Button>

          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Camera & Gate Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
              Offline / Standby
            </span>
          )}
        </div>
      </div>

      {/* 2. Today's Attendance Overview Hero Banner */}
      <Card className="overflow-hidden border border-border/80 bg-gradient-to-br from-card via-card to-blue-500/[0.03] shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            
            {/* Progress Turnout */}
            <div className="flex items-center gap-4 sm:gap-5">
              <ProgressRing
                value={overallStats.attendanceRate}
                size={isMobile ? 'md' : 'lg'}
                color={overallStats.attendanceRate >= 80 ? 'success' : overallStats.attendanceRate >= 60 ? 'warning' : 'destructive'}
                thickness={isMobile ? 6 : 8}
              />
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Today's School Attendance
                </p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight text-foreground font-mono">
                    {overallStats.attendanceRate}%
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Turnout
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <strong className="text-foreground">{overallStats.presentToday + overallStats.lateToday}</strong> present out of <strong className="text-foreground">{overallStats.totalRegistered}</strong> enrolled students & teachers.
                </p>
              </div>
            </div>

            {/* Quick Human Action Buttons */}
            <div className="w-full lg:w-auto flex flex-wrap items-center gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-border/60">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setIsCutoffModalOpen(true)}
                className="text-xs h-9 px-3 gap-1.5 rounded-xl border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Cutoff: {format12Hour(cutoffTime)}
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleNavigate('notifications')}
                className="text-xs h-9 px-3 gap-1.5 rounded-xl border-border hover:bg-muted font-semibold"
              >
                <Send className="w-3.5 h-3.5 text-blue-600" /> Message Absent Parents
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleNavigate('reports')}
                className="text-xs h-9 px-3 gap-1.5 rounded-xl border-border hover:bg-muted font-semibold"
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-600" /> Attendance Report
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleNavigate('timetable')}
                className="text-xs h-9 px-3 gap-1.5 rounded-xl border-border hover:bg-muted font-semibold"
              >
                <CalendarDays className="w-3.5 h-3.5 text-indigo-600" /> Timetable
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleNavigate('gatepass')}
                className="text-xs h-9 px-3 gap-1.5 rounded-xl border-border hover:bg-muted font-semibold"
              >
                <QrCode className="w-3.5 h-3.5 text-purple-600" /> Gate Passes ({gatePassStats.active})
              </Button>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 3. The 4 Big Friendly Attendance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SimpleStatCard 
          label="Total Enrolled" 
          value={overallStats.totalRegistered} 
          icon={Users} 
          color="text-blue-600 dark:text-blue-400" 
          bgColor="bg-blue-500/10" 
          helper={`${overallStats.teacherTotal} Teachers registered`}
          onClick={() => {
            setStatusFilter('all');
            const el = document.getElementById('student-directory-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
        <SimpleStatCard 
          label="In School Today" 
          value={overallStats.presentToday} 
          icon={CheckCircle2} 
          color="text-emerald-600 dark:text-emerald-400" 
          bgColor="bg-emerald-500/10" 
          helper="Arrived on time"
          onClick={() => {
            setStatusFilter('present');
            const el = document.getElementById('student-directory-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
        <SimpleStatCard 
          label="Came Late" 
          value={overallStats.lateToday} 
          icon={Clock} 
          color="text-amber-600 dark:text-amber-400" 
          bgColor="bg-amber-500/10" 
          helper={`After ${format12Hour(cutoffTime)}`}
          onClick={() => {
            setStatusFilter('late');
            const el = document.getElementById('student-directory-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
        <SimpleStatCard 
          label="Absent Today" 
          value={overallStats.absentToday} 
          icon={UserX} 
          color="text-rose-600 dark:text-rose-400" 
          bgColor="bg-rose-500/10" 
          helper="Not checked in"
          onClick={() => {
            setStatusFilter('absent');
            const el = document.getElementById('student-directory-section');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>

      {/* 4. Class Attendance Overview & Real-Time Check-in Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Class Attendance Overview */}
        <Card className="border border-border/80 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
                <FolderKanban className="w-4 h-4 text-blue-600" />
                Attendance by Class
              </CardTitle>
              <CardDescription className="text-xs">Turnout percentage for each grade today</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('sections')}
              className="text-xs text-primary h-7 px-2 hover:bg-muted font-semibold"
            >
              All Classes <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-2.5">
            {classBreakdowns.slice(0, 8).map((item) => (
              <div 
                key={item.key} 
                onClick={() => handleNavigate('sections')}
                className="cursor-pointer group flex items-center justify-between gap-3 text-xs p-2 rounded-xl hover:bg-muted/60 transition-colors border border-transparent hover:border-border/60"
              >
                <div className="flex items-center gap-2 min-w-[90px]">
                  <span className="font-bold text-foreground group-hover:text-primary transition-colors">
                    {item.label}
                  </span>
                </div>
                <div className="flex-1 max-w-[150px]">
                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        item.rate >= 80 ? "bg-emerald-500" : item.rate >= 60 ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
                <div className="text-right tabular-nums min-w-[80px]">
                  <span className="font-bold text-foreground">{item.present + item.late}</span>
                  <span className="text-muted-foreground text-[11px]"> of {item.total}</span>
                  <span className={cn(
                    "ml-1.5 font-bold text-[11px]",
                    item.rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : item.rate >= 60 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"
                  )}>
                    ({item.rate}%)
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Real-time Live Gate & Camera Feed */}
        <Card className="overflow-hidden border border-border/80 shadow-xs flex flex-col">
          <CardHeader className="pb-2 px-4 pt-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                Live Student Check-ins
              </CardTitle>
              <CardDescription className="text-xs">Students recognized at the gate & cameras</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => handleNavigate('students')}
              className="text-xs text-primary h-7 px-2 font-semibold"
            >
              All Students <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <ScrollArea className="h-[310px]">
              <AnimatePresence initial={false}>
                {liveEntries.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
                    <p className="text-xs font-semibold">No attendance scans recorded yet today</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Scans will show up here automatically when students arrive</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {liveEntries.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        initial={i === 0 ? { opacity: 0, x: -8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0 border border-border">
                          <AvatarImage src={entry.imageUrl?.startsWith('data:') ? entry.imageUrl : ''} />
                          <AvatarFallback className="text-xs font-bold bg-muted">
                            {entry.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-foreground truncate">{entry.name}</p>
                            {entry.studentId ? (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                ID: {entry.studentId}
                              </span>
                            ) : null}
                            {entry.category && entry.category !== '?' && entry.category !== '—' ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                                Class {entry.category}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Checked in at {entry.time}
                          </p>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-[10px] font-bold px-2 py-0.5",
                            entry.status === 'late'
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                          )}
                        >
                          {entry.status === 'late' ? 'Late' : 'On Time'}
                        </Badge>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* 5. 7-Day Attendance Trend Chart */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-1 sm:pb-2 px-4 sm:px-6 pt-4 sm:pt-5 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2 text-foreground">
              <TrendingUp className="w-4 h-4 text-primary" />
              Attendance Trend (Last 7 Working Days)
            </CardTitle>
            <CardDescription className="text-xs">How many students attended school each day</CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleNavigate('reports')}
            className="text-xs h-8 gap-1.5 font-semibold"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Full Reports
          </Button>
        </CardHeader>
        <CardContent className="px-1 sm:px-4 pb-3 sm:pb-4">
          <div className="h-44 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTrend} barSize={isMobile ? 24 : 38}>
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
                  width={isMobile ? 25 : 35}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '10px',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [`${value} Students & Teachers`, 'Present']}
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

      {/* 6. Student Directory (Search & Attendance List) */}
      <Card id="student-directory-section" className="overflow-hidden border border-border/80 shadow-xs scroll-mt-20">
        <CardHeader className="pb-3 px-4 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Student Attendance List ({filteredStudents.length})
            </CardTitle>
            <CardDescription className="text-xs">Search for any student and view today's check-in status</CardDescription>
          </div>
          
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by student name or roll number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-muted/40 rounded-xl pl-9 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary/40 border border-border transition-all"
            />
          </div>
        </CardHeader>

        {/* Filter Tabs */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-border/50">
          {statusFilterOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0",
                statusFilter === opt.key
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {opt.label} <span className="tabular-nums opacity-85 font-mono">({opt.count})</span>
            </button>
          ))}
        </div>

        <CardContent className="p-0">
          <ScrollArea className="h-[360px]">
            <div className="divide-y divide-border">
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  No students found matching your search or filter
                </div>
              ) : (
                displayedStudents.map((student, i) => (
                  <div 
                    key={i} 
                    onClick={() => setSelectedStudentForDetail(student)}
                    className="cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group"
                  >
                    <Avatar className="h-9 w-9 flex-shrink-0 border border-border">
                      <AvatarImage src={student.image_url} />
                      <AvatarFallback className="text-xs font-bold bg-muted">
                        {student.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-sm font-semibold truncate group-hover:text-primary transition-colors text-foreground">
                          {student.name}
                        </p>
                        <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 h-4">
                          {student.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Roll / ID: {student.employee_id || 'N/A'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <StatusDot status={student.status} showLabel />
                      {student.time && (
                        <span className="text-[11px] text-muted-foreground tabular-nums font-mono">{student.time}</span>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity ml-1" />
                  </div>
                ))
              )}
              {filteredStudents.length > studentDisplayLimit && (
                <div className="p-3 text-center border-t border-border/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-primary hover:text-primary/80 h-8 font-semibold"
                    onClick={() => setStudentDisplayLimit(prev => prev + 40)}
                  >
                    Show more ({filteredStudents.length - studentDisplayLimit} remaining)
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 7. Student Detail Modal */}
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
                      {getCategoryLabel(selectedStudentForDetail.category)} • Roll Number: {selectedStudentForDetail.employee_id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl border bg-card">
                    <span className="text-[10px] text-muted-foreground block font-medium">Today's Status</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <StatusDot status={selectedStudentForDetail.status} showLabel />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border bg-card">
                    <span className="text-[10px] text-muted-foreground block font-medium">Arrival Time</span>
                    <span className="font-bold text-foreground mt-1 block">
                      {selectedStudentForDetail.time || 'Not Punched Today'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-card space-y-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Student Details
                  </span>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Class & Section:</span>
                    <span className="font-semibold text-right">{selectedStudentForDetail.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Roll / ID:</span>
                    <span className="font-semibold text-right">{selectedStudentForDetail.employee_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Face Verification:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Photo Enrolled</span>
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
                  className="flex-1 text-xs gap-1.5 font-semibold"
                >
                  <Eye className="w-3.5 h-3.5" /> Full Profile
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setSelectedStudentForDetail(null);
                    handleNavigate('notifications');
                  }}
                  className="flex-1 text-xs gap-1.5 font-semibold"
                >
                  <Bell className="w-3.5 h-3.5" /> Notify Parent
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cutoff Time Real-Time Adjustment Dialog */}
      <Dialog open={isCutoffModalOpen} onOpenChange={setIsCutoffModalOpen}>
        <DialogContent className="sm:max-w-[480px] p-6 rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-black tracking-tight">
                  Attendance Cutoff Time
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Arrivals after this cutoff time are automatically marked as Late across the whole school.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Live Indicator Banner */}
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                </span>
                <span className="text-xs font-semibold text-foreground">Active School Cutoff:</span>
              </div>
              <Badge variant="outline" className="text-sm font-mono font-bold px-3 py-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {format12Hour(cutoffTime)}
              </Badge>
            </div>

            {/* Quick 1-Click Presets */}
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                1-Click Presets
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { time: '07:45', label: '7:45 AM' },
                  { time: '08:00', label: '8:00 AM (Default)' },
                  { time: '08:15', label: '8:15 AM' },
                  { time: '08:30', label: '8:30 AM' },
                  { time: '08:45', label: '8:45 AM' },
                  { time: '09:00', label: '9:00 AM' },
                ].map(preset => {
                  const isCurrent = cutoffTime === preset.time;
                  return (
                    <button
                      key={preset.time}
                      type="button"
                      disabled={isUpdatingCutoff}
                      onClick={() => handleSetCutoff(preset.time)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer",
                        isCurrent 
                          ? "bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-md shadow-amber-500/20" 
                          : "bg-card border-border/80 text-foreground hover:bg-muted/80 hover:border-amber-500/30"
                      )}
                    >
                      <span>{preset.label}</span>
                      {preset.time === '08:00' && !isCurrent && (
                        <span className="text-[9px] text-muted-foreground font-normal">Default</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Time Selector */}
            <div className="pt-2 border-t border-border/60">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Or Custom Cutoff Time
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={customCutoffInput}
                  onChange={(e) => setCustomCutoffInput(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl border border-input bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <Button
                  onClick={() => handleSetCutoff(customCutoffInput)}
                  disabled={isUpdatingCutoff || customCutoffInput === cutoffTime}
                  className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {isUpdatingCutoff ? 'Updating...' : 'Set Cutoff'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                ⚡ Changes apply <strong>instantly</strong> across all face scanners, tablets, QR kiosks, and dashboards in the school without refreshing.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCutoffModalOpen(false)}
              className="rounded-xl text-xs h-9"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Friendly Stat Card for normal users
const SimpleStatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  helper?: string;
  onClick?: () => void;
}> = ({ label, value, icon: Icon, color, bgColor, helper, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className={cn(
      "relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 sm:p-5 transition-all duration-200",
      onClick && "cursor-pointer hover:shadow-md hover:border-primary/40 active:scale-[0.99] group"
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground truncate">{label}</p>
        <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
          <span className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight text-foreground font-mono">
            {value}
          </span>
          {helper && (
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted/60 whitespace-nowrap", color)}>
              {helper}
            </span>
          )}
        </div>
      </div>
      <div className={cn("rounded-xl p-2.5 shrink-0 shadow-xs", bgColor)}>
        <Icon className={cn("w-5 h-5", color)} />
      </div>
    </div>
  </motion.div>
);

// Clear, Friendly Status dot with human label
const StatusDot: React.FC<{ status: string; showLabel?: boolean }> = ({ status, showLabel }) => {
  const config = {
    present: { color: 'bg-emerald-500', label: 'Present', textColor: 'text-emerald-600 dark:text-emerald-400' },
    late: { color: 'bg-amber-500', label: 'Late', textColor: 'text-amber-600 dark:text-amber-400' },
    absent: { color: 'bg-rose-500', label: 'Absent', textColor: 'text-rose-600 dark:text-rose-400' },
  }[status] || { color: 'bg-muted-foreground', label: status, textColor: 'text-muted-foreground' };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("w-2 h-2 rounded-full", config.color)} />
      {showLabel && <span className={cn("text-xs font-bold", config.textColor)}>{config.label}</span>}
    </div>
  );
};

export default PrincipalDashboard;
