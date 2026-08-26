import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * iOS/macOS Dock-Style App Launch Pop-Out Spring Transition
 * Replaces instant blink with a fluid expansion originating from the navigation dock.
 */
const dockPopVariants = {
  initial: {
    opacity: 0,
    scale: 0.93,
    y: 22,
    filter: 'blur(3px)',
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25,
      mass: 0.85,
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 12,
    filter: 'blur(2px)',
    transition: {
      duration: 0.2,
      ease: [0.32, 0, 0.67, 0],
    },
  },
};

const popChildVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 16,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 320,
      damping: 24,
    },
  },
};

export const PageTransition = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : dockPopVariants}
      initial={prefersReducedMotion ? false : 'initial'}
      animate={prefersReducedMotion ? undefined : 'animate'}
      exit={prefersReducedMotion ? undefined : 'exit'}
      className={className}
      style={{
        transformOrigin: '50% 92%',
        willChange: prefersReducedMotion ? 'auto' : 'opacity, transform, filter',
      }}
    >
      {children}
    </motion.div>
  );
};

export const AnimatedSection = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : popChildVariants}
      className={className}
      style={{
        transformOrigin: '50% 50%',
        willChange: prefersReducedMotion ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
