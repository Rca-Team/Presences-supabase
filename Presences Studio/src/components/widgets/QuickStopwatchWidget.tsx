import React, { useState, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, Flag } from 'lucide-react';
import { audioService } from '../../services/audioService';

export const QuickStopwatchWidget: React.FC = () => {
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const handleToggle = () => {
    setIsActive(!isActive);
    if (!isActive) {
      audioService.playClickSound();
    }
  };

  const handleReset = () => {
    setIsActive(false);
    setSeconds(0);
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-teal-500/30 backdrop-blur-xl shadow-lg text-white text-xs select-none">
      <div className="flex items-center gap-1 font-bold text-teal-300">
        <Timer className="w-3.5 h-3.5 text-teal-400" />
        <span>Quiz Timer:</span>
      </div>

      <div className="font-mono font-bold text-xs text-teal-300 bg-slate-950 px-2 py-0.5 rounded-lg border border-teal-500/20">
        {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
      </div>

      <button
        onClick={handleToggle}
        className={`p-1 rounded-lg text-xs font-bold transition ${
          isActive ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-teal-600 hover:bg-teal-500 text-white'
        }`}
        title={isActive ? 'Pause Timer' : 'Start Timer'}
      >
        {isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>

      <button
        onClick={handleReset}
        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        title="Reset Stopwatch"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
};
