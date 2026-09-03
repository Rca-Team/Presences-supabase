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
  Sparkles,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserCheck,
  FileSpreadsheet,
  Layers,
  Globe,
  Feather,
  GraduationCap,
  CalendarDays,
  Smartphone,
  ShieldCheck,
  Flame,
  Activity,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import PageLayout from '@/components/layouts/PageLayout';
import LiteModeToggle from '@/components/LiteModeToggle';
import HomeInstallCard from '@/components/HomeInstallCard';

interface ModuleItem {
  to: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  category: 'Attendance & Gate' | 'Academic & Timetable' | 'Student Management' | 'Safety & Alerts' | 'Reports & Portal';
  badge?: string;
  badgeTone?: string;
}

const MODULES_LIST: ModuleItem[] = [
  // Attendance & Gate
  {
    to: '/attendance',
    icon: Scan,
    label: 'Autonomous Face Terminal',
    desc: 'Instant camera recognition with audio confirmation and parent notification',
    category: 'Attendance & Gate',
    badge: 'Real-time AI',
    badgeTone: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  },
  {
    to: '/attendance?mode=qr&autostart=1',
    icon: QrCode,
    label: 'Digital ID QR Scanner',
    desc: 'High-speed camera barcode scanning with instant sound chime',
    category: 'Attendance & Gate',
    badge: 'Fast Scan',
    badgeTone: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  },
  {
    to: '/gate',
    icon: DoorOpen,
    label: 'Gate Security Terminal',
    desc: 'Campus gate entry & exit monitoring, stranger alerts and visitor passes',
    category: 'Attendance & Gate',
    badge: 'Security',
    badgeTone: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
  },

  // Academic & Timetable
  {
    to: '/admin?tab=timetable',
    icon: BookOpen,
    label: 'Timetable & Class Schedules',
    desc: 'Smart weekly schedule planner for all classes, periods, and subject allocations',
    category: 'Academic & Timetable',
    badge: 'Schedules',
  },
  {
    to: '/admin?tab=timetable',
    icon: UserCheck,
    label: 'Teacher Auto-Substitution',
    desc: 'Intelligent substitution engine when teachers are absent or on leave',
    category: 'Academic & Timetable',
    badge: 'Automated',
  },
  {
    to: '/teacher',
    icon: GraduationCap,
    label: 'Teacher Classroom Portal',
    desc: 'Dedicated teacher workspace for section attendance, grading, and roll calls',
    category: 'Academic & Timetable',
  },

  // Student Management
  {
    to: '/register',
    icon: UserPlus,
    label: 'Student Face Enrollment',
    desc: 'AI face registration with 3D multi-angle capture and batch card extraction',
    category: 'Student Management',
    badge: 'Biometric',
  },
  {
    to: '/admin?tab=students',
    icon: Users,
    label: 'Student Roster & Profiles',
    desc: 'Searchable master directory of registered students, classes, and sections',
    category: 'Student Management',
  },
  {
    to: '/admin?tab=sections',
    icon: Layers,
    label: 'Class Section Management',
    desc: 'Organize student groups, class teachers, and section category assignments',
    category: 'Student Management',
  },

  // Safety & Alerts
  {
    to: '/admin?tab=emergency',
    icon: Bell,
    label: 'Emergency Alert Command',
    desc: 'Instant campus lockdown, fire alerts, panic siren, and parent SMS broadcasts',
    category: 'Safety & Alerts',
    badge: 'Emergency',
    badgeTone: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
  },
  {
    to: '/parent',
    icon: Globe,
    label: 'Parent Communication Hub',
    desc: 'Real-time parent portal for attendance tracking, circulars, and notifications',
    category: 'Safety & Alerts',
  },

  // Reports & Portal
  {
    to: '/admin',
    icon: BarChart3,
    label: 'Principal Command Suite',
    desc: 'School-wide analytics, attendance trends, risk prediction and operational audits',
    category: 'Reports & Portal',
    badge: 'Admin',
  },
  {
    to: '/admin?tab=reports',
    icon: FileSpreadsheet,
    label: 'Attendance Reports & Exports',
    desc: 'Generate printable daily, weekly, monthly summaries and CSV/PDF data exports',
    category: 'Reports & Portal',
  },
  {
    to: '/profile',
    icon: Shield,
    label: 'Account & Security Preferences',
    desc: 'Manage administrative roles, performance mode defaults, and notifications',
    category: 'Reports & Portal',
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
  'All Modules',
  'Attendance & Gate',
  'Academic & Timetable',
  'Student Management',
  'Safety & Alerts',
  'Reports & Portal',
] as const;

export const LiteHome: React.FC = () => {
  const { signals, setPreference } = usePerformanceMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All Modules');
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

      // 2. Fetch last 4 marked students for live mini-feed preview
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: records } = await supabase
        .from('attendance_records')
        .select('id, student_name, device_info, timestamp, status, confidence')
        .gte('timestamp', today.toISOString())
        .in('status', ['present', 'late'])
        .order('timestamp', { ascending: false })
        .limit(4);

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
      console.warn('LiteHome data error:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Supabase Real-time updates
    const channel = supabase
      .channel('lite-home-stream-preview')
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
      const matchesCategory = activeCategory === 'All Modules' || m.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.label.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        (m.badge && m.badge.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  return (
    <PageLayout className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 space-y-5">
        
        {/* ========================================================================= */}
        {/* 1. HERO BANNER: Institutional Branding, Status & Animated Segmented Switch */}
        {/* ========================================================================= */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-7 shadow-xs">
          {/* Subtle Ambient Decorative Accent */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2">
              {/* Institution and Active Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
                  <Building2 className="h-3.5 w-3.5" />
                  PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  AI Campus Online
                </span>
              </div>

              {/* Title & Description */}
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-foreground tracking-tight">
                Presences AI <span className="text-amber-500">Lite Edition</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
                High-efficiency campus command center. Streamlined 60-FPS rendering, instant sound confirmation,
                and zero-lag operation optimized for low-bandwidth networks and low-power hardware.
              </p>

              {/* Diagnostic Telemetry Pills */}
              <div className="pt-1 flex items-center gap-2 text-[11px] font-mono text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/80">
                  <Zap className="w-3 h-3 text-amber-500 fill-current" /> 60 FPS Target
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/80">
                  <Activity className="w-3 h-3 text-blue-500" /> Shaders Bypassed
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 border border-border/80">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" /> Low Latency
                </span>
              </div>
            </div>

            {/* Mode Switcher Segmented Control */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-start lg:self-center shrink-0">
              <LiteModeToggle variant="segmented" />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. REAL-TIME ATTENDANCE METRICS GRID                                      */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Enrolled */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs hover:border-purple-500/40 transition-colors">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <span>Enrolled Roster</span>
              <Users className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-foreground mt-1.5 tracking-tight">
              {stats.totalRegistered}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">Verified Face Profiles</div>
          </div>

          {/* Present Today */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-2xs hover:border-emerald-500/50 transition-colors">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              <span>Present Today</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5 tracking-tight">
              {stats.presentToday}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1 font-medium">
              Checked-in on campus
            </div>
          </div>

          {/* Late Arrivals */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-2xs hover:border-amber-500/50 transition-colors">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
              <span>Late Arrivals</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1.5 tracking-tight">
              {stats.lateToday}
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1 font-medium">
              Past morning cutoff
            </div>
          </div>

          {/* Attendance Rate */}
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 shadow-2xs hover:border-blue-500/50 transition-colors">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase tracking-wider">
              <span>Attendance Rate</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mt-1.5 tracking-tight">
              {stats.attendanceRate}%
            </div>
            <div className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-1 font-medium">
              Overall daily ratio
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. PRIMARY ACTION HUB: Quick Terminal Launch                              */}
        {/* ========================================================================= */}
        <div className="rounded-3xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-md shadow-primary/25">
              <Scan className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-foreground">
                  Smart Autonomous Attendance Terminal
                </h2>
                <span className="hidden sm:inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                  Instant Chime
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                Hands-free live face recognition with synthesized audio feedback and real-time live attendance feed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
            <Button asChild className="gap-2 w-full sm:w-auto font-semibold">
              <Link to="/attendance">
                Launch Face Terminal <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-1.5 hidden sm:inline-flex">
              <Link to="/attendance?mode=qr&autostart=1">
                <QrCode className="w-4 h-4" /> QR Mode
              </Link>
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. LIVE ATTENDANCE SNAPSHOT (Mini Feed Preview)                           */}
        {/* ========================================================================= */}
        {recentScans.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Recent Attendance Stream
                </span>
              </div>
              <Link
                to="/attendance"
                className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
              >
                View Full Live Feed <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/25 text-xs"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold text-foreground truncate">{scan.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{scan.time}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                      scan.status === 'late'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {scan.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. SEARCH & CATEGORY FILTER BAR                                           */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          {/* Quick Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools, modules, timetables, or features (e.g. face attendance, timetable, register)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-border bg-card text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. MODULES DIRECTORY GRID                                                */}
        {/* ========================================================================= */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {activeCategory} ({filteredModules.length})
            </h3>
            <button
              onClick={loadData}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredModules.map((m) => (
              <Link
                key={m.label}
                to={m.to}
                className="group relative flex flex-col justify-between p-4 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-muted/30 transition-all shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <m.icon className="h-5 w-5" />
                    </div>
                    {m.badge && (
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          m.badgeTone || 'bg-primary/15 text-primary border-primary/20'
                        }`}
                      >
                        {m.badge}
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                    {m.label}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {m.desc}
                  </p>
                </div>

                <div className="pt-3 mt-3 border-t border-border/50 flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  <span>Open Tool</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 7. APP INSTALLATION & PWA BANNER                                          */}
        {/* ========================================================================= */}
        <HomeInstallCard />

        {/* ========================================================================= */}
        {/* 8. FOOTER / INSTITUTIONAL CREDITS                                         */}
        {/* ========================================================================= */}
        <footer className="pt-4 pb-8 border-t border-border text-center space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">
            PM Shri Kendriya Vidyalaya NFC Vigyan Vihar · AI Campus
          </p>
          <p className="text-[11px]">
            Created by Gaurav Raj, Swami Anant Vyas, Jatin Dhama & Team RCA
          </p>
          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={() => setPreference('off')}
              className="text-primary hover:underline font-medium"
            >
              Switch to Standard Visual Mode
            </button>
            <span>•</span>
            <Link to="/contact" className="hover:text-foreground">
              Contact Support
            </Link>
          </div>
        </footer>
      </div>
    </PageLayout>
  );
};

export default LiteHome;
