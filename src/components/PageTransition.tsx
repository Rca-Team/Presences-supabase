import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Royal Page Transition — Silky smooth, crystal-clear page entrance
 * Designed for optimal 120fps compositor throughput with zero raster blur or layout shift.
 */
const royalPageVariants = {
  initial: {
    opacity: 0,
    y: 8,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1], // Royal luxury cubic ease
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
};

const royalSectionVariants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  },
};

export const PageTransition = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : royalPageVariants}
      initial={prefersReducedMotion ? false : 'initial'}
      animate={prefersReducedMotion ? undefined : 'animate'}
      exit={prefersReducedMotion ? undefined : 'exit'}
      className={`relative ${className}`}
    >
      {/* Subtle Royal Ambient Launch Glow */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-20 dark:opacity-10"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 10%, rgba(37, 99, 235, 0.12), transparent 75%)',
        }}
      />
      {children}
    </motion.div>
  );
};

export const AnimatedSection = ({ children, className = '' }: PageTransitionProps) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : royalSectionVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
