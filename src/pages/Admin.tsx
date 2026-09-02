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
const LiteAdmin = lazyWithRetry(() => import('@/components/lite/LiteAdmin'), 'admin-lite');

// Sidebar utilities — small, but they drag in xlsx/notification helpers, so keep
// them out of the critical path too.
const AttendanceExport = lazyWithRetry(() => import('@/components/admin/AttendanceExport'), 'admin-export');
const BulkNotificationService = lazyWithRetry(() => import('@/components/admin/BulkNotificationService'), 'admin-bulk-notif');
const AdminTutorial = lazyWithRetry(() => import('@/components/admin/AdminTutorial'), 'admin-tutorial');

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
  CreditCard, Image, Download, RefreshCw, MessageSquareText, Mail, Siren, CalendarDays, DatabaseBackup, ScanLine } from
'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { fetchUnifiedStudentSnapshot } from '@/utils/attendanceStatsHelper';

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
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', group: 'Overview' },
  { id: 'sections', icon: FolderKanban, label: 'Class', group: 'Overview' },
  { id: 'students', icon: Users, label: 'Students', group: 'Overview', badge: attendanceUpdated ? 'new' : undefined },
  { id: 'idcard', icon: Image, label: 'ID Extract', group: 'Registration' },
  { id: 'idcards', icon: CreditCard, label: 'ID Cards', group: 'Registration' },
  
  { id: 'reports', icon: BarChart3, label: 'Reports', group: 'Management' },
  { id: 'access', icon: UserCog, label: 'Access', group: 'Management' },
  { id: 'notifications', icon: Bell, label: 'Notifications', group: 'Management', count: notificationCount },
  { id: 'samples', icon: Activity, label: 'Face Samples', group: 'Management' },
  { id: 'notif-log', icon: MessageSquareText, label: 'Delivery Log', group: 'Management' },
  { id: 'inbox', icon: Mail, label: 'Inbox', group: 'Management' },
  { id: 'emergency', icon: Siren, label: 'Emergency', group: 'Management' },
  { id: 'timetable', icon: CalendarDays, label: 'Timetable', group: 'Management' },
  { id: 'settings', icon: Settings, label: 'Settings', group: 'Management' }];


  const groups = ['Overview', 'Registration', 'Management'];

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
            <PrincipalDashboard />
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
            <PrincipalDashboard />
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
      <PageLayout className="min-h-screen bg-background p-0" fullWidth noFooter>
        <div className="flex h-[calc(100dvh-4rem)] overflow-hidden">
          {/* Desktop Sidebar */}
          {!isMobile &&
          <aside
            data-lenis-prevent="true"
            className={cn(
              "border-r border-border bg-card flex flex-col transition-all duration-200 h-full min-h-0 select-none overflow-hidden shrink-0",
              sidebarCollapsed ? "w-16" : "w-56"
            )}
          >
              <div className="p-3 border-b border-border flex items-center gap-2 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-primary-foreground" />
                </div>
                {!sidebarCollapsed &&
              <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">Admin</p>
                    <p className="text-[10px] text-muted-foreground">Management</p>
                  </div>
              }
              </div>

              <ScrollArea data-lenis-prevent="true" className="flex-1 min-h-0 py-2 overscroll-contain">
                {groups.map((group) =>
              <div key={group} className="mb-1">
                    {!sidebarCollapsed &&
                <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {group}
                      </p>
                }
                    {navItems.filter((n) => n.group === group).map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      data-nav-id={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-200",
                        isActive ?
                        "text-primary font-medium" :
                        "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                      title={sidebarCollapsed ? item.label : undefined}>

                          {isActive &&
                      <motion.span
                        layoutId="admin-nav-active"
                        className="absolute inset-0 bg-primary/10 border-r-2 border-primary"
                        transition={{ type: 'spring', stiffness: 480, damping: 38, mass: 0.8 }} />
                      }
                          <item.icon className={cn("relative z-10 w-4 h-4 flex-shrink-0", isActive && "text-primary")} />
                          {!sidebarCollapsed &&
                      <>
                              <span className="relative z-10 truncate flex-1 text-left">{item.label}</span>
                              {item.badge &&
                        <span className="relative z-10 w-1.5 h-1.5 rounded-full bg-green-500" />
                        }
                              {item.count !== undefined && item.count > 0 &&
                        <Badge variant="destructive" className="relative z-10 text-[8px] px-1 py-0 h-3.5 min-w-[14px]">
                          {item.count}
                        </Badge>
                        }
                            </>
                      }
                        </button>);


                })}
                  </div>
              )}
              </ScrollArea>

              <div className="p-2 border-t border-border space-y-1">
                <div className="flex items-center justify-between px-2">
                  <ThemeToggle />
                  <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
                  
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", sidebarCollapsed && "rotate-180")} />
                  </Button>
                </div>
                {!sidebarCollapsed &&
              <div className="flex gap-1">
                    <Suspense fallback={<div className="h-8 flex-1 rounded-md bg-muted/40" />}>
                      <AttendanceExport />
                      <BulkNotificationService availableFaces={availableFaces} />
                    </Suspense>
                  </div>
              }
              </div>
            </aside>
          }

          {/* Main Content */}
          <main data-lenis-prevent="true" className="flex-1 flex flex-col min-w-0 h-full min-h-0 overflow-hidden bg-background/50">
            {/* Top Bar - Premium Glassmorphism */}
            <div className="border-b border-border/60 bg-card/70 backdrop-blur-2xl px-3 sm:px-5 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 shadow-sm">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm sm:text-lg font-bold tracking-tight text-foreground truncate">
                      {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
                    </h1>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-semibold">
                      PM Shri Kendriya Vidyalaya
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block truncate mt-0.5">
                    {activeTab === 'dashboard' && 'School-wide attendance command center and analytics'}
                    {activeTab === 'students' && 'Manage registered student biometric profiles and class assignments'}
                    {activeTab === 'reports' && 'Generate and export official attendance reports and daily logs'}
                    {activeTab === 'access' && 'Manage system roles, permissions, and teacher class assignments'}
                    {activeTab === 'emergency' && 'Instant safety alerts, campus lockdown, and fire emergency broadcasting'}
                    {activeTab === 'timetable' && 'Class timetables, schedules, and automatic teacher substitutions'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <Suspense fallback={null}>
                  <AdminTutorial onNavigate={handleTabChange} />
                </Suspense>
                <Button variant="outline" size="sm" className="h-8 px-2.5 rounded-xl border-border/60 bg-card/60 hover:bg-muted text-xs font-semibold btn-spring" onClick={handleRefresh}>
                  <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                {isMobile && <ThemeToggle />}
              </div>
            </div>

            {/* Stats Bar - Premium SaaS Metric Strip */}
            <div className="border-b border-border/60 bg-card/40 backdrop-blur-xl px-3 sm:px-5 py-2">
              <div className="flex gap-3 sm:gap-6 overflow-x-auto no-scrollbar items-center">
                {statsCards.map((stat, i) =>
                  <div key={i} className="flex items-center gap-2 py-0.5 min-w-fit px-2.5 py-1 rounded-xl bg-card/50 border border-border/40 shadow-xs hover:border-primary/30 transition-all card-hover-pop">
                    <div className="p-1.5 rounded-lg bg-muted/60">
                      <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-extrabold tabular-nums tracking-tight text-foreground">
                        {stat.value}
                      </div>
                      <div className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile feature navigation moved to top for faster access */}
            {isMobile && (
              <div className="border-b border-border bg-card px-2 py-2 sticky top-0 z-20">
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {navItems.map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabChange(item.id)}
                        className={cn(
                          "relative shrink-0 h-8 px-2.5 rounded-md border flex items-center gap-1.5 transition-colors duration-200",
                          isActive
                            ? "border-transparent text-primary-foreground"
                            : "border-border text-muted-foreground active:scale-[0.97]"
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="admin-mobile-nav-active"
                            className="absolute inset-0 rounded-md bg-primary"
                            transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.7 }}
                          />
                        )}
                        <item.icon className="relative z-10 w-3.5 h-3.5" />
                        <span className="relative z-10 text-[11px] whitespace-nowrap">{item.label}</span>
                        {item.count !== undefined && item.count > 0 && (
                          <Badge variant="destructive" className="relative z-10 text-[8px] h-4 min-w-[14px] px-1">
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
              <div className="p-2.5 sm:p-4 md:p-6 pb-6">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={isDataLoading ? 'loading' : activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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

      </PageLayout>
    </PageTransition>);

};

export default Admin;