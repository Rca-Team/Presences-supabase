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
const RealtimeSettingsHeader = lazyWithRetry(() => import('@/components/admin/RealtimeSettingsHeader'), 'admin-realtime-settings-header');
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
const DeviceFleetConsole = lazyWithRetry(() => import('@/components/admin/telemetry/DeviceFleetConsole'), 'admin-fleet-telemetry');
const AdminSecretGateModal = lazyWithRetry(() => import('@/components/admin/telemetry/AdminSecretGateModal'), 'admin-secret-gate');

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
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  User, Calendar, Clock, FolderKanban, School,
  LayoutDashboard, Settings, Bell, Users, BarChart3,
  Shield, Activity, TrendingUp, ChevronRight, Send, UserCog,
  CreditCard, Image, Download, RefreshCw, MessageSquareText, Mail, Siren, CalendarDays, DatabaseBackup, ScanLine, QrCode, Smartphone, Radio } from
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

// Plain wrapper for sections with clean padding and natural scrolling
const TabPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn("space-y-4 min-w-0 pb-6", className)}>{children}</div>
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
  const [isSecretModalOpen, setIsSecretModalOpen] = useState(false);
  const [isTelemetryUnlocked, setIsTelemetryUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem('presences_telemetry_unlocked') === 'true';
    } catch {
      return false;
    }
  });

  // Secret Hotkey Listener: Ctrl+Shift+D or Cmd+Shift+D (Fleet Radar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd' || e.code === 'KeyD')) {
        e.preventDefault();
        haptic('heavy');
        setIsSecretModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [haptic]);

  // Mobile Secret Triple-Tap and Long-Press Handlers
  const shieldTapCountRef = useRef(0);
  const lastShieldTapTimeRef = useRef(0);
  const handleSecretShieldTap = useCallback(() => {
    const currentTime = Date.now();
    if (currentTime - lastShieldTapTimeRef.current < 650) {
      shieldTapCountRef.current += 1;
    } else {
      shieldTapCountRef.current = 1;
    }
    lastShieldTapTimeRef.current = currentTime;

    if (shieldTapCountRef.current >= 3) {
      shieldTapCountRef.current = 0;
      haptic('heavy');
      setIsSecretModalOpen(true);
    }
  }, [haptic]);

  const longPressTimerRef = useRef<any>(null);
  const handleBadgeTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      haptic('heavy');
      setIsSecretModalOpen(true);
    }, 1200);
  }, [haptic]);

  const handleBadgeTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const statsCards = React.useMemo(() => [
    { label: 'Registered', value: stats.totalFaces, icon: Users, color: 'text-primary' },
    { label: 'Present', value: stats.presentToday, icon: TrendingUp, color: 'text-green-600 dark:text-green-400' },
    { label: 'Late', value: stats.lateToday, icon: Clock, color: 'text-orange-600 dark:text-orange-400' },
    { label: 'Total', value: stats.todayAttendance, icon: Activity, color: 'text-blue-600 dark:text-blue-400' }
  ], [stats.totalFaces, stats.presentToday, stats.lateToday, stats.todayAttendance]);

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
    if (!hasLoadedOnceRef.current) setIsDataLoading(true);
    try {
      const unified = await fetchUnifiedStudentSnapshot();

      setStats(prev => {
        const next = {
          totalFaces: unified.totalRegistered,
          todayAttendance: unified.presentToday + unified.lateToday,
          presentToday: unified.presentToday,
          lateToday: unified.lateToday,
        };
        if (
          prev.totalFaces === next.totalFaces &&
          prev.todayAttendance === next.todayAttendance &&
          prev.presentToday === next.presentToday &&
          prev.lateToday === next.lateToday
        ) {
          return prev;
        }
        return next;
      });

      // Registered users for available faces list
      const { data: faceData } = await supabase
        .from('attendance_records')
        .select('id, user_id, device_info, category')
        .eq('status', 'registered');

      const processedFaces = (faceData || []).map(r => {
        const m = (r.device_info as any)?.metadata || {};
        const name = m.name || (r.device_info as any)?.name || '';
        const employeeId = m.employee_id || (r.device_info as any)?.employee_id || '';
        return { id: r.id, user_id: r.user_id || undefined, name, employee_id: employeeId, category: r.category || 'A' };
      }).filter(u => u.name && u.name !== 'Unknown' && u.name !== 'User');

      const seenIds = new Set<string>();
      const uniqueFaces = processedFaces.filter(u => {
        const key = u.employee_id || u.user_id || u.id;
        if (!key || seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });

      setAvailableFaces(prev => (prev.length === uniqueFaces.length ? prev : uniqueFaces));

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
    }, 3000);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        setAttendanceUpdated(true);
        queueRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => {
        setAttendanceUpdated(true);
        queueRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => queueRefresh())
      .subscribe();
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [fetchData, queueRefresh]);

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
      </PageTransition>
    );
  }

  if (isTeacher && !isAdminOrPrincipal) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <Suspense fallback={<div className="p-6"><AdminContentSkeleton /></div>}>
            <TeacherDashboard />
          </Suspense>
        </PageLayout>
      </PageTransition>
    );
  }

  const navItems: NavItem[] = [
    // 1. Daily Operations
    { id: 'dashboard', icon: LayoutDashboard, label: 'School Overview', group: 'Daily Operations' },
    { id: 'students', icon: Users, label: 'Students', group: 'Daily Operations', badge: attendanceUpdated ? 'new' : undefined },
    { id: 'sections', icon: FolderKanban, label: 'Classes & Sections', group: 'Daily Operations' },
    { id: 'timetable', icon: CalendarDays, label: 'Timetable & Teachers', group: 'Daily Operations' },

    // 2. Reports & Safety
    { id: 'reports', icon: BarChart3, label: 'Attendance Reports', group: 'Reports & Safety' },
    { id: 'gatepass', icon: QrCode, label: 'Gate Passes & Leaves', group: 'Reports & Safety' },
    { id: 'notifications', icon: Bell, label: 'Send Messages', group: 'Reports & Safety' },
    { id: 'inbox', icon: Mail, label: 'Parent Messages', group: 'Reports & Safety' },
    { id: 'emergency', icon: Siren, label: 'Emergency Alerts', group: 'Reports & Safety' },

    // 3. Settings & Admin
    { id: 'access', icon: UserCog, label: 'Staff Permissions', group: 'Settings & Admin' },
    { id: 'samples', icon: Activity, label: 'Student Face Photos', group: 'Settings & Admin' },
    { id: 'settings', icon: Settings, label: 'School Settings', group: 'Settings & Admin' },
    ...(isTelemetryUnlocked
      ? [{ id: 'telemetry', icon: Radio, label: 'Fleet Intelligence', group: 'Settings & Admin', badge: 'LIVE' }]
      : []),
  ];

  const groups = ['Daily Operations', 'Reports & Safety', 'Settings & Admin'];

  const renderContent = () => {
    switch (activeTab) {
      case 'telemetry':
        return (
          <TabPanel>
            <DeviceFleetConsole
              onLock={() => {
                setIsTelemetryUnlocked(false);
                setActiveTab('dashboard');
                toast({ title: '🔒 Console Locked', description: 'Fleet telemetry session ended.' });
              }}
            />
          </TabPanel>
        );
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
            <RealtimeSettingsHeader />
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
      <PageLayout className="min-h-screen bg-slate-50/50 dark:bg-slate-950 !pt-0 md:!pt-16 !pb-0 !px-0" fullWidth noFooter>
        <div className={cn(
          "w-full",
          isMobile 
            ? "flex flex-col min-h-screen" 
            : "flex h-[calc(100vh-4rem)] overflow-hidden"
        )}>
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
                <div
                  onClick={handleSecretShieldTap}
                  className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0 text-white shadow-md shadow-blue-600/25 border border-white/20 cursor-pointer active:scale-95 transition-transform"
                  title="School Admin"
                >
                  <Shield className="w-4 h-4 text-white" />
                </div>
                {!sidebarCollapsed && (
                  <div className="min-w-0" onClick={handleSecretShieldTap}>
                    <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white truncate cursor-pointer select-none">School Admin</p>
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Principal & Staff</p>
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

              <div className="p-2.5 border-t border-slate-200/70 dark:border-white/10 flex items-center justify-between px-3">
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
            </aside>
          )}

          {/* Main Content Stage */}
          <main className={cn(
            "flex-1 flex flex-col min-w-0 bg-transparent",
            isMobile ? "overflow-visible" : "h-full min-h-0 overflow-hidden"
          )}>
            {/* Top Bar - Clean Apple Nano-Glass Header */}
            <div className="border-b border-slate-200/70 dark:border-white/10 nano-glass px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
                      {navItems.find((n) => n.id === activeTab)?.label || 'School Overview'}
                    </h1>
                    <span
                      onClick={handleSecretShieldTap}
                      onTouchStart={handleBadgeTouchStart}
                      onTouchEnd={handleBadgeTouchEnd}
                      onMouseDown={handleBadgeTouchStart}
                      onMouseUp={handleBadgeTouchEnd}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-bold cursor-pointer select-none active:scale-95 transition-transform"
                      title="Triple-tap or long-press for Fleet Intelligence"
                    >
                      PM Shri KV NFC
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 hidden sm:block truncate mt-0.5">
                    {activeTab === 'telemetry' && 'Real-time device radar, IP geolocation, hardware specs & fleet control'}
                    {activeTab === 'dashboard' && 'Daily attendance summary, turnout trends, and quick actions'}
                    {activeTab === 'students' && 'View and manage student details, classes, and photos'}
                    {activeTab === 'sections' && 'Manage classes, sections, and assigned class teachers'}
                    {activeTab === 'reports' && 'Download and print daily, weekly, or monthly attendance records'}
                    {activeTab === 'gatepass' && 'Approve student gate passes and view student exit logs'}
                    {activeTab === 'access' && 'Manage teacher accounts and access permissions'}
                    {activeTab === 'emergency' && 'Send urgent safety alerts to parents, teachers, and staff'}
                    {activeTab === 'timetable' && 'View class timetables and assign substitute teachers'}
                    {activeTab === 'samples' && 'Check and update student face photos for attendance'}
                    {activeTab === 'notifications' && 'Send SMS, WhatsApp, and notices to parents'}
                    {activeTab === 'settings' && 'Set school timings, late arrival cutoffs, and notifications'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                <LiteModeToggle variant="segmented" className="hidden md:inline-flex" />
                <LiteModeToggle variant="badge" className="md:hidden" />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 rounded-xl border-slate-200/80 dark:border-white/10 nano-glass-dock hover:bg-white dark:hover:bg-slate-800 text-xs font-bold btn-spring"
                  onClick={handleRefresh}
                  title="Refresh data"
                >
                  <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5 text-blue-500" />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                {isMobile && <ThemeToggle />}
              </div>
            </div>

            {/* Mobile feature navigation - Apple Nano-Glass Segmented Capsule */}
            {isMobile && (
              <div className="border-b border-slate-200/70 dark:border-white/10 nano-glass px-2.5 py-2 sticky top-0 z-20 backdrop-blur-xl bg-slate-50/85 dark:bg-slate-950/85">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full shrink-0 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    onClick={handleRefresh}
                    title="Refresh data"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                  </Button>
                </div>
              </div>
            )}

            {/* Content Area - Fluid Native Scrolling */}
            <div 
              className={cn(
                "w-full",
                isMobile 
                  ? "flex-1 overflow-visible" 
                  : "flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
              )}
              style={!isMobile ? { WebkitOverflowScrolling: 'touch' } : undefined}
            >
              <div className="p-2.5 sm:p-4 md:p-6 pb-32 sm:pb-12 max-w-full">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isDataLoading ? 'loading' : activeTab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
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
            </div>

          </main>
        </div>

        {/* Mobile App Update Pusher Dialog */}
        <AdminUpdatePusherDialog
          isOpen={showUpdatePusher}
          onClose={() => setShowUpdatePusher(false)}
        />

        {/* Hidden Fleet Intelligence Security PIN Modal */}
        <Suspense fallback={null}>
          <AdminSecretGateModal
            isOpen={isSecretModalOpen}
            onClose={() => setIsSecretModalOpen(false)}
            onUnlock={() => {
              setIsTelemetryUnlocked(true);
              setActiveTab('telemetry');
              toast({
                title: '🔓 Fleet Intelligence Unlocked',
                description: 'Real-time device radar and session console is active.',
              });
            }}
          />
        </Suspense>
      </PageLayout>
    </PageTransition>);

};

export default Admin;