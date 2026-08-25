import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  enabled?: boolean;
  threshold?: number;
}

export const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  children,
  className,
  enabled = true,
  threshold = 80,
}) => {
  const {
    containerRef,
    isRefreshing,
    pullDistance,
    pullProgress,
    isReady,
    isPulling,
  } = usePullToRefresh({ onRefresh, threshold, enabled });

  return (
    <div ref={containerRef} className={cn('relative overflow-auto', className)}>
      {/* Pull indicator */}
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{
          opacity: isPulling || isRefreshing ? 1 : 0,
          y: isPulling ? Math.min(pullDistance - 40, 40) : isRefreshing ? 20 : -40,
        }}
        className="absolute top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      >
        <motion.div
          animate={{
            scale: isReady ? 1.1 : 1,
            backgroundColor: isReady ? 'rgb(59 130 246)' : 'rgb(148 163 184)',
          }}
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg"
        >
          {isRefreshing ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </motion.div>
          ) : (
            <motion.div
              animate={{ rotate: pullProgress * 180 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <ArrowDown className="w-5 h-5 text-white" />
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Content wrapper with pull effect */}
      <motion.div
        animate={{
          y: isPulling ? Math.min(pullDistance * 0.5, 40) : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="min-h-full"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default PullToRefresh;
