import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

export const MobileSmartScroll: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const lastScrollY = useRef(0);
  const rafId = useRef<number | null>(null);
  const { trigger: haptic } = useHapticFeedback();

  useEffect(() => {
    // Only mount on touch / mobile devices
    const isMobile =
      window.innerWidth < 768 ||
      (window.matchMedia('(hover: none) and (pointer: coarse)').matches &&
        !window.matchMedia('(hover: hover)').matches);

    if (!isMobile) return;

    const onScroll = () => {
      if (rafId.current) return;

      rafId.current = requestAnimationFrame(() => {
        const currentY = window.scrollY || document.documentElement.scrollTop || 0;
        const maxScroll = (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight;

        const progress = maxScroll > 0 ? Math.min(100, Math.max(0, Math.round((currentY / maxScroll) * 100))) : 0;
        setScrollProgress(progress);

        // Visible after 300px
        setIsVisible(currentY > 300);
        rafId.current = null;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const scrollToTop = () => {
    haptic('light');
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 450, damping: 28 }}
          className="fixed bottom-[5.6rem] right-4 z-40 md:hidden pointer-events-auto"
        >
          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-1.5 rounded-full border border-primary/35 bg-background/85 px-3 py-2 text-xs font-bold text-foreground shadow-xl backdrop-blur-xl active:scale-95 transition-transform"
            aria-label="Scroll to top"
          >
            {/* Circular Mini Progress Ring */}
            <div className="relative flex h-4 w-4 items-center justify-center">
              <svg className="h-4 w-4 -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-muted/40"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-primary transition-[stroke-dasharray] duration-150"
                  strokeDasharray={`${scrollProgress}, 100`}
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
            </div>

            <ArrowUp className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[11px] font-bold text-primary">{scrollProgress}%</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileSmartScroll;
