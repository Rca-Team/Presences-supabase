import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, ShieldCheck, Bell, PhoneCall, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AndroidWidgetItem, PALETTE_CLASSES } from './types';
import { backgroundPushService } from '@/services/BackgroundPushService';
import { useToast } from '@/hooks/use-toast';

interface EmergencyAlertWidgetProps {
  widget: AndroidWidgetItem;
  classNameStr?: string;
}

export const EmergencyAlertWidget: React.FC<EmergencyAlertWidgetProps> = ({
  widget,
  classNameStr = '10-A',
}) => {
  const palette = PALETTE_CLASSES[widget.palette] || PALETTE_CLASSES['dynamic-rose'];
  const { toast } = useToast();
  const [isAlerting, setIsAlerting] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState<string | null>(null);

  const handleSendEmergencyAlert = async () => {
    setIsAlerting(true);
    try {
      await backgroundPushService.sendStrangerAlert(`Class ${classNameStr} Emergency Panic`);
      const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setLastAlertTime(time);
      toast({
        title: '🚨 Emergency Alert Broadcasted',
        description: `Principal and Campus Security notified from Class ${classNameStr}.`,
        variant: 'destructive',
      });
    } catch {
      toast({ title: 'Alert Failed', description: 'Could not dispatch broadcast', variant: 'destructive' });
    } finally {
      setIsAlerting(false);
    }
  };

  return (
    <div className="flex flex-col justify-between h-full gap-3">
      {/* Top Status */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400">
              Campus Security: Online
            </span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-foreground mt-1 tracking-tight">
            Security & Emergency Broadcast
          </h3>
          <p className="text-xs text-muted-foreground font-medium">
            Direct push dispatch to Principal & Gate Security
          </p>
        </div>

        <div className="h-12 w-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
          <ShieldAlert className="h-6 w-6" />
        </div>
      </div>

      {/* Action Row */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] font-mono text-muted-foreground">
          {lastAlertTime ? `Last Alert Sent: ${lastAlertTime}` : 'All Gate Turnstiles Secured'}
        </span>

        <button
          type="button"
          onClick={handleSendEmergencyAlert}
          disabled={isAlerting}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs shadow-md shadow-rose-500/25 transition-all disabled:opacity-50 shrink-0"
        >
          <Bell className={`h-4 w-4 ${isAlerting ? 'animate-bounce' : ''}`} />
          {isAlerting ? 'Broadcasting...' : '1-Tap Security Alert'}
        </button>
      </div>
    </div>
  );
};
