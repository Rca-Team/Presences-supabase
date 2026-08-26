import React, { useEffect, useState, useMemo } from 'react';
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
  Feather,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useToast } from '@/hooks/use-toast';
import LiteAttendanceMode from '@/components/attendance/LiteAttendanceMode';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';

const Attendance: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode, preference, setPreference, signals } = usePerformanceMode();
  const minimizeMotion = isMobile || prefersReducedMotion || liteMode;

  const [activeTab, setActiveTab] = useState<'kiosk' | 'qr' | 'analytics' | 'help'>('kiosk');
  const [tabDirection, setTabDirection] = useState(1);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Live Synchronized Stats
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
    const timer = window.setTimeout(() => setIsInitialLoading(false), 300);

    // Supabase Realtime channel for live attendance stats sync
    const channel = supabase
      .channel('attendance-page-live-sync')
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
    { id: 'kiosk', label: 'Face ID Station (Hands-Free)', shortLabel: 'Face ID', icon: Scan },
    { id: 'qr', label: 'QR Code Scanner', shortLabel: 'QR Scan', icon: QrCode },
    { id: 'analytics', label: 'Analytics & Insights', shortLabel: 'Stats', icon: BarChart3 },
    { id: 'help', label: 'Instructions', shortLabel: 'Help', icon: Info },
  ];

  const handleTabChange = (nextTab: 'kiosk' | 'qr' | 'analytics' | 'help') => {
    const order = ['kiosk', 'qr', 'analytics', 'help'];
    setTabDirection(order.indexOf(nextTab) >= order.indexOf(activeTab) ? 1 : -1);
    setActiveTab(nextTab);
  };

  const slideAnimation = {
    initial: { opacity: 0, x: tabDirection * 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: tabDirection * -24 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
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
        {/* Ambient background glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full blur-[120px] opacity-20"
            style={{ background: 'hsl(var(--ios-blue))' }}
          />
          <div
            className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-[120px] opacity-15"
            style={{ background: 'hsl(var(--ios-purple))' }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-card/60 border border-border/60 backdrop-blur-xl shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                <Scan className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                    Smart Attendance Terminal
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Live Hands-Free Engine
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  PM Shri Kendriya Vidyalaya NFC Vigyan Vihar ✕ Presence AI
                </p>
              </div>
            </div>

            {/* Micro Feature Indicators */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted/60 border border-border/50">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> &lt;1s Recognition
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted/60 border border-border/50">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" /> 99.8% Accuracy
              </span>
            </div>
          </div>

          {/* Real-time Synchronized Stats Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card/70 border-border/60 backdrop-blur-lg shadow-sm">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Registered</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{stats.totalRegistered}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
              </div>
            </Card>

            <Card className="bg-emerald-500/5 border-emerald-500/20 shadow-sm">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Present Today</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.presentToday}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
            </Card>

            <Card className="bg-amber-500/5 border-amber-500/20 shadow-sm">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Late Arrivals</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.lateToday}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Clock className="h-4 w-4" />
                </div>
              </div>
            </Card>

            <Card className="bg-blue-500/5 border-blue-500/20 shadow-sm">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Attendance Rate</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{stats.attendanceRate}%</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Percent className="h-4 w-4" />
                </div>
              </div>
            </Card>
          </div>

          {/* Navigation Tab Bar */}
          <div className="flex p-1 bg-card/70 backdrop-blur-xl border border-border/60 rounded-2xl shadow-sm overflow-x-auto">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as any)}
                  className={`relative flex items-center justify-center gap-2 flex-1 min-w-[100px] px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                    isActive ? 'text-white font-semibold shadow-md' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeAttendancePill"
                      className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl"
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    />
                  )}
                  <span className="relative flex items-center gap-1.5 truncate">
                    <tab.icon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab Views */}
          <AnimatePresence mode="wait">
            {activeTab === 'kiosk' && (
              <motion.div key="kiosk" {...slideAnimation} className="space-y-4">
                {/* 2-Column Responsive High-Performance Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  {/* Left Column: Hands-Free AI Face Scanner (2/3 width) */}
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-3 sm:p-5 shadow-xl">
                    <FuturisticFaceScanner />
                  </div>

                  {/* Right Column: Real-time Live Attendance Feed (1/3 width) */}
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-4 shadow-xl space-y-3 sticky top-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        <h3 className="font-bold text-sm text-foreground">Live Check-in Feed</h3>
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground">Realtime Sync</span>
                    </div>
                    <div className="max-h-[500px] overflow-y-auto pr-1">
                      <LiveAttendanceFeed />
                    </div>
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
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-4 sm:p-6 shadow-xl">
                    <QRCodeScanner autoStart={true} hideManualControls={isQRKioskMode} />
                  </div>
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-4 shadow-xl space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      <h3 className="font-bold text-sm text-foreground">Live Feed</h3>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">
                      <LiveAttendanceFeed />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'analytics' && (
              <motion.div key="analytics" {...slideAnimation} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                  <div className="lg:col-span-2 rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-4 sm:p-6 shadow-xl">
                    <AttendanceStats />
                  </div>
                  <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-4 shadow-xl space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                      <Activity className="h-4 w-4 text-emerald-500" />
                      <h3 className="font-bold text-sm text-foreground">Live Check-ins</h3>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">
                      <LiveAttendanceFeed />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'help' && (
              <motion.div key="help" {...slideAnimation} className="max-w-3xl mx-auto">
                <div className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-5 sm:p-7 shadow-xl">
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
