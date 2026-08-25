import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '@/components/Logo';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2200,
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(progressInterval); return 100; }
        return prev + 2.5;
      });
    }, duration / 50);

    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => { if (onComplete) onComplete(); }, 440);
    }, duration);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [duration, onComplete]);

  const loadingText =
    progress < 30 ? 'Initializing presence core' :
    progress < 60 ? 'Syncing intelligent modules' :
    progress < 90 ? 'Preparing secure environment' :
    'Launch ready';

  return (
    <AnimatePresence>
      {!isExiting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-50 overflow-hidden"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 95% at 82% -10%, hsl(var(--neon-blue) / 0.22) 0%, transparent 62%), radial-gradient(110% 90% at -8% 110%, hsl(var(--neon-pink) / 0.24) 0%, transparent 58%), linear-gradient(142deg, hsl(var(--background)) 0%, hsl(var(--secondary) / 0.96) 48%, hsl(var(--accent) / 0.76) 100%)',
            }}
          />

          <div
            className="absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(118deg, hsl(var(--foreground) / 0.03) 0 14px, transparent 14px 26px), repeating-linear-gradient(24deg, hsl(var(--neon-blue) / 0.06) 0 18px, transparent 18px 32px)',
            }}
          />

          <motion.div
            initial={{ x: '-130%' }}
            animate={{ x: '140%' }}
            transition={{ duration: 1.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute inset-y-0 w-[38%]"
            style={{
              transform: 'skewX(-28deg)',
              background:
                'linear-gradient(95deg, transparent 0%, hsl(var(--neon-cyan) / 0.24) 34%, hsl(var(--neon-pink) / 0.28) 64%, hsl(var(--neon-blue) / 0.24) 100%)',
              filter: 'blur(8px)',
            }}
          />

          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: i % 3 === 0 ? 6 : 4,
                height: i % 3 === 0 ? 6 : 4,
                background: i % 2 === 0 ? 'hsl(var(--neon-cyan) / 0.52)' : 'hsl(var(--neon-blue) / 0.48)',
                boxShadow: i % 2 === 0 ? '0 0 16px hsl(var(--neon-cyan) / 0.42)' : '0 0 16px hsl(var(--neon-blue) / 0.4)',
              }}
              initial={{
                x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 400),
                y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 800),
              }}
              animate={{
                y: [null, Math.random() * -180 - 80],
                opacity: [0, 0.75, 0],
              }}
              transition={{
                duration: 2.5 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: 'easeOut',
              }}
            />
          ))}

          <div className="relative h-full w-full grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-start justify-center px-8 sm:px-12 md:px-16 pt-20 md:pt-8"
            >
              <div className="px-3 py-1 rounded-full border border-border/70 bg-card/70 text-[10px] tracking-[0.24em] uppercase text-muted-foreground mb-5">
                Presence OS
              </div>
              <h1 className="font-bold text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-tight text-foreground max-w-xl">
                Presence
                <span className="block text-[0.44em] font-normal tracking-[0.26em] uppercase text-muted-foreground mt-2">
                  Smart School Automation
                </span>
              </h1>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground max-w-md">
                {loadingText}
              </p>

              <div className="mt-8 w-full max-w-sm">
                <div className="relative h-1.5 overflow-hidden rounded-full border border-white/15 bg-black/35">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, hsl(var(--neon-cyan)) 0%, hsl(var(--neon-blue)) 58%, hsl(var(--neon-pink)) 100%)',
                    }}
                  />
                  <motion.div
                    animate={{ x: ['-100%', '180%'] }}
                    transition={{ duration: 1.05, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-y-0 w-[36%]"
                    style={{
                      background: 'linear-gradient(90deg, transparent 0%, hsl(var(--foreground) / 0.22) 50%, transparent 100%)',
                    }}
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{Math.round(progress)}%</span>
                  <span className="tracking-[0.2em] uppercase">Booting</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ x: 32, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
              className="relative flex items-center justify-center px-8 pb-10 md:pb-0"
            >
              <div className="relative w-full max-w-[320px] aspect-square rounded-[28px] border border-border/70 bg-card/80 backdrop-blur-2xl overflow-hidden shadow-[0_28px_80px_-24px_hsl(var(--neon-pink)/0.35)]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-3 rounded-[22px] border border-border/70"
                  style={{ borderStyle: 'dashed' }}
                />
                <motion.div
                  animate={{ scale: [1, 1.06, 1], opacity: [0.28, 0.54, 0.28] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-8 rounded-2xl"
                  style={{
                    background: 'radial-gradient(circle, hsl(var(--neon-cyan) / 0.24) 0%, hsl(var(--neon-blue) / 0.2) 45%, hsl(var(--neon-pink) / 0.18) 100%)',
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-border/70 bg-card/85 px-5 py-4 backdrop-blur-xl">
                    <Logo size="md" className="[&>div>span:last-child]:text-foreground [&>div>span:last-child]:tracking-wide" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
