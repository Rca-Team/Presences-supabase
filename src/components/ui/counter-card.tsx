import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface CounterCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: 'cyan' | 'purple' | 'blue' | 'pink' | 'green' | 'yellow' | 'red';
  className?: string;
}

export function CounterCard({ title, value, icon: Icon, color, className }: CounterCardProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    const duration = 2000;
    const increment = end / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [value]);

  const colorClasses = {
    cyan: 'from-cyan-500 to-blue-500 dark:shadow-cyan-500/20',
    purple: 'from-purple-500 to-pink-500 dark:shadow-purple-500/20',
    blue: 'from-blue-500 to-indigo-500 dark:shadow-blue-500/20',
    pink: 'from-pink-500 to-rose-500 dark:shadow-pink-500/20',
    green: 'from-green-500 to-emerald-500 dark:shadow-green-500/20',
    yellow: 'from-yellow-500 to-orange-500 dark:shadow-yellow-500/20',
    red: 'from-red-500 to-rose-500 dark:shadow-red-500/20',
  };

  const iconColorClasses = {
    cyan: 'text-cyan-400',
    purple: 'text-purple-400',
    blue: 'text-blue-400',
    pink: 'text-pink-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };

  return (
    <Card className={cn(
      "relative overflow-hidden bg-card dark:bg-slate-900/60 border-border dark:border-slate-700/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1",
      colorClasses[color],
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-br opacity-0 dark:opacity-10" 
           style={{ backgroundImage: `linear-gradient(135deg, var(--tw-gradient-stops))` }} />
      
      <div className="relative p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
            <h3 className="text-4xl font-bold bg-gradient-to-r bg-clip-text text-transparent from-foreground to-foreground/70">
              {count}
            </h3>
          </div>
          
          <div className={cn(
            "p-4 rounded-2xl bg-gradient-to-br backdrop-blur-sm",
            `bg-${color}-500/10 dark:bg-${color}-500/20`
          )}>
            <Icon className={cn("h-8 w-8", iconColorClasses[color])} />
          </div>
        </div>
      </div>

      {/* Animated border */}
      <div className={cn(
        "absolute bottom-0 left-0 h-1 bg-gradient-to-r animate-shimmer",
        colorClasses[color]
      )} style={{ width: '100%' }} />
    </Card>
  );
}
