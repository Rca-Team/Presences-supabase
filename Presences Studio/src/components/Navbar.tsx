import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  Sparkles, 
  Settings, 
  ShieldCheck, 
  ChevronDown, 
  Maximize2,
  Tv
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
}

export const Navbar: React.FC<NavbarProps> = ({
  gradeLabel,
  subjectName,
  chapterTitle,
  subtopicTitle,
  onOpenPreloader,
  isCopilotOpen,
  onToggleCopilot,
}) => {
  // 45-minute Period countdown
  const [periodSecondsLeft, setPeriodSecondsLeft] = useState(45 * 60);
  const [showSettings, setShowSettings] = useState(false);
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
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shadow-md z-30 select-none">
        
        {/* Left: Brand & Active Curriculum Chapter Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-800">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-black shadow-md">
              <Tv className="w-4 h-4" />
            </div>
            <div>
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
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-700/80 transition"
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <div className="text-left">
              <span className="text-[10px] font-bold text-slate-400 block leading-none">
                {gradeLabel} • {subjectName}
              </span>
              <span className="text-xs font-bold text-white block leading-tight truncate max-w-[220px] md:max-w-[340px]">
                {chapterTitle}: {subtopicTitle}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>
        </div>

        {/* Right: Period Countdown + Copilot Toggle + Settings */}
        <div className="flex items-center gap-3">
          
          {/* Period Timer */}
          <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs">
            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
            <div>
              <span className="text-[10px] text-slate-400 block leading-none">Period 3</span>
              <span className="font-mono font-bold text-amber-300 block leading-none mt-0.5">
                {formatTime(periodSecondsLeft)} left
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
            <span>Jarvis Copilot</span>
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
