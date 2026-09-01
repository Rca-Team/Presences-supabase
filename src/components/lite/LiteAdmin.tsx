import React, { Suspense, useState, useTransition } from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Button } from '@/components/ui/button';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Calendar,
  Image,
  CreditCard,
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
  Feather,
  ChevronRight,
  Search,
} from 'lucide-react';

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
  category: 'Core' | 'Students & Classes' | 'Communication & Security';
  icon: React.ElementType;
}

const ALL_TABS: TabItem[] = [
  { id: 'dashboard', label: 'Principal Dashboard', category: 'Core', icon: LayoutDashboard },
  { id: 'timetable', label: 'Timetable & Substitutions', category: 'Core', icon: CalendarDays },
  { id: 'reports', label: 'Reports & Analytics', category: 'Core', icon: BarChart3 },
  { id: 'export', label: 'Export Attendance', category: 'Core', icon: Download },
  
  { id: 'students', label: 'Student Roster', category: 'Students & Classes', icon: Users },
  { id: 'sections', label: 'Class Sections', category: 'Students & Classes', icon: FolderKanban },
  { id: 'calendar', label: 'Attendance Calendar', category: 'Students & Classes', icon: Calendar },
  { id: 'samples', label: 'Face Recognition Samples', category: 'Students & Classes', icon: Activity },
  { id: 'idcard', label: 'Batch ID Extractor', category: 'Students & Classes', icon: Image },

  { id: 'emergency', label: 'Emergency & Safety', category: 'Communication & Security', icon: Siren },
  { id: 'notifications', label: 'Send Notifications', category: 'Communication & Security', icon: Bell },
  { id: 'inbox', label: 'Admin Inbox', category: 'Communication & Security', icon: Mail },
  { id: 'notif-log', label: 'Delivery Logs', category: 'Communication & Security', icon: MessageSquareText },
  { id: 'access', label: 'User & Staff Access', category: 'Communication & Security', icon: UserCog },
  { id: 'settings', label: 'Cutoff & Settings', category: 'Communication & Security', icon: Settings },
];

interface Props {
  stats?: { totalFaces: number; presentToday: number; lateToday: number; todayAttendance: number };
}

const LiteAdmin: React.FC<Props> = ({ stats }) => {
  const { setPreference } = usePerformanceMode();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const categories = ['All', 'Core', 'Students & Classes', 'Communication & Security'];

  const filteredTabs = ALL_TABS.filter((t) => {
    const matchesCategory = activeCategory === 'All' || t.category === activeCategory;
    const matchesSearch = !search.trim() || t.label.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleTabSelect = (id: string) => {
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
      case 'calendar':
        return <AttendanceCalendar selectedFaceId={null} />;
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
        {/* Top Header */}
        <header className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground">Principal & Administration</h1>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Lite Mode
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Full management suite with optimized rendering and instant response
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreference('off')}
            className="text-xs gap-1.5"
          >
            <Feather className="w-3.5 h-3.5" />
            Switch to Full Admin
          </Button>
        </header>

        {/* Live Admin Stat Metrics */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
              <div className="text-xs font-semibold text-muted-foreground uppercase">Registered Students</div>
              <div className="text-xl sm:text-2xl font-bold text-foreground mt-0.5">{stats.totalFaces}</div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-xs">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase">Present Today</div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.presentToday}</div>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-xs">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase">Late Today</div>
              <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.lateToday}</div>
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 shadow-xs">
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Total Marked</div>
              <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.todayAttendance}</div>
            </div>
          </div>
        )}

        {/* Category Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeCategory === c
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tabs..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Tab Pills Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 bg-muted/20 p-1.5 rounded-xl border border-border">
          {filteredTabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTabSelect(t.id)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-card/80'
                }`}
              >
                <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tab Panel with Suspense */}
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 shadow-xs min-h-[420px]">
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center py-20 text-sm text-muted-foreground space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p>Loading module…</p>
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
