import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Clock, 
  Sparkles, 
  Settings, 
  ChevronDown, 
  Tv,
  Mic,
  Layers,
  FileDown
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
  onToggleSlideDrawer?: () => void;
  onExportPDF?: () => void;
}

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
  onToggleSlideDrawer,
  onExportPDF,
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
            className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 px-2.5 md:px-3 py-1.5 rounded-xl border border-slate-700/80 transition max-w-[200px] sm:max-w-xs md:max-w-md"
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

        {/* Right: Noise Monitor + Timer + Copilot Toggle + Settings */}
        <div className="flex items-center gap-2 md:gap-3">
          
          {/* Noise Level Monitor Pill */}
          {onToggleNoiseMonitor && (
            <button
              onClick={onToggleNoiseMonitor}
              title="Classroom Noise Monitor"
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition ${
                isNoiseMonitoring
                  ? noiseStatus === 'quiet'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : noiseStatus === 'moderate'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="text-[11px] font-mono">
                {isNoiseMonitoring ? (noiseStatus === 'quiet' ? 'Quiet' : noiseStatus === 'moderate' ? 'Moderate' : 'Loud!') : 'Noise Mic'}
              </span>
            </button>
          )}

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
