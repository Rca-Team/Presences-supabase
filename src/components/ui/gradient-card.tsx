import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface GradientCardProps {
  title?: string;
  value?: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  gradient?: 'cyan' | 'purple' | 'green' | 'orange' | 'pink' | 'blue' | 'ios-blue' | 'ios-green' | 'ios-pink' | 'ios-purple';
  trend?: {
    value: number;
    positive: boolean;
  };
  className?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

const gradientMap = {
  cyan: 'from-cyan to-ios-blue',
  purple: 'from-violet to-ios-purple',
  green: 'from-ios-green to-ios-mint',
  orange: 'from-ios-orange to-ios-yellow',
  pink: 'from-ios-pink to-ios-purple',
  blue: 'from-ios-blue to-ios-purple',
  'ios-blue': 'from-ios-blue to-ios-purple',
  'ios-green': 'from-ios-green to-ios-mint',
  'ios-pink': 'from-ios-pink to-ios-orange',
  'ios-purple': 'from-ios-purple to-violet',
};

const borderMap = {
  cyan: 'border-cyan/40',
  purple: 'border-violet/40',
  green: 'border-ios-green/40',
  orange: 'border-ios-orange/40',
  pink: 'border-ios-pink/40',
  blue: 'border-ios-blue/40',
  'ios-blue': 'border-ios-blue/40',
  'ios-green': 'border-ios-green/40',
  'ios-pink': 'border-ios-pink/40',
  'ios-purple': 'border-ios-purple/40',
};

const glowMap = {
  cyan: 'hover:shadow-cyan/30',
  purple: 'hover:shadow-violet/30',
  green: 'hover:shadow-ios-green/30',
  orange: 'hover:shadow-ios-orange/30',
  pink: 'hover:shadow-ios-pink/30',
  blue: 'hover:shadow-ios-blue/30',
  'ios-blue': 'hover:shadow-ios-blue/40',
  'ios-green': 'hover:shadow-ios-green/40',
  'ios-pink': 'hover:shadow-ios-pink/40',
  'ios-purple': 'hover:shadow-ios-purple/40',
};

const iconBgMap = {
  cyan: 'bg-cyan/15 text-cyan',
  purple: 'bg-violet/15 text-violet',
  green: 'bg-ios-green/15 text-ios-green',
  orange: 'bg-ios-orange/15 text-ios-orange',
  pink: 'bg-ios-pink/15 text-ios-pink',
  blue: 'bg-ios-blue/15 text-ios-blue',
  'ios-blue': 'bg-ios-blue/15 text-ios-blue',
  'ios-green': 'bg-ios-green/15 text-ios-green',
  'ios-pink': 'bg-ios-pink/15 text-ios-pink',
  'ios-purple': 'bg-ios-purple/15 text-ios-purple',
};

const orbMap = {
  cyan: 'bg-cyan',
  purple: 'bg-violet',
  green: 'bg-ios-green',
  orange: 'bg-ios-orange',
  pink: 'bg-ios-pink',
  blue: 'bg-ios-blue',
  'ios-blue': 'bg-ios-blue',
  'ios-green': 'bg-ios-green',
  'ios-pink': 'bg-ios-pink',
  'ios-purple': 'bg-ios-purple',
};

export const GradientCard: React.FC<GradientCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient = 'blue',
  trend,
  className,
  onClick,
  children
}) => {
  // If children are provided, render as a simple gradient container
  if (children) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl bg-gradient-to-br shadow-xl transition-all duration-500 hover:shadow-2xl hover:-translate-y-2 hover:scale-[1.02]',
          gradientMap[gradient],
          glowMap[gradient],
          className
        )}
        onClick={onClick}
        style={{ transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
      >
        {children}
      </div>
    );
  }

  // Original card layout with title/value
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-3xl border bg-card p-6 cursor-pointer backdrop-blur-sm',
        'hover:-translate-y-2 hover:shadow-2xl hover:scale-[1.02]',
        borderMap[gradient],
        glowMap[gradient],
        className
      )}
      onClick={onClick}
      style={{ transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      {/* Background gradient */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-15 group-hover:opacity-25 transition-opacity duration-500',
        gradientMap[gradient]
      )} />
      
      {/* Animated glow orb */}
      <div className={cn(
        'absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl opacity-40 transition-all duration-500 group-hover:opacity-70 group-hover:scale-110',
        orbMap[gradient]
      )} />
      
      {/* Secondary animated orb */}
      <div className={cn(
        'absolute -left-4 -bottom-4 h-20 w-20 rounded-full blur-2xl opacity-20 transition-all duration-700 group-hover:opacity-40',
        orbMap[gradient]
      )} />
      
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            {title && (
              <p className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
                {title}
              </p>
            )}
            {value !== undefined && (
              <p className="mt-3 text-4xl font-bold tracking-tight animate-fade-in">
                {value}
              </p>
            )}
            {subtitle && (
              <p className="mt-2 text-xs text-muted-foreground font-medium">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                'mt-3 flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-full w-fit',
                trend.positive 
                  ? 'bg-ios-green/15 text-ios-green' 
                  : 'bg-ios-red/15 text-ios-red'
              )}>
                <span className="text-base">{trend.positive ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn(
              'rounded-2xl p-4 backdrop-blur-md transition-all duration-300 group-hover:scale-110',
              iconBgMap[gradient]
            )}>
              <Icon className="h-7 w-7" strokeWidth={2} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};