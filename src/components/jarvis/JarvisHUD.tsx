import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Cpu, Mic, Volume2, Sparkles, AlertTriangle } from "lucide-react";

interface JarvisHUDProps {
  isScanning: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  healthScore: number | null;
  onMicClick: () => void;
  onScanClick: () => void;
}

export const JarvisHUD: React.FC<JarvisHUDProps> = ({
  isScanning,
  isSpeaking,
  isListening,
  healthScore,
  onMicClick,
  onScanClick,
}) => {
  return (
    <div className="relative flex flex-col items-center justify-center p-8 overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950/80 backdrop-blur-xl shadow-2xl shadow-cyan-500/10">
      {/* Ambient background grid and glow */}
      <div className="absolute inset-0 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Outer Holographic Concentric Rings */}
      <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center my-4">
        {/* Ring 1 - Slow clockwise rotate */}
        <motion.div
          className="absolute inset-0 rounded-full border border-dashed border-cyan-500/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        />

        {/* Ring 2 - Counter-clockwise with tactical ticks */}
        <motion.div
          className="absolute inset-4 rounded-full border-2 border-t-cyan-400 border-r-transparent border-b-cyan-500/40 border-l-transparent"
          animate={{ rotate: -360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {/* Ring 3 - Rapid pulse during scan or speech */}
        <motion.div
          className="absolute inset-8 rounded-full border border-cyan-400/40"
          animate={
            isScanning || isSpeaking
              ? { scale: [1, 1.06, 1], opacity: [0.5, 0.9, 0.5] }
              : { scale: 1, opacity: 0.3 }
          }
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Ring 4 - Arc segments */}
        <motion.div
          className="absolute inset-12 rounded-full border border-dotted border-cyan-300/30"
          animate={{ rotate: 180 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        />

        {/* Inner Arc Reactor Core */}
        <motion.div
          className={`relative w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center shadow-inner cursor-pointer transition-all duration-500 ${
            isListening
              ? "bg-gradient-to-br from-emerald-500/30 to-cyan-600/30 border-2 border-emerald-400 shadow-emerald-500/50"
              : isSpeaking
              ? "bg-gradient-to-br from-cyan-400/30 to-blue-600/30 border-2 border-cyan-300 shadow-cyan-400/60"
              : isScanning
              ? "bg-gradient-to-br from-amber-500/30 to-cyan-500/30 border-2 border-amber-400 shadow-amber-400/50"
              : "bg-gradient-to-br from-cyan-950/80 to-slate-900/90 border border-cyan-500/40 shadow-cyan-500/20"
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={onMicClick}
        >
          {/* Animated Waveform when speaking or listening */}
          {(isSpeaking || isListening) && (
            <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-60">
              {[12, 24, 38, 52, 38, 24, 12].map((h, idx) => (
                <motion.div
                  key={idx}
                  className="w-1 bg-cyan-300 rounded-full"
                  animate={{ height: [8, h, 8] }}
                  transition={{ duration: 0.6 + idx * 0.1, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </div>
          )}

          {/* Central Reactor Icon / Status */}
          <div className="relative z-10 flex flex-col items-center justify-center text-center select-none">
            {isListening ? (
              <>
                <Mic className="w-9 h-9 text-emerald-300 animate-pulse mb-1" />
                <span className="text-[10px] tracking-widest text-emerald-300 font-mono font-semibold uppercase">
                  LISTENING...
                </span>
              </>
            ) : isSpeaking ? (
              <>
                <Volume2 className="w-9 h-9 text-cyan-200 animate-pulse mb-1" />
                <span className="text-[10px] tracking-widest text-cyan-200 font-mono font-semibold uppercase">
                  JARVIS SPEAKING
                </span>
              </>
            ) : isScanning ? (
              <>
                <Cpu className="w-9 h-9 text-amber-300 animate-spin mb-1" />
                <span className="text-[10px] tracking-widest text-amber-300 font-mono font-semibold uppercase">
                  SCANNING SYSTEM
                </span>
              </>
            ) : (
              <>
                <Cpu className="w-9 h-9 text-cyan-400 mb-1" />
                <span className="text-xs font-bold tracking-widest text-cyan-300 font-mono">
                  J.A.R.V.I.S.
                </span>
                <span className="text-[9px] text-cyan-400/70 font-mono">CORE STANDBY</span>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Telemetry Status Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-mono">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>AUTONOMOUS ENGINE: ONLINE</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>GEMINI 2.5 FLASH</span>
        </div>

        {healthScore !== null && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${
              healthScore >= 80
                ? "bg-emerald-950/60 border-emerald-500/30 text-emerald-300"
                : healthScore >= 50
                ? "bg-amber-950/60 border-amber-500/30 text-amber-300"
                : "bg-red-950/60 border-red-500/30 text-red-300"
            }`}
          >
            {healthScore >= 80 ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>INTEGRITY: {healthScore}%</span>
          </div>
        )}
      </div>

      {/* Control Action Buttons */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4 z-10">
        <button
          onClick={onScanClick}
          disabled={isScanning}
          className="relative group px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Cpu className={`w-4 h-4 ${isScanning ? "animate-spin" : ""}`} />
            {isScanning ? "Diagnosing Systems..." : "Initialize Diagnostic Sweep"}
          </span>
        </button>

        <button
          onClick={onMicClick}
          className={`px-5 py-3 rounded-xl border text-sm font-semibold tracking-wider uppercase transition-all cursor-pointer ${
            isListening
              ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/20"
              : "bg-white/5 hover:bg-white/10 border-cyan-500/30 text-cyan-300"
          }`}
        >
          <span className="flex items-center gap-2">
            <Mic className="w-4 h-4" />
            {isListening ? "Listening (Tap to End)" : "Speak with Jarvis"}
          </span>
        </button>
      </div>
    </div>
  );
};
