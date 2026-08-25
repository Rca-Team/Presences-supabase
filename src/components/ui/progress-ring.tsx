import React from 'react';
import { cn } from '@/lib/utils';

interface ProgressRingProps {
  progress?: number;
  value?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  thickness?: number;
  showValue?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'destructive' | 'blue';
  className?: string;
  children?: React.ReactNode;
}

const sizeMap = {
  sm: 48,
  md: 72,
  lg: 120,
  xl: 160,
};

const colorMap = {
  primary: 'stroke-primary',
  success: 'stroke-green-500',
  warning: 'stroke-yellow-500',
  destructive: 'stroke-destructive',
  blue: 'stroke-blue-500',
};

export const ProgressRing: React.FC<ProgressRingProps> = ({
  progress,
  value,
  max = 100,
  size = 'md',
  thickness = 6,
  showValue = true,
  color = 'primary',
  className,
  children
}) => {
  // Support both 'progress' and 'value' props
  const actualValue = progress !== undefined ? progress : (value ?? 0);
  
  const dimension = sizeMap[size];
  const radius = (dimension - thickness * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(Math.max(actualValue / max, 0), 1);
  const offset = circumference - percentage * circumference;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={dimension}
        height={dimension}
        className="-rotate-90 transform"
      >
        {/* Background circle */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(colorMap[color], 'transition-all duration-500 ease-out')}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children ? children : showValue && (
          <span className={cn(
            'font-bold tabular-nums',
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-xl',
            size === 'xl' && 'text-3xl',
          )}>
            {Math.round(percentage * 100)}%
          </span>
        )}
      </div>
    </div>
  );
};
