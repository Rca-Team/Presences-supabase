import React, { Suspense, useState, useEffect, useTransition, useMemo } from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { supabase } from '@/integrations/supabase/client';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Image,
  BarChart3,
  UserCog,
  Bell,
  Activity,
  MessageSquareText,
  Mail,
  Siren,
  CalendarDays,
  Settings,
  Download,
  Loader2,
  Zap,
  Search,
  Building2,
  CheckCircle2,
  Clock,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  SlidersHorizontal,
  RefreshCw,
} from 'lucide-react';
import LiteModeToggle from '@/components/LiteModeToggle';

// Dynamic module loaders
const PrincipalDashboard = lazyWithRetry(() => import('@/components/admin/PrincipalDashboard'), 'admin-dashboard');
const CategoryBasedView = lazyWithRetry(() => import('@/components/admin/CategoryBasedView'), 'admin-sections');
const StudentDetailsTable = lazyWithRetry(() => import('@/components/admin/StudentDetailsTable'), 'admin-id-cards');
const AttendanceCalendar = lazyWithRetry(() => import('@/components/admin/AttendanceCalendar'), 'admin-calendar');
const BatchIDCardExtractor = lazyWithRetry(() => import('@/components/admin/BatchIDCardExtractor'), 'admin-id-extract');
const AttendanceReportGenerator = lazyWithRetry(() => import('@/components/admin/AttendanceReportGenerator'), 'admin-report-gen');
const UserAccessManager = lazyWithRetry(() => import('@/components/admin/UserAccessManager'), 'admin-access');
const AdminNotificationSender = lazyWithRetry(() => import('@/components/admin/AdminNotificationSender'), 'admin-notif-sender');
const StudentFaceSamplesManager = lazyWithRetry(() => import('@/components/admin/StudentFaceSamplesManager'), 'admin-samples');
const NotificationLog = lazyWithRetry(() => import('@/components/admin/NotificationLog'), 'admin-notif-log');
const AdminInbox = lazyWithRetry(() => import('@/components/admin/AdminInbox'), 'admin-inbox');
const EmergencyAlertPanel = lazyWithRetry(() => import('@/components/admin/EmergencyAlertPanel'), 'admin-emergency');
const TimetableManager = lazyWithRetry(() => import('@/components/admin/TimetableManager'), 'admin-timetable');
const AttendanceCutoffSetting = lazyWithRetry(() => import('@/components/admin/AttendanceCutoffSetting'), 'admin-cutoff');
const AttendanceExport = lazyWithRetry(() => import('@/components/admin/AttendanceExport'), 'admin-export');

interface TabItem {
  id: string;
  label: string;
  desc: string;
  category: 'Core Operations' | 'Students & AI' | 'Safety & Comms';
  icon: React.ElementType;
  badge?: string;
  tone: 'indigo' | 'emerald' | 'purple' | 'amber' | 'rose' | 'blue';
}

