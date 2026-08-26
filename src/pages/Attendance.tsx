import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import AttendanceInstructions from '@/components/attendance/AttendanceInstructions';
import AttendanceStats from '@/components/attendance/AttendanceStats';
import FuturisticFaceScanner from '@/components/attendance/FuturisticFaceScanner';
import QRCodeScanner from '@/components/attendance/QRCodeScanner';
import LiveAttendanceFeed from '@/components/attendance/LiveAttendanceFeed';
import VoiceCommands from '@/components/attendance/VoiceCommands';
import {
  BarChart3,
  Info,
  Scan,
  Sparkles,
  Zap,
  Activity,
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  Percent,
  Radio,
  Cpu,
  ShieldCheck,
  Building2,
  GraduationCap,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LiteAttendanceMode from '@/components/attendance/LiteAttendanceMode';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';

const Attendance: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode, preference, setPreference } = usePerformanceMode();
  const minimizeMotion = isMobile || prefersReducedMotion || liteMode;

  const [activeTab, setActiveTab] = useState<'kiosk' | 'qr' | 'analytics' | 'help'>('kiosk');
  const [tabDirection, setTabDirection] = useState(1);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Live Synchronized Attendance Stats
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
      console.warn('Stats refresh error:', e);
    }
  };

  useEffect(() => {
    refreshStats();
    const timer = window.setTimeout(() => setIsInitialLoading(false), 200);

    const channel = supabase
      .channel('attendance-page-live-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        refreshStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => {
        refreshStats();
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const isQRKioskMode = searchParams.get('mode') === 'qr' && searchParams.get('autostart') === '1';

  useEffect(() => {
    if (isQRKioskMode) {
      setActiveTab('qr');
    }
  }, [isQRKioskMode]);

  const tabs = [
    { id: 'kiosk', label: 'Face ID Terminal', shortLabel: 'Face ID', icon: Scan },
    { id: 'qr', label: 'QR ID Scanner', shortLabel: 'QR Scan', icon: QrCode },
    { id: 'analytics', label: 'Analytics & Insights', shortLabel: 'Analytics', icon: BarChart3 },
    { id: 'help', label: 'Guide & Help', shortLabel: 'Guide', icon: Info },
  ];

  const handleTabChange = (nextTab: 'kiosk' | 'qr' | 'analytics' | 'help') => {
    const order = ['kiosk', 'qr', 'analytics', 'help'];
    setTabDirection(order.indexOf(nextTab) >= order.indexOf(activeTab) ? 1 : -1);
    setActiveTab(nextTab);
  };

  const slideAnimation = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  };

  if (liteMode) {
    return (
      <PageTransition>
        <PageLayout className="min-h-screen bg-background">
          <div className="px-3 sm:px-4 py-4 max-w-4xl mx-auto space-y-4">
            <div className="text-center">
              <h1 className="text-xl font-bold text-foreground">Smart Attendance (Lite)</h1>
              <p className="text-xs text-muted-foreground">High efficiency mode for low-latency devices</p>
              <button
                onClick={() => setPreference('off')}
                className="mt-2 text-xs text-primary underline underline-offset-2"
              >
                Switch to Full Experience
              </button>
            </div>
            <LiteAttendanceMode />
          </div>
        </PageLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-background pb-12">
        {/* Ambient mesh gradient backdrop */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-40 -right-40 w-[32rem] h-[32rem] rounded-full blur-[140px] opacity-25"
            style={{ background: 'radial-gradient(circle, hsl(var(--ios-blue)), transparent 70%)' }}
          />
          <div
            className="absolute -bottom-40 -left-40 w-[32rem] h-[32rem] rounded-full blur-[140px] opacity-20"
            style={{ background: 'radial-gradient(circle, hsl(var(--ios-purple)), transparent 70%)' }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5">
          {/* Top Brand Collaboration Header Banner */}
          <div className="relative overflow-hidden p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-indigo-950/70 border border-white/10 shadow-2xl backdrop-blur-2xl">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-xl shadow-blue-600/30 border border-white/20 shrink-0">
                  <Scan className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white">
                      Smart Attendance Terminal
                    </h1>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold backdrop-blur-md">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      100% Hands-Free AI Active
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300/90 mt-1 flex-wrap font-medium">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-blue-400" />
                      PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                    </span>
                    <span className="text-slate-500">✕</span>
                    <span className="text-blue-300 font-semibold">Presence AI</span>
                  </div>
                </div>
              </div>

              {/* Station Indicators */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md text-slate-200 shadow-inner">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-semibold">&lt;0.8s</span>
                  <span className="text-slate-400 text-[11px]">Match</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md text-slate-200 shadow-inner">
                  <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                  <span className="font-semibold">99.8%</span>
                  <span className="text-slate-400 text-[11px]">Accuracy</span>
                </div>
              </div>
            </div>
          </div>

          {/* Real-time Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Enrolled */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-card/70 border border-border/60 backdrop-blur-xl shadow-lg hover:border-purple-500/30 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Enrolled Roster</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-foreground mt-1 tracking-tight">
                    {stats.totalRegistered}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20 shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Present Today */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-emerald-500/5 border border-emerald-500/20 backdrop-blur-xl shadow-lg hover:border-emerald-500/40 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Present Today</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 tracking-tight">
                    {stats.presentToday}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/30 shadow-sm">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Late Arrivals */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-amber-500/5 border border-amber-500/20 backdrop-blur-xl shadow-lg hover:border-amber-500/40 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Late Arrivals</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-1 tracking-tight">
                    {stats.lateToday}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/30 shadow-sm">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Attendance Rate */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-blue-500/5 border border-blue-500/20 backdrop-blur-xl shadow-lg hover:border-blue-500/40 transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Attendance %</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 mt-1 tracking-tight">
                    {stats.attendanceRate}%
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/30 shadow-sm">
                  <Percent className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Segmented Floating Pill Tab Bar */}
          <div className="flex p-1 bg-card/60 backdrop-blur-2xl border border-border/60 rounded-2xl shadow-md overflow-x-auto">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as any)}
                  className={`relative flex items-center justify-center gap-2 flex-1 min-w-[110px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 ${
                    isActive ? 'text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activePillTab"
                      className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 rounded-xl shadow-md shadow-blue-600/30"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2 truncate">
                    <tab.icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Main Tab Panels */}
          <AnimatePresence mode="wait">
            {activeTab === 'kiosk' && (
              <motion.div key="kiosk" {...slideAnimation} className="space-y-4">
                {/* 2-Column Responsive High-Performance Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  {/* Left Column: Hands-Free AI Face Scanner (2/3 width) */}
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-3 sm:p-5 shadow-2xl">
                    <FuturisticFaceScanner />
                  </div>

                  {/* Right Column: Real-time Live Attendance Feed (1/3 width) */}
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-4 shadow-2xl space-y-3 sticky top-4">
                    <LiveAttendanceFeed />
                  </div>
                </div>

                {/* Voice Commands Helper */}
                <div className="hidden sm:block">
                  <VoiceCommands
                    onCommand={cmd => {
                      if (cmd === 'stats') setActiveTab('analytics');
                      if (cmd === 'help') setActiveTab('help');
                    }}
                    onStartScan={() => toast({ title: 'Voice Activated', description: 'Autonomous Face Recognition Active' })}
                    onStopScan={() => toast({ title: 'Standby', description: 'Scanner on Standby' })}
                    onConfirmAttendance={() => toast({ title: 'Confirmed', description: 'Attendance Recorded' })}
                  />
                </div>
              </motion.div>
            )}

            {activeTab === 'qr' && (
              <motion.div key="qr" {...slideAnimation} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-4 sm:p-6 shadow-2xl">
                    <QRCodeScanner autoStart={true} hideManualControls={isQRKioskMode} />
                  </div>
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-4 shadow-2xl space-y-3">
                    <LiveAttendanceFeed />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'analytics' && (
              <motion.div key="analytics" {...slideAnimation} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-4 sm:p-6 shadow-2xl">
                    <AttendanceStats />
                  </div>
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-4 shadow-2xl space-y-3">
                    <LiveAttendanceFeed />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'help' && (
              <motion.div key="help" {...slideAnimation} className="max-w-3xl mx-auto">
                <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-2xl p-5 sm:p-7 shadow-2xl">
                  <AttendanceInstructions />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Attendance;
