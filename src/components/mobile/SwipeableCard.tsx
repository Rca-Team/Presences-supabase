import React, { ReactNode, useState } from 'react';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check, X, Trash2, Edit, Star } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  leftColor?: string;
  rightColor?: string;
  className?: string;
  swipeThreshold?: number;
  disabled?: boolean;
}

const SwipeableCard: React.FC<SwipeableCardProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  leftColor = 'from-ios-red to-ios-pink',
  rightColor = 'from-ios-green to-ios-mint',
  className,
  swipeThreshold = 100,
  disabled = false
}) => {
  const { trigger } = useHapticFeedback();
  const [isDragging, setIsDragging] = useState(false);
  const x = useMotionValue(0);
  
  // Transform values for animations
  const opacity = useTransform(x, [-200, 0, 200], [0.7, 1, 0.7]);
  const scale = useTransform(x, [-200, 0, 200], [0.95, 1, 0.95]);
  const rotate = useTransform(x, [-200, 0, 200], [-3, 0, 3]);
  
  // Left side (swipe right to reveal)
  const leftIconScale = useTransform(x, [0, swipeThreshold], [0.3, 1.3]);
  const leftIconRotate = useTransform(x, [0, swipeThreshold], [-90, 0]);
  const leftOpacity = useTransform(x, [0, 30, swipeThreshold], [0, 0.5, 1]);
  const leftBgOpacity = useTransform(x, [0, swipeThreshold / 2], [0, 1]);
  
  // Right side (swipe left to reveal)
  const rightIconScale = useTransform(x, [0, -swipeThreshold], [0.3, 1.3]);
  const rightIconRotate = useTransform(x, [0, -swipeThreshold], [90, 0]);
  const rightOpacity = useTransform(x, [0, -30, -swipeThreshold], [0, 0.5, 1]);
  const rightBgOpacity = useTransform(x, [0, -swipeThreshold / 2], [0, 1]);

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset < -swipeThreshold || velocity < -500) {
      trigger('medium');
      onSwipeLeft?.();
    } else if (offset > swipeThreshold || velocity > 500) {
      trigger('medium');
      onSwipeRight?.();
    }
  };
  
  const handleDrag = (_: any, info: PanInfo) => {
    // Trigger haptic at threshold
    if (Math.abs(info.offset.x) === swipeThreshold) {
      trigger('light');
    }
  };

  return (
    <div className={cn("relative overflow-hidden rounded-3xl", className)}>
      {/* Left action background (swipe right) */}
      <motion.div
        style={{ opacity: leftBgOpacity }}
        className={cn(
          "absolute inset-0 flex items-center justify-start pl-8",
          "bg-gradient-to-r",
          rightColor
        )}
      >
        <motion.div 
          style={{ scale: leftIconScale, rotate: leftIconRotate, opacity: leftOpacity }}
          className="flex flex-col items-center gap-1"
        >
          {rightAction || <Check className="w-8 h-8 text-white drop-shadow-lg" />}
          <span className="text-xs font-semibold text-white/90">Approve</span>
        </motion.div>
      </motion.div>

      {/* Right action background (swipe left) */}
      <motion.div
        style={{ opacity: rightBgOpacity }}
        className={cn(
          "absolute inset-0 flex items-center justify-end pr-8",
          "bg-gradient-to-r",
          leftColor
        )}
      >
        <motion.div 
          style={{ scale: rightIconScale, rotate: rightIconRotate, opacity: rightOpacity }}
          className="flex flex-col items-center gap-1"
        >
          {leftAction || <X className="w-8 h-8 text-white drop-shadow-lg" />}
          <span className="text-xs font-semibold text-white/90">Delete</span>
        </motion.div>
      </motion.div>

      {/* Main content */}
      <motion.div
        style={{ x, opacity, scale, rotate }}
        drag={disabled ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileTap={{ cursor: 'grabbing' }}
        className={cn(
          "relative z-10 bg-card touch-pan-y rounded-3xl",
          isDragging && "shadow-2xl"
        )}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {children}
        
        {/* Swipe hint indicator */}
        <AnimatePresence>
          {!isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-1"
            >
              <motion.div
                animate={{ x: [-2, 2, -2] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="w-1 h-8 bg-muted-foreground/20 rounded-full"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default SwipeableCard;