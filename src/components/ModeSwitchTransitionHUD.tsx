import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Sparkles, X, CheckCircle2, Gauge, Cpu, BatteryCharging, ShieldCheck } from 'lucide-react';

interface ModeSwitchTransitionHUDProps {
  show: boolean;
  targetMode: 'lite' | 'standard' | null;
  onDismiss: () => void;
}

export const ModeSwitchTransitionHUD: React.FC<ModeSwitchTransitionHUDProps> = ({
  show,
  targetMode,
  onDismiss,
}) => {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 1800);
    return () => clearTimeout(timer);
  }, [show, onDismiss]);

  const isLite = targetMode === 'lite';

  return (
    <AnimatePresence>
      {show && targetMode && (
        <div className="fixed inset-0 z-[99999] pointer-events-none flex items-start justify-center pt-8 sm:pt-14 px-4 select-none">
          {/* Subtle Ambient Flash */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`absolute inset-0 pointer-events-none ${
              isLite
                ? 'bg-gradient-to-b from-amber-500/10 via-transparent to-transparent'
                : 'bg-gradient-to-b from-indigo-500/15 via-transparent to-transparent'
            }`}
          />

          {/* Main Floating Capsule HUD */}
          <motion.div
            initial={{ opacity: 0, y: -30, scale: 0.92, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, scale: 0.94, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            onClick={onDismiss}
            className={`pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl p-4 sm:p-5 shadow-2xl cursor-pointer border ${
              isLite
                ? 'bg-zinc-950/95 text-zinc-100 border-amber-500/40 shadow-amber-500/15'
                : 'bg-slate-950/95 text-slate-100 border-indigo-500/40 shadow-indigo-500/20'
            }`}
          >
            {/* Animated Laser Progress Bar on Top */}
            <div className="absolute top-0 inset-x-0 h-1 bg-white/10 overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.6, ease: 'easeInOut' }}
                className={`h-full w-full ${
                  isLite
                    ? 'bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#f59e0b]'
                    : 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#06b6d4]'
                }`}
              />
            </div>

            {/* Glowing Corner Accents */}
            <div
              className={`absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-60 ${
                isLite ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
            />
            <div
              className={`absolute -bottom-12 -left-12 w-28 h-28 rounded-full blur-2xl pointer-events-none opacity-40 ${
                isLite ? 'bg-orange-600' : 'bg-purple-600'
              }`}
            />

            <div className="relative flex items-center gap-3.5">
              {/* Animated Icon Avatar */}
              <motion.div
                initial={{ rotate: -45, scale: 0.7 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 460, damping: 20 }}
                className={`relative flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl border shadow-lg ${
                  isLite
                    ? 'border-amber-400/50 bg-amber-500/20 text-amber-400 shadow-amber-500/25'
                    : 'border-cyan-400/50 bg-gradient-to-br from-indigo-500/30 to-cyan-500/30 text-cyan-300 shadow-cyan-500/25'
                }`}
              >
                {/* Sonar Ping Ring */}
                <span
                  className={`absolute inset-0 rounded-2xl animate-ping opacity-35 ${
                    isLite ? 'bg-amber-400' : 'bg-cyan-400'
                  }`}
                />

                {isLite ? (
                  <Zap className="h-6 w-6 fill-current relative z-10" />
                ) : (
                  <Sparkles className="h-6 w-6 relative z-10" />
                )}
              </motion.div>

              {/* Text Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                      isLite
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : 'bg-indigo-500/25 text-cyan-300 border border-cyan-500/30'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    {isLite ? '⚡ Low-Resource Mode' : '✦ High-Fidelity Mode'}
                  </span>
                  <span className="text-[11px] text-zinc-400 font-mono">Instant Sync</span>
                </div>

                <h3 className="text-base font-bold tracking-tight text-white mt-1 flex items-center gap-1.5">
                  {isLite ? 'Switching to Lite Mode' : 'Switching to Standard Mode'}
                </h3>

                <p className="text-xs text-zinc-300 line-clamp-1 mt-0.5">
                  {isLite
                    ? 'Battery & GPU optimized · 60 FPS · Zero blur lag'
                    : 'Full visual effects · 3D Neural Orbs & Liquid Glass'}
                </p>
              </div>

              {/* Close Icon */}
              <button
                type="button"
                onClick={onDismiss}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Telemetry Pills Strip */}
            <div className="mt-3.5 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center font-mono text-[10px]">
              <div className="rounded-xl bg-white/5 py-1.5 px-2 border border-white/5">
                <span className="text-zinc-400 block text-[9px] uppercase">Engine</span>
                <span className={`font-semibold ${isLite ? 'text-amber-400' : 'text-cyan-300'}`}>
                  {isLite ? 'Ultra-Lite' : 'Full 3D'}
                </span>
              </div>

              <div className="rounded-xl bg-white/5 py-1.5 px-2 border border-white/5">
                <span className="text-zinc-400 block text-[9px] uppercase">GPU Filter</span>
                <span className={`font-semibold ${isLite ? 'text-emerald-400' : 'text-indigo-300'}`}>
                  {isLite ? 'Bypassed' : 'Active'}
                </span>
              </div>

              <div className="rounded-xl bg-white/5 py-1.5 px-2 border border-white/5">
                <span className="text-zinc-400 block text-[9px] uppercase">Response</span>
                <span className="font-semibold text-emerald-400">&lt;10ms</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ModeSwitchTransitionHUD;
