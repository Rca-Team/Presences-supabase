import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, AlertTriangle, ShieldCheck } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';

interface DecibelMeterWidgetProps {
  widget: AndroidWidgetItem;
}

export const DecibelMeterWidget: React.FC<DecibelMeterWidgetProps> = ({ widget }) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-blue'];
  const [isListening, setIsListening] = useState(false);
  const [decibels, setDecibels] = useState(38);
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
      analyser.fftSize = 128;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsListening(true);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        // Map 0-255 to roughly 30-90 dB SPL simulation
        const calculatedDb = Math.min(95, Math.max(30, Math.round(30 + (avg / 255) * 65)));
        setDecibels(calculatedDb);
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
    <div className="flex flex-col justify-between h-full gap-2 text-center">
      {/* Decibel Display */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="flex items-baseline justify-center gap-1">
          <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight transition-colors ${status.color}`}>
            {isListening ? decibels : '—'}
          </span>
          <span className="text-xs font-bold text-muted-foreground uppercase">dB</span>
        </div>

        <div className={`mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${status.bg} ${status.border} ${status.color}`}>
          {isListening ? status.label : 'Microphone Inactive'}
        </div>
      </div>

      {/* Mic Trigger */}
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
    </div>
  );
};
