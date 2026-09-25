import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Clock, CheckCircle2, AlertCircle, MailWarning, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useRealtimeSettings } from '@/hooks/useRealtimeSettings';

const AutoNotificationScheduler: React.FC = () => {
  const { settings, isConnected } = useRealtimeSettings();
  const [isLoading, setIsLoading] = useState(false);
  const [isCutoffLoading, setIsCutoffLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [isPastCutoff, setIsPastCutoff] = useState(false);
  const [cutoffResult, setCutoffResult] = useState<{ absentCount?: number; emailsSent?: number; inAppSent?: number } | null>(null);

  const checkIfPastCutoff = (cutoff: string) => {
    if (!cutoff) return;
    const now = new Date();
    const [hours, minutes] = cutoff.split(':').map(Number);
    const cutoffDate = new Date();
    cutoffDate.setHours(hours || 0, minutes || 0, 0, 0);
    setIsPastCutoff(now > cutoffDate);
  };

  useEffect(() => {
    checkIfPastCutoff(settings.cutoffTime);

    // Check every 30 seconds if past cutoff
    const interval = setInterval(() => {
      checkIfPastCutoff(settings.cutoffTime);
    }, 30000);

    return () => clearInterval(interval);
  }, [settings.cutoffTime]);

  const triggerAutoNotifications = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-attendance-notifications', {
        body: {}
      });

      if (error) throw error;

      setLastRun(new Date());
      toast.success('Automatic notifications sent', {
        description: `${data?.results?.length || 0} notification emails processed successfully.`,
      });
    } catch (error: any) {
      console.error('Error triggering notifications:', error);
      toast.error('Failed to send automatic notifications', {
        description: error.message || 'Please check edge function logs.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const triggerCutoffAbsenceNotify = async () => {
    setIsCutoffLoading(true);
    setCutoffResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('absence-cutoff-notify', { body: {} });
      if (error) throw error;

      setCutoffResult({ absentCount: data?.absentCount, emailsSent: data?.emailsSent, inAppSent: data?.inAppSent });
      toast.success('Absence Cutoff Notifications Sent', {
        description: data?.message || `${data?.absentCount || 0} absent student parent(s) notified.`,
      });
    } catch (error: any) {
      console.error('Cutoff notify error:', error);
      toast.error('Failed to send absence cutoff notifications', {
        description: error.message || 'Check edge function logs.',
      });
    } finally {
      setIsCutoffLoading(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Automatic Notifications & Sweep</CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Trigger bulk morning arrival confirmations and post-cutoff absence sweeps.
              </CardDescription>
            </div>
          </div>

          <Badge
            variant="outline"
            className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full flex items-center gap-1.5 self-start sm:self-center ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {isConnected ? 'LIVE SYNC ACTIVE' : 'CONNECTING'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-4 p-3.5 rounded-xl border border-border/70 bg-muted/20">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Active Cutoff Time</p>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <p className="font-semibold text-sm">{settings.cutoffTime || '08:15'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Current School Status</p>
            <div className="flex items-center gap-2">
              {isPastCutoff ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="font-semibold text-xs text-emerald-600">Past Cutoff Time</p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="font-semibold text-xs text-amber-600">Before Cutoff Time</p>
                </>
              )}
            </div>
          </div>
        </div>

        {lastRun && (
          <Alert className="rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-xs">
              Last sweep run: {lastRun.toLocaleTimeString()} ({lastRun.toLocaleDateString()})
            </AlertDescription>
          </Alert>
        )}

        <Alert className="rounded-xl border-border/70 bg-muted/20 text-xs">
          <AlertCircle className="h-4 w-4 text-primary" />
          <AlertDescription>
            Parents in selected classes will receive arrival status alerts (Present, Late, or Absent).
          </AlertDescription>
        </Alert>

        <Button 
          onClick={triggerAutoNotifications}
          disabled={isLoading}
          className="w-full rounded-xl font-semibold text-xs h-10"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Sending All Notifications...
            </>
          ) : (
            <>
              <Bell className="mr-2 h-4 w-4" />
              Send Morning Notifications Now
            </>
          )}
        </Button>

        <Separator className="my-2" />

        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-sm text-foreground">
            <MailWarning className="h-4 w-4 text-rose-500" />
            Absence Cutoff Sweep Alerts
          </h4>
          <p className="text-xs text-muted-foreground">
            Notify parents and teachers of all students who have not scanned in before cutoff time today.
          </p>

          {cutoffResult && (
            <Alert className="rounded-xl border-rose-500/30 bg-rose-500/10 text-xs">
              <CheckCircle2 className="h-4 w-4 text-rose-600" />
              <AlertDescription>
                {cutoffResult.absentCount} absent students found • {cutoffResult.emailsSent} email(s) sent • {cutoffResult.inAppSent} in-app notification(s) dispatched.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={triggerCutoffAbsenceNotify}
            disabled={isCutoffLoading || !isPastCutoff}
            variant="destructive"
            className="w-full rounded-xl font-semibold text-xs h-10"
          >
            {isCutoffLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Sending Absence Alerts...
              </>
            ) : (
              <>
                <MailWarning className="mr-2 h-4 w-4" />
                {isPastCutoff ? 'Send Absence Cutoff Alerts Now' : 'Available After Cutoff Time'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoNotificationScheduler;