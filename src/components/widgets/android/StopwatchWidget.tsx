import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';

interface StopwatchWidgetProps {
  widget: AndroidWidgetItem;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({ widget }) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-amber'];
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (!isActive && seconds !== 0) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const addMinutes = (mins: number) => {
    setSeconds((s) => s + mins * 60);
  };

  const resetTimer = () => {
    setIsActive(false);
    setSeconds(0);
  };

  return (
    <div className="flex flex-col justify-between h-full gap-2 text-center">
      <div className="flex flex-col items-center justify-center my-auto">
        <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-foreground">
          {formatTime(seconds)}
        </span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
          {isActive ? 'Stopwatch Running' : 'Class Timer'}
        </span>
      </div>

      {/* Preset Chips */}
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          onClick={() => addMinutes(5)}
          className="px-2 py-0.5 rounded-lg bg-card border border-border/80 text-[10px] font-bold font-mono text-muted-foreground hover:text-foreground"
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(10)}
          className="px-2 py-0.5 rounded-lg bg-card border border-border/80 text-[10px] font-bold font-mono text-muted-foreground hover:text-foreground"
        >
          +10m
        </button>
        <button
          type="button"
          onClick={() => addMinutes(15)}
          className="px-2 py-0.5 rounded-lg bg-card border border-border/80 text-[10px] font-bold font-mono text-muted-foreground hover:text-foreground"
        >
          +15m
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 ${
            isActive
              ? 'bg-amber-500 hover:bg-amber-600 text-amber-950'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }`}
        >
          {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {isActive ? 'Pause' : 'Start'}
        </button>

        <button
          type="button"
          onClick={resetTimer}
          className="py-1.5 rounded-xl bg-card border border-border/80 hover:bg-muted text-foreground font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" /> Reset
        </button>
      </div>
    </div>
  );
};
