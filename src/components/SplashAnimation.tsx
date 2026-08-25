import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/Logo';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2400,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const startTime = performance.now();
    let animFrame: number;

    const update = (now: number) => {
      const elapsed = now - startTime;
      const linearProgress = Math.min(100, (elapsed / duration) * 100);
      // Sine easing for ultra-smooth natural progress
      const easedProgress = Math.min(100, Math.sin((linearProgress / 100) * (Math.PI / 2)) * 100);
      setProgress(easedProgress);

      if (linearProgress < 100) {
        animFrame = requestAnimationFrame(update);
      } else {
        setTimeout(() => {
          setIsExiting(true);
          setTimeout(() => {
            if (onComplete) onComplete();
          }, 500);
        }, 150);
      }
    };

    animFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrame);
  }, [duration, onComplete]);

  const statusMessage = useMemo(() => {
    if (progress < 25) return 'Calibrating Neural Vision Core...';
    if (progress < 55) return 'Loading Face Recognition Embeddings...';
    if (progress < 85) return 'Establishing High-Speed Synapses...';
    return 'Presence Automation Ready';
  }, [progress]);

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-slate-950 text-white select-none pointer-events-auto"
        >
          {/* Ambient Background Aura */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Radial Glow Centers */}
            <div 
              className="absolute -top-[15%] -left-[10%] w-[65vw] h-[65vw] rounded-full blur-[140px] opacity-25"
              style={{ background: 'radial-gradient(circle, #06b6d4 0%, #3b82f6 50%, transparent 75%)' }}
            />
            <div 
              className="absolute -bottom-[20%] -right-[10%] w-[65vw] h-[65vw] rounded-full blur-[140px] opacity-25"
              style={{ background: 'radial-gradient(circle, #8b5cf6 0%, #ec4899 50%, transparent 75%)' }}
            />

            {/* Subtle Grid Matrix */}
            <div 
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                backgroundSize: '48px 48px',
              }}
            />

            {/* Animated Dynamic Sine Waves */}
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <svg className="w-full h-96" viewBox="0 0 1200 400" preserveAspectRatio="none">
                <motion.path
                  d="M0,200 C300,120 600,280 900,140 C1050,70 1150,220 1200,200 L1200,400 L0,400 Z"
                  fill="url(#sineGradient1)"
                  animate={{
                    d: [
                      "M0,200 C300,120 600,280 900,140 C1050,70 1150,220 1200,200 L1200,400 L0,400 Z",
                      "M0,200 C300,270 600,130 900,260 C1050,330 1150,180 1200,200 L1200,400 L0,400 Z",
                      "M0,200 C300,120 600,280 900,140 C1050,70 1150,220 1200,200 L1200,400 L0,400 Z",
                    ],
                  }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.path
                  d="M0,200 C200,260 500,140 800,260 C1000,340 1100,150 1200,200 L1200,400 L0,400 Z"
                  fill="url(#sineGradient2)"
                  animate={{
                    d: [
                      "M0,200 C200,260 500,140 800,260 C1000,340 1100,150 1200,200 L1200,400 L0,400 Z",
                      "M0,200 C200,140 500,260 800,140 C1000,60 1100,250 1200,200 L1200,400 L0,400 Z",
                      "M0,200 C200,260 500,140 800,260 C1000,340 1100,150 1200,200 L1200,400 L0,400 Z",
                    ],
                  }}
                  transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <defs>
                  <linearGradient id="sineGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
                  </linearGradient>
                  <linearGradient id="sineGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ec4899" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Central Logo & Sine Shine Composition */}
          <div className="relative z-10 flex flex-col items-center justify-center px-6 max-w-md w-full">
            {/* Crystalline Glowing Orb Frame */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex items-center justify-center mb-8"
            >
              {/* Outer Breathing Sine Ring */}
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.35, 0.75, 0.35],
                  rotate: 360,
                }}
                transition={{
                  scale: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                  opacity: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
                  rotate: { duration: 18, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute -inset-6 rounded-full border border-cyan-500/30"
                style={{
                  boxShadow: '0 0 45px rgba(6,182,212,0.25), inset 0 0 25px rgba(59,130,246,0.2)',
                }}
              />

              {/* Inner Hex-Glow Container */}
              <div className="relative p-6 sm:p-7 rounded-3xl bg-slate-900/80 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden">
                {/* Logo Image with Sine Glow */}
                <motion.div
                  animate={{
                    y: [0, -4, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <img
                    src="/logo.png"
                    alt="Presence Logo"
                    className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-[0_8px_24px_rgba(6,182,212,0.5)]"
                  />
                </motion.div>

                {/* Diagonal Specular Sine Light Shine Sweep */}
                <motion.div
                  initial={{ x: '-150%', opacity: 0 }}
                  animate={{ x: '180%', opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    repeatDelay: 0.8,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="absolute inset-y-0 w-24 -skew-x-25 pointer-events-none z-20"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
                    filter: 'blur(3px)',
                  }}
                />
              </div>
            </motion.div>

            {/* Typography Reveal */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="text-center mb-8"
            >
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300 drop-shadow-[0_2px_15px_rgba(6,182,212,0.4)]">
                PRESENCE
              </h1>
              <p className="mt-1.5 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Smart School AI Automation
              </p>
            </motion.div>

            {/* Precision Futuristic Progress Bar */}
            <div className="w-full max-w-xs space-y-3">
              <div className="relative h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden border border-white/5 shadow-inner">
                {/* Progress Fill */}
                <motion.div
                  className="absolute top-0 bottom-0 left-0 rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
                    boxShadow: '0 0 14px rgba(6,182,212,0.8)',
                  }}
                />
                {/* Traveling Light Pulse */}
                <motion.div
                  animate={{ x: ['-100%', '250%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-y-0 w-16"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.9) 50%, transparent 100%)',
                  }}
                />
              </div>

              {/* Status & Numeric Telemetry */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span className="truncate max-w-[210px] text-slate-300 transition-all duration-300">
                  {statusMessage}
                </span>
                <span className="text-cyan-400 font-bold ml-2">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>

          {/* Minimalist Bottom Brand Signature */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.4 }}
            className="absolute bottom-6 text-[10px] uppercase tracking-[0.25em] text-slate-400"
          >
            Encrypted Neural Platform · v2.5
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
