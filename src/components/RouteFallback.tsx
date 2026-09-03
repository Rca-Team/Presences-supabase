import React, { useEffect, useState } from 'react';

/**
 * RouteFallback — Smooth, zero-blink route transition placeholder
 * Prevents layout collapse, eliminates white/dark flashes, and displays
 * an ultra-smooth top laser progress bar.
 */
const RouteFallback: React.FC = () => {
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => {
    // Only show center indicator if chunk takes longer than 220ms (slow network)
    const t = window.setTimeout(() => setShowIndicator(true), 220);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="w-full min-h-[75vh] flex flex-col items-center justify-center relative overflow-hidden transition-opacity duration-200"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Top Laser Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] z-[99999] pointer-events-none overflow-hidden bg-primary/10">
        <div
          className="h-full w-2/5 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, hsl(var(--primary)), #06b6d4, transparent)',
            boxShadow: '0 0 14px hsl(var(--primary) / 0.8), 0 0 6px #06b6d4',
            animation: 'route-laser-sweep 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite',
          }}
        />
      </div>

      {/* Subtle Center Spinner only on slow network loads */}
      <div
        className={`flex flex-col items-center gap-3 transition-opacity duration-300 ${
          showIndicator ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping opacity-40" />
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <span className="text-xs font-medium text-muted-foreground tracking-wide font-mono">
          Loading view...
        </span>
      </div>

      <style>{`
        @keyframes route-laser-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
};

export default RouteFallback;
