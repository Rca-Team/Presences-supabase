import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Scan } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'dots' | 'bars' | 'pulse' | 'face-scan';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
};

const sizePx = { sm: 16, md: 32, lg: 48, xl: 64 };

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  variant = 'default',
  className
}) => {
  if (variant === 'dots') {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={cn(
              'rounded-full bg-primary',
              size === 'sm' && 'h-1.5 w-1.5',
              size === 'md' && 'h-2 w-2',
              size === 'lg' && 'h-3 w-3',
              size === 'xl' && 'h-4 w-4'
            )}
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'bars') {
    return (
      <div className={cn('flex items-end gap-1', sizeClasses[size], className)}>
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="w-1 bg-primary rounded-full"
            animate={{ height: ['30%', '80%', '30%'] }}
            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
            style={{ height: '30%' }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div className={cn('relative', sizeClasses[size], className)}>
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/20"
          animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/15"
          animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
        />
        <div className="relative rounded-full bg-primary h-full w-full" />
      </div>
    );
  }

  if (variant === 'face-scan') {
    const s = sizePx[size];
    return (
      <div className={cn('relative', className)} style={{ width: s, height: s }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/50"
        />
        <div className="absolute inset-[4px] rounded-full border border-muted flex items-center justify-center">
          <Scan className="w-1/2 h-1/2 text-primary" />
        </div>
      </div>
    );
  }

  // Default: modern orbital spinner
  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full border-2 border-muted border-t-primary"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-[3px] rounded-full border border-transparent border-b-primary/40"
      />
    </div>
  );
};

export const FullPageLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative">
        {/* Outer glow */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -inset-4 rounded-full bg-primary/10 blur-xl"
        />
        
        {/* Main spinner */}
        <div className="relative w-16 h-16">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-2 border-muted border-t-primary"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-1.5 rounded-full border border-transparent border-b-primary/50"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Scan className="w-6 h-6 text-primary" />
            </motion.div>
          </div>
        </div>
      </div>
      
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 text-sm text-muted-foreground"
      >
        {message}
      </motion.p>
      
      {/* Animated dots */}
      <div className="flex gap-1 mt-2">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-1 h-1 rounded-full bg-primary/50"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
};

export const CardLoader: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-4"
        >
          <div className="relative h-12 w-12 rounded-full bg-muted overflow-hidden">
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
              className="absolute inset-0 bg-gradient-to-r from-transparent via-background/50 to-transparent"
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="relative h-4 w-3/4 rounded bg-muted overflow-hidden">
              <motion.div
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-background/50 to-transparent"
              />
            </div>
            <div className="relative h-3 w-1/2 rounded bg-muted overflow-hidden">
              <motion.div
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 + 0.1 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-background/50 to-transparent"
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
