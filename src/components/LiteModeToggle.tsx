import React from 'react';
import { usePerformanceMode } from '@/hooks/usePerformanceMode';
import { Zap, Feather, WifiOff, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface LiteModeToggleProps {
  variant?: 'pill' | 'button' | 'icon' | 'badge';
  className?: string;
}

export const LiteModeToggle: React.FC<LiteModeToggleProps> = ({
  variant = 'pill',
  className = '',
}) => {
  const { liteMode, preference, toggleLite, signals } = usePerformanceMode();

  const statusText = liteMode
    ? 'Lite Mode Active'
    : 'Full Visual Mode';

  const detailsText = liteMode
    ? `Battery & GPU optimized${signals.slowNetwork ? ` · Slow network (${signals.effectiveType})` : ''}`
    : 'Full visual effects & 3D neural orbs active';

  if (variant === 'badge') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleLite}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                liteMode
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
              } ${className}`}
            >
              {liteMode ? (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Lite Mode</span>
                </>
              ) : (
                <>
                  <Feather className="w-3.5 h-3.5" />
                  <span>Standard</span>
                </>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p className="font-semibold">{statusText}</p>
            <p className="text-muted-foreground">{detailsText}</p>
            <p className="mt-1 text-[10px] text-primary">Click to toggle</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'icon') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLite}
              className={`h-9 w-9 rounded-full ${className}`}
              aria-label="Toggle Lite Mode"
            >
              {liteMode ? (
                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
              ) : (
                <Feather className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <p className="font-semibold">{statusText}</p>
            <p className="text-muted-foreground">{detailsText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-2xl border border-border/80 bg-card/80 px-3 py-1.5 text-xs text-foreground shadow-sm ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {liteMode ? (
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        ) : (
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
        )}
        <span className="font-medium">{statusText}</span>
      </div>

      <button
        onClick={toggleLite}
        className="ml-1 text-[11px] font-semibold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        {liteMode ? 'Switch to Full' : 'Switch to Lite'}
      </button>
    </div>
  );
};

export default LiteModeToggle;
