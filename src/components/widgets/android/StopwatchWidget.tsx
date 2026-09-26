import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Timer, Bell, Clock } from 'lucide-react';
import { AndroidWidgetItem, MaterialPalette, AndroidWidgetSize, PALETTE_CLASSES } from './types';
import { playSchoolBellChime } from '@/utils/audioChimes';
import { cn } from '@/lib/utils';

interface StopwatchWidgetProps {
  widget?: AndroidWidgetItem;
  size?: AndroidWidgetSize;
  palette?: MaterialPalette;
}

export const StopwatchWidget: React.FC<StopwatchWidgetProps> = ({
  widget,
  size = widget?.size || '2x2',
  palette = widget?.palette || 'dynamic-amber',
}) => {
  const paletteConfig = PALETTE_CLASSES[palette] || PALETTE_CLASSES['dynamic-amber'];
  const [seconds, setSeconds] = useState(0);
  const [targetSeconds, setTargetSeconds] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch');

  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        if (mode === 'countdown') {
          setSeconds((s) => {
            if (s <= 1) {
              clearInterval(interval);
              setIsActive(false);
              playSchoolBellChime();
              return 0;
            }
            return s - 1;
          });
        } else {
          setSeconds((s) => s + 1);
        }
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, mode]);

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCountdown = (mins: number) => {
    const total = mins * 60;
    setMode('countdown');
    setTargetSeconds(total);
    setSeconds(total);
    setIsActive(true);
  };

  const resetTimer = () => {
    setIsActive(false);
    if (mode === 'countdown' && targetSeconds) {
      setSeconds(targetSeconds);
    } else {
      setSeconds(0);
    }
  };

  return (
    <div className="flex flex-col justify-between h-full gap-2 text-center select-none">
      {/* Time Display */}
      <div className="flex flex-col items-center justify-center my-auto">
        <span className="text-3xl sm:text-5xl font-black font-mono tracking-tight text-foreground">
          {formatTime(seconds)}
        </span>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono">
            {mode === 'countdown' ? (isActive ? '⏱️ Countdown Active' : 'Countdown Paused') : (isActive ? '⏱️ Stopwatch Running' : 'Class Timer')}
          </span>
          {mode === 'countdown' && seconds === 0 && (
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500 text-white animate-bounce">
              TIME UP!
            </span>
          )}
        </div>
      </div>

      {/* Preset Countdown Chips */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {[5, 10, 15, 30, 45].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => startCountdown(m)}
            className={cn(
              "px-2 py-0.5 rounded-lg border text-[10px] font-bold font-mono transition-all active:scale-95",
              mode === 'countdown' && targetSeconds === m * 60
                ? "bg-amber-500 text-amber-950 border-amber-600 font-extrabold"
                : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
            )}
          >
            {m}m
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setMode('stopwatch');
            setTargetSeconds(null);
            setSeconds(0);
            setIsActive(false);
          }}
          className={cn(
            "px-2 py-0.5 rounded-lg border text-[10px] font-bold font-mono transition-all active:scale-95",
            mode === 'stopwatch'
              ? "bg-blue-600 text-white border-blue-600 font-extrabold"
              : "bg-card border-border/80 text-muted-foreground hover:text-foreground"
          )}
        >
          Lap
        </button>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95 ${
            isActive
              ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 font-black'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground font-black'
          }`}
        >
          {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span>{isActive ? 'Pause' : 'Start'}</span>
        </button>

        <button
          type="button"
          onClick={resetTimer}
          className="py-2 rounded-xl bg-card border border-border/80 hover:bg-muted text-foreground font-bold text-xs flex items-center justify-center gap-1 shadow-xs transition-all active:scale-95"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
          <span>Reset</span>
        </button>
      </div>
    </div>
  );
};
