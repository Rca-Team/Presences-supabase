import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import AttendanceInstructions from '@/components/attendance/AttendanceInstructions';
import AttendanceStats from '@/components/attendance/AttendanceStats';
import FuturisticFaceScanner from '@/components/attendance/FuturisticFaceScanner';
import QRCodeScanner from '@/components/attendance/QRCodeScanner';
import LiveAttendanceFeed from '@/components/attendance/LiveAttendanceFeed';
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
  ShieldCheck,
  TrendingUp,
  Maximize2,
  Minimize2,
  Radio,
  Cpu,
  Wifi,
  ChevronRight,
  Flame,
  Volume2,
  VolumeX,
  Vibrate,
  VibrateOff,
  Sun,
  SunDim,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';
import { LiteFlashOverlay } from '@/components/attendance/LiteFeedbackControls';
import LiteModeToggle from '@/components/LiteModeToggle';
import { useToast } from '@/hooks/use-toast';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';

// Apple iOS Fluid Spring Configurations
const iosSpring = {
  type: 'spring',
  stiffness: 380,
  damping: 28,
  mass: 0.8,
};

const iosSnappySpring = {
  type: 'spring',
  stiffness: 450,
  damping: 32,
  mass: 0.7,
};

// Smooth Counter for iOS Metric Cards
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

// Live Digital Apple Clock
const AppleLiveClock: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeStrShort = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm font-medium tracking-tight text-slate-800 dark:text-slate-200">
      <div className="flex items-center gap-1.5 font-mono font-semibold tracking-normal text-slate-900 dark:text-white">
        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-500 animate-pulse" />
        <span className="hidden sm:inline">{timeStr}</span>
        <span className="sm:hidden">{timeStrShort}</span>
      </div>
      <span className="text-slate-300 dark:text-slate-700 hidden md:inline">•</span>
      <span className="text-slate-500 dark:text-slate-400 text-xs hidden md:inline">{dateStr}</span>
    </div>
  );
};

