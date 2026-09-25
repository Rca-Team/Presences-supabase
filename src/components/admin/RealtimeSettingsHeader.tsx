import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock, 
  Beaker, 
  Cpu, 
  Mail, 
  ShieldCheck, 
  Sparkles 
} from 'lucide-react';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

export const RealtimeSettingsHeader: React.FC = () => {
  const {
    settings,
    isLoading,
    isConnected,
    isSaving,
    lastSyncedAt,
    refetch,
  } = useRealtimeSettings();

  const formatTime12h = (time24: string) => {
    if (!time24) return '8:00 AM';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    const displayMinute = m < 10 ? `0${m}` : m;
    return `${displayHour}:${displayMinute} ${period}`;
  };

  const activeChannelsCount = [
    settings.notifyChannels.email,
    settings.notifyChannels.inapp,
    settings.notifyChannels.sms,
    settings.notifyChannels.whatsapp,
  ].filter(Boolean).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-emerald-500/10 p-4 shadow-sm backdrop-blur-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Connection status and live summary */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              )}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              {isConnected ? 'Realtime Cloud Sync Active' : 'Connecting to Realtime Channel...'}
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                isConnected
                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  : 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10'
              }`}
            >
              {isConnected ? 'Live WebSocket' : 'Reconnecting'}
            </Badge>
            {isSaving && (
              <Badge variant="secondary" className="text-[10px] animate-pulse">
                Saving updates...
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Any changes saved here instantly apply across all gate cameras, scanner terminals, and teacher tablets without page reloads.
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2 self-start md:self-center shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="h-8 rounded-xl text-xs font-semibold gap-1.5 bg-background/80 hover:bg-background border-border/80"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-primary ${isLoading ? 'animate-spin' : ''}`} />
            <span>Force Re-sync</span>
          </Button>
        </div>
      </div>

      {/* Quick Summary Pill Bar */}
      <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-muted-foreground block text-[10px]">Cutoff Time</span>
            <span className="font-bold text-foreground truncate">{formatTime12h(settings.cutoffTime)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
          <Beaker className="w-3.5 h-3.5 text-purple-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-muted-foreground block text-[10px]">Rollout Mode</span>
            <span className="font-bold text-foreground truncate">
              {settings.pilotEnabled ? `Pilot (${settings.pilotClass}-${settings.pilotSection})` : 'All School'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
          <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-muted-foreground block text-[10px]">Face AI Engine</span>
            <span className="font-bold text-foreground truncate">
              {settings.faceModelPreferred === 'ssd' ? 'SSD MobileNet' : 'TinyFace'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/40">
          <Mail className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-muted-foreground block text-[10px]">Alert Channels</span>
            <span className="font-bold text-foreground truncate">{activeChannelsCount} Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealtimeSettingsHeader;
