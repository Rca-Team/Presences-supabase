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
import { getCutoffTime } from '@/services/attendance/AttendanceSettingsService';
import { cn } from '@/lib/utils';



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
  const [activeCutoffTime, setActiveCutoffTime] = useState<string>('08:00');

  const format12Hour = (time24: string) => {
    if (!time24) return '8:00 AM';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return '8:00 AM';
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const minuteStr = m < 10 ? `0${m}` : `${m}`;
    return `${hour12}:${minuteStr} ${period}`;
  };

  useEffect(() => {
    let isMounted = true;
    getCutoffTime().then(time => {
      if (isMounted && time) setActiveCutoffTime(time);
    });

    const handleCutoffChange = (e: Event) => {
      const custom = e as CustomEvent<{ time?: string }>;
      if (custom.detail?.time) {
        setActiveCutoffTime(custom.detail.time);
      }
    };

    window.addEventListener('presence:cutoff-time-changed', handleCutoffChange);
    return () => {
      isMounted = false;
      window.removeEventListener('presence:cutoff-time-changed', handleCutoffChange);
    };
  }, []);

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
    }, 300);
  }, []);

  useEffect(() => {
    refreshStats();
    const timer = window.setTimeout(() => setIsInitialLoading(false), 200);

    const handleLocalMarked = () => {
      refreshStats();
    };
    window.addEventListener('presence:attendance-marked', handleLocalMarked);

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
      window.removeEventListener('presence:attendance-marked', handleLocalMarked);
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

  // Dock Navigation Items
  const tabs = [
    { id: 'kiosk', label: 'Face Camera', shortLabel: 'Camera', badge: 'Fast', icon: Scan },
    { id: 'qr', label: 'Scan QR Code', shortLabel: 'QR Code', badge: 'Contactless', icon: QrCode },
    { id: 'analytics', label: 'Attendance Stats', shortLabel: 'Stats', badge: null, icon: BarChart3 },
    { id: 'help', label: 'How to Use', shortLabel: 'Help', badge: null, icon: Info },
  ];

  // ---------------------------------------------------------------------------
  // UNIFIED INTERFACE (Zero Lag in Fast Mode)
  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <PageLayout className="min-h-screen bg-slate-50/60 dark:bg-slate-950 pb-16 selection:bg-blue-500/20">
        {/* Visual Flash feedback overlay */}
        <LiteFlashOverlay kind={flashKind} />

        {/* Multi-Chromic Ambient Light Backing */}
        <div 
          className="fixed inset-0 pointer-events-none -z-10 opacity-60 dark:opacity-25"
          style={{
            background: 'radial-gradient(ellipse 60% 40% at 80% 0%, rgba(59, 130, 246, 0.18) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at 10% 40%, rgba(168, 85, 247, 0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 70% 90%, rgba(16, 185, 129, 0.10) 0%, transparent 70%)',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-6">
          {/* 1. Top Title & School Branding */}
          <div className="text-center space-y-1.5 py-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-bold">
              <Scan className="w-3.5 h-3.5" />
              <span>PM Shri KV NFC Vigyan Vihar</span>
              <span className="opacity-40">•</span>
              <span>Presences.AI</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-2">
              Daily Attendance {liteMode && <span className="text-amber-500 font-extrabold">(Fast Mode)</span>}
            </h1>
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
              <span>Biometric & QR Attendance System</span>
              <span className="opacity-40">•</span>
              <AppleLiveClock />
            </div>
          </div>

          {/* 2. Unified Terminal Active Card (Matching Lite Mode Layout) */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3.5 sm:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border",
                liteMode
                  ? "bg-amber-500/10 text-amber-500 border-amber-500/25"
                  : "bg-blue-600/10 text-blue-600 dark:text-blue-400 border-blue-600/25"
              )}>
                {liteMode ? <Zap className="w-5 h-5 fill-current" /> : <Scan className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm sm:text-base">
                    {liteMode ? 'Lite Mode Terminal Active' : 'Daily Attendance Terminal Active'}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE SYNC
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30" title={`Arrivals after ${format12Hour(activeCutoffTime)} are marked Late`}>
                    <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    Cutoff: {format12Hour(activeCutoffTime)}
                  </span>
                  {scopedCategory && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                      <Users className="w-3 h-3" />
                      Class {scopedCategory}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {liteMode 
                    ? `Optimized for smooth high-speed attendance${signals?.slowNetwork ? ` · Slow network (${signals.effectiveType})` : ''}${signals?.saveData ? ' · Data saver' : ''}`
                    : 'High-speed biometric recognition active · Keep face visible in camera'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
              {/* Feedback Toggles */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => toggleFeedback('sound')}
                  title={feedbackPrefs.sound ? 'Mute Arrival Sound' : 'Enable Arrival Sound'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
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
                  title={feedbackPrefs.vibrate ? 'Disable Vibration' : 'Enable Vibration'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
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
                  title={feedbackPrefs.flash ? 'Disable Visual Flash' : 'Enable Visual Flash'}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
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

              {/* Kiosk Fullscreen Focus Button */}
              <button
                type="button"
                onClick={() => setIsKioskFocus(!isKioskFocus)}
                title={isKioskFocus ? 'Exit Full Screen' : 'Open Full Screen Camera'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                  isKioskFocus
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {isKioskFocus ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isKioskFocus ? 'Normal View' : 'Full Screen'}</span>
              </button>
            </div>
          </div>

          {/* 3. The 4 Clean Metric Cards (Zero-Lag Direct Render, High-Contrast) */}
          {!isKioskFocus && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 p-3 sm:p-3.5 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <span>ENROLLED</span>
                  <Users className="w-3.5 h-3.5 text-purple-500" />
                </div>
                <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white font-mono mt-1">
                  {stats.totalRegistered}
                </div>
                <div className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                  Total registered roster
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
                <div className="text-[10px] text-emerald-600/80 font-medium truncate mt-0.5">
                  Before {format12Hour(activeCutoffTime)}
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
                <div className="text-[10px] text-amber-600/80 font-medium truncate mt-0.5">
                  After {format12Hour(activeCutoffTime)}
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
                <div className="text-[10px] text-blue-600/80 font-medium truncate mt-0.5">
                  Turnout percentage
                </div>
              </div>
            </div>
          )}

          {/* 4. Snappy Segmented Method Switcher (Lag-free, Unified Across All Modes) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-900/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    isActive
                      ? liteMode 
                        ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20' 
                        : 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  {tab.badge && (
                    <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-extrabold hidden lg:inline ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 4. Main Workstation Bento Stage */}
          <main className="relative">
            <div>
              {/* TAB 1: Hands-free Face Recognition Kiosk */}
              {activeTab === 'kiosk' && (
                <motion.div
                  key="kiosk"
                  initial={{ opacity: 0.88, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    {/* Left 2/3: Nano-Glass Camera Stage Housing */}
                    <div className="lg:col-span-2 nano-glass rounded-2xl sm:rounded-[32px] p-2.5 sm:p-5 shadow-2xl border border-white/70 dark:border-white/10 overflow-hidden">
                      <FuturisticFaceScanner
                        onAttendanceMarked={(rec) => {
                          signal(rec.status === 'late' ? 'warn' : 'ok');
                          debouncedRefreshStats();
                        }}
                      />
                    </div>

                    {/* Right 1/3: iOS 18 Dynamic Island Live Activity Feed */}
                    <div className="nano-glass rounded-2xl sm:rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 sticky top-4 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 2: Digital QR Pass Scanner */}
              {activeTab === 'qr' && (
                <motion.div
                  key="qr"
                  initial={{ opacity: 0.88, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    <div className="lg:col-span-2 nano-glass rounded-2xl sm:rounded-[32px] p-3 sm:p-7 shadow-2xl border border-white/70 dark:border-white/10">
                      <QRCodeScanner autoStart={true} hideManualControls={isQRKioskMode} />
                    </div>
                    <div className="nano-glass rounded-2xl sm:rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 3: Full Analytics & Reporting */}
              {activeTab === 'analytics' && (
                <motion.div
                  key="analytics"
                  initial={{ opacity: 0.88, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
                    <div className="lg:col-span-2 nano-glass rounded-2xl sm:rounded-[32px] p-3.5 sm:p-7 shadow-2xl border border-white/70 dark:border-white/10">
                      <AttendanceStats />
                    </div>
                    <div className="nano-glass rounded-2xl sm:rounded-[32px] p-3 sm:p-4 shadow-2xl border border-white/70 dark:border-white/10 hardware-layer">
                      <LiveAttendanceFeed scopedCategory={scopedCategory} />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 4: Operational Kiosk Guide */}
              {activeTab === 'help' && (
                <motion.div
                  key="help"
                  initial={{ opacity: 0.88, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="max-w-3xl mx-auto"
                >
                  <div className="nano-glass rounded-2xl sm:rounded-[32px] p-4 sm:p-8 shadow-2xl border border-white/70 dark:border-white/10">
                    <AttendanceInstructions />
                  </div>
                </motion.div>
              )}
            </div>
          </main>
        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Attendance;
