import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  Sparkles, 
  Settings, 
  ChevronDown, 
  Tv,
  Mic,
  Calculator,
  Sliders,
  Users,
  Swords,
  Megaphone,
  Calendar,
  X
} from 'lucide-react';
import { GeminiTeachingService } from '../services/geminiTeachingService';

interface NavbarProps {
  gradeLabel: string;
  subjectName: string;
  chapterTitle: string;
  subtopicTitle: string;
  onOpenPreloader: () => void;
  isCopilotOpen: boolean;
  onToggleCopilot: () => void;
  isNoiseMonitoring?: boolean;
  noiseStatus?: 'quiet' | 'moderate' | 'loud';
  onToggleNoiseMonitor?: () => void;
  onOpenAttendance?: () => void;
  onOpenGraphModal?: () => void;
  onOpenCalculator?: () => void;
  onOpenChallengeMode?: () => void;
}

const DEFAULT_TIMETABLE = [
  { period: 1, time: '08:30 - 09:15', subject: 'Mathematics', teacher: 'Dr. R. K. Sharma', room: 'Room 204' },
  { period: 2, time: '09:15 - 10:00', subject: 'English Lit', teacher: 'Mrs. S. Sen', room: 'Room 204' },
  { period: 3, time: '10:15 - 11:00', subject: 'Physics (Active)', teacher: 'Prof. Gaurav', room: 'Physics Lab' },
  { period: 4, time: '11:00 - 11:45', subject: 'Chemistry', teacher: 'Dr. V. Nair', room: 'Chem Lab' },
  { period: 5, time: '12:30 - 01:15', subject: 'Computer Sci', teacher: 'Mr. A. Joshi', room: 'Comp Lab 1' },
];

export const Navbar: React.FC<NavbarProps> = ({
  gradeLabel,
  subjectName,
  chapterTitle,
  subtopicTitle,
  onOpenPreloader,
  isCopilotOpen,
  onToggleCopilot,
  isNoiseMonitoring = false,
  noiseStatus = 'quiet',
  onToggleNoiseMonitor,
  onOpenAttendance,
  onOpenGraphModal,
  onOpenCalculator,
  onOpenChallengeMode,
}) => {
  // 45-minute Period countdown
  const [periodSecondsLeft, setPeriodSecondsLeft] = useState(45 * 60);
  const [showSettings, setShowSettings] = useState(false);
  const [showTimetable, setShowTimetable] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(true);
  const [customKey, setCustomKey] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setPeriodSecondsLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveApiKey = () => {
    if (customKey.trim()) {
      GeminiTeachingService.setApiKey(customKey.trim());
    }
    setShowSettings(false);
  };

  return (
    <>
      {/* Top Emergency / Principal Announcement Ticker Banner */}
      {showAnnouncement && (
        <div className="h-7 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 px-4 flex items-center justify-between text-[11px] font-bold text-white shadow select-none z-40">
          <div className="flex items-center gap-2 overflow-hidden truncate">
            <Megaphone className="w-3.5 h-3.5 animate-bounce flex-shrink-0" />
            <span className="truncate">
              📢 Principal's Campus Alert: Inter-School Science Fair submissions close at 2:30 PM today in Main Hall
            </span>
          </div>
          <button
            onClick={() => setShowAnnouncement(false)}
            className="text-white/80 hover:text-white ml-2 flex-shrink-0 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 md:px-4 flex items-center justify-between shadow-md z-30 select-none">
        
        {/* Left: Brand & Active Curriculum Chapter Picker */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex items-center gap-2 pr-2 md:pr-3 border-r border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-black shadow-md flex-shrink-0">
              <Tv className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-black tracking-tight text-white block leading-none">
                PRESENCES
              </span>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block leading-none mt-0.5">
                STUDIOS
              </span>
            </div>
          </div>

          {/* Current Chapter Selector Button */}
          <button
            onClick={onOpenPreloader}
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 px-2.5 md:px-3 py-1.5 rounded-xl border border-slate-700/80 transition max-w-[190px] sm:max-w-xs md:max-w-sm"
          >
            <BookOpen className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div className="text-left truncate">
              <span className="text-[10px] font-bold text-slate-400 block leading-none truncate">
                {gradeLabel} • {subjectName}
              </span>
              <span className="text-xs font-bold text-white block leading-tight truncate">
                {chapterTitle}: {subtopicTitle}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1 flex-shrink-0" />
          </button>
        </div>

        {/* Center/Right Action Badges: Roll Call, Auto-Solver, Grapher, Challenge, Timetable */}
        <div className="flex items-center gap-1.5 md:gap-2">
          
          {/* Roll Call Attendance Button */}
          {onOpenAttendance && (
            <button
              onClick={onOpenAttendance}
              title="Class Attendance & Face Roll Call"
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-semibold transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Roll Call</span>
            </button>
          )}

          {/* Auto Calculator Performer Button */}
          {onOpenCalculator && (
            <button
              onClick={onOpenCalculator}
              title="Instant AI Math Solver"
              className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-semibold transition"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Auto Solver</span>
            </button>
          )}

          {/* Graph Curve Visualizer Button */}
          {onOpenGraphModal && (
            <button
              onClick={onOpenGraphModal}
              title="Formula Sliders & Graph Curve Generator"
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Graph Curve</span>
            </button>
          )}

          {/* Student vs Student Challenge Mode Button */}
          {onOpenChallengeMode && (
            <button
              onClick={onOpenChallengeMode}
              title="2-Student 50/50 Split Board Challenge"
              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold transition"
            >
              <Swords className="w-3.5 h-3.5" />
              <span className="hidden md:inline">2-Player Race</span>
            </button>
          )}

          {/* Timetable Dropdown */}
          <button
            onClick={() => setShowTimetable(!showTimetable)}
            title="Today's Timetable"
            className="p-1.5 md:px-2.5 md:py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Schedule</span>
          </button>

          {/* Period Timer */}
          <div className="flex items-center gap-1.5 md:gap-2 bg-slate-950/80 px-2.5 md:px-3 py-1 rounded-xl border border-slate-800 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
            <div>
              <span className="text-[9px] text-slate-400 block leading-none">Period 3</span>
              <span className="font-mono font-bold text-amber-300 block leading-none mt-0.5">
                {formatTime(periodSecondsLeft)}
              </span>
            </div>
          </div>

          {/* Copilot Dock Toggle */}
          <button
            onClick={onToggleCopilot}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-md ${
              isCopilotOpen
                ? 'bg-emerald-600 text-white shadow-emerald-900/30'
                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Jarvis Copilot</span>
          </button>

          {/* Quick Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
            title="Board Settings & AI Key"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Timetable Dropdown Modal */}
      {showTimetable && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Today's Class Schedule ({gradeLabel})</h3>
              </div>
              <button onClick={() => setShowTimetable(false)} className="p-1 hover:bg-slate-800 rounded text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {DEFAULT_TIMETABLE.map(p => (
                <div
                  key={p.period}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                    p.period === 3
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                      p.period === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      P{p.period}
                    </span>
                    <div>
                      <span className="font-bold block">{p.subject}</span>
                      <span className="text-[11px] text-slate-400">{p.time} • {p.room}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">{p.teacher}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 flex flex-col shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Smartboard Settings</h3>
            <p className="text-xs text-slate-400 mb-4">
              Configure classroom AI co-pilot and display features
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Gemini AI API Key (Optional Override):
                </label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="Paste your Gemini API key here..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Leave blank to use preconfigured system key or built-in offline solvers.
                </span>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveApiKey}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
