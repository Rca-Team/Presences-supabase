import { motion, useReducedMotion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Presence Signature Electric Blue Opening & Dock Pop-Out Transition
 * Smooth expansion tailored for desktop and mobile with ambient blue aura illumination.
 */
const presenceBluePopVariants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 18,
    filter: 'blur(4px)',
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
    scale: 0.97,
    y: 10,
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
    scale: 0.96,
    y: 14,
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
      variants={prefersReducedMotion ? undefined : presenceBluePopVariants}
      initial={prefersReducedMotion ? false : 'initial'}
      animate={prefersReducedMotion ? undefined : 'animate'}
      exit={prefersReducedMotion ? undefined : 'exit'}
      className={`relative ${className}`}
      style={{
        transformOrigin: '50% 88%',
        willChange: prefersReducedMotion ? 'auto' : 'opacity, transform, filter',
      }}
    >
      {/* Subtle Electric Blue Ambient Launch Glow for Desktop */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-30 dark:opacity-20"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 10%, rgba(37, 99, 235, 0.15), transparent 75%)',
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
