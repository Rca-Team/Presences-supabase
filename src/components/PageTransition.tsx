import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Solid, Zero-Glitch Page Transition
 * Maintains 100% opacity throughout navigation so there are no
 * flash/strobe/blink artifacts on route mount.
 */
export const PageTransition = ({ children, className = '' }: PageTransitionProps) => {
  return (
    <div className={`relative w-full ${className}`}>
      {children}
    </div>
  );
};

export const AnimatedSection = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();
  const { liteMode } = usePerformanceMode();

  if (prefersReducedMotion || liteMode) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0.96, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
