import React from 'react';
import { cn } from '@/lib/utils';

interface PulseDotProps {
  status?: 'online' | 'offline' | 'warning' | 'processing';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusColors = {
  online: 'bg-green-500',
  offline: 'bg-red-500',
  warning: 'bg-yellow-500',
  processing: 'bg-blue-500',
};

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

export const PulseDot: React.FC<PulseDotProps> = ({
  status = 'online',
  size = 'md',
  className
}) => {
  return (
    <span className={cn('relative flex', sizeClasses[size], className)}>
      <span className={cn(
        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
        statusColors[status]
      )} />
      <span className={cn(
        'relative inline-flex h-full w-full rounded-full',
        statusColors[status]
      )} />
    </span>
  );
};
