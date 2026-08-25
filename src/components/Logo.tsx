import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animate?: boolean;
  shine?: boolean;
  glow?: boolean;
}

const Logo: React.FC<LogoProps> = ({ 
  className, 
  size = 'md', 
  animate = false,
  shine = false,
  glow = false,
}) => {
  const sizeClasses = {
    sm: 'text-lg sm:text-xl',
    md: 'text-xl sm:text-2xl',
    lg: 'text-2xl sm:text-3xl',
    xl: 'text-3xl sm:text-4xl',
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <div className={cn("relative inline-flex items-center gap-2.5 font-semibold tracking-tight select-none", sizeClasses[size], className)}>
      {/* Ambient glowing backlight */}
      {glow && (
        <div 
          className="absolute -inset-2 rounded-2xl opacity-40 blur-xl pointer-events-none -z-10"
          style={{ background: 'radial-gradient(circle, hsl(var(--neon-blue) / 0.6) 0%, hsl(var(--neon-violet) / 0.4) 60%, transparent 80%)' }}
        />
      )}

      {/* Logo Emblem with specular reflection */}
      <div className="relative flex-shrink-0 flex items-center justify-center">
        <motion.img 
          src="/logo.png" 
          alt="Presence Logo" 
          className={cn("object-contain drop-shadow-[0_4px_12px_rgba(59,130,246,0.35)]", iconSizes[size])}
          animate={animate ? { rotate: [0, 360] } : undefined}
          transition={animate ? { duration: 20, repeat: Infinity, ease: "linear" } : undefined}
        />
      </div>

      {/* Typography with gradient & specular shine */}
      <div className="flex flex-col leading-none relative overflow-hidden">
        <div className="relative">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 font-extrabold tracking-wider drop-shadow-sm">
            PRESENCE
          </span>
          {/* Specular sine sweep */}
          {shine && (
            <motion.div
              className="absolute inset-0 w-1/2 -skew-x-12 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)',
              }}
              animate={{ x: ['-120%', '220%'] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
            />
          )}
        </div>
        <span className="text-[9px] sm:text-[10px] text-muted-foreground tracking-[0.25em] font-medium uppercase mt-0.5 opacity-90">
          Smart School AI
        </span>
      </div>
    </div>
  );
};

export default Logo;
