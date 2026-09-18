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
  ShieldCheck,
  UserCheck,
  Zap,
  Minimize2,
  Maximize2
} from 'lucide-react';
import { smartboardSupabase } from '../../services/supabaseSyncService';

export type TPATheme = 'emerald' | 'cyber' | 'gold' | 'rose' | 'slate' | 'chalkboard';

export interface LiveTPAWidgetProps {
  grade?: string;
  section?: string;
  onOpenFullAttendance?: () => void;
  defaultTheme?: TPATheme;
  isCompact?: boolean;
}

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

export const LiveTPAWidget: React.FC<LiveTPAWidgetProps> = ({
  grade = 'Grade 10',
  section = 'A',
  onOpenFullAttendance,
  defaultTheme = 'emerald',
  isCompact = false,
}) => {
  // Theme state with local persistence
  const [theme, setTheme] = useState<TPATheme>(() => {
    return (localStorage.getItem('smartboard_tpa_theme') as TPATheme) || defaultTheme;
  });
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLivePulse, setIsLivePulse] = useState(false);

  // Live Attendance Counts State
  const [totalStudents, setTotalStudents] = useState<number>(42);
  const [presentStudents, setPresentStudents] = useState<number>(39);
  const [absentStudents, setAbsentStudents] = useState<number>(3);
  const [lateStudents, setLateStudents] = useState<number>(1);
  const [absenteeList, setAbsenteeList] = useState<Array<{ id: string; name: string; roll: string }>>([
    { id: '1', name: 'Aarav Sharma', roll: '12' },
    { id: '2', name: 'Diya Patel', roll: '18' },
    { id: '3', name: 'Rohan Gupta', roll: '27' },
  ]);

  const style = THEME_STYLES[theme] || THEME_STYLES.emerald;
  const attendanceRate = totalStudents > 0 ? Math.round((presentStudents / totalStudents) * 100) : 0;

  const handleSelectTheme = (newTheme: TPATheme) => {
    setTheme(newTheme);
    localStorage.setItem('smartboard_tpa_theme', newTheme);
    setIsThemePickerOpen(false);
  };

  // Fetch live stats from Supabase
  const fetchLiveCounts = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch today's attendance records
      const { data: records } = await smartboardSupabase
        .from('attendance_records')
        .select('id, student_name, student_id, status, timestamp')
        .gte('timestamp', today.toISOString());

      if (records && records.length > 0) {
        const presentCount = records.filter(r => r.status === 'present' || r.status === 'late').length;
        const lateCount = records.filter(r => r.status === 'late').length;
        const total = Math.max(42, records.length);
        const absent = Math.max(0, total - presentCount);

        setTotalStudents(total);
        setPresentStudents(presentCount);
        setAbsentStudents(absent);
        setLateStudents(lateCount);

        // Flash live indicator
        setIsLivePulse(true);
        setTimeout(() => setIsLivePulse(false), 1500);
      }
    } catch (e) {
      console.warn('Smartboard TPA Supabase poll note:', e);
    }
  };

  useEffect(() => {
    fetchLiveCounts();

    // Subscribe to realtime attendance events
    const channel = smartboardSupabase
      .channel('smartboard_tpa_hud_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records' }, () => {
        fetchLiveCounts();
      })
      .subscribe();

    return () => {
      smartboardSupabase.removeChannel(channel);
    };
  }, []);

  // Quick 1-tap mark present from popup
  const handleQuickMarkPresent = async (studentId: string, studentName: string) => {
    setAbsenteeList(prev => prev.filter(s => s.id !== studentId));
    setPresentStudents(prev => prev + 1);
    setAbsentStudents(prev => Math.max(0, prev - 1));

    try {
      await smartboardSupabase.from('attendance_records').insert([
        {
          student_name: studentName,
          status: 'present',
          source: 'smartboard-tpa-widget',
          capture_mode: 'manual',
          timestamp: new Date().toISOString(),
        }
      ]);
    } catch (e) {
      console.warn('Quick mark error:', e);
    }
  };

  return (
    <div className="relative select-none z-30 font-sans">
      {/* ── Main T/P/A Pill / Box Widget ── */}
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
            {grade.replace(/Grade|Class/i, '').trim()}-{section}
          </span>
        </div>

        {/* Metric 1: Total (T) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.totalBadge}`}
          title="Total Enrolled Students"
        >
          <span className="text-[10px] opacity-70 font-semibold">T:</span>
          <span className="font-mono text-sm">{totalStudents}</span>
        </div>

        {/* Metric 2: Present (P) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.presentBadge}`}
          title="Present in Classroom"
        >
          <span className="text-[10px] font-semibold text-emerald-400">P:</span>
          <span className="font-mono text-sm text-emerald-300 font-extrabold">{presentStudents}</span>
        </div>

        {/* Metric 3: Absent (A) */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-xl border text-xs font-bold cursor-pointer transition hover:scale-105 ${style.absentBadge}`}
          title="Absent / Unmarked Students"
        >
          <span className="text-[10px] font-semibold text-rose-400">A:</span>
          <span className="font-mono text-sm text-rose-300 font-extrabold">{absentStudents}</span>
        </div>

        {/* Metric 4: Live % Gauge */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 pl-1 cursor-pointer"
          title="Class Attendance Rate"
        >
          <span className={`text-xs font-black font-mono ${style.rateText}`}>
            {attendanceRate}%
          </span>
        </div>

        {/* Recolor Palette Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsThemePickerOpen(!isThemePickerOpen);
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition ml-0.5"
          title="Change Widget Color & Theme"
        >
          <Palette className="w-3.5 h-3.5" />
        </button>

        {/* Expand / Collapse Arrow */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          title="Toggle Details & Absentee List"
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Recolor Theme Dropdown Palette ── */}
      {isThemePickerOpen && (
        <div className="absolute top-12 right-0 w-48 p-2 rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 z-50">
          <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3 h-3 text-cyan-400" />
            Widget Colors
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {(Object.keys(THEME_STYLES) as TPATheme[]).map((tKey) => {
              const t = THEME_STYLES[tKey];
              const isSelected = theme === tKey;
              return (
                <button
                  key={tKey}
                  onClick={() => handleSelectTheme(tKey)}
                  className={`flex items-center gap-2 p-1.5 rounded-xl text-left text-xs font-semibold transition ${
                    isSelected ? 'bg-white/15 text-white ring-1 ring-white/30' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${t.accentBg} shadow-xs shrink-0`} />
                  <span className="truncate text-[11px]">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Expandable Quick Absentee Sheet ── */}
      {isExpanded && (
        <div className="absolute top-12 right-0 w-80 p-3 rounded-3xl bg-slate-950/95 border border-white/15 shadow-2xl backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 z-40">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-400">
                <XCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>Absentees Today</span>
                  <span className="px-1.5 py-0.2 text-[10px] bg-rose-500/20 text-rose-300 rounded-full font-extrabold">
                    {absentStudents}
                  </span>
                </h4>
                <p className="text-[10px] text-slate-400">1-Tap to mark present on board</p>
              </div>
            </div>

            {onOpenFullAttendance && (
              <button
                onClick={() => {
                  setIsExpanded(false);
                  onOpenFullAttendance();
                }}
                className="px-2 py-1 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-[10px] font-bold flex items-center gap-1 border border-blue-500/30 transition"
              >
                <span>Full List</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Absentee Quick List */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto mt-2.5 pr-1 no-scrollbar">
            {absenteeList.length === 0 ? (
              <div className="text-center py-4 text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>100% Class Attendance Today!</span>
              </div>
            ) : (
              absenteeList.map((stu) => (
                <div
                  key={stu.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-slate-800 text-[10px] font-mono font-bold flex items-center justify-center text-slate-300">
                      {stu.roll}
                    </span>
                    <span className="text-xs font-bold text-slate-200">{stu.name}</span>
                  </div>
                  <button
                    onClick={() => handleQuickMarkPresent(stu.id, stu.name)}
                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-extrabold flex items-center gap-1 shadow-sm transition"
                    title="Mark this student present"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>Present</span>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Live Sync Footer */}
          <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Zap className="w-3 h-3 text-emerald-400" />
              Live Edge Sync Active
            </span>
            <button
              onClick={fetchLiveCounts}
              className="hover:text-white flex items-center gap-1 transition"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
