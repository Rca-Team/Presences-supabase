import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo, useAnimation } from 'framer-motion';
import { 
  Hand, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp, 
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface GestureControlsProps {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  activeTab?: string;
  tabs?: { value: string; label: string; icon: React.ElementType }[];
  children?: React.ReactNode;
  enabled?: boolean;
}

const GESTURE_HINT_KEY = 'gesture_hint_shown';

const GestureControls: React.FC<GestureControlsProps> = ({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onDoubleTap,
  onLongPress,
  activeTab,
  tabs = [],
  children,
  enabled = true
}) => {
  const [showGestureHint, setShowGestureHint] = useState(false);
  const [gestureDirection, setGestureDirection] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimation();

  const currentTabIndex = tabs.findIndex(t => t.value === activeTab);

  const handleDragEnd = useCallback((event: any, info: PanInfo) => {
    if (!enabled) return;

    const threshold = 100;
    const velocity = 500;

    const { offset, velocity: v } = info;

    // Horizontal swipe
    if (Math.abs(offset.x) > Math.abs(offset.y)) {
      if (offset.x > threshold || v.x > velocity) {
        setGestureDirection('right');
        onSwipeRight?.();
      } else if (offset.x < -threshold || v.x < -velocity) {
        setGestureDirection('left');
        onSwipeLeft?.();
      }
    } 
    // Vertical swipe
    else {
      if (offset.y > threshold || v.y > velocity) {
        setGestureDirection('down');
        onSwipeDown?.();
      } else if (offset.y < -threshold || v.y < -velocity) {
        setGestureDirection('up');
        onSwipeUp?.();
      }
    }

    // Reset after animation
    setTimeout(() => {
      setGestureDirection(null);
      controls.start({ x: 0, y: 0 });
    }, 300);
  }, [enabled, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, controls]);

  const handleTapStart = useCallback(() => {
    if (!enabled) return;

    // Start long press timer
    longPressTimerRef.current = setTimeout(() => {
      onLongPress?.();
      setShowGestureHint(true);
      setTimeout(() => setShowGestureHint(false), 3000);
    }, 500);
  }, [enabled, onLongPress]);

  const handleTapEnd = useCallback(() => {
    if (!enabled) return;

    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Handle double tap
    setTapCount(prev => prev + 1);

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current);
    }

    tapTimerRef.current = setTimeout(() => {
      if (tapCount === 1) {
        onDoubleTap?.();
      }
      setTapCount(0);
    }, 300);
  }, [enabled, tapCount, onDoubleTap]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

  const getGestureIcon = () => {
    switch (gestureDirection) {
      case 'left': return <ChevronLeft className="w-8 h-8" />;
      case 'right': return <ChevronRight className="w-8 h-8" />;
      case 'up': return <ChevronUp className="w-8 h-8" />;
      case 'down': return <ChevronDown className="w-8 h-8" />;
      default: return null;
    }
  };

  const getNextTab = (direction: 'left' | 'right') => {
    if (tabs.length === 0) return null;
    
    const nextIndex = direction === 'right' 
      ? (currentTabIndex - 1 + tabs.length) % tabs.length
      : (currentTabIndex + 1) % tabs.length;
    
    return tabs[nextIndex];
  };

  return (
    <motion.div
      className="relative touch-pan-y"
      drag={enabled ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      onTapStart={handleTapStart}
      onTap={handleTapEnd}
      animate={controls}
    >
      {children}

      {/* Gesture Direction Indicator */}
      <AnimatePresence>
        {gestureDirection && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 flex items-center justify-center text-cyan-400"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.3 }}
            >
              {getGestureIcon()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gesture Help Overlay */}
      <AnimatePresence>
        {showGestureHint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowGestureHint(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 rounded-3xl border border-cyan-500/20 p-6 max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <Hand className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">Gesture Controls</h3>
                  <p className="text-sm text-slate-400">Navigate with gestures</p>
                </div>
              </div>

              <div className="space-y-4">
                {[
                  { icon: ChevronLeft, text: 'Swipe Left', desc: 'Next tab' },
                  { icon: ChevronRight, text: 'Swipe Right', desc: 'Previous tab' },
                  { icon: ChevronDown, text: 'Swipe Down', desc: 'Refresh data' },
                  { icon: Sparkles, text: 'Double Tap', desc: 'Switch method' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50"
                  >
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <p className="font-medium text-white">{item.text}</p>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <p className="text-center text-xs text-slate-500 mt-6">
                Tap anywhere to close
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default GestureControls;
