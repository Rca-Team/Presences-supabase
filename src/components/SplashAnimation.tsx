import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashAnimationProps {
  onComplete?: () => void;
  duration?: number;
}

// Synthesize authentic warm Windows 11 startup harmonic chime using Web Audio API
const playWindows11Chime = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Windows 11 style harmonic chime notes (frequencies in Hz): F#4, G#4, C#5, D#5, G#5
    const chordFrequencies = [369.99, 415.30, 554.37, 622.25, 830.61];
    const startTime = ctx.currentTime + 0.1;

    chordFrequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + index * 0.04);

      // Smooth envelope attack and long gentle decay
      gain.gain.setValueAtTime(0.0001, startTime + index * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.045 / (index + 1), startTime + index * 0.04 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + index * 0.04);
      osc.stop(startTime + 2.3);
    });
  } catch {
    // Audio auto-play might be restricted before user gesture; gracefully fallback silently
  }
};

export const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2400,
}) => {
  const [phase, setPhase] = useState<'logo' | 'spinning' | 'welcome' | 'exiting'>('logo');
  const [statusMessage, setStatusMessage] = useState('Starting Presence...');
  const hasTriggeredChime = useRef(false);

  useEffect(() => {
    // Phase 1: Logo & Chime
    if (!hasTriggeredChime.current) {
      hasTriggeredChime.current = true;
      playWindows11Chime();
    }

    const t1 = setTimeout(() => {
      setPhase('spinning');
      setStatusMessage('Preparing smart school workspace...');
    }, 600);

    const t2 = setTimeout(() => {
      setPhase('welcome');
      setStatusMessage('Welcome to PM Shri KV NFC Vigyan Vihar');
    }, 1500);

    const t3 = setTimeout(() => {
      setPhase('exiting');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 550);
    }, duration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [duration, onComplete]);

  // Click or Keypress skips instantly
  const handleSkip = () => {
    setPhase('exiting');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 200);
  };

  return (
    <AnimatePresence>
      {phase !== 'exiting' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.05,
            filter: 'blur(10px)',
            transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
          }}
          onClick={handleSkip}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#000000] text-white select-none overflow-hidden cursor-pointer"
        >
          {/* Subtle Windows 11 ambient radial backdrop glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle 480px at 50% 45%, rgba(0, 120, 215, 0.18) 0%, rgba(0, 60, 160, 0.08) 50%, transparent 80%)',
            }}
          />

          {/* Windows 11 Center Hero Container */}
          <div className="relative z-10 flex flex-col items-center justify-center space-y-10 sm:space-y-12">
            {/* Windows 11 4-Square Fluent Logo */}
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex items-center justify-center"
            >
              {/* Soft logo aura */}
              <div className="absolute -inset-6 rounded-3xl bg-[#0078d7]/20 blur-2xl pointer-events-none" />

              {/* 2x2 Grid of Fluent Blue Tiles */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 w-20 h-20 sm:w-24 sm:h-24 p-1">
                {/* Top-Left Tile (Vibrant Sky Blue) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="rounded-[3px] sm:rounded-[4px] bg-gradient-to-br from-[#00d2ff] via-[#00adef] to-[#0094e8] shadow-[0_2px_10px_rgba(0,173,239,0.4)] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/30" />
                </motion.div>

                {/* Top-Right Tile (Royal Blue) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                  className="rounded-[3px] sm:rounded-[4px] bg-gradient-to-br from-[#009bf2] via-[#0078d7] to-[#0063b1] shadow-[0_2px_10px_rgba(0,120,215,0.4)] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/20" />
                </motion.div>

                {/* Bottom-Left Tile (Ocean Blue) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="rounded-[3px] sm:rounded-[4px] bg-gradient-to-br from-[#00a2f8] via-[#008be3] to-[#0074c8] shadow-[0_2px_10px_rgba(0,139,227,0.4)] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/25" />
                </motion.div>

                {/* Bottom-Right Tile (Sapphire Blue) */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                  className="rounded-[3px] sm:rounded-[4px] bg-gradient-to-br from-[#0074cf] via-[#005fa3] to-[#004880] shadow-[0_2px_10px_rgba(0,95,163,0.4)] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/15" />
                </motion.div>
              </div>
            </motion.div>

            {/* Authentic Windows 11 Orbital Dots Ring Spinner */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-center justify-center space-y-6"
            >
              {/* Windows 11 Ring of 5 Dots */}
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                {[0, 1, 2, 3, 4].map((index) => (
                  <div
                    key={index}
                    className="absolute inset-0 flex items-start justify-center"
                    style={{
                      animation: `win11Orbit 3.6s cubic-bezier(0.5, 0.2, 0, 1) infinite`,
                      animationDelay: `${index * 0.16}s`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.85),0_0_14px_rgba(0,174,255,0.6)]"
                      style={{
                        transform: 'translateY(1px)',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Status Typography */}
              <motion.div
                key={statusMessage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35 }}
                className="text-center space-y-1.5 px-4"
              >
                <p className="text-xs sm:text-sm font-medium tracking-wide text-neutral-300 antialiased font-sans">
                  {statusMessage}
                </p>
                <p className="text-[10px] sm:text-xs text-neutral-500 font-mono tracking-wider uppercase">
                  Presence OS • PM Shri KV Vigyan Vihar
                </p>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom subtle hint */}
          <div className="absolute bottom-6 text-[10px] text-neutral-600 tracking-wider">
            Click anywhere to skip
          </div>

          {/* Authentic Windows 11 Orbital Keyframes Style */}
          <style>{`
            @keyframes win11Orbit {
              0% {
                transform: rotate(0deg);
                opacity: 1;
                animation-timing-function: cubic-bezier(0.5, 0.2, 0, 1);
              }
              38% {
                transform: rotate(270deg);
                opacity: 1;
                animation-timing-function: cubic-bezier(0.2, 0, 0.5, 1);
              }
              68% {
                transform: rotate(720deg);
                opacity: 1;
                animation-timing-function: cubic-bezier(0.3, 0.2, 0, 1);
              }
              78% {
                transform: rotate(760deg);
                opacity: 0.7;
              }
              100% {
                transform: rotate(1080deg);
                opacity: 0;
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashAnimation;
