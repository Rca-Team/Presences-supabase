import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Silky Smooth Standard Page Transition
 * Eliminates blank-frame blinking, reduces layout flicker,
 * and delivers fluid 120fps GPU compositor performance.
 */
const smoothPageVariants = {
  initial: {
    opacity: 0.9,
    y: 4,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: [0.16, 1, 0.3, 1], // Fluid cubic ease
    },
  },
  exit: {
    opacity: 0.95,
    transition: {
      duration: 0.12,
      ease: 'easeOut',
    },
  },
};

const smoothSectionVariants = {
  initial: {
    opacity: 0.92,
    y: 6,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

export const PageTransition = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();
  const { liteMode } = usePerformanceMode();

  const disableAnimation = prefersReducedMotion || liteMode;

  return (
    <motion.div
      variants={disableAnimation ? undefined : smoothPageVariants}
      initial={disableAnimation ? false : 'initial'}
      animate={disableAnimation ? undefined : 'animate'}
      exit={disableAnimation ? undefined : 'exit'}
      className={`relative w-full ${className}`}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
};

export const AnimatedSection = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();
  const { liteMode } = usePerformanceMode();

  const disableAnimation = prefersReducedMotion || liteMode;

  return (
    <motion.div
      variants={disableAnimation ? undefined : smoothSectionVariants}
      initial={disableAnimation ? false : 'initial'}
      animate={disableAnimation ? undefined : 'animate'}
      className={className}
      style={{ willChange: 'opacity, transform' }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
