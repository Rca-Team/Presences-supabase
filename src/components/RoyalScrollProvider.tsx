import React, { createContext, useContext, useEffect, useRef } from 'react';

interface RoyalScrollContextType {
  lenis: null;
  scrollTo: (target: string | HTMLElement | number, options?: { offset?: number; immediate?: boolean }) => void;
}

const RoyalScrollContext = createContext<RoyalScrollContextType>({
  lenis: null,
  scrollTo: () => {},
});

export const useRoyalScroll = () => useContext(RoyalScrollContext);

interface RoyalScrollProviderProps {
  children: React.ReactNode;
}

/**
 * Universal Native High-Performance Scroll Engine
 * - 100% native hardware-accelerated compositor-thread scrolling
 * - Zero wheel / touchpad interception or scroll hijacking
 * - Supports nested scroll areas, modals, tables, and mobile touch flawlessly
 */
export const RoyalScrollProvider: React.FC<RoyalScrollProviderProps> = ({ children }) => {
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    onNativeScroll();

    return () => {
      window.removeEventListener('scroll', onNativeScroll);
    };
  }, []);

  const scrollTo = (target: string | HTMLElement | number, options?: { offset?: number; immediate?: boolean }) => {
    const behavior: ScrollBehavior = options?.immediate ? 'auto' : 'smooth';
    if (typeof target === 'number') {
      window.scrollTo({ top: target, behavior });
    } else if (typeof target === 'string') {
      const el = document.querySelector(target);
      if (el) {
        if (options?.offset) {
          const top = el.getBoundingClientRect().top + window.scrollY + options.offset;
          window.scrollTo({ top, behavior });
        } else {
          el.scrollIntoView({ behavior });
        }
      }
    } else if (target instanceof HTMLElement) {
      if (options?.offset) {
        const top = target.getBoundingClientRect().top + window.scrollY + options.offset;
        window.scrollTo({ top, behavior });
      } else {
        target.scrollIntoView({ behavior });
      }
    }
  };

  return (
    <RoyalScrollContext.Provider value={{ lenis: null, scrollTo }}>
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
