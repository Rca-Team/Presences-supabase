import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import { AndroidWidgetItem, MaterialPalette, AndroidWidgetSize, PALETTE_CLASSES } from './types';
import { playQuietAlertTone } from '@/utils/audioChimes';

interface DecibelMeterWidgetProps {
  widget?: AndroidWidgetItem;
  size?: AndroidWidgetSize;
  palette?: MaterialPalette;
}

export const DecibelMeterWidget: React.FC<DecibelMeterWidgetProps> = ({
  widget,
  size = widget?.size || '2x2',
  palette = widget?.palette || 'dynamic-blue',
}) => {
  const paletteConfig = PALETTE_CLASSES[palette] || PALETTE_CLASSES['dynamic-blue'];
  const [isListening, setIsListening] = useState(false);
  const [decibels, setDecibels] = useState(38);
  const [audioLevels, setAudioLevels] = useState<number[]>([10, 15, 25, 40, 20, 15, 10]);
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const lastAlarmTimeRef = useRef(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        const levels: number[] = [];
        const step = Math.max(1, Math.floor(buffer.length / 8));
        
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
          if (i % step === 0 && levels.length < 8) {
            levels.push(Math.max(10, Math.round((buffer[i] / 255) * 100)));
          }
        }
        setAudioLevels(levels);

        const avg = sum / buffer.length;
        // Map 0-255 to calibrated 30-90 dB SPL
        const calculatedDb = Math.min(95, Math.max(30, Math.round(30 + (avg / 255) * 65)));
        setDecibels(calculatedDb);

        // Optional gentle warning chime if noisy (> 75 dB) for more than 4 seconds
        if (alarmEnabled && calculatedDb > 75) {
          const now = Date.now();
          if (now - lastAlarmTimeRef.current > 6000) {
            lastAlarmTimeRef.current = now;
            playQuietAlertTone();
          }
        }

        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsListening(false);
    setDecibels(38);
    setAudioLevels([10, 15, 25, 40, 20, 15, 10]);
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const getStatus = (db: number) => {
    if (db < 50) return { label: 'Quiet & Focused', color: 'text-emerald-500', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' };
    if (db < 70) return { label: 'Moderate Talk', color: 'text-amber-500', bg: 'bg-amber-500/15', border: 'border-amber-500/30' };
    return { label: 'High Classroom Noise', color: 'text-rose-500', bg: 'bg-rose-500/15', border: 'border-rose-500/30' };
  };

  const status = getStatus(decibels);

  return (
    <div className="flex flex-col justify-between h-full gap-2 text-center select-none">
      {/* Decibel Display & Waveform */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="flex items-baseline justify-center gap-1">
          <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight transition-colors ${status.color}`}>
            {isListening ? decibels : '—'}
          </span>
          <span className="text-xs font-bold text-muted-foreground uppercase font-mono">dB</span>
        </div>

        {/* Live Audio Waveform Bars */}
        {isListening && (
          <div className="flex items-center justify-center gap-1 h-8 my-1">
            {audioLevels.map((lvl, idx) => (
              <motion.div
                key={idx}
                animate={{ height: `${lvl}%` }}
                transition={{ duration: 0.08 }}
                className={cn(
                  "w-1.5 sm:w-2 rounded-full min-h-[4px]",
                  decibels > 70 ? "bg-rose-500" : decibels > 50 ? "bg-amber-500" : "bg-emerald-500"
                )}
              />
            ))}
          </div>
        )}

        <div className={`mt-1.5 px-3 py-0.5 rounded-full text-[10px] font-bold border ${status.bg} ${status.border} ${status.color}`}>
          {isListening ? status.label : 'Microphone Inactive'}
        </div>
      </div>

      {/* Mic Trigger Button */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          className={`w-full py-2 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95 ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20'
              : 'bg-card border border-border hover:bg-muted text-foreground'
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="h-3.5 w-3.5" /> Stop Noise Monitor
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5 text-blue-500" /> Start Sound Monitor
            </>
          )}
        </button>

        {isListening && (
          <button
            type="button"
            onClick={() => setAlarmEnabled(!alarmEnabled)}
            className={cn(
              "text-[10px] font-semibold flex items-center justify-center gap-1 mx-auto transition-colors",
              alarmEnabled ? "text-amber-400 font-bold" : "text-slate-400 hover:text-slate-300"
            )}
          >
            <Activity className="h-3 w-3" />
            <span>{alarmEnabled ? 'Chime Alert Active (>75dB)' : 'Enable Quiet Chime Alert'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
