import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { useCursorDragScroll } from '@/hooks/useCursorDragScroll';

interface RoyalScrollContextType {
  lenis: Lenis | null;
  scrollTo: (target: string | HTMLElement | number, options?: Parameters<Lenis['scrollTo']>[1]) => void;
}

const RoyalScrollContext = createContext<RoyalScrollContextType>({
  lenis: null,
  scrollTo: () => {},
});

export const useRoyalScroll = () => useContext(RoyalScrollContext);

interface RoyalScrollProviderProps {
  children: React.ReactNode;
}

export const RoyalScrollProvider: React.FC<RoyalScrollProviderProps> = ({ children }) => {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const { liteMode } = usePerformanceMode();

  // Enable universal cursor drag-to-scroll across all pages and containers
  useCursorDragScroll();

  // Full-screen / heavy camera routes that shouldn't bind global wheel interception
  const isExcludedRoute = location.pathname.startsWith('/gate') || location.pathname.startsWith('/__admin');

  // Initialize Lenis smooth scroll engine (Desktop wheel / trackpad) & Native Touch on Mobile
  useEffect(() => {
    const isTouchOnly =
      window.matchMedia('(hover: none) and (pointer: coarse)').matches &&
      !window.matchMedia('(hover: hover)').matches;

    // Synchronize top luminescence progress bar on all devices
    const onNativeScroll = () => {
      if (!progressBarRef.current) return;
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const maxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;
      const pct = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
      progressBarRef.current.style.transform = `scaleX(${pct})`;
      progressBarRef.current.style.opacity = pct > 0.005 ? '1' : '0';
    };

    window.addEventListener('scroll', onNativeScroll, { passive: true });

    // If user prefers reduced motion, low-power mode, is on touch screen, or full-screen gate mode, bypass Lenis
    if (prefersReducedMotion || liteMode || isExcludedRoute || isTouchOnly) {
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
        setLenisInstance(null);
      }
      return () => {
        window.removeEventListener('scroll', onNativeScroll);
      };
    }

    const lenis = new Lenis({
      duration: 0.85,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -8 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 0, // Never hijack native touch gestures
      infinite: false,
    });

    lenisRef.current = lenis;
    setLenisInstance(lenis);

    lenis.on('scroll', (e: { progress: number; scroll: number; limit: number }) => {
      if (progressBarRef.current) {
        const pct = Math.max(0, Math.min(1, e.progress || 0));
        progressBarRef.current.style.transform = `scaleX(${pct})`;
        progressBarRef.current.style.opacity = pct > 0.005 ? '1' : '0';
      }
    });

    let rafId: number;
    let isRunning = true;

    function raf(time: number) {
      if (!isRunning) return;
      if (document.visibilityState === 'visible') {
        lenis.raf(time);
      }
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !isRunning) {
        isRunning = true;
        rafId = requestAnimationFrame(raf);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isRunning = false;
      window.removeEventListener('scroll', onNativeScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
      setLenisInstance(null);
    };
  }, [prefersReducedMotion, liteMode, isExcludedRoute]);

  // Handle route changes: notify Lenis to recalibrate document scroll dimensions
  useEffect(() => {
    if (lenisRef.current && !isExcludedRoute) {
      requestAnimationFrame(() => {
        lenisRef.current?.resize();
      });
    }
  }, [location.pathname, isExcludedRoute]);

  const scrollTo = (target: string | HTMLElement | number, options?: Parameters<Lenis['scrollTo']>[1]) => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, {
        offset: 0,
        immediate: false,
        duration: 1.2,
        ...options,
      });
    } else {
      if (typeof target === 'number') {
        window.scrollTo({ top: target, behavior: 'smooth' });
      } else if (typeof target === 'string') {
        const el = document.querySelector(target);
        el?.scrollIntoView({ behavior: 'smooth' });
      } else if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <RoyalScrollContext.Provider value={{ lenis: lenisInstance, scrollTo }}>
      {/* Royal Top Scroll Luminescence Bar */}
      <div
        className="pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-transparent overflow-hidden"
        aria-hidden="true"
      >
        <div
          ref={progressBarRef}
          className="h-full w-full origin-left transition-opacity duration-300 ease-out"
          style={{
            transform: 'scaleX(0)',
            opacity: 0,
            background:
              'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--neon-cyan, 191 82% 60%)) 40%, hsl(var(--neon-pink, 318 70% 64%)) 75%, hsl(38 96% 58%) 100%)',
            boxShadow: '0 0 12px hsl(var(--primary) / 0.8), 0 0 24px hsl(var(--neon-cyan, 191 82% 60%) / 0.5)',
          }}
        />
      </div>
      {children}
    </RoyalScrollContext.Provider>
  );
};

export default RoyalScrollProvider;
