import React from 'react';
import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  max?: number;
  variant?: 'default' | 'dot';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
  children: React.ReactNode;
}

const positionClasses = {
  'top-right': '-top-1 -right-1',
  'top-left': '-top-1 -left-1',
  'bottom-right': '-bottom-1 -right-1',
  'bottom-left': '-bottom-1 -left-1',
};

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  max = 99,
  variant = 'default',
  position = 'top-right',
  className,
  children
}) => {
  if (count <= 0) {
    return <>{children}</>;
  }

  const displayCount = count > max ? `${max}+` : count;

  return (
    <div className={cn('relative inline-flex', className)}>
      {children}
      {variant === 'dot' ? (
        <span className={cn(
          'absolute h-3 w-3 rounded-full bg-destructive border-2 border-background',
          positionClasses[position]
        )} />
      ) : (
        <span className={cn(
          'absolute flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground border-2 border-background',
          positionClasses[position]
        )}>
          {displayCount}
        </span>
      )}
    </div>
  );
};
