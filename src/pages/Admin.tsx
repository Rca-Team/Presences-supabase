import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

import { motion, AnimatePresence } from 'framer-motion';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

// Every admin section is a separate chunk. Previously all ~30 panels were
// statically imported, which pulled jspdf, xlsx, html2canvas, recharts and the
// face pipeline into a single ~960 kB Admin chunk that had to parse before the
// first paint. Now only the active section downloads.
const AdminFacesList = lazyWithRetry(() => import('@/components/admin/AdminFacesList'), 'admin-faces');
const AttendanceCalendar = lazyWithRetry(() => import('@/components/admin/AttendanceCalendar'), 'admin-calendar');
const AttendanceCutoffSetting = lazyWithRetry(() => import('@/components/admin/AttendanceCutoffSetting'), 'admin-cutoff');
const FaceModelUpgradeSettings = lazyWithRetry(() => import('@/components/admin/FaceModelUpgradeSettings'), 'admin-model-settings');
const AutoNotificationScheduler = lazyWithRetry(() => import('@/components/admin/AutoNotificationScheduler'), 'admin-notif-scheduler');
const PilotModeSettings = lazyWithRetry(() => import('@/components/admin/PilotModeSettings'), 'admin-pilot');
const NotificationSettings = lazyWithRetry(() => import('@/components/admin/NotificationSettings'), 'admin-notif-settings');
const CategoryBasedView = lazyWithRetry(() => import('@/components/admin/CategoryBasedView'), 'admin-sections');
const PrincipalDashboard = lazyWithRetry(() => import('@/components/admin/PrincipalDashboard'), 'admin-dashboard');
const TeacherDashboard = lazyWithRetry(() => import('@/components/admin/TeacherDashboard'), 'admin-teacher-dashboard');
const AdminNotificationSender = lazyWithRetry(() => import('@/components/admin/AdminNotificationSender'), 'admin-notif-sender');
const UserAccessManager = lazyWithRetry(() => import('@/components/admin/UserAccessManager'), 'admin-access');
const BatchIDCardExtractor = lazyWithRetry(() => import('@/components/admin/BatchIDCardExtractor'), 'admin-id-extract');
const StudentDetailsTable = lazyWithRetry(() => import('@/components/admin/StudentDetailsTable'), 'admin-id-cards');
const AttendanceReportGenerator = lazyWithRetry(() => import('@/components/admin/AttendanceReportGenerator'), 'admin-report-gen');
const ClassSectionReport = lazyWithRetry(() => import('@/components/admin/ClassSectionReport'), 'admin-class-report');
const SubstitutionReport = lazyWithRetry(() => import('@/components/admin/SubstitutionReport'), 'admin-subs-report');
const EmergencyAlertPanel = lazyWithRetry(() => import('@/components/admin/EmergencyAlertPanel'), 'admin-emergency');
const NotificationLog = lazyWithRetry(() => import('@/components/admin/NotificationLog'), 'admin-notif-log');
const AdminInbox = lazyWithRetry(() => import('@/components/admin/AdminInbox'), 'admin-inbox');
const StudentFaceSamplesManager = lazyWithRetry(() => import('@/components/admin/StudentFaceSamplesManager'), 'admin-samples');
const FaceSamplesDiagnosticsPanel = lazyWithRetry(() => import('@/components/admin/FaceSamplesDiagnosticsPanel'), 'admin-samples-diag');
const TimetableManager = lazyWithRetry(() => import('@/components/admin/TimetableManager'), 'admin-timetable');
const GatePassManager = lazyWithRetry(() => import('@/components/admin/GatePassManager'), 'admin-gate-passes');
const LiteAdmin = lazyWithRetry(() => import('@/components/lite/LiteAdmin'), 'admin-lite');

// Sidebar utilities — small, but they drag in xlsx/notification helpers, so keep
// them out of the critical path too.
const AttendanceExport = lazyWithRetry(() => import('@/components/admin/AttendanceExport'), 'admin-export');
const BulkNotificationService = lazyWithRetry(() => import('@/components/admin/BulkNotificationService'), 'admin-bulk-notif');

import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  User, Calendar, Clock, FolderKanban, School,
  LayoutDashboard, Settings, Bell, Users, BarChart3,
  Shield, Activity, TrendingUp, ChevronRight, Send, UserCog,
  CreditCard, Image, Download, RefreshCw, MessageSquareText, Mail, Siren, CalendarDays, DatabaseBackup, ScanLine, QrCode, Smartphone } from
'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { fetchUnifiedStudentSnapshot } from '@/utils/attendanceStatsHelper';
import AdminUpdatePusherDialog from '@/components/admin/AdminUpdatePusherDialog';
import LiteModeToggle from '@/components/LiteModeToggle';

interface NavItem {
  id: string;
  icon: React.ElementType;
  label: string;
  group: string;
  badge?: string;
  count?: number;
}

const AdminContentSkeleton = () => (
  <div className="space-y-4 animate-fade-in">
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="premium-skeleton h-16 rounded-xl" />
      ))}
    </div>
    <div className="premium-skeleton h-12 rounded-xl" />
    <div className="premium-skeleton h-[360px] md:h-[460px] rounded-2xl" />
  </div>
);

// Plain wrapper — the single AnimatePresence in the content area owns the
// transition, so panels must not animate a second time (double animation = jank).
const TabPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div data-lenis-prevent="true" className={cn("space-y-4 min-w-0 overscroll-contain pb-6", className)}>{children}</div>
);

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  tabName: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Admin Section [${this.props.tabName}] error:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="p-8 border-primary/20 bg-card text-center space-y-4 shadow-lg">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Section Reload Required</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {this.state.error?.message || 'New features were deployed. Click refresh to load the latest version.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            >
              Reload Page
            </Button>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}


