import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AnimatedNotificationBadgeProps {
  count: number;
  max?: number;
  variant?: 'default' | 'dot' | 'pulse';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
  children: React.ReactNode;
  onBounce?: boolean;
}

const positionClasses = {
  'top-right': '-top-1.5 -right-1.5',
  'top-left': '-top-1.5 -left-1.5',
  'bottom-right': '-bottom-1.5 -right-1.5',
  'bottom-left': '-bottom-1.5 -left-1.5',
};

export const AnimatedNotificationBadge: React.FC<AnimatedNotificationBadgeProps> = ({
  count,
  max = 99,
  variant = 'default',
  position = 'top-right',
  className,
  children,
  onBounce = true,
}) => {
  const [shouldBounce, setShouldBounce] = useState(false);
  const [prevCount, setPrevCount] = useState(count);

  useEffect(() => {
    if (count > prevCount && onBounce) {
      setShouldBounce(true);
      // Trigger haptic feedback on mobile
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      const timer = setTimeout(() => setShouldBounce(false), 600);
      return () => clearTimeout(timer);
    }
    setPrevCount(count);
  }, [count, prevCount, onBounce]);

  const displayCount = count > max ? `${max}+` : count;

  const bounceAnimation = {
    initial: { scale: 0, opacity: 0 },
    animate: shouldBounce
      ? {
          scale: [0, 1.4, 0.9, 1.1, 1],
          opacity: 1,
          rotate: [0, -10, 10, -5, 0],
        }
      : { scale: 1, opacity: 1 },
    exit: { scale: 0, opacity: 0 },
    transition: shouldBounce
      ? {
          type: 'tween',
          ease: 'easeOut',
          duration: 0.5,
        }
      : {
          type: 'spring',
          stiffness: 500,
          damping: 15,
        },
  };

  const pulseRingAnimation = {
    animate: {
      scale: [1, 1.5, 1],
      opacity: [0.5, 0, 0.5],
    },
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  };

  return (
    <div className={cn('relative inline-flex', className)}>
      {children}
      <AnimatePresence mode="wait">
        {count > 0 && (
          <>
            {/* Pulse ring for attention - using design tokens */}
            {variant !== 'dot' && (
              <motion.span
                {...pulseRingAnimation}
                className={cn(
                  'absolute rounded-full bg-destructive/50',
                  variant === 'default' ? 'min-w-[20px] h-5' : 'w-3 h-3',
                  positionClasses[position]
                )}
              />
            )}
            
            {variant === 'dot' ? (
              <motion.span
                {...bounceAnimation}
                className={cn(
                  'absolute w-3 h-3 rounded-full bg-gradient-to-br from-destructive to-destructive/80 border-2 border-background shadow-lg shadow-destructive/30',
                  positionClasses[position]
                )}
              />
            ) : variant === 'pulse' ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
                className={cn(
                  'absolute flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground border-2 border-background shadow-lg shadow-destructive/30',
                  positionClasses[position]
                )}
              >
                {displayCount}
              </motion.span>
            ) : (
              <motion.span
                key={count}
                {...bounceAnimation}
                className={cn(
                  'absolute flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full bg-gradient-to-br from-destructive to-destructive/80 text-destructive-foreground border-2 border-background shadow-lg shadow-destructive/30',
                  positionClasses[position]
                )}
              >
                <motion.span
                  key={`count-${count}`}
                  initial={{ y: -10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {displayCount}
                </motion.span>
              </motion.span>
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AnimatedNotificationBadge;
