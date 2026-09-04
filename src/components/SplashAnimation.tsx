import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Code2,
  Cpu,
  Sparkles,
  Zap,
  Radio,
  GraduationCap,
  Binary,
  Wrench,
  CircuitBoard,
  Layers,
  Terminal,
} from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';

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

    const chordFrequencies = [369.99, 415.30, 554.37, 622.25, 830.61];
    const startTime = ctx.currentTime + 0.08;

    chordFrequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + index * 0.04);

      gain.gain.setValueAtTime(0.0001, startTime + index * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.04 / (index + 1), startTime + index * 0.04 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + index * 0.04);
      osc.stop(startTime + 2.3);
    });
  } catch {
    // Audio autoplays fail silently if user has not interacted
  }
};

export const SplashAnimation: React.FC<SplashAnimationProps> = ({
  onComplete,
  duration = 2600,
}) => {
  const { theme } = useTheme();
  const isDark =
    theme === 'dark' ||
    (typeof window !== 'undefined' &&
      window.document.documentElement.classList.contains('dark'));

  const [phase, setPhase] = useState<'logo' | 'spinning' | 'welcome' | 'exiting'>('logo');
  const [statusMessage, setStatusMessage] = useState('Starting Presence OS...');
  const hasTriggeredChime = useRef(false);

  useEffect(() => {
    if (!hasTriggeredChime.current) {
      hasTriggeredChime.current = true;
      playWindows11Chime();
    }

    const t1 = setTimeout(() => {
      setPhase('spinning');
      setStatusMessage('Initializing Robotics & AI Vision Modules...');
    }, 450);

    const t2 = setTimeout(() => {
      setPhase('welcome');
      setStatusMessage('Connecting ATL Innovation Lab & Smart Gate...');
    }, 1100);

    const t3 = setTimeout(() => {
      setPhase('exiting');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 300);
    }, duration);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [duration, onComplete]);

  const handleSkip = () => {
    setPhase('exiting');
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 120);
  };

  // Thematic holographic stickers
  const stickers = [
    {
      id: 'robotics',
      title: 'ROBOTICS LAB',
      subtitle: 'Autonomous Bots • ROS & Servos',
      icon: Bot,
      color: isDark ? 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-400' : 'from-emerald-50 to-teal-100 border-emerald-300 text-emerald-700',
      badge: 'ATL ROBOTICS',
      pos: 'top-10 left-6 sm:top-14 sm:left-12',
      rotation: -6,
      delay: 0.15,
    },
    {
      id: 'coding',
      title: 'AI & CODING CORE',
      subtitle: 'Python • ArcFace Vision • Neural Net',
      icon: Terminal,
      color: isDark ? 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-400' : 'from-cyan-50 to-blue-100 border-cyan-300 text-cyan-700',
      badge: 'CODE CLUB',
      pos: 'top-12 right-6 sm:top-16 sm:right-12',
      rotation: 5,
      delay: 0.25,
    },
    {
      id: 'atl-lab',
      title: 'PM SHRI ATL LAB',
      subtitle: 'Tinkering • 3D Print • IoT Sensors',
      icon: Sparkles,
      color: isDark ? 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-400' : 'from-amber-50 to-orange-100 border-amber-300 text-amber-700',
      badge: 'INNOVATION HUB',
      pos: 'bottom-16 left-6 sm:bottom-20 sm:left-14',
      rotation: 4,
      delay: 0.35,
    },
    {
      id: 'stem',
      title: 'SMART BIOMETRICS',
      subtitle: '3D Neural Mesh • Gate Vision',
      icon: CircuitBoard,
      color: isDark ? 'from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-400' : 'from-purple-50 to-indigo-100 border-purple-300 text-purple-700',
      badge: 'STEM 2026',
      pos: 'bottom-16 right-6 sm:bottom-20 sm:right-14',
      rotation: -5,
      delay: 0.45,
    },
  ];

  return (
    <AnimatePresence>
      {phase !== 'exiting' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.02,
            transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
          }}
          onClick={handleSkip}
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden cursor-pointer transition-colors duration-500 ${
            isDark
              ? 'bg-[#04060d] text-white'
              : 'bg-[#f4f7fb] text-slate-900'
          }`}
        >
          {/* Subtle Ambient Radial Lighting Nebula */}
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-700"
            style={{
              background: isDark
                ? 'radial-gradient(circle 650px at 50% 45%, rgba(0, 168, 255, 0.16) 0%, rgba(99, 102, 241, 0.08) 45%, transparent 75%)'
                : 'radial-gradient(circle 650px at 50% 45%, rgba(0, 140, 255, 0.14) 0%, rgba(147, 51, 234, 0.08) 50%, transparent 75%)',
            }}
          />

          {/* Blueprint Circuit Matrix Grid Lines */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.25]"
            style={{
              backgroundImage: isDark
                ? `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`
                : `linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />

          {/* Floating Thematic Hologram Stickers (Robotics, Coding, ATL Lab, Biometrics) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {stickers.map((s) => {
              const IconComp = s.icon;
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, scale: 0.7, y: 15 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: [0, -8, 0],
                  }}
                  transition={{
                    opacity: { duration: 0.6, delay: s.delay },
                    scale: { duration: 0.6, delay: s.delay },
                    y: {
                      duration: 3.5 + s.delay * 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    },
                  }}
                  style={{ transform: `rotate(${s.rotation}deg)` }}
                  className={`absolute ${s.pos} hidden sm:flex items-center gap-3 p-3 rounded-2xl border backdrop-blur-xl bg-gradient-to-br shadow-2xl ${s.color}`}
                >
                  <div className={`p-2 rounded-xl border ${isDark ? 'bg-black/40 border-white/10' : 'bg-white/80 border-slate-200'}`}>
                    <IconComp className="h-5 w-5" />
                  </div>
                  <div className="space-y-0.5 pr-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black tracking-wider uppercase">{s.title}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full border bg-background/60">
                        {s.badge}
                      </span>
                    </div>
                    <p className={`text-[10px] font-medium font-mono ${isDark ? 'text-neutral-400' : 'text-slate-600'}`}>
                      {s.subtitle}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Central Hero Windows 11 Flow with Presence Logo */}
          <div className="relative z-10 flex flex-col items-center justify-center space-y-9 sm:space-y-11">
            {/* Center Presence Logo Capsule with Windows 11 Glow */}
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col items-center justify-center"
            >
              {/* Vibrant Logo Aura Backdrop */}
              <div
                className={`absolute -inset-10 rounded-full blur-3xl pointer-events-none transition-opacity duration-700 ${
                  isDark ? 'bg-cyan-500/20' : 'bg-blue-500/15'
                }`}
              />

              {/* Glassmorphic Logo Shield */}
              <div
                className={`relative p-5 sm:p-6 rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all duration-300 flex items-center justify-center ${
                  isDark
                    ? 'bg-slate-950/75 border-cyan-500/30 shadow-[0_16px_50px_-10px_rgba(0,180,255,0.3)]'
                    : 'bg-white/85 border-blue-400/30 shadow-[0_16px_50px_-10px_rgba(37,99,235,0.2)]'
                }`}
              >
                <img
                  src="/logo.png"
                  alt="Presence Logo"
                  className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-xl"
                />
              </div>

              {/* Title Typography */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="mt-4 text-center"
              >
                <div className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 font-black text-2xl sm:text-3xl tracking-widest">
                  PRESENCE
                </div>
                <div className="text-[11px] sm:text-xs font-bold tracking-[0.28em] uppercase text-muted-foreground mt-0.5">
                  SMART SCHOOL AUTOMATION
                </div>
              </motion.div>
            </motion.div>

            {/* Authentic Windows 11 Orbital Dots Ring Spinner */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col items-center justify-center space-y-6"
            >
              {/* Ring of 5 Orbiting Dots */}
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
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                        isDark
                          ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.9),0_0_14px_rgba(0,180,255,0.7)]'
                          : 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6),0_0_12px_rgba(59,130,246,0.5)]'
                      }`}
                      style={{
                        transform: 'translateY(1px)',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Cycling Status Typography */}
              <motion.div
                key={statusMessage}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35 }}
                className="text-center space-y-1 px-4 max-w-sm"
              >
                <p
                  className={`text-xs sm:text-sm font-semibold tracking-wide antialiased ${
                    isDark ? 'text-neutral-300' : 'text-slate-700'
                  }`}
                >
                  {statusMessage}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground font-mono">
                  <Sparkles className="h-3 w-3 text-cyan-500 animate-pulse" />
                  <span>PM Shri KV NFC Vigyan Vihar</span>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom Fast Skip / Mode Indicator Pill */}
          <div className="absolute bottom-6 flex items-center gap-3 text-[10px] text-muted-foreground tracking-wider">
            <span className="px-2 py-0.5 rounded-full border bg-background/50 font-mono">
              {isDark ? '🌙 Dark Mode Active' : '☀️ Light Mode Active'}
            </span>
            <span>• Tap anywhere to launch</span>
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
