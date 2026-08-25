import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className, size = 'md', animate = false }) => {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const iconSizes = {
    sm: 'w-9 h-9',
    md: 'w-12 h-12',
    lg: 'w-14 h-14'
  };

  return (
    <div className={cn("font-semibold tracking-tight flex items-center gap-2.5", sizeClasses[size], className)}>
      <img 
        src="/logo.png" 
        alt="Presence Logo" 
        className={cn("object-contain", iconSizes[size])}
      />
      <div className="flex flex-col leading-none">
        <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 font-bold tracking-wide">
          PRESENCE
        </span>
        <span className="text-[10px] text-muted-foreground tracking-[0.2em] font-normal uppercase mt-0.5">
          Smart School
        </span>
      </div>
    </div>
  );
};

export default Logo;
