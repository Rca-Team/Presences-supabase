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
} from 'lucide-react';
import PageLayout from '@/components/layouts/PageLayout';

/**
 * LiteHome
 * --------
 * High-performance, low-data home dashboard for Lite mode.
 * Features 100% full module access with zero GPU blur overhead,
 * instantaneous load times, live attendance stats, and fast tool search.
 */

interface ModuleItem {
  to: string;
  icon: React.ElementType;
  label: string;
  desc: string;
  category: 'Attendance' | 'Management' | 'Security & Portal';
  badge?: string;
}

const ALL_MODULES: ModuleItem[] = [
  {
    to: '/attendance',
    icon: Scan,
    label: 'Face Recognition Terminal',
    desc: 'Instant hands-free attendance with millisecond AI matching',
    category: 'Attendance',
    badge: 'Primary',
  },
  {
    to: '/attendance?mode=qr&autostart=1',
    icon: QrCode,
    label: 'Digital ID QR Scanner',
    desc: 'High-speed camera barcode scanning with audio feedback',
    category: 'Attendance',
  },
  {
    to: '/gate',
    icon: DoorOpen,
    label: 'Gate Security & Kiosk',
    desc: 'Campus boundary monitoring, stranger alerts & gate pass',
    category: 'Security & Portal',
  },
  {
    to: '/admin?tab=timetable',
    icon: BookOpen,
    label: 'Timetable & Substitutions',
    desc: 'Automated period timetable and teacher absence replacement',
    category: 'Management',
  },
  {
    to: '/admin',
    icon: BarChart3,
    label: 'Principal & Admin Suite',
    desc: 'Central command, student roster, exports and attendance cutoff',
    category: 'Management',
  },
  {
    to: '/register',
    icon: Users,
    label: 'Student Face Registration',
    desc: 'Multi-angle face enrollment and batch profile management',
    category: 'Management',
  },
  {
    to: '/parent',
    icon: Globe,
    label: 'Parent Communication Portal',
    desc: 'Live attendance notifications, circulars and student tracking',
    category: 'Security & Portal',
  },
  {
    to: '/admin?tab=emergency',
    icon: Bell,
    label: 'Emergency & Safety Alerts',
    desc: 'One-click campus alerts, lockdown controls and parent SMS',
    category: 'Security & Portal',
  },
  {
    to: '/admin?tab=reports',
    icon: FileSpreadsheet,
    label: 'Reports & CSV/PDF Exports',
    desc: 'Daily, monthly, and class-wise attendance reporting',
    category: 'Management',
  },
  {
    to: '/profile',
    icon: Shield,
    label: 'Account & Security Settings',
    desc: 'Manage credentials, notification preferences and roles',
    category: 'Security & Portal',
  },
];

const LiteHome: React.FC = () => {
  const { setPreference, signals } = usePerformanceMode();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<UnifiedAttendanceStats>({
    totalRegistered: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    attendanceRate: 0,
  });

  const refreshStats = async () => {
    try {
      const data = await fetchUnifiedAttendanceStats();
      setStats(data);
    } catch (e) {
      console.warn('LiteHome stats error:', e);
    }
  };

  useEffect(() => {
    refreshStats();

    const channel = supabase
      .channel('lite-home-live-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        refreshStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return ALL_MODULES;
    const q = searchQuery.toLowerCase();
    return ALL_MODULES.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.desc.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  return (
    <PageLayout className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Top Header */}
        <header className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary">
                <Building2 className="h-3.5 w-3.5" />
                PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-semibold">
                <Zap className="w-3 h-3 fill-current" /> Lite Mode Active
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
              Presences AI Command Hub
            </h1>
            <p className="text-xs text-muted-foreground">
              High-performance school automation · Optimized for battery, speed, and low bandwidth
              {signals.slowNetwork ? ` (${signals.effectiveType})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreference('off')}
              className="text-xs gap-1.5"
            >
              <Feather className="w-3.5 h-3.5" />
              Switch to Full Visual App
            </Button>
          </div>
        </header>

        {/* Live Attendance Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
              <span>Total Enrolled</span>
              <Users className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-foreground mt-1">
              {stats.totalRegistered}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase">
              <span>Present Today</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.presentToday}
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase">
              <span>Late Arrivals</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
              {stats.lateToday}
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase">
              <span>Attendance Rate</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
              {stats.attendanceRate}%
            </div>
          </div>
        </div>

        {/* Quick Search & Filter */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools, modules, and workflows (e.g. face attendance, timetable, gate)..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>

        {/* Primary Attendance CTA Banner */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 shadow-sm">
              <Scan className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base sm:text-lg">
                Autonomous Face & QR Terminal
              </h2>
              <p className="text-xs text-muted-foreground">
                Live continuous camera recognition with automatic sound confirmation and parent SMS
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button asChild className="gap-2 w-full sm:w-auto">
              <Link to="/attendance">
                Launch Terminal <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* All Modules Grid */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            System Modules & Portals ({filteredModules.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredModules.map((m) => (
              <Link
                key={m.label}
                to={m.to}
                className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-3.5 hover:border-primary/50 hover:bg-muted/30 transition-all shadow-2xs"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <m.icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {m.label}
                    </span>
                    {m.badge && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {m.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all self-center flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default LiteHome;
