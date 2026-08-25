import React from 'react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';

interface StatsCardSkeletonProps {
  count?: number;
}

export const StatsCardSkeleton: React.FC<StatsCardSkeletonProps> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="relative overflow-hidden rounded-xl border bg-card p-4 sm:p-5"
        >
          {/* Gradient overlay animation */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          
          <div className="relative space-y-3">
            {/* Icon skeleton */}
            <Skeleton className="h-10 w-10 rounded-xl" />
            
            {/* Label skeleton */}
            <Skeleton className="h-3 w-20" />
            
            {/* Value skeleton */}
            <Skeleton className="h-7 w-14" />
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default StatsCardSkeleton;
