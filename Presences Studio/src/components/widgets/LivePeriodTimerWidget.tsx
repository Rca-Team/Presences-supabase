import React, { useState, useEffect } from 'react';
import { Clock, Bell, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';
import { audioService } from '../../services/audioService';

export interface LivePeriodTimerWidgetProps {
  currentPeriod?: number;
  subjectName?: string;
  teacherName?: string;
  nextSubject?: string;
  nextRoom?: string;
  onPeriodChime?: () => void;
}

export const LivePeriodTimerWidget: React.FC<LivePeriodTimerWidgetProps> = ({
  currentPeriod = 3,
  subjectName = 'Physics',
  teacherName = 'Prof. Gaurav',
  nextSubject = 'Chemistry',
  nextRoom = 'Chem Lab 2',
  onPeriodChime,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(25 * 60); // 25 minutes left by default
  const [isRunning, setIsRunning] = useState(true);
  const totalPeriodSeconds = 45 * 60;

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          audioService.playCorrectChime();
          if (onPeriodChime) onPeriodChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, onPeriodChime]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const progressPct = Math.round(((totalPeriodSeconds - secondsLeft) / totalPeriodSeconds) * 100);

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-blue-500/30 backdrop-blur-xl shadow-lg text-white text-xs select-none">
      <div className="flex items-center gap-1.5 font-bold text-blue-400">
        <Clock className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
        <span>Period {currentPeriod}</span>
      </div>

      {/* Countdown Digits */}
      <div className="font-mono font-black text-sm text-cyan-300 bg-slate-950/80 px-2 py-0.5 rounded-lg border border-cyan-500/20">
        {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </div>

      {/* Mini Progress bar */}
      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 rounded-full"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Next Period Preview */}
      <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 pl-1 border-l border-white/10">
        <span>Next:</span>
        <span className="font-bold text-slate-200">{nextSubject}</span>
        <span className="text-[10px] text-slate-500">({nextRoom})</span>
      </div>
    </div>
  );
};
