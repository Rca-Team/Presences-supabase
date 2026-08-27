import React from 'react';
import { motion, useReducedMotion, Variants } from 'framer-motion';
import { cn } from '@/lib/utils';

export type RoyalRevealEffect = 'fade-up' | 'fade-in' | 'scale-subtle' | 'slide-left' | 'slide-right' | 'card-lift';

interface RoyalRevealProps {
  children: React.ReactNode;
  className?: string;
  effect?: RoyalRevealEffect;
  delay?: number;
  duration?: number;
  threshold?: number;
  staggerChildren?: number;
  once?: boolean;
}

const revealVariants: Record<RoyalRevealEffect, Variants> = {
  'fade-up': {
    hidden: { opacity: 0, y: 22 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.65,
        ease: [0.22, 1, 0.36, 1], // Royal luxury cubic ease
      },
    },
  },
  'fade-in': {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  },
  'scale-subtle': {
    hidden: { opacity: 0, scale: 0.96, y: 12 },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  },
  'slide-left': {
    hidden: { opacity: 0, x: -24 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  },
  'slide-right': {
    hidden: { opacity: 0, x: 24 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.6,
        ease: [0.22, 1, 0.36, 1],
      },
    },
  },
  'card-lift': {
    hidden: { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  },
};

export const RoyalReveal: React.FC<RoyalRevealProps> = ({
  children,
  className = '',
  effect = 'fade-up',
  delay = 0,
  duration,
  threshold = 0.12,
  staggerChildren,
  once = true,
}) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const baseVariant = revealVariants[effect];
  const customVariant: Variants = {
    hidden: baseVariant.hidden,
    visible: {
      ...baseVariant.visible,
      transition: {
        ...(typeof baseVariant.visible === 'object' && 'transition' in baseVariant.visible
          ? (baseVariant.visible.transition as object)
          : {}),
        delay,
        ...(duration ? { duration } : {}),
        ...(staggerChildren ? { staggerChildren, delayChildren: delay } : {}),
      },
    },
  };

  return (
    <motion.div
      variants={customVariant}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: '0px 0px -40px 0px', amount: threshold }}
      className={cn('royal-reveal-item', className)}
    >
      {children}
    </motion.div>
  );
};

export const RoyalStaggerGroup: React.FC<{
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}> = ({ children, className = '', stagger = 0.08, delay = 0 }) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '0px 0px -50px 0px', amount: 0.1 }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: stagger,
            delayChildren: delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const RoyalStaggerItem: React.FC<{
  children: React.ReactNode;
  className?: string;
  yOffset?: number;
}> = ({ children, className = '', yOffset = 18 }) => {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: yOffset },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.55,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export default RoyalReveal;
