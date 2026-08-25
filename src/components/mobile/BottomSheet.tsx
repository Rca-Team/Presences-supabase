import React, { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showHandle?: boolean;
  snapPoints?: number[];
  initialSnap?: number;
  className?: string;
}

const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  showHandle = true,
  snapPoints = [0.5, 0.9],
  initialSnap = 0,
  className
}) => {
  const controls = useDragControls();
  const [currentSnap, setCurrentSnap] = React.useState(initialSnap);
  const { trigger } = useHapticFeedback();

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    if (velocity > 500 || offset > 200) {
      trigger('light');
      onClose();
    } else if (velocity < -500 && currentSnap < snapPoints.length - 1) {
      trigger('light');
      setCurrentSnap(currentSnap + 1);
    } else if (velocity > 200 && currentSnap > 0) {
      trigger('light');
      setCurrentSnap(currentSnap - 1);
    }
  };

  const sheetHeight = `${snapPoints[currentSnap] * 100}vh`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%', scale: 0.95 }}
            animate={{ 
              y: 0, 
              scale: 1,
              height: sheetHeight,
              transition: { type: 'spring', stiffness: 300, damping: 30 }
            }}
            exit={{ 
              y: '100%', 
              scale: 0.95,
              transition: { duration: 0.3 }
            }}
            drag="y"
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50",
              "bg-background/95 backdrop-blur-2xl rounded-t-[2rem]",
              "border-t border-white/20 dark:border-white/10",
              "flex flex-col",
              "touch-pan-y",
              className
            )}
            style={{
              boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.2), 0 -5px 20px rgba(0, 0, 0, 0.1)'
            }}
          >
            {/* Handle with glow effect */}
            {showHandle && (
              <motion.div 
                className="flex justify-center pt-4 pb-2 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => controls.start(e)}
                whileTap={{ scale: 0.95 }}
              >
                <motion.div 
                  className="w-14 h-1.5 rounded-full bg-muted-foreground/30"
                  whileHover={{ 
                    scaleX: 1.2,
                    backgroundColor: 'hsl(var(--ios-blue) / 0.5)'
                  }}
                  transition={{ type: 'spring', stiffness: 400 }}
                />
              </motion.div>
            )}

            {/* Header */}
            {(title || subtitle) && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: 'spring' }}
                className="flex items-center justify-between px-6 py-4 border-b border-border/50"
              >
                <div>
                  {title && (
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-muted-foreground">
                      {title}
                    </h2>
                  )}
                  {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
                </div>
                <motion.button
                  onClick={() => {
                    trigger('light');
                    onClose();
                  }}
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="w-10 h-10 rounded-full bg-muted/50 backdrop-blur-sm flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </motion.button>
              </motion.div>
            )}

            {/* Content with stagger animation */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 momentum-scroll"
            >
              {children}
            </motion.div>
            
            {/* Safe area padding */}
            <div className="safe-area-bottom" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default BottomSheet;