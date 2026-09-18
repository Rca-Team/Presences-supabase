import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Palette, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  RefreshCw, 
  ExternalLink,
  UserCheck,
  Zap,
  Sliders,
  X,
  Plus,
  Trash2,
  Mic,
  Shuffle,
  Timer,
  Quote,
  Layers,
  Monitor,
  Tablet,
  Smartphone,
  Check
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type TPATheme = 'emerald' | 'cyber' | 'gold' | 'rose' | 'slate' | 'chalkboard';

export interface WidgetConfig {
  showTPA: boolean;
  showPeriodTimer: boolean;
  showQuickNotes: boolean;
  showDecibelMeter: boolean;
  showStudentPicker: boolean;
  showStopwatch: boolean;
  showDailyQuote: boolean;
  tpaTheme: TPATheme;
  deviceMode: 'smartboard' | 'tablet' | 'mobile';
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  showTPA: true,
  showPeriodTimer: false,
  showQuickNotes: false,
  showDecibelMeter: false,
  showStudentPicker: false,
  showStopwatch: false,
  showDailyQuote: false,
  tpaTheme: 'emerald',
  deviceMode: 'smartboard',
  position: 'top-right',
};

const THEME_STYLES: Record<TPATheme, {
  container: string;
  border: string;
  totalBadge: string;
  presentBadge: string;
  absentBadge: string;
  rateText: string;
  accentBg: string;
  name: string;
}> = {
  emerald: {
    container: 'bg-gradient-to-r from-emerald-950/90 via-slate-900/90 to-teal-950/90 text-white shadow-emerald-950/40',
    border: 'border-emerald-500/40 hover:border-emerald-400/60',
    totalBadge: 'bg-slate-800/80 text-slate-200 border-slate-700/60',
    presentBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    absentBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    rateText: 'text-emerald-400',
    accentBg: 'bg-emerald-500',
    name: 'Emerald Glass',
  },
  cyber: {
    container: 'bg-gradient-to-r from-blue-950/90 via-slate-900/90 to-cyan-950/90 text-white shadow-cyan-950/40',
    border: 'border-cyan-500/40 hover:border-cyan-400/60',
    totalBadge: 'bg-slate-800/80 text-slate-200 border-slate-700/60',
    presentBadge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    absentBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    rateText: 'text-cyan-400',
    accentBg: 'bg-cyan-500',
    name: 'Cyber Neon',
  },
  gold: {
    container: 'bg-gradient-to-r from-amber-950/90 via-slate-900/90 to-yellow-950/90 text-white shadow-amber-950/40',
    border: 'border-amber-500/40 hover:border-amber-400/60',
    totalBadge: 'bg-slate-800/80 text-slate-200 border-slate-700/60',
    presentBadge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    absentBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    rateText: 'text-amber-400',
    accentBg: 'bg-amber-500',
    name: 'Royal Gold',
  },
  rose: {
    container: 'bg-gradient-to-r from-rose-950/90 via-slate-900/90 to-pink-950/90 text-white shadow-rose-950/40',
    border: 'border-rose-500/40 hover:border-rose-400/60',
    totalBadge: 'bg-slate-800/80 text-slate-200 border-slate-700/60',
    presentBadge: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
    absentBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    rateText: 'text-pink-400',
    accentBg: 'bg-rose-500',
    name: 'Velvet Rose',
  },
  slate: {
    container: 'bg-gradient-to-r from-slate-900/95 via-slate-900/95 to-slate-950/95 text-white shadow-slate-950/60',
    border: 'border-slate-700/70 hover:border-slate-500/60',
    totalBadge: 'bg-slate-800 text-slate-300 border-slate-700',
    presentBadge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    absentBadge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    rateText: 'text-emerald-400',
    accentBg: 'bg-blue-500',
    name: 'Dark Minimal',
  },
  chalkboard: {
    container: 'bg-gradient-to-r from-emerald-950/95 via-green-950/95 to-teal-950/95 text-white shadow-black/60',
    border: 'border-emerald-600/50 hover:border-emerald-500/70',
    totalBadge: 'bg-emerald-900/70 text-emerald-200 border-emerald-800',
    presentBadge: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
    absentBadge: 'bg-rose-500/25 text-rose-200 border-rose-400/50',
    rateText: 'text-emerald-300',
    accentBg: 'bg-emerald-400',
    name: 'Chalkboard Classic',
  },
};

export const FloatingDeviceWidgets: React.FC = () => {
  const [config, setConfig] = useState<WidgetConfig>(() => {
    try {
      const saved = localStorage.getItem('presences_device_widget_config');
      return saved ? { ...DEFAULT_WIDGET_CONFIG, ...JSON.parse(saved) } : DEFAULT_WIDGET_CONFIG;
    } catch {
      return DEFAULT_WIDGET_CONFIG;
    }
  });

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isTPAExpanded, setIsTPAExpanded] = useState(false);
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [isLivePulse, setIsLivePulse] = useState(false);

  // Live Attendance State
  const [totalStudents, setTotalStudents] = useState<number>(45);
  const [presentStudents, setPresentStudents] = useState<number>(41);
  const [absentStudents, setAbsentStudents] = useState<number>(4);
  const [lateStudents, setLateStudents] = useState<number>(2);
  const [recentAbsentees, setRecentAbsentees] = useState<Array<{ id: string; name: string }>>([
    { id: '1', name: 'Aarav Sharma' },
    { id: '2', name: 'Diya Patel' },
    { id: '3', name: 'Rohan Gupta' },
    { id: '4', name: 'Zoya Khan' },
  ]);

  // Secondary Widget States
  const [notes, setNotes] = useState<Array<{ id: string; text: string; color: string }>>([
    { id: '1', text: '🎯 Goal: Chapter 4 Problem Set', color: '#fef08a' },
  ]);
  const [newNoteText, setNewNoteText] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);

  // Lucky Student Picker State
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  // Stopwatch State
  const [stopwatchSecs, setStopwatchSecs] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);

  // Period Countdown (25 mins default)
  const [periodSecs, setPeriodSecs] = useState(25 * 60);

  const style = THEME_STYLES[config.tpaTheme] || THEME_STYLES.emerald;
  const attendanceRate = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;

  // Save config changes
  const updateConfig = (newCfg: WidgetConfig) => {
    setConfig(newCfg);
    try {
      localStorage.setItem('presences_device_widget_config', JSON.stringify(newCfg));
    } catch {}
  };

  // Live Data Fetcher
  const fetchCounts = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [recordsRes, registeredRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('id, student_name, status, timestamp')
          .gte('timestamp', today.toISOString()),
        supabase
          .from('attendance_records')
          .select('id, student_name')
          .eq('status', 'registered'),
      ]);

      const records = recordsRes.data || [];
      const registered = registeredRes.data || [];
      const total = registered.length > 0 ? registered.length : records.length;
      const p = records.filter((r) => r.status === 'present' || r.status === 'late').length;
      const l = records.filter((r) => r.status === 'late').length;
      const a = Math.max(0, total - p);

      setTotalStudents(total);
      setPresentStudents(p);
      setAbsentStudents(a);
      setLateStudents(l);

      setIsLivePulse(true);
      setTimeout(() => setIsLivePulse(false), 1500);
    } catch (err) {
      console.warn('Widget poll notice:', err);
    }
  };

  useEffect(() => {
    fetchCounts();

    const channel = supabase
      .channel('floating_device_widgets_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        fetchCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setPeriodSecs(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Stopwatch interval
  useEffect(() => {
    let interval: any = null;
    if (isStopwatchRunning) {
      interval = setInterval(() => setStopwatchSecs(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isStopwatchRunning]);

  // Quick 1-tap mark present
  const handleQuickMarkPresent = async (name: string) => {
    setRecentAbsentees(prev => prev.filter(s => s.name !== name));
    setPresentStudents(p => p + 1);
    setAbsentStudents(a => Math.max(0, a - 1));

    try {
      await supabase.from('attendance_records').insert({
        student_name: name,
        status: 'present',
        source: 'device-widget',
        capture_mode: 'manual',
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Mark error:', e);
    }
  };

  // Lucky Student Pick
  const handlePickStudent = () => {
    if (isPicking) return;
    setIsPicking(true);
    const pool = ['Aarav', 'Diya', 'Rohan', 'Sneha', 'Tanvi', 'Vihaan', 'Zoya', 'Aditya', 'Priya', 'Kavya'];
    let count = 0;
    const intv = setInterval(() => {
      setPickedStudent(pool[Math.floor(Math.random() * pool.length)]);
      count++;
      if (count > 12) {
        clearInterval(intv);
        setIsPicking(false);
      }
    }, 80);
  };

  return (
    <>
      {/* ── Fixed Floating Widget Container ── */}
      <div className="fixed top-20 right-4 z-40 flex flex-col items-end gap-2 pointer-events-auto select-none font-sans">
        
        {/* 1. Signature T/P/A Recolor-able Box Widget */}
        {config.showTPA && (
          <div className="relative">
            <div 
              className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-300 ${style.container} ${style.border}`}
            >
              {/* Live Gate Status Beacon */}
              <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isLivePulse ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isLivePulse ? 'bg-cyan-500' : 'bg-emerald-500'}`} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                  LIVE
                </span>
              </div>

              {/* T (Total) */}
              <div 
                onClick={() => setIsTPAExpanded(!isTPAExpanded)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.totalBadge}`}
                title="Total Students"
              >
                <span className="text-[10px] opacity-70 font-semibold">T:</span>
                <span className="font-mono text-sm">{totalStudents}</span>
              </div>

              {/* P (Present) */}
              <div 
                onClick={() => setIsTPAExpanded(!isTPAExpanded)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.presentBadge}`}
                title="Present Today"
              >
                <span className="text-[10px] font-semibold text-emerald-400">P:</span>
                <span className="font-mono text-sm text-emerald-300 font-extrabold">{presentStudents}</span>
              </div>

              {/* A (Absent) */}
              <div 
                onClick={() => setIsTPAExpanded(!isTPAExpanded)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.absentBadge}`}
                title="Absent / Unmarked"
              >
                <span className="text-[10px] font-semibold text-rose-400">A:</span>
                <span className="font-mono text-sm text-rose-300 font-extrabold">{absentStudents}</span>
              </div>

              {/* % Rate */}
              <div 
                onClick={() => setIsTPAExpanded(!isTPAExpanded)}
                className="flex items-center gap-1 pl-1 cursor-pointer"
              >
                <span className={`text-xs font-black font-mono ${style.rateText}`}>
                  {attendanceRate}%
                </span>
              </div>

              {/* Palette button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsThemePickerOpen(!isThemePickerOpen);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition ml-0.5"
                title="Recolor Widget"
              >
                <Palette className="w-3.5 h-3.5" />
              </button>

              {/* Expand Toggle */}
              <button
                onClick={() => setIsTPAExpanded(!isTPAExpanded)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                {isTPAExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Recolor Dropdown */}
            {isThemePickerOpen && (
              <div className="absolute top-12 right-0 w-44 p-2 rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 z-50">
                <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-cyan-400" />
                  Color Themes
                </div>
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {(Object.keys(THEME_STYLES) as TPATheme[]).map((tKey) => {
                    const t = THEME_STYLES[tKey];
                    return (
                      <button
                        key={tKey}
                        onClick={() => {
                          updateConfig({ ...config, tpaTheme: tKey });
                          setIsThemePickerOpen(false);
                        }}
                        className={`flex items-center gap-1.5 p-1.5 rounded-xl text-left text-[11px] font-semibold transition ${
                          config.tpaTheme === tKey ? 'bg-white/15 text-white ring-1 ring-white/30' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${t.accentBg} shrink-0`} />
                        <span className="truncate">{t.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Expandable Absentee Quick Popup */}
            {isTPAExpanded && (
              <div className="absolute top-12 right-0 w-72 p-3 rounded-3xl bg-slate-950/95 border border-white/15 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 z-40 text-white">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold">Unmarked Students ({absentStudents})</span>
                  </div>
                  <button onClick={() => setIsTPAExpanded(false)} className="text-slate-400 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 mt-2 max-h-40 overflow-y-auto no-scrollbar">
                  {recentAbsentees.map(stu => (
                    <div key={stu.id} className="flex items-center justify-between p-1.5 rounded-xl bg-white/5 border border-white/5 text-xs">
                      <span className="font-semibold text-slate-200">{stu.name}</span>
                      <button
                        onClick={() => handleQuickMarkPresent(stu.name)}
                        className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-sm"
                      >
                        <UserCheck className="w-2.5 h-2.5" /> Present
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Secondary Floating Widgets Row */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          
          {/* Period Timer */}
          {config.showPeriodTimer && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-2xl bg-slate-900/90 border border-blue-500/30 backdrop-blur-xl text-white text-xs">
              <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="font-mono font-bold text-cyan-300">
                {Math.floor(periodSecs / 60).toString().padStart(2, '0')}:{(periodSecs % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Lucky Student Picker */}
          {config.showStudentPicker && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-purple-950/90 border border-purple-500/30 backdrop-blur-xl text-white text-xs">
              <Shuffle className="w-3.5 h-3.5 text-purple-400" />
              <span className="font-bold text-yellow-300 text-[11px] max-w-[90px] truncate">
                {pickedStudent || 'Picker'}
              </span>
              <button 
                onClick={handlePickStudent}
                className="px-1.5 py-0.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-[10px] font-bold text-white shadow-xs"
              >
                Pick
              </button>
            </div>
          )}

          {/* Stopwatch */}
          {config.showStopwatch && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-2xl bg-slate-900/90 border border-teal-500/30 backdrop-blur-xl text-white text-xs">
              <Timer className="w-3.5 h-3.5 text-teal-400" />
              <span className="font-mono font-bold text-teal-300 text-[11px]">
                {Math.floor(stopwatchSecs / 60)}:{(stopwatchSecs % 60).toString().padStart(2, '0')}
              </span>
              <button
                onClick={() => setIsStopwatchRunning(!isStopwatchRunning)}
                className="px-1.5 py-0.5 bg-teal-600 hover:bg-teal-500 rounded-lg text-[10px] font-bold text-white shadow-xs"
              >
                {isStopwatchRunning ? 'Pause' : 'Start'}
              </button>
            </div>
          )}

          {/* Widget Wizard Trigger Button */}
          <button
            onClick={() => setIsWizardOpen(true)}
            title="Open Widget Wizard & Store"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-indigo-950/40 transition hover:scale-105"
          >
            <Sliders className="w-3.5 h-3.5 text-yellow-300" />
            <span className="text-[11px]">Widgets</span>
          </button>
        </div>
      </div>

      {/* ── Widget Wizard Modal ── */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none font-sans">
          <div className="w-full max-w-xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-3.5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Smart Device Widgets Wizard</h3>
                  <p className="text-[11px] text-slate-400">Add or customize floating widgets for Mobile, Tablet, and Smartboard</p>
                </div>
              </div>
              <button onClick={() => setIsWizardOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-xl">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto no-scrollbar">
              {/* Device Profile Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Device Presets</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => updateConfig({ ...config, deviceMode: 'smartboard', showTPA: true, showPeriodTimer: true, showStudentPicker: true, showStopwatch: true })}
                    className={`p-2.5 rounded-xl border text-center transition ${config.deviceMode === 'smartboard' ? 'border-indigo-500 bg-indigo-950/50 text-white' : 'border-slate-800 text-slate-400'}`}
                  >
                    <Monitor className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
                    <div className="text-xs font-bold">Smartboard</div>
                  </button>
                  <button
                    onClick={() => updateConfig({ ...config, deviceMode: 'tablet', showTPA: true, showPeriodTimer: true, showStudentPicker: false, showStopwatch: false })}
                    className={`p-2.5 rounded-xl border text-center transition ${config.deviceMode === 'tablet' ? 'border-cyan-500 bg-cyan-950/50 text-white' : 'border-slate-800 text-slate-400'}`}
                  >
                    <Tablet className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                    <div className="text-xs font-bold">Tablet</div>
                  </button>
                  <button
                    onClick={() => updateConfig({ ...config, deviceMode: 'mobile', showTPA: true, showPeriodTimer: false, showStudentPicker: false, showStopwatch: false })}
                    className={`p-2.5 rounded-xl border text-center transition ${config.deviceMode === 'mobile' ? 'border-emerald-500 bg-emerald-950/50 text-white' : 'border-slate-800 text-slate-400'}`}
                  >
                    <Smartphone className="w-4 h-4 mx-auto mb-1 text-emerald-400" />
                    <div className="text-xs font-bold">Mobile</div>
                  </button>
                </div>
              </div>

              {/* TPA Theme */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">T/P/A Box Color</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {(['emerald', 'cyber', 'gold', 'rose', 'slate', 'chalkboard'] as const).map(th => (
                    <button
                      key={th}
                      onClick={() => updateConfig({ ...config, tpaTheme: th })}
                      className={`p-1.5 rounded-xl border text-xs font-bold capitalize transition ${config.tpaTheme === th ? 'border-white bg-white/15 text-white' : 'border-slate-800 text-slate-400'}`}
                    >
                      {th}
                    </button>
                  ))}
                </div>
              </div>

              {/* Widget Toggles */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Toggle Screen Widgets</label>
                
                {[
                  { key: 'showTPA' as const, name: 'Live T/P/A Attendance Box', icon: Users, enabled: config.showTPA },
                  { key: 'showPeriodTimer' as const, name: 'Period Countdown Timer', icon: Clock, enabled: config.showPeriodTimer },
                  { key: 'showStudentPicker' as const, name: 'Lucky Student Picker', icon: Shuffle, enabled: config.showStudentPicker },
                  { key: 'showStopwatch' as const, name: 'Activity Stopwatch', icon: Timer, enabled: config.showStopwatch },
                ].map(w => {
                  const Icon = w.icon;
                  return (
                    <div
                      key={w.key}
                      onClick={() => updateConfig({ ...config, [w.key]: !w.enabled })}
                      className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${w.enabled ? 'border-indigo-500/40 bg-indigo-950/20 text-white' : 'border-slate-800 bg-slate-900/30 text-slate-400'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold">{w.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${w.enabled ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}>
                        {w.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setIsWizardOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FloatingDeviceWidgets;
