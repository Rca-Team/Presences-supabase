import React from 'react';
import { cn } from '@/lib/utils';
import { KVS_LOGO_URL, PRESENCES_LOGO_URL } from '@/constants/schoolConfig';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  showKvsLogo?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className, size = 'md', animate = false, showKvsLogo = true }) => {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl'
  };

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11'
  };

  const kvsIconSizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  return (
    <div className={cn("font-semibold tracking-tight flex items-center gap-2 sm:gap-2.5", sizeClasses[size], className)}>
      <div className="flex items-center gap-1.5 shrink-0">
        <img 
          src={PRESENCES_LOGO_URL} 
          alt="Presence AI Logo" 
          className={cn("object-contain rounded-lg drop-shadow-sm", iconSizes[size])}
        />
        {showKvsLogo && (
          <img 
            src={KVS_LOGO_URL} 
            alt="Kendriya Vidyalaya Sangathan Logo" 
            className={cn("object-contain rounded-md bg-white/90 p-0.5 shadow-xs border border-amber-400/30", kvsIconSizes[size])}
          />
        )}
      </div>
      <div className="flex flex-col leading-none">
        <div className="flex items-center gap-1.5">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 font-black tracking-wide">
            PRESENCE
          </span>
          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
            KV NFC
          </span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground tracking-[0.14em] font-medium uppercase mt-0.5">
          PM SHRI KV NFC VIGYAN VIHAR
        </span>
      </div>
    </div>
  );
};

export default Logo;

