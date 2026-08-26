import React, { useEffect, useState, useRef } from 'react';
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
  ShieldCheck,
  Building2,
  Layers,
  TrendingUp,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LiteAttendanceMode from '@/components/attendance/LiteAttendanceMode';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';

// Smooth number counter for SaaS KPI cards
const AnimatedNumber: React.FC<{ value: number; durationMs?: number }> = ({ value, durationMs = 600 }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const startValRef = useRef<number>(0);
  const targetValRef = useRef<number>(value);

  useEffect(() => {
    startValRef.current = displayValue;
    targetValRef.current = value;
    startTimeRef.current = null;

    let rafId: number;
    const animate = (time: number) => {
      if (startTimeRef.current === null) startTimeRef.current = time;
      const elapsed = time - startTimeRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValRef.current + (targetValRef.current - startValRef.current) * ease);
      setDisplayValue(current);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return <span>{displayValue.toLocaleString()}</span>;
};

const Attendance: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode, preference, setPreference } = usePerformanceMode();
  const minimizeMotion = isMobile || prefersReducedMotion || liteMode;

  const [activeTab, setActiveTab] = useState<'kiosk' | 'qr' | 'analytics' | 'help'>('kiosk');
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
    const timer = window.setTimeout(() => setIsInitialLoading(false), 220);

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
    { id: 'kiosk', label: 'Autonomous Face Terminal', shortLabel: 'Face Terminal', icon: Scan },
    { id: 'qr', label: 'Digital ID Scanner', shortLabel: 'QR ID', icon: QrCode },
    { id: 'analytics', label: 'Attendance Analytics', shortLabel: 'Analytics', icon: BarChart3 },
    { id: 'help', label: 'Operational Guide', shortLabel: 'Guide', icon: Info },
  ];

  // Staggered SaaS Opening Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: minimizeMotion ? 0 : 0.07,
        delayChildren: minimizeMotion ? 0 : 0.03,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: minimizeMotion ? 0 : 14, scale: minimizeMotion ? 1 : 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 340,
        damping: 26,
        mass: 0.8,
      },
    },
  };

  const slideAnimation = {
    initial: { opacity: 0, y: minimizeMotion ? 0 : 10, scale: minimizeMotion ? 1 : 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: minimizeMotion ? 0 : -8, scale: minimizeMotion ? 1 : 0.99 },
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
                className="mt-2 text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
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
        {/* Ambient subtle lighting backdrop */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-36 -right-36 w-[30rem] h-[30rem] rounded-full blur-[140px] opacity-25"
            style={{ background: 'radial-gradient(circle, hsl(var(--ios-blue)), transparent 70%)' }}
          />
          <div
            className="absolute -bottom-36 -left-36 w-[30rem] h-[30rem] rounded-full blur-[140px] opacity-20"
            style={{ background: 'radial-gradient(circle, hsl(var(--ios-purple)), transparent 70%)' }}
          />
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-5"
        >
          {/* 1. Header / Top Collaboration Hero Section */}
          <motion.div
            variants={itemVariants}
            className="relative overflow-hidden p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-blue-50/95 via-indigo-50/85 to-white/95 dark:from-slate-900/90 dark:via-slate-900/75 dark:to-indigo-950/75 border border-blue-200/60 dark:border-white/10 shadow-xl dark:shadow-2xl backdrop-blur-2xl"
          >
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 flex items-center justify-center text-white shadow-xl shadow-blue-600/30 border border-white/20 shrink-0">
                  <Scan className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                      Smart Attendance Automation
                    </h1>
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-semibold backdrop-blur-md">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      Autonomous Hands-Free Active
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300/90 mt-1 flex-wrap font-medium">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      PM Shri Kendriya Vidyalaya NFC Vigyan Vihar
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">✕</span>
                    <span className="text-blue-600 dark:text-blue-300 font-semibold">Presence AI</span>
                  </div>
                </div>
              </div>

              {/* Station Indicators */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 backdrop-blur-md text-slate-800 dark:text-slate-200 shadow-sm hover:border-blue-400/40 transition-colors">
                  <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
                  <span className="font-semibold">&lt;0.8s</span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">Match</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 backdrop-blur-md text-slate-800 dark:text-slate-200 shadow-sm hover:border-blue-400/40 transition-colors">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="font-semibold">99.8%</span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">Accuracy</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 2. Real-time SaaS Metric Cards Grid with Animated Counter */}
          <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Enrolled */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-white/90 dark:bg-card/70 border border-slate-200/80 dark:border-border/60 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-purple-500/40 hover:translate-y-[-2px] transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-muted-foreground uppercase tracking-wider">Enrolled Roster</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-foreground mt-1 tracking-tight">
                    {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.totalRegistered} />}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-500 flex items-center justify-center border border-purple-500/20 shadow-xs group-hover:scale-105 transition-transform">
                  <Users className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Present Today */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-emerald-50/80 dark:bg-emerald-500/5 border border-emerald-200/80 dark:border-emerald-500/20 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-emerald-500/40 hover:translate-y-[-2px] transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Present Today</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1 tracking-tight">
                    {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.presentToday} />}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-500 flex items-center justify-center border border-emerald-500/30 shadow-xs group-hover:scale-105 transition-transform">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Late Arrivals */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-amber-50/80 dark:bg-amber-500/5 border border-amber-200/80 dark:border-amber-500/20 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-amber-500/40 hover:translate-y-[-2px] transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Late Arrivals</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-amber-700 dark:text-amber-400 mt-1 tracking-tight">
                    {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.lateToday} />}
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-500 flex items-center justify-center border border-amber-500/30 shadow-xs group-hover:scale-105 transition-transform">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* Attendance Rate */}
            <div className="group relative overflow-hidden rounded-2xl p-4 bg-blue-50/80 dark:bg-blue-500/5 border border-blue-200/80 dark:border-blue-500/20 backdrop-blur-xl shadow-sm hover:shadow-md hover:border-blue-500/40 hover:translate-y-[-2px] transition-all duration-300">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/15 rounded-full blur-2xl group-hover:scale-125 transition-all" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Attendance Rate</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-blue-700 dark:text-blue-400 mt-1 tracking-tight">
                    {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.attendanceRate} />}%
                  </p>
                </div>
                <div className="h-10 w-10 rounded-2xl bg-blue-500/15 text-blue-700 dark:text-blue-500 flex items-center justify-center border border-blue-500/30 shadow-xs group-hover:scale-105 transition-transform">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* 3. Segmented Floating Pill Tab Bar */}
          <motion.div variants={itemVariants} className="flex p-1 bg-slate-100/90 dark:bg-card/60 backdrop-blur-2xl border border-slate-200/80 dark:border-border/60 rounded-2xl shadow-sm overflow-x-auto">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`relative flex items-center justify-center gap-2 flex-1 min-w-[110px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 active:scale-[0.98] ${
                    isActive ? 'text-white shadow-md' : 'text-slate-600 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-foreground hover:bg-slate-200/50 dark:hover:bg-muted/40'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeAttendanceTab"
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
          </motion.div>

          {/* 4. Main Tab Panels & Workstation Layout */}
          <motion.div variants={itemVariants}>
            <AnimatePresence mode="wait">
              {activeTab === 'kiosk' && (
                <motion.div key="kiosk" {...slideAnimation} className="space-y-4">
                  {/* 2-Column Responsive High-Performance Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    {/* Left Column: Hands-Free AI Face Scanner (2/3 width) */}
                    <div className="lg:col-span-2 rounded-3xl border border-slate-200/80 dark:border-border/60 bg-white/95 dark:bg-card/80 backdrop-blur-2xl p-3 sm:p-5 shadow-xl dark:shadow-2xl">
                      <FuturisticFaceScanner />
                    </div>

                    {/* Right Column: Real-time Live Attendance Feed (1/3 width) */}
                    <div className="rounded-3xl border border-slate-200/80 dark:border-border/60 bg-white/95 dark:bg-card/80 backdrop-blur-2xl p-4 shadow-xl dark:shadow-2xl space-y-3 sticky top-4">
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
          </motion.div>
        </motion.div>
      </PageLayout>
    </PageTransition>
  );
};

export default Attendance;
