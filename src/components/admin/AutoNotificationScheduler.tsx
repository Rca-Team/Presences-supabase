import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Bell, Clock, CheckCircle2, AlertCircle, MailWarning } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

const AutoNotificationScheduler: React.FC = () => {
  const { toast } = useToast();
  const [cutoffTime, setCutoffTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCutoffLoading, setIsCutoffLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [isPastCutoff, setIsPastCutoff] = useState(false);
  const [cutoffResult, setCutoffResult] = useState<{ absentCount?: number; emailsSent?: number; inAppSent?: number } | null>(null);

  useEffect(() => {
    // Fetch cutoff time
    const fetchCutoffTime = async () => {
      const { data } = await supabase
        .from('attendance_settings')
        .select('value')
        .eq('key', 'cutoff_time')
        .single();

      if (data) {
        const timeValue = typeof data.value === 'string' ? data.value : String(data.value);
        setCutoffTime(timeValue);
        checkIfPastCutoff(timeValue);
      }
    };

    fetchCutoffTime();

    // Check every minute if we're past cutoff
    const interval = setInterval(() => {
      if (cutoffTime) {
        checkIfPastCutoff(cutoffTime);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [cutoffTime]);

  const checkIfPastCutoff = (cutoff: string) => {
    const now = new Date();
    const [hours, minutes] = cutoff.split(':').map(Number);
    const cutoffDate = new Date();
    cutoffDate.setHours(hours, minutes, 0, 0);
    setIsPastCutoff(now > cutoffDate);
  };

  const triggerAutoNotifications = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-attendance-notifications', {
        body: {}
      });

      if (error) throw error;

      setLastRun(new Date());
      
      toast({
        title: "Success",
        description: `Automatic notifications sent. ${data?.results?.length || 0} emails processed.`,
        variant: "default",
      });

    } catch (error) {
      console.error('Error triggering notifications:', error);
      toast({
        title: "Error",
        description: "Failed to send automatic notifications",
        variant: "destructive",
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
      toast({
        title: 'Absence Notifications Sent',
        description: data?.message || `${data?.absentCount || 0} absent user(s) notified.`,
      });
    } catch (error) {
      console.error('Cutoff notify error:', error);
      toast({ title: 'Error', description: 'Failed to send absence cutoff notifications', variant: 'destructive' });
    } finally {
      setIsCutoffLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle>Automatic Notifications</CardTitle>
        </div>
        <CardDescription>
          Send attendance notifications to all parents after cutoff time
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Cutoff Time</p>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <p className="font-semibold">{cutoffTime || 'Not set'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex items-center gap-2">
              {isPastCutoff ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="font-semibold text-green-600">Past Cutoff</p>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <p className="font-semibold text-yellow-600">Before Cutoff</p>
                </>
              )}
            </div>
          </div>
        </div>

        {lastRun && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Last run: {lastRun.toLocaleString()}
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            This will send notifications to all registered students' parents:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Present:</strong> Confirmation email with arrival time</li>
              <li><strong>Late:</strong> Late arrival notification with time</li>
              <li><strong>Absent:</strong> Absence alert if no record found</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button 
          onClick={triggerAutoNotifications}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin mr-2" />
              Sending Notifications...
            </>
          ) : (
            <>
              <Bell className="mr-2 h-4 w-4" />
              Send Notifications Now
            </>
          )}
        </Button>

        <Separator className="my-4" />

        <div className="space-y-3">
          <h4 className="font-semibold flex items-center gap-2 text-sm">
            <MailWarning className="h-4 w-4 text-destructive" />
            Absence Cutoff Alerts
          </h4>
          <p className="text-sm text-muted-foreground">
            Send emails to absent students' parents and their class teachers after the attendance cutoff time.
          </p>

          {cutoffResult && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {cutoffResult.absentCount} absent • {cutoffResult.emailsSent} email(s) sent • {cutoffResult.inAppSent} in-app notification(s)
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={triggerCutoffAbsenceNotify}
            disabled={isCutoffLoading || !isPastCutoff}
            variant="destructive"
            className="w-full"
          >
            {isCutoffLoading ? (
              <>
                <div className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin mr-2" />
                Sending Absence Alerts...
              </>
            ) : (
              <>
                <MailWarning className="mr-2 h-4 w-4" />
                {isPastCutoff ? 'Send Absence Cutoff Alerts' : 'Available After Cutoff Time'}
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AutoNotificationScheduler;