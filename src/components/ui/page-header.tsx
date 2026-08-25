
import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string | ReactNode;
  description?: string;
  children?: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function PageHeader({ 
  title, 
  description, 
  children,
  className,
  icon
}: PageHeaderProps) {
  return (
    <div className={cn("mb-8 liquid-glass-surface liquid-glass-highlight p-5 md:p-7", className)}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="hidden sm:flex h-12 w-12 rounded-xl items-center justify-center bg-card/70 border border-border/60 shadow-sm">
              {icon}
            </div>
          )}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
            {description && (
              <p className="text-muted-foreground text-balance">{description}</p>
            )}
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