const ADMIN_TABS: TabItem[] = [
  // Core Operations
  {
    id: 'dashboard',
    label: 'Principal Dashboard',
    desc: 'Executive analytics, attendance trends & campus overview',
    category: 'Core Operations',
    icon: LayoutDashboard,
    badge: 'Executive',
    tone: 'indigo',
  },
  {
    id: 'timetable',
    label: 'Timetable & Substitutions',
    desc: 'Weekly class schedule matrix and automated teacher substitution engine',
    category: 'Core Operations',
    icon: CalendarDays,
    badge: 'Matrix',
    tone: 'blue',
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    desc: 'Custom attendance filters, percentage rosters and monthly summaries',
    category: 'Core Operations',
    icon: BarChart3,
    tone: 'emerald',
  },
  {
    id: 'export',
    label: 'Attendance Export Center',
    desc: 'Generate printable CSV and PDF attendance sheets',
    category: 'Core Operations',
    icon: Download,
    tone: 'amber',
  },

  // Students & AI
  {
    id: 'students',
    label: 'Master Student Roster',
    desc: 'Comprehensive directory of enrolled students across all sections',
    category: 'Students & AI',
    icon: Users,
    badge: 'Directory',
    tone: 'purple',
  },
  {
    id: 'sections',
    label: 'Class & Section Manager',
    desc: 'Manage section allotments, class teachers and cohort groups',
    category: 'Students & AI',
    icon: FolderKanban,
    tone: 'indigo',
  },
  {
    id: 'samples',
    label: 'Face Recognition Diagnostics',
    desc: 'Inspect neural biometric vectors, quality scores and face model integrity',
    category: 'Students & AI',
    icon: Activity,
    badge: 'AI Vectors',
    tone: 'emerald',
  },
  {
    id: 'idcard',
    label: 'Batch ID Card Extractor',
    desc: 'Extract face crops from batch PDF or photo sheets for instant enrollment',
    category: 'Students & AI',
    icon: Image,
    tone: 'blue',
  },

  // Safety & Comms
  {
    id: 'emergency',
    label: 'Emergency Alert Command',
    desc: 'Campus-wide lockdown siren, fire alerts and instant parent SMS dispatch',
    category: 'Safety & Comms',
    icon: Siren,
    badge: 'Priority',
    tone: 'rose',
  },
  {
    id: 'notifications',
    label: 'Broadcast Notifications',
    desc: 'Send customized messages and circulars to parents or staff groups',
    category: 'Safety & Comms',
    icon: Bell,
    tone: 'amber',
  },
  {
    id: 'inbox',
    label: 'Administration Inbox',
    desc: 'Incoming communication, parent queries and administrative approvals',
    category: 'Safety & Comms',
    icon: Mail,
    tone: 'purple',
  },
  {
    id: 'notif-log',
    label: 'Notification Delivery Logs',
    desc: 'Audit trail of sent SMS and push notifications with delivery status',
    category: 'Safety & Comms',
    icon: MessageSquareText,
    tone: 'blue',
  },
  {
    id: 'access',
    label: 'User & Staff Permissions',
    desc: 'Role-based security assignments for teachers, admins and coordinators',
    category: 'Safety & Comms',
    icon: UserCog,
    tone: 'indigo',
  },
  {
    id: 'settings',
    label: 'Morning Cutoff & Policies',
    desc: 'Set late entry grace period, morning cutoff times and attendance policies',
    category: 'Safety & Comms',
    icon: Settings,
    tone: 'amber',
  },
];

interface Props {
  stats?: { totalFaces: number; presentToday: number; lateToday: number; todayAttendance: number };
}

export const LiteAdmin: React.FC<Props> = ({ stats: initialStats }) => {
  const { setPreference } = usePerformanceMode();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [liveStats, setLiveStats] = useState<UnifiedAttendanceStats>({
    totalRegistered: initialStats?.totalFaces || 0,
    presentToday: initialStats?.presentToday || 0,
    lateToday: initialStats?.lateToday || 0,
    absentToday: 0,
    attendanceRate: 0,
  });

  const refreshStats = async () => {
    try {
      const data = await fetchUnifiedAttendanceStats();
      setLiveStats(data);
    } catch (e) {
      console.warn('LiteAdmin stats error:', e);
    }
  };

  useEffect(() => {
    refreshStats();

    const channel = supabase
      .channel('lite-admin-live-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        refreshStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const categories = ['All', 'Core Operations', 'Students & AI', 'Safety & Comms'] as const;

  const filteredTabs = useMemo(() => {
    return ADMIN_TABS.filter((t) => {
      const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.label.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const activeTabItem = useMemo(() => {
    return ADMIN_TABS.find((t) => t.id === activeTab) || ADMIN_TABS[0];
  }, [activeTab]);

  const handleTabChange = (id: string) => {
    startTransition(() => {
      setActiveTab(id);
    });
  };

  const renderActiveSection = () => {
    switch (activeTab) {
      case 'dashboard':
        return <PrincipalDashboard />;
      case 'timetable':
        return <TimetableManager />;
      case 'reports':
        return <AttendanceReportGenerator />;
      case 'export':
        return <AttendanceExport />;
      case 'students':
        return <StudentDetailsTable />;
      case 'sections':
        return <CategoryBasedView />;
      case 'samples':
        return <StudentFaceSamplesManager />;
      case 'idcard':
        return <BatchIDCardExtractor />;
      case 'emergency':
        return <EmergencyAlertPanel />;
      case 'notifications':
        return <AdminNotificationSender />;
      case 'inbox':
        return <AdminInbox />;
      case 'notif-log':
        return <NotificationLog />;
      case 'access':
        return <UserAccessManager />;
      case 'settings':
        return <AttendanceCutoffSetting />;
      default:
        return <PrincipalDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ========================================================================= */}
        {/* 1. TOP EXECUTIVE HEADER                                                   */}
        {/* ========================================================================= */}
        <div className="text-center space-y-1 py-1">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-2">
            Smart Administration <span className="text-amber-500 font-extrabold">(Lite)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            High efficiency institutional command & AI operations for low-latency devices
          </p>
          <button
            type="button"
            onClick={() => setPreference('standard')}
            className="text-xs font-semibold text-blue-500 hover:text-blue-400 underline underline-offset-4 transition-colors cursor-pointer"
          >
            Switch to Full Experience
          </button>
        </div>

        {/* Executive Terminal Banner */}
        <header className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 border border-amber-500/25">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                  Lite Administration Terminal
                </h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE SYNC
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                PM Shri KV NFC Vigyan Vihar · Fast institutional management suite
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-center">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStats}
              className="h-8 px-3 rounded-xl text-xs font-bold border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
              <span>Sync</span>
            </Button>
            <LiteModeToggle variant="segmented" />
          </div>
        </header>

        {/* ========================================================================= */}
        {/* 2. REAL-TIME OPERATIONAL METRICS RIBBON (4 Cards)                         */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>REGISTERED</span>
              <Users className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
              {liveStats.totalRegistered}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              Verified face profiles
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <span>PRESENT TODAY</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {liveStats.presentToday}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 font-medium">
              Checked-in students
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
              <span>LATE TODAY</span>
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
              {liveStats.lateToday}
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 font-medium">
              Recorded past cutoff
            </div>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 sm:p-3.5 shadow-xs">
            <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
              <span>RATE</span>
              <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1">
              {liveStats.attendanceRate}%
            </div>
            <div className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-0.5 font-medium">
              Daily ratio
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. DOCK OF TABS: CATEGORY SELECTOR + FLOATING SEGMENTED MODULE DOCK      */}
        {/* ========================================================================= */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 sm:p-4 shadow-sm space-y-3">
          
          {/* Top Row: Category Pills & Search Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scrollbar-none pb-0.5">
              {categories.map((c) => {
                const isCatActive = selectedCategory === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCategory(c)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      isCatActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>

            {/* Quick Search */}
            <div className="relative min-w-[200px] sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search admin modules..."
                className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Dock of Tabs: Horizontal Segmented Dock */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none py-1 px-0.5">
            {filteredTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`group relative flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer border ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-100/80 dark:bg-slate-800/60 border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800'
                  }`}
                  title={tab.desc}
                >
                  <tab.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-md shrink-0 ${
                        isActive
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {filteredTabs.length === 0 && (
              <div className="py-2 text-xs text-slate-400 italic">
                No modules match "{searchQuery}"
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4. FULL-WIDTH ACTIVE MODULE WORKSTATION CANVAS                            */}
        {/* ========================================================================= */}
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-4 sm:p-6 shadow-sm space-y-4 min-h-[580px]">
          {/* Active Module Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3.5 gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-500/20">
                <activeTabItem.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  {activeTabItem.label}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeTabItem.desc}
                </p>
              </div>
            </div>

            <span className="hidden sm:inline-flex text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              {activeTabItem.category}
            </span>
          </div>

          {/* Lazy Component Renderer */}
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-24 text-sm text-slate-400 space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                <p className="text-xs font-mono">Loading {activeTabItem.label}…</p>
              </div>
            }
          >
            {renderActiveSection()}
          </Suspense>
        </div>

      </div>
    </div>
  );
};

export default LiteAdmin;
