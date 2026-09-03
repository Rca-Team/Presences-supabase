import React, { useState, useEffect } from 'react';
import FuturisticFaceScanner from './FuturisticFaceScanner';
import QRCodeScanner from './QRCodeScanner';
import LiveAttendanceFeed from './LiveAttendanceFeed';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useLiteFeedback } from '@/hooks/useLiteFeedback';
import { LiteFeedbackControls, LiteFlashOverlay } from './LiteFeedbackControls';
import { fetchUnifiedAttendanceStats, type UnifiedAttendanceStats } from '@/utils/attendanceStatsHelper';
import { supabase } from '@/integrations/supabase/client';
import {
  Scan,
  QrCode,
  Zap,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import LiteModeToggle from '@/components/LiteModeToggle';

/**
 * LiteAttendanceMode
 * ------------------
 * High-performance, low-resource attendance workstation for smart boards,
 * low-memory tablets, and 2G/3G mobile networks.
 *
 * Full Feature Parity with OG App:
 * - Real-time AI Face Recognition terminal with instant recording
 * - High-speed Digital ID QR Scanner
 * - Real-time synchronized Live Attendance Feed via Supabase Realtime
 * - Live statistical metrics (Total enrolled, Present, Late, Rate)
 * - Instant audio (chime), tactile vibration, and visual flash feedback
 */
const LiteAttendanceMode: React.FC = () => {
  const { signals, preference, setPreference } = usePerformanceMode();
  const { prefs, toggle, flashKind } = useLiteFeedback();
  const [activeTab, setActiveTab] = useState<'face' | 'qr'>('face');
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
      console.warn('Lite Attendance stats error:', e);
    }
  };

  useEffect(() => {
    refreshStats();

    const channel = supabase
      .channel('lite-attendance-live-metrics')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records' },
        () => {
          refreshStats();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gate_entries' },
        () => {
          refreshStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* Visual Flash feedback overlay */}
      <LiteFlashOverlay kind={flashKind} />

      {/* Top Banner: Lite Mode Status & Quick Toggles */}
      <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center flex-shrink-0 border border-amber-500/20">
            <Zap className="w-5 h-5 fill-current" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground text-sm sm:text-base">
                Lite Mode Terminal Active
              </span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Live Sync
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Optimized for smooth high-speed attendance
              {signals.slowNetwork ? ` · Slow network (${signals.effectiveType})` : ''}
              {signals.saveData ? ' · Data saver' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
          <LiteFeedbackControls prefs={prefs} onToggle={toggle} />
          <LiteModeToggle variant="segmented" />
        </div>
      </div>

      {/* Real-time Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-semibold uppercase">
            <span>Enrolled</span>
            <Users className="w-3.5 h-3.5 text-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            {stats.totalRegistered}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-semibold uppercase">
            <span>Present</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {stats.presentToday}
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase">
            <span>Late</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {stats.lateToday}
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 dark:text-blue-400 text-xs font-semibold uppercase">
            <span>Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
            {stats.attendanceRate}%
          </div>
        </div>
      </div>

      {/* Method Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-muted/30 p-1 rounded-xl border border-border">
        <button
          onClick={() => setActiveTab('face')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'face'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          }`}
        >
          <Scan className="w-4 h-4" />
          <span>Autonomous Face Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('qr')}
          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
            activeTab === 'qr'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-card/50'
          }`}
        >
          <QrCode className="w-4 h-4" />
          <span>Digital ID QR Scanner</span>
        </button>
      </div>

      {/* Main Workstation Layout: Left Scanner (2/3) + Right Live Feed (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Left Scanner Workstation */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-3 sm:p-5 shadow-sm">
          {activeTab === 'face' ? (
            <FuturisticFaceScanner />
          ) : (
            <QRCodeScanner autoStart={true} />
          )}
        </div>

        {/* Right Live Attendance Feed (Real-time Supabase postgres updates) */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3 sticky top-4">
          <LiveAttendanceFeed />
        </div>
      </div>
    </div>
  );
};

export default LiteAttendanceMode;