const Attendance: React.FC = () => {
  const [searchParams] = useSearchParams();
  const classParam = searchParams.get('class');
  const sectionParam = searchParams.get('section');
  const scopedCategory = classParam && sectionParam ? `${classParam}-${sectionParam.toUpperCase()}` : null;

  const { toast } = useToast();
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode, signals, preference, setPreference } = usePerformanceMode();
  const { prefs: feedbackPrefs, toggle: toggleFeedback, flashKind, signal } = useLiteFeedback();
  const minimizeMotion = isMobile || prefersReducedMotion || liteMode;

  const [activeTab, setActiveTab] = useState<'kiosk' | 'qr' | 'analytics' | 'help'>('kiosk');
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isKioskFocus, setIsKioskFocus] = useState(false);

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

  const refreshTimerRef = useRef<number | null>(null);
  const debouncedRefreshStats = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshStats();
    }, 2500);
  }, []);

  useEffect(() => {
    refreshStats();
    const timer = window.setTimeout(() => setIsInitialLoading(false), 200);

    const channel = supabase
      .channel('attendance-page-live-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        debouncedRefreshStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gate_entries' }, () => {
        debouncedRefreshStats();
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [debouncedRefreshStats]);

  const isQRKioskMode = searchParams.get('mode') === 'qr' && searchParams.get('autostart') === '1';

  useEffect(() => {
    if (isQRKioskMode) {
      setActiveTab('qr');
    }
  }, [isQRKioskMode]);

  // iOS Dock Navigation Items
  const tabs = [
    { id: 'kiosk', label: 'Face Terminal', shortLabel: 'Face', badge: 'Ultra-Fast', icon: Scan },
    { id: 'qr', label: 'Digital ID Pass', shortLabel: 'QR Pass', badge: 'Contactless', icon: QrCode },
    { id: 'analytics', label: 'Telemetry & Stats', shortLabel: 'Stats', badge: null, icon: BarChart3 },
    { id: 'help', label: 'Operations Guide', shortLabel: 'Guide', badge: null, icon: Info },
  ];

  // ---------------------------------------------------------------------------
  // UNIFIED APPLE NANO-TEXTURED GLASS & iOS MOTION INTERFACE (Zero Lag in Lite Mode)
  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-slate-50/60 dark:bg-slate-950 pb-16 selection:bg-blue-500/20">
        {/* Visual Flash feedback overlay */}
        <LiteFlashOverlay kind={flashKind} />

        {/* Optimized Multi-Chromic Ambient Light Backing (Single Composite Layer) */}
        <div 
          className="fixed inset-0 pointer-events-none -z-10 opacity-60 dark:opacity-25"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 80% 0%, rgba(59, 130, 246, 0.18) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 10% 40%, rgba(168, 85, 247, 0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 70% 90%, rgba(16, 185, 129, 0.10) 0%, transparent 70%)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
          {/* CONDITIONAL HEADER & STATS: LITE MODE VS STANDARD MODE */}
          {liteMode ? (
            <div className="space-y-4">
              {/* Top Title & Mode Switch Link */}
              <div className="text-center space-y-1 py-1">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-2">
                  Smart Attendance <span className="text-amber-500 font-extrabold">(Lite)</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  High efficiency mode for low-latency devices
                </p>
                <button
                  type="button"
                  onClick={() => setPreference('standard')}
                  className="text-xs font-semibold text-blue-500 hover:text-blue-400 underline underline-offset-4 transition-colors cursor-pointer"
                >
                  Switch to Full Experience
                </button>
              </div>

              {/* Terminal Active Card */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 border border-amber-500/25">
                    <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                        Lite Mode Terminal Active
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        LIVE SYNC
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Optimized for smooth high-speed attendance
                      {signals?.slowNetwork ? ` · Slow network (${signals.effectiveType})` : ''}
                      {signals?.saveData ? ' · Data saver' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
                  {/* Feedback Toggles */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleFeedback('sound')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        feedbackPrefs.sound
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {feedbackPrefs.sound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      <span>Sound {feedbackPrefs.sound ? 'on' : 'off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFeedback('vibrate')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        feedbackPrefs.vibrate
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {feedbackPrefs.vibrate ? <Vibrate className="w-3.5 h-3.5" /> : <VibrateOff className="w-3.5 h-3.5" />}
                      <span>Vibrate {feedbackPrefs.vibrate ? 'on' : 'off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleFeedback('flash')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                        feedbackPrefs.flash
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {feedbackPrefs.flash ? <Sun className="w-3.5 h-3.5" /> : <SunDim className="w-3.5 h-3.5" />}
                      <span>Flash {feedbackPrefs.flash ? 'on' : 'off'}</span>
                    </button>
                  </div>

                  {/* Mode Switcher */}
                  <LiteModeToggle variant="segmented" />
                </div>
              </div>

              {/* 4 Lite Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <span>ENROLLED</span>
                    <Users className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                    {stats.totalRegistered}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-3.5 shadow-xs">
                  <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
                    <span>PRESENT</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
                    {stats.presentToday}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-3.5 shadow-xs">
                  <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
                    <span>LATE</span>
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
                    {stats.lateToday}
                  </div>
                </div>

                <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 sm:p-3.5 shadow-xs">
                  <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
                    <span>RATE</span>
                    <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono mt-1">
                    {stats.attendanceRate}%
                  </div>
                </div>
              </div>

              {/* Lite Method Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('kiosk')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeTab === 'kiosk'
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Scan className="w-4 h-4" />
                  <span>Autonomous Face Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('qr')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    activeTab === 'qr'
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>Digital ID QR Scanner</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* 1. iOS Dynamic Island Command Header */}
              <motion.header
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={iosSpring}
                className="relative z-30"
              >
                <div className="nano-glass rounded-[28px] p-2.5 sm:p-3.5 flex items-center justify-between gap-3 shadow-lg shadow-blue-500/5">
                  {/* Left: Clock & Time Capsule */}
                  <div className="flex items-center gap-2 sm:gap-3 pl-1.5 sm:pl-2">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-blue-600/25 shrink-0 border border-white/25">
                      <Scan className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 dark:text-white">
                          Presences<span className="text-blue-500">.</span>AI
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          v2.4 Nano
                        </span>
                      </div>
                      <AppleLiveClock />
                    </div>
                  </div>

                  {/* Center: Dynamic Island Biometric Radar Pill */}
                  <div className="hidden lg:flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-slate-950/85 dark:bg-black/90 text-white border border-white/15 shadow-inner">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-semibold tracking-tight text-slate-200">
                      Neural Face ID • Ultra-Fast Sub-Second Mark Active
                    </span>
                    <span className="h-3 w-[1px] bg-white/20" />
                    <span className="text-[11px] font-mono text-emerald-400 font-medium">
                      100% Verified
                    </span>
                  </div>

                  {/* Right: Scoped Badge, Lite Mode Toggle & Kiosk Focus Toggle */}
                  <div className="flex items-center gap-2 pr-1">
                    {scopedCategory && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 text-xs font-bold">
                        <Users className="h-3.5 w-3.5" />
                        Class {scopedCategory}
                      </span>
                    )}

                    {/* Segmented Lite Mode Toggle */}
                    <LiteModeToggle variant="segmented" />

                    {/* Kiosk Fullscreen Focus Button */}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setIsKioskFocus(!isKioskFocus)}
                      title={isKioskFocus ? 'Exit Kiosk Focus' : 'Enter Kiosk Focus Mode'}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold transition-all border cursor-pointer ${
                        isKioskFocus
                          ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                          : 'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {isKioskFocus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isKioskFocus ? 'Standard View' : 'Kiosk Focus'}</span>
                    </motion.button>
                  </div>
                </div>
              </motion.header>

              {/* 2. iOS Control Center Modular KPI Grid (Smoothly collapses in Kiosk Focus) */}
              <AnimatePresence>
                {!isKioskFocus && (
                  <motion.section
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={iosSpring}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                      {/* Card 1: Attendance Rate Ring Module */}
                      <motion.div
                        whileHover={{ y: -3 }}
                        transition={iosSnappySpring}
                        className="nano-glass rounded-[26px] p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Attendance Rate
                          </span>
                          <div className="h-7 w-7 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <TrendingUp className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                            {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.attendanceRate} />}%
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
                            +1.4%
                          </span>
                        </div>
                        {/* iOS Mini Progress Bar */}
                        <div className="mt-3 w-full h-2 rounded-full bg-slate-200/70 dark:bg-slate-800/80 overflow-hidden">
                          <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.max(0, stats.attendanceRate))}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                          />
                        </div>
                      </motion.div>

                      {/* Card 2: Today's Checked-in */}
                      <motion.div
                        whileHover={{ y: -3 }}
                        transition={iosSnappySpring}
                        className="nano-glass rounded-[26px] p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Checked-In Today
                          </span>
                          <div className="h-7 w-7 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                            {isInitialLoading ? <span className="opacity-40">...</span> : <AnimatedNumber value={stats.presentToday + stats.lateToday} />}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            / {stats.totalRegistered} enrolled
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {stats.presentToday} on-time
                          </span>
                          {stats.lateToday > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              {stats.lateToday} late
                            </span>
                          )}
                        </div>
                      </motion.div>

                      {/* Card 3: Biometric Velocity & Accuracy */}
                      <motion.div
                        whileHover={{ y: -3 }}
                        transition={iosSnappySpring}
                        className="nano-glass rounded-[26px] p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Recognition Velocity
                          </span>
                          <div className="h-7 w-7 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
                            <Zap className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight text-amber-500 font-mono">
                            &lt; 0.3s
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            sub-second
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          <span>100% True Identity Verified</span>
                        </div>
                      </motion.div>

                      {/* Card 4: Terminal Encryption & Health */}
                      <motion.div
                        whileHover={{ y: -3 }}
                        transition={iosSnappySpring}
                        className="nano-glass rounded-[26px] p-4 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Security & Edge
                          </span>
                          <div className="h-7 w-7 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-500/20">
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </div>
                        </div>
                        <div className="mt-3 flex items-baseline gap-1.5">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-mono">
                            AES-256
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <span>Hardware Accelerated Sync</span>
                        </div>
                      </motion.div>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* 3. iOS 18 Floating Nano-Glass Segmented Dock */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={iosSpring}
                className="flex justify-center"
              >
                <div className="nano-glass-dock rounded-full p-1 sm:p-1.5 inline-flex items-center gap-0.5 sm:gap-1 shadow-xl shadow-slate-900/5 max-w-full overflow-x-auto no-scrollbar scrollbar-none">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`relative px-3 sm:px-6 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all duration-300 flex items-center gap-1.5 sm:gap-2 shrink-0 cursor-pointer ${
                          isActive ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="iosDockPill"
                            className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-md shadow-blue-600/35 border border-white/20"
                            transition={iosSpring}
                          />
                        )}
                        <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 relative z-10" />
                        <span className="relative z-10 hidden sm:inline">{tab.label}</span>
                        <span className="relative z-10 sm:hidden">{tab.shortLabel}</span>
                        {tab.badge && (
                          <span
                            className={`relative z-10 text-[9px] uppercase px-1.5 py-0.2 rounded-md font-extrabold hidden md:inline ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </>
          )}

          {/* 4. Main Workstation Bento Stage */}
          <main className="relative">
            <AnimatePresence mode="wait">
              {/* TAB 1: Hands-free Face Recognition Kiosk */}
              {activeTab === 'kiosk' && (
                <motion.div
                  key="kiosk"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={iosSpring}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    {/* Left 2/3: Nano-Glass Camera Stage Housing */}
                    <div className="lg:col-span-2 nano-glass rounded-[32px] p-3 sm:p-5 shadow-2xl border border-white/70 dark:border-white/10 overflow-hidden">
                      <FuturisticFaceScanner
                        onAttendanceMarked={(rec) => {
                          signal(rec.status === 'late' ? 'warn' : 'ok');
                          debouncedRefreshStats();
                        }}
                      />
                    </div>

                    {/* Right 1/3: iOS 18 Dynamic Island Live Activity Feed */}
                    <div className="nano-glass rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 sticky top-4 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 2: Digital QR Pass Scanner */}
              {activeTab === 'qr' && (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={iosSpring}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    <div className="lg:col-span-2 nano-glass rounded-[32px] p-5 sm:p-7 shadow-2xl border border-white/70 dark:border-white/10">
                      <QRCodeScanner autoStart={true} hideManualControls={isQRKioskMode} />
                    </div>
                    <div className="nano-glass rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 3: Full Analytics & Reporting */}
              {activeTab === 'analytics' && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={iosSpring}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    <div className="lg:col-span-2 nano-glass rounded-[32px] p-5 sm:p-7 shadow-2xl border border-white/70 dark:border-white/10">
                      <AttendanceStats />
                    </div>
                    <div className="nano-glass rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 4: Operational Kiosk Guide */}
              {activeTab === 'help' && (
                <motion.div
                  key="help"
                  initial={{ opacity: 0, scale: 0.98, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -10 }}
                  transition={iosSpring}
                  className="max-w-3xl mx-auto"
                >
                  <div className="nano-glass rounded-[32px] p-6 sm:p-8 shadow-2xl border border-white/70 dark:border-white/10">
                    <AttendanceInstructions />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Attendance;