const Admin = () => {
  const { liteMode } = usePerformanceMode();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { trigger: haptic } = useHapticFeedback();
  const { role, isLoading: isRoleLoading, isAdminOrPrincipal, isTeacher } = useUserRole();
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('');
  const [attendanceUpdated, setAttendanceUpdated] = useState(false);
  const [nameFilter, setNameFilter] = useState<string>('all');
  const [availableFaces, setAvailableFaces] = useState<{id: string; user_id?: string; name: string; employee_id: string;}[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const refreshTimerRef = useRef<number | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const [stats, setStats] = useState({
    totalFaces: 0,
    todayAttendance: 0,
    presentToday: 0,
    lateToday: 0
  });
  const [showUpdatePusher, setShowUpdatePusher] = useState(false);

  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');

  useEffect(() => {
    if (!isRoleLoading && !activeTab) {
      setActiveTab(isTeacher && !isAdminOrPrincipal ? 'teacher' : 'dashboard');
    }
  }, [isRoleLoading, isTeacher, isAdminOrPrincipal, activeTab]);

  // Deep-link support: /admin?tab=timetable opens that section directly.
  useEffect(() => {
    if (requestedTab) setActiveTab(requestedTab);
  }, [requestedTab]);


  const fetchData = useCallback(async () => {
    if (!isAdminOrPrincipal) return;
    // Only the very first load may show a skeleton — background refreshes must
    // never blank out the active section (that's what felt like a page reload).
    if (!hasLoadedOnceRef.current) setIsDataLoading(true);
    try {

      // Registered users: attendance_records with status='registered' is the canonical source
      const { data: faceData } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, image_url, category')
        .eq('status', 'registered');

      const processedFaces = (faceData || []).map(r => {
        const m = (r.device_info as any)?.metadata || {};
        const name = m.name || (r.device_info as any)?.name || '';
        const employeeId = m.employee_id || (r.device_info as any)?.employee_id || '';
        return { id: r.id, user_id: r.user_id || undefined, name, employee_id: employeeId, category: r.category || 'A' };
      }).filter(u => u.name && u.name !== 'Unknown' && u.name !== 'User');

      // Deduplicate by employee_id
      const seenIds = new Set<string>();
      const uniqueFaces = processedFaces.filter(u => {
        const key = u.employee_id || u.user_id || u.id;
        if (!key || seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });
      setAvailableFaces(uniqueFaces);

      const unified = await fetchUnifiedStudentSnapshot();

      setStats({
        totalFaces: unified.totalRegistered,
        todayAttendance: unified.presentToday + unified.lateToday,
        presentToday: unified.presentToday,
        lateToday: unified.lateToday,
      });

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);
      setNotificationCount(count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      hasLoadedOnceRef.current = true;
      setIsDataLoading(false);
    }
  }, [isAdminOrPrincipal]);

  const queueRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      fetchData();
      refreshTimerRef.current = null;
    }, 300);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const channel = supabase.
    channel('admin-dashboard').
    on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
      setAttendanceUpdated(true);
      haptic('medium');
      queueRefresh();
    }).
    on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => {
      setAttendanceUpdated(true);
      haptic('medium');
      queueRefresh();
    }).
    on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => queueRefresh()).
    subscribe();
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [fetchData, haptic, queueRefresh]);

  useEffect(() => {
    if (attendanceUpdated) {
      const timer = setTimeout(() => setAttendanceUpdated(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [attendanceUpdated]);

  const handleTabChange = (tab: string) => {
    haptic('selection');
    setActiveTab(tab);
  };

  const handleRefresh = async () => {
    await fetchData();
    toast({ title: "Refreshed", description: "Data updated." });
  };

  if (isRoleLoading) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </PageLayout>
      </PageTransition>);

  }

  if (isTeacher && !isAdminOrPrincipal) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <Suspense fallback={<div className="p-6"><AdminContentSkeleton /></div>}>
            <TeacherDashboard />
          </Suspense>
        </PageLayout>
      </PageTransition>);

  }

  const navItems: NavItem[] = [
    // 1. Daily Operations
    { id: 'dashboard', icon: LayoutDashboard, label: 'Command Center', group: 'Daily Operations' },
    { id: 'students', icon: Users, label: 'Student Directory', group: 'Daily Operations', badge: attendanceUpdated ? 'new' : undefined },
    { id: 'sections', icon: FolderKanban, label: 'Classes & Cohorts', group: 'Daily Operations' },
    { id: 'timetable', icon: CalendarDays, label: 'Timetable & Substitutions', group: 'Daily Operations' },

    // 2. Reports & Safety
    { id: 'reports', icon: BarChart3, label: 'Attendance Reports', group: 'Reports & Safety' },
    { id: 'gatepass', icon: QrCode, label: 'Gate Passes', group: 'Reports & Safety' },
    { id: 'emergency', icon: Siren, label: 'Campus Safety Alerts', group: 'Reports & Safety' },
    { id: 'notifications', icon: Bell, label: 'Broadcast Notices', group: 'Reports & Safety', count: notificationCount },
    { id: 'inbox', icon: Mail, label: 'Parent Inbox', group: 'Reports & Safety' },

    // 3. System & Biometrics
    { id: 'access', icon: UserCog, label: 'Teacher Permissions', group: 'System & Biometrics' },
    { id: 'samples', icon: Activity, label: 'Face AI Biometrics', group: 'System & Biometrics' },
    { id: 'idcard', icon: Image, label: 'Batch ID Extraction', group: 'System & Biometrics' },
    { id: 'idcards', icon: CreditCard, label: 'Student ID Cards', group: 'System & Biometrics' },
    { id: 'notif-log', icon: MessageSquareText, label: 'Delivery Log', group: 'System & Biometrics' },
    { id: 'settings', icon: Settings, label: 'School Settings', group: 'System & Biometrics' },
  ];

  const groups = ['Daily Operations', 'Reports & Safety', 'System & Biometrics'];

  const statsCards = [
  { label: 'Registered', value: stats.totalFaces, icon: Users, color: 'text-primary' },
  { label: 'Present', value: stats.presentToday, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
  { label: 'Late', value: stats.lateToday, icon: Clock, color: 'text-orange-600 dark:text-orange-400' },
  { label: 'Total', value: stats.todayAttendance, icon: Activity, color: 'text-blue-600 dark:text-blue-400' }];


  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <TabPanel>
            <PrincipalDashboard onNavigateTab={handleTabChange} />
          </TabPanel>
        );
      case 'sections':
        return (
          <TabPanel>
            <CategoryBasedView />
          </TabPanel>
        );
      case 'students':
        return (
          <TabPanel>
            <AdminFacesList
              viewMode={viewMode}
              selectedFaceId={selectedFaceId}
              nameFilter={nameFilter}
              setSelectedFaceId={(id) => {
                haptic('selection');
                setSelectedFaceId(id);
              }} />
          </TabPanel>
        );
      case 'idcard':
        return (
          <TabPanel>
            <BatchIDCardExtractor />
          </TabPanel>
        );
      case 'idcards':
        return (
          <TabPanel>
            <StudentDetailsTable />
          </TabPanel>
        );
      case 'reports':
        return (
          <TabPanel className="space-y-6">
            <SubstitutionReport />
            <ClassSectionReport />
            <AttendanceReportGenerator />
          </TabPanel>
        );
      case 'access':
        return (
          <TabPanel>
            <UserAccessManager />
          </TabPanel>
        );
      case 'notifications':
        return (
          <TabPanel>
            <AdminNotificationSender availableFaces={availableFaces} />
          </TabPanel>
        );
      case 'samples':
        return (
          <TabPanel>
            <FaceSamplesDiagnosticsPanel />
            <StudentFaceSamplesManager />
          </TabPanel>
        );
      case 'notif-log':
        return (
          <TabPanel>
            <NotificationLog />
          </TabPanel>
        );
      case 'inbox':
        return (
          <TabPanel>
            <AdminInbox />
          </TabPanel>
        );
      case 'emergency':
        return (
          <TabPanel>
            <EmergencyAlertPanel />
          </TabPanel>
        );
      case 'gatepass':
        return (
          <TabPanel>
            <GatePassManager />
          </TabPanel>
        );
      case 'timetable':
        return (
          <TabPanel>
            <TimetableManager />
          </TabPanel>
        );
      case 'settings':
        return (
          <TabPanel className="space-y-6">
            <AttendanceCutoffSetting />
            <PilotModeSettings />
            <NotificationSettings />
            <FaceModelUpgradeSettings />
            <AutoNotificationScheduler />
          </TabPanel>
        );
      default:
        return (
          <TabPanel>
            <PrincipalDashboard onNavigateTab={handleTabChange} />
          </TabPanel>
        );
    }
  };

  if (liteMode) {
    return (
      <Suspense fallback={<div className="p-6"><AdminContentSkeleton /></div>}>
        <LiteAdmin stats={stats} />
      </Suspense>
    );
  }

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-0" fullWidth noFooter>
        <div className={cn("flex overflow-hidden", isMobile ? "min-h-[calc(100dvh-6rem)] flex-col" : "h-[calc(100dvh-4rem)]")}>
          {/* Desktop Sidebar — Apple macOS Nano-Glass Style */}
          {!isMobile && (
            <aside
              data-lenis-prevent="true"
              className={cn(
                "border-r border-slate-200/80 dark:border-white/10 nano-glass flex flex-col transition-all duration-300 h-full min-h-0 select-none overflow-hidden shrink-0 shadow-lg",
                sidebarCollapsed ? "w-16" : "w-60"
              )}
            >
              <div className="p-3.5 border-b border-slate-200/70 dark:border-white/10 flex items-center gap-2.5 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-blue-600/25 border border-white/20">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white truncate">Admin Center</p>
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Campus Control</p>
                  </div>
                )}
              </div>

              <ScrollArea data-lenis-prevent="true" className="flex-1 min-h-0 p-2 overscroll-contain">
                {groups.map((group) => (
                  <div key={group} className="mb-2">
                    {!sidebarCollapsed && (
                      <p className="px-3 py-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                        {group}
                      </p>
                    )}
                    {navItems.filter((n) => n.group === group).map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          data-nav-id={item.id}
                          onClick={() => handleTabChange(item.id)}
                          className={cn(
                            "relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200",
                            isActive
                              ? "text-blue-600 dark:text-blue-400 font-bold"
                              : "text-slate-600 hover:bg-white/60 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
                          )}
                          title={sidebarCollapsed ? item.label : undefined}
                        >
                          {isActive && (
                            <motion.span
                              layoutId="admin-nav-active"
                              className="absolute inset-0 rounded-xl bg-blue-500/15 dark:bg-blue-400/15 border border-blue-500/30 dark:border-blue-400/25 shadow-sm"
                              transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                            />
                          )}
                          <item.icon className={cn("relative z-10 w-4 h-4 flex-shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-500")} />
                          {!sidebarCollapsed && (
                            <>
                              <span className="relative z-10 truncate flex-1 text-left">{item.label}</span>
                              {item.badge && (
                                <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              )}
                              {item.count !== undefined && item.count > 0 && (
                                <Badge variant="destructive" className="relative z-10 text-[8px] px-1 py-0 h-3.5 min-w-[14px]">
                                  {item.count}
                                </Badge>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </ScrollArea>

              <div className="p-2.5 border-t border-slate-200/70 dark:border-white/10 space-y-1.5">
                <div className="flex items-center justify-between px-1.5">
                  <ThemeToggle />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-xl hover:bg-white/60 dark:hover:bg-white/10"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-300", sidebarCollapsed && "rotate-180")} />
                  </Button>
                </div>
                {!sidebarCollapsed && (
                  <div className="flex gap-1">
                    <Suspense fallback={<div className="h-8 flex-1 rounded-md bg-muted/40" />}>
                      <AttendanceExport />
                      <BulkNotificationService availableFaces={availableFaces} />
                    </Suspense>
                  </div>
                )}
              </div>
            </aside>
          )}

          {/* Main Content Stage */}
          <main data-lenis-prevent="true" className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden bg-transparent will-change-transform">
            {/* Top Bar - Apple Nano-Glass Header */}
            <div className="border-b border-slate-200/70 dark:border-white/10 nano-glass px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                      {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
                    </h1>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-bold">
                      PM Shri KV NFC
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate mt-0.5">
                    {activeTab === 'dashboard' && 'School-wide attendance command center and analytics'}
                    {activeTab === 'students' && 'Manage registered student biometric profiles and class assignments'}
                    {activeTab === 'sections' && 'Manage classroom sections, student cohorts, and teacher assignments'}
                    {activeTab === 'reports' && 'Generate and export official attendance reports and daily logs'}
                    {activeTab === 'gatepass' && 'Manage digital gate passes, pickup verifications, and exit history'}
                    {activeTab === 'access' && 'Manage system roles, permissions, and teacher class assignments'}
                    {activeTab === 'emergency' && 'Instant safety alerts, campus lockdown, and fire emergency broadcasting'}
                    {activeTab === 'timetable' && 'Class timetables, schedules, and automatic teacher substitutions'}
                    {activeTab === 'samples' && 'Face biometric gallery, verification thresholds, and training samples'}
                    {activeTab === 'notifications' && 'Send SMS, Email, and in-app notices to parents and staff'}
                    {activeTab === 'settings' && 'Configure attendance cutoffs, notification triggers, and school parameters'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <LiteModeToggle variant="segmented" className="hidden md:inline-flex" />
                <LiteModeToggle variant="badge" className="md:hidden" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 sm:px-3 rounded-xl border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-xs font-bold btn-spring shadow-xs"
                  onClick={() => setShowUpdatePusher(true)}
                  title="Broadcast app updates to all mobile devices and PWA clients"
                >
                  <Smartphone className="h-3.5 w-3.5 sm:mr-1.5 text-purple-600 dark:text-purple-400" />
                  <span className="hidden sm:inline">Push App Update</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 rounded-xl border-slate-200/80 dark:border-white/10 nano-glass-dock hover:bg-white dark:hover:bg-slate-800 text-xs font-bold btn-spring"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5 text-blue-500" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                {isMobile && <ThemeToggle />}
              </div>
            </div>

            {/* Stats Bar - Nano-Glass Modular Strip */}
            <div className="border-b border-slate-200/70 dark:border-white/10 nano-glass-dock px-3.5 sm:px-6 py-2">
              <div className="flex gap-2.5 sm:gap-4 overflow-x-auto no-scrollbar items-center">
                {statsCards.map((stat, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-2xl nano-glass border border-slate-200/60 dark:border-white/10 shadow-xs hover:border-blue-500/30 transition-all card-hover-pop shrink-0"
                  >
                    <div className="p-1.5 rounded-xl bg-blue-500/10 dark:bg-blue-400/10">
                      <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black tabular-nums tracking-tight text-slate-900 dark:text-white font-mono">
                        {stat.value}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile feature navigation - Apple Nano-Glass Segmented Capsule */}
            {isMobile && (
              <div className="border-b border-slate-200/70 dark:border-white/10 nano-glass px-2.5 py-2 sticky top-0 z-20">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {navItems.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={cn(
                          "relative shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold select-none transition-all duration-200 active:scale-95",
                          isActive
                            ? "text-white font-bold"
                            : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="admin-mobile-nav-active"
                            className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-md shadow-blue-600/30 border border-white/20"
                            transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                          />
                        )}
                        <item.icon className="relative z-10 w-3.5 h-3.5" />
                        <span className="relative z-10 text-[11px] whitespace-nowrap">{item.label}</span>
                        {item.count !== undefined && item.count > 0 && (
                          <Badge variant="destructive" className="relative z-10 text-[8px] h-4 min-w-[14px] px-1 rounded-full">
                            {item.count}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Content Area */}
            <PullToRefresh onRefresh={handleRefresh} enabled={isMobile} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div className="p-2.5 sm:p-4 md:p-6 pb-24 sm:pb-8">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={isDataLoading ? 'loading' : activeTab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.7 }}
                    style={{ willChange: 'opacity, transform' }}>

                    {isDataLoading ? (
                      <AdminContentSkeleton />
                    ) : (
                      <SectionErrorBoundary tabName={activeTab || 'dashboard'} key={activeTab}>
                        <Suspense fallback={<AdminContentSkeleton />}>{renderContent()}</Suspense>
                      </SectionErrorBoundary>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </PullToRefresh>

          </main>
        </div>

        {/* Mobile App Update Pusher Dialog */}
        <AdminUpdatePusherDialog
          isOpen={showUpdatePusher}
          onClose={() => setShowUpdatePusher(false)}
        />
      </PageLayout>
    </PageTransition>);

};

export default Admin;