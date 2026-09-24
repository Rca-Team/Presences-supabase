import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Zap, Sparkles, Feather } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LiteModeToggleProps {
  variant?: 'pill' | 'button' | 'icon' | 'badge' | 'segmented';
  className?: string;
}

export const LiteModeToggle: React.FC<LiteModeToggleProps> = ({
  variant = 'pill',
  className = '',
}) => {
  const { liteMode, toggleLite, setPreference, signals } = usePerformanceMode();

  const statusText = liteMode ? 'Fast Mode Active' : 'Standard Mode Active';
  const detailsText = liteMode
    ? `Battery-saving mode for fast performance${signals.slowNetwork ? ` · Network: ${signals.effectiveType}` : ''}`
    : 'Standard mode with full graphics and animations';

  // 1. Segmented Slider Variant: [ ✦ Standard | ⚡ Fast Mode ]
  if (variant === 'segmented') {
    return (
      <div
        className={`relative inline-flex items-center p-1 rounded-2xl border border-border/80 bg-muted/40 backdrop-blur-md shadow-xs select-none touch-manipulation ${className}`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreference('off');
          }}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[38px] sm:min-h-[32px] rounded-xl text-xs font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 ${
            !liteMode ? 'text-primary-foreground font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Switch to Standard Mode"
          title="Switch to Standard Mode"
        >
          {!liteMode && (
            <motion.div
              layoutId="mode-segmented-active"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 shadow-md shadow-blue-500/25 pointer-events-none"
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
            />
          )}
          <Sparkles className="w-3.5 h-3.5 relative z-10 pointer-events-none shrink-0" />
          <span className="relative z-10 pointer-events-none">Standard</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreference('on');
          }}
          className={`relative z-10 flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 sm:py-1.5 min-h-[38px] sm:min-h-[32px] rounded-xl text-xs font-semibold transition-all cursor-pointer touch-manipulation active:scale-95 ${
            liteMode ? 'text-amber-950 dark:text-amber-950 font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-label="Switch to Fast Mode"
          title="Switch to Fast Mode"
        >
          {liteMode && (
            <motion.div
              layoutId="mode-segmented-active"
              className="absolute inset-0 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 shadow-md shadow-amber-500/30 pointer-events-none"
              transition={{ type: 'spring', stiffness: 480, damping: 32 }}
            />
          )}
          <Zap className="w-3.5 h-3.5 relative z-10 fill-current pointer-events-none shrink-0" />
          <span className="relative z-10 pointer-events-none">Fast Mode</span>
        </button>
      </div>
    );
  }

  // 2. Animated Badge Variant (for Top Navbars)
  if (variant === 'badge') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              transition={{ type: 'spring', stiffness: 450, damping: 24 }}
              onClick={toggleLite}
              className={`relative overflow-hidden inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                liteMode
                  ? 'bg-amber-500/15 text-amber-500 border-amber-500/40 shadow-sm shadow-amber-500/20'
                  : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/15'
              } ${className}`}
            >
              {/* Subtle background animated pulse when in Lite mode */}
              {liteMode && (
                <motion.span
                  initial={{ opacity: 0.3, scale: 0.8 }}
                  animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.95, 1.05, 0.95] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 bg-amber-400/10 pointer-events-none rounded-full"
                />
              )}

              <AnimatePresence mode="wait">
                {liteMode ? (
                  <motion.div
                    key="badge-lite"
                    initial={{ scale: 0.5, rotate: -30, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.5, rotate: 30, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current text-amber-500 animate-pulse" />
                    <span>Fast Mode</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="badge-standard"
                    initial={{ scale: 0.5, rotate: 30, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={{ scale: 0.5, rotate: -30, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className="flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span>Standard</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p className="font-semibold">{statusText}</p>
            <p className="text-muted-foreground">{detailsText}</p>
            <p className="mt-1 text-[10px] text-primary font-medium">Click for animated switch</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // 3. Icon Button Variant
  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLite}
              className={`relative h-9 w-9 rounded-full ${className}`}
              aria-label="Toggle Lite Mode"
            >
              <AnimatePresence mode="wait">
                {liteMode ? (
                  <motion.div
                    key="icon-lite"
                    initial={{ scale: 0.6, rotate: -45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0.6, rotate: 45 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                  >
                    <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="icon-standard"
                    initial={{ scale: 0.6, rotate: 45 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0.6, rotate: -45 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 20 }}
                  >
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p className="font-semibold">{statusText}</p>
            <p className="text-muted-foreground">{detailsText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // 4. Default Interactive Pill Variant
  return (
    <motion.div
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`inline-flex items-center gap-2.5 rounded-2xl border border-border/80 bg-card/90 backdrop-blur-md px-3.5 py-1.5 text-xs text-foreground shadow-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-2.5 w-2.5 rounded-full transition-colors ${
            liteMode ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
          }`}
        />
        <span className="font-semibold">{statusText}</span>
      </div>

      <button
        onClick={toggleLite}
        className="ml-1 text-[11px] font-bold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        {liteMode ? 'Switch to Full' : 'Switch to Lite'}
      </button>
    </motion.div>
  );
};

export default LiteModeToggle;
