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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">

        {/* ========================================================================= */}
        {/* 1. TOP EXECUTIVE HEADER                                                   */}
        {/* ========================================================================= */}
        <header className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                  Principal & Administration Suite
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <Zap className="w-3 h-3 fill-current" /> Lite Mode Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                PM Shri KV NFC Vigyan Vihar · High-performance institutional command & controls
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-center">
            <LiteModeToggle variant="segmented" />
          </div>
        </header>

        {/* ========================================================================= */}
        {/* 2. REAL-TIME OPERATIONAL METRICS RIBBON                                  */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs hover:border-purple-500/30 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
              <span>Registered Students</span>
              <Users className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-black text-foreground mt-1 tracking-tight">
              {liveStats.totalRegistered}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">
              Verified face profiles
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 shadow-2xs hover:border-emerald-500/50 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">
              <span>Present Today</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tracking-tight">
              {liveStats.presentToday}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 font-medium">
              Checked-in students
            </div>
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-2xs hover:border-amber-500/50 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">
              <span>Late Today</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 tracking-tight">
              {liveStats.lateToday}
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-0.5 font-medium">
              Recorded past cutoff
            </div>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 shadow-2xs hover:border-blue-500/50 transition-colors">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">
              <span>Daily Attendance</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 tracking-tight">
              {liveStats.attendanceRate}%
            </div>
            <div className="text-[11px] text-blue-700/80 dark:text-blue-400/80 mt-0.5 font-medium">
              School-wide ratio
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. WORKSTATION LAYOUT: NAVIGATION HUB + MAIN CANVAS                     */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* LEFT COLUMN: MODULE SELECTOR RAIL (4 Cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-border bg-card p-3.5 sm:p-4 space-y-3 shadow-xs lg:sticky lg:top-4">
            
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search 14 admin modules..."
                className="w-full pl-8 pr-8 py-2 rounded-xl border border-border bg-muted/20 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === c
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Tab Modules List */}
            <div className="space-y-1 max-h-[580px] overflow-y-auto pr-1">
              {filteredTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`w-full group flex items-center justify-between p-2.5 rounded-xl text-left transition-all border ${
                      isActive
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs font-semibold'
                        : 'bg-card/40 border-border/50 text-foreground hover:bg-muted/30 hover:border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isActive
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground group-hover:text-foreground'
                        }`}
                      >
                        <tab.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs truncate block font-medium">
                            {tab.label}
                          </span>
                          {tab.badge && (
                            <span
                              className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded shrink-0 ${
                                isActive
                                  ? 'bg-primary-foreground/20 text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {tab.badge}
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] truncate block mt-0.5 line-clamp-1 ${
                            isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}
                        >
                          {tab.desc}
                        </span>
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive
                          ? 'text-primary-foreground translate-x-0.5'
                          : 'text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5'
                      }`}
                    />
                  </button>
                );
              })}

              {filteredTabs.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No modules match "{searchQuery}"
                </div>
              )}
            </div>

            {/* Quick Live Sync Button */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span>{filteredTabs.length} of 14 Modules</span>
              <button
                onClick={refreshStats}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Sync Stats
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: ACTIVE MODULE WORKSTATION CANVAS (8 Cols) */}
          <div className="lg:col-span-8 rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-xs space-y-4 min-h-[580px]">
            {/* Header of Active Module */}
            <div className="flex items-center justify-between border-b border-border/70 pb-3 gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <activeTabItem.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-foreground">
                    {activeTabItem.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {activeTabItem.desc}
                  </p>
                </div>
              </div>

              <span className="hidden sm:inline-flex text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground">
                {activeTabItem.category}
              </span>
            </div>

            {/* Lazy Component Renderer */}
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center py-24 text-sm text-muted-foreground space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-xs font-mono">Loading {activeTabItem.label}…</p>
                </div>
              }
            >
              {renderActiveSection()}
            </Suspense>
          </div>

        </div>

      </div>
    </div>
  );
};

export default LiteAdmin;
