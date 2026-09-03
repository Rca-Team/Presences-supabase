import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';
import {
  Scan,
  QrCode,
  DoorOpen,
  BarChart3,
  Users,
  Shield,
  Zap,
  ArrowRight,
  BookOpen,
  Bell,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserCheck,
  FileSpreadsheet,
  Layers,
  Globe,
  GraduationCap,
  ShieldCheck,
  Activity,
  UserPlus,
  RefreshCw,
  Sparkles,
  Wifi,
  ChevronRight,
  Radio,
} from 'lucide-react';
import PageLayout from '@/components/layouts/PageLayout';
import LiteModeToggle from '@/components/LiteModeToggle';
import HomeInstallCard from '@/components/HomeInstallCard';

interface ModuleItem {
  to: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  category: 'Attendance' | 'Academic' | 'Students' | 'Safety' | 'Admin';
  badge?: string;
  colorScheme: 'emerald' | 'blue' | 'purple' | 'amber' | 'rose' | 'indigo';
}

const MODULES_LIST: ModuleItem[] = [
  // Attendance & Gate
  {
    to: '/attendance',
    icon: Scan,
    label: 'Autonomous Face Terminal',
    desc: 'Hands-free continuous face recognition with instant audio chime & parent notification',
    category: 'Attendance',
    badge: 'AI Powered',
    colorScheme: 'emerald',
  },
  {
    to: '/attendance?mode=qr&autostart=1',
    icon: QrCode,
    label: 'Digital ID QR Scanner',
    desc: 'Ultra-fast camera barcode scanning with synthesized tone confirmation',
    category: 'Attendance',
    badge: 'Fast Scan',
    colorScheme: 'blue',
  },
  {
    to: '/gate',
    icon: DoorOpen,
    label: 'Gate Security Kiosk',
    desc: 'Campus boundary monitoring, visitor entry-exit tracking and stranger alerts',
    category: 'Attendance',
    badge: 'Perimeter',
    colorScheme: 'purple',
  },

  // Academic & Schedules
  {
    to: '/admin?tab=timetable',
    icon: BookOpen,
    label: 'Timetable & Period Schedules',
    desc: 'Automated weekly schedule matrix for classes, periods, and room assignments',
    category: 'Academic',
    badge: 'Schedules',
    colorScheme: 'indigo',
  },
  {
    to: '/admin?tab=timetable',
    icon: UserCheck,
    label: 'Smart Teacher Substitution',
    desc: 'Automated teacher absence replacement engine with zero period conflicts',
    category: 'Academic',
    badge: 'Automated',
    colorScheme: 'amber',
  },
  {
    to: '/teacher',
    icon: GraduationCap,
    label: 'Teacher Classroom Portal',
    desc: 'Dedicated teacher workspace for section roll-call, grading, and attendance overrides',
    category: 'Academic',
    badge: 'Portal',
    colorScheme: 'blue',
  },

  // Student Management
  {
    to: '/register',
    icon: UserPlus,
    label: 'Student Face Enrollment',
    desc: 'Multi-angle 3D face capture with batch ID card photo extraction & training',
    category: 'Students',
    badge: 'Biometric',
    colorScheme: 'purple',
  },
  {
    to: '/admin?tab=students',
    icon: Users,
    label: 'Master Student Directory',
    desc: 'Comprehensive searchable student roster across all classes and sections',
    category: 'Students',
    badge: 'Roster',
    colorScheme: 'emerald',
  },
  {
    to: '/admin?tab=sections',
    icon: Layers,
    label: 'Class & Section Manager',
    desc: 'Manage section allotments, class teachers, roll numbers, and cohort groupings',
    category: 'Students',
    badge: 'Sections',
    colorScheme: 'indigo',
  },

  // Safety & Institutional
  {
    to: '/admin?tab=emergency',
    icon: Bell,
    label: 'Emergency Alert Command',
    desc: 'One-click campus lockdown, audible siren, fire alerts and instant parent SMS broadcasts',
    category: 'Safety',
    badge: 'Emergency',
    colorScheme: 'rose',
  },
  {
    to: '/parent',
    icon: Globe,
    label: 'Parent Communication Portal',
    desc: 'Real-time parent portal for arrival notifications, circulars, and attendance logs',
    category: 'Safety',
    badge: 'Real-Time',
    colorScheme: 'blue',
  },

  // Admin & Reports
  {
    to: '/admin',
    icon: BarChart3,
    label: 'Principal Command Suite',
    desc: 'Centralized school analytics, daily attendance rates, risk prediction and operational audits',
    category: 'Admin',
    badge: 'Command',
    colorScheme: 'indigo',
  },
  {
    to: '/admin?tab=reports',
    icon: FileSpreadsheet,
    label: 'Attendance Reports & Exports',
    desc: 'Generate daily, monthly, and class-wise attendance summaries with CSV & PDF export',
    category: 'Admin',
    badge: 'Exports',
    colorScheme: 'amber',
  },
  {
    to: '/profile',
    icon: Shield,
    label: 'Security & Access Control',
    desc: 'Manage system credentials, role-based privileges, and telemetry defaults',
    category: 'Admin',
    colorScheme: 'purple',
  },
];

interface RecentScan {
  id: string;
  name: string;
  time: string;
  status: 'present' | 'late';
  confidence?: number;
}

const CATEGORIES = [
  { id: 'All', label: 'All Modules' },
  { id: 'Attendance', label: 'Attendance & Gate' },
  { id: 'Academic', label: 'Academic & Schedule' },
  { id: 'Students', label: 'Students & Classes' },
  { id: 'Safety', label: 'Safety & Emergency' },
  { id: 'Admin', label: 'Admin & Reports' },
] as const;

export const LiteHome: React.FC = () => {
  const { signals, setPreference } = usePerformanceMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stats, setStats] = useState<UnifiedAttendanceStats>({
    totalRegistered: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    attendanceRate: 0,
  });

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch KPI metrics
      const data = await fetchUnifiedAttendanceStats();
      setStats(data);

      // 2. Fetch last 5 marked students for live activity ticker
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: records } = await supabase
        .from('attendance_records')
        .select('id, student_name, device_info, timestamp, status, confidence')
        .gte('timestamp', today.toISOString())
        .in('status', ['present', 'late'])
        .order('timestamp', { ascending: false })
        .limit(5);

      if (records) {
        const formatted: RecentScan[] = records.map((r: any) => {
          const name = r.student_name || r.device_info?.metadata?.name || 'Verified Student';
          const time = new Date(r.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return {
            id: r.id,
            name,
            time,
            status: r.status as 'present' | 'late',
            confidence: r.confidence ? Math.round(r.confidence * 100) : undefined,
          };
        });
        setRecentScans(formatted);
      }
    } catch (e) {
      console.warn('LiteHome data load warning:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Supabase Real-time updates
    const channel = supabase
      .channel('lite-home-feed-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredModules = useMemo(() => {
    return MODULES_LIST.filter((m) => {
      const matchesCategory = selectedCategory === 'All' || m.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.badge && m.badge.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const getColorClasses = (scheme: ModuleItem['colorScheme']) => {
    switch (scheme) {
      case 'emerald':
        return {
          iconBg: 'bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-emerald-950',
          badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
          borderHover: 'hover:border-emerald-500/40',
        };
      case 'blue':
        return {
          iconBg: 'bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white',
          badge: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
          borderHover: 'hover:border-blue-500/40',
        };
      case 'purple':
        return {
          iconBg: 'bg-purple-500/10 text-purple-500 group-hover:bg-purple-500 group-hover:text-white',
          badge: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25',
          borderHover: 'hover:border-purple-500/40',
        };
      case 'amber':
        return {
          iconBg: 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-amber-950',
          badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
          borderHover: 'hover:border-amber-500/40',
        };
      case 'rose':
        return {
          iconBg: 'bg-rose-500/10 text-rose-500 group-hover:bg-rose-500 group-hover:text-white',
          badge: 'bg-rose-500/15 text-rose-500 border-rose-500/25',
          borderHover: 'hover:border-rose-500/40',
        };
      case 'indigo':
      default:
        return {
          iconBg: 'bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white',
          badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/25',
          borderHover: 'hover:border-indigo-500/40',
        };
    }
  };

  return (
    <PageLayout className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-5">

        {/* ========================================================================= */}
        {/* 1. TOP INSTITUTIONAL COMMAND BAR                                          */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border border-border bg-card/90 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-sm sm:text-base text-foreground tracking-tight">
                  PM Shri KV NFC Vigyan Vihar
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  AI Campus Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Presences AI · High-Efficiency Workstation Edition (60 FPS Locked)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <LiteModeToggle variant="segmented" />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. HERO BENTO GRID: PRIMARY TERMINAL + ATTENDANCE GAUGE + TELEMETRY      */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* Card A: Primary Action Workstation (7 Cols) */}
          <div className="lg:col-span-7 rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 text-[11px] font-bold">
                  <Scan className="w-3.5 h-3.5" /> Primary Station
                </span>
                <span className="text-[11px] font-mono text-emerald-500 flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Audio Chime Active
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight mt-3">
                Smart Autonomous Face Terminal
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                Millisecond AI face recognition with instant synthesized success chimes, continuous multi-face
                tracking, and automatic parental SMS notifications.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
              <Button asChild size="default" className="gap-2 font-bold shadow-sm shadow-primary/25">
                <Link to="/attendance">
                  <Scan className="w-4 h-4" /> Launch Face Camera <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="default" className="gap-2 font-medium">
                <Link to="/attendance?mode=qr&autostart=1">
                  <QrCode className="w-4 h-4" /> QR Barcode Mode
                </Link>
              </Button>
              <Button asChild variant="ghost" size="default" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Link to="/gate">
                  <DoorOpen className="w-4 h-4" /> Gate Kiosk
                </Link>
              </Button>
            </div>
          </div>

          {/* Card B: Attendance Rate Pulse Gauge (5 Cols) */}
          <div className="lg:col-span-5 rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Today's Attendance Rate
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500">
                <TrendingUp className="w-3.5 h-3.5" /> Realtime Metric
              </span>
            </div>

            <div className="flex items-baseline gap-3 my-1">
              <span className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">
                {stats.attendanceRate}%
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {stats.presentToday + stats.lateToday} of {stats.totalRegistered} checked in
              </span>
            </div>

            {/* Attendance Progress Bar */}
            <div className="w-full bg-muted/60 rounded-full h-2.5 overflow-hidden p-0.5 border border-border/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, stats.attendanceRate))}%` }}
              />
            </div>

            {/* Mini Stat Breakdown Strips */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-center">
              <div className="rounded-xl bg-purple-500/5 p-2 border border-purple-500/20">
                <span className="text-[10px] text-muted-foreground block uppercase">Enrolled</span>
                <span className="text-sm font-bold text-foreground">{stats.totalRegistered}</span>
              </div>
              <div className="rounded-xl bg-emerald-500/5 p-2 border border-emerald-500/20">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase">Present</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{stats.presentToday}</span>
              </div>
              <div className="rounded-xl bg-amber-500/5 p-2 border border-amber-500/20">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block uppercase">Late</span>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{stats.lateToday}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. LIVE ACTIVITY TICKER (Instant Attendance Stream)                       */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Live Attendance Stream
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadData}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title="Refresh Stream"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
                Sync
              </button>
              <Link
                to="/attendance"
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
              >
                Full Live Terminal <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {recentScans.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-foreground truncate">{scan.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{scan.time}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                      scan.status === 'late'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {scan.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-muted-foreground">
              No students recorded yet today. Launch the terminal to begin scanning.
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. UNIFIED SEARCH & CATEGORY FILTER BAR                                   */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools, timetables, rosters, substitutions, or emergency alerts..."
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-border bg-card text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 5. WORKSTATION MODULES DIRECTORY GRID                                     */}
        {/* ========================================================================= */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {CATEGORIES.find((c) => c.id === selectedCategory)?.label} ({filteredModules.length})
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground">
              Instant 60fps Dispatch
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredModules.map((m) => {
              const colors = getColorClasses(m.colorScheme);
              return (
                <Link
                  key={m.label}
                  to={m.to}
                  className={`group relative flex flex-col justify-between p-4 rounded-2xl border border-border bg-card transition-all shadow-2xs ${colors.borderHover}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${colors.iconBg}`}>
                        <m.icon className="h-5 w-5" />
                      </div>
                      {m.badge && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${colors.badge}`}>
                          {m.badge}
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                      {m.label}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {m.desc}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-border/50 flex items-center justify-between text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Open Workstation</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. PWA & OFFLINE-READY INSTALLATION CARD                                  */}
        {/* ========================================================================= */}
        <HomeInstallCard />

        {/* ========================================================================= */}
        {/* 7. INSTITUTIONAL CREDITS & SYSTEM STATUS FOOTER                           */}
        {/* ========================================================================= */}
        <footer className="pt-4 pb-10 border-t border-border text-center space-y-2.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2 text-foreground font-semibold">
            <Building2 className="w-4 h-4 text-primary" />
            <span>PM Shri Kendriya Vidyalaya NFC Vigyan Vihar · Delhi</span>
          </div>
          <p className="text-[11px] max-w-md mx-auto">
            Architected and engineered by Gaurav Raj, Swami Anant Vyas, Jatin Dhama & Team RCA
          </p>
          <div className="flex items-center justify-center gap-4 pt-1 text-xs">
            <button
              onClick={() => setPreference('off')}
              className="text-primary hover:underline font-bold"
            >
              Switch to Standard Visual Mode
            </button>
            <span>•</span>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Help & Support
            </Link>
          </div>
        </footer>

      </div>
    </PageLayout>
  );
};

export default LiteHome;
