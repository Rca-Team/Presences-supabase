import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Mail, ShieldCheck, Zap, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';

export const DailyEmailFrequencySetting: React.FC = () => {
  const { toast } = useToast();
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [emailsToday, setEmailsToday] = useState<number>(0);
  const [refreshingStats, setRefreshingStats] = useState<boolean>(false);

  // Fetch initial setting & stats
  const fetchSettingAndStats = async () => {
    try {
      // 1. Fetch setting
      const { data: setting } = await supabase
        .from('attendance_settings')
        .select('value')
        .eq('key', 'one_student_one_email_per_day')
        .maybeSingle();

      if (setting) {
        setIsEnabled(setting.value !== 'false' && setting.value !== 'disabled' && setting.value !== '0');
      } else {
        setIsEnabled(true);
      }

      // 2. Fetch today's email count
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('notification_log')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'email')
        .eq('status', 'sent')
        .gte('created_at', startOfToday.toISOString());

      setEmailsToday(count || 0);
    } catch (err) {
      console.error('Error fetching frequency setting:', err);
    } finally {
      setLoading(false);
      setRefreshingStats(false);
    }
  };

  useEffect(() => {
    fetchSettingAndStats();

    // Setup realtime subscription for instant synchronization across all admins
    const channel = supabase
      .channel('attendance_settings_frequency_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_settings',
          filter: 'key=eq.one_student_one_email_per_day',
        },
        (payload: any) => {
          const newVal = payload?.new?.value;
          if (newVal !== undefined) {
            const active = newVal !== 'false' && newVal !== 'disabled' && newVal !== '0';
            setIsEnabled(active);
            toast({
              title: 'Realtime Sync Updated',
              description: `1 Student 1 Email setting changed to: ${active ? 'ENABLED' : 'DISABLED'}`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle Toggle Switch
  const handleToggle = async (checked: boolean) => {
    setIsUpdating(true);
    setIsEnabled(checked); // Optimistic UI update

    try {
      const { data: existing } = await supabase
        .from('attendance_settings')
        .select('id')
        .eq('key', 'one_student_one_email_per_day')
        .maybeSingle();

      const newValue = checked ? 'true' : 'false';

      if (existing?.id) {
        const { error } = await supabase
          .from('attendance_settings')
          .update({ value: newValue, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('attendance_settings')
          .insert({ key: 'one_student_one_email_per_day', value: newValue });
        if (error) throw error;
      }

      toast({
        title: checked ? '✅ 1 Student 1 Mail Enabled' : '⚠️ Rate Limit Disabled',
        description: checked
          ? 'Parents will receive at most 1 attendance alert email per student each day.'
          : 'Parents may receive multiple emails if student attendance is recognized repeatedly.',
      });
    } catch (err: any) {
      console.error('Error updating setting:', err);
      setIsEnabled(!checked); // Rollback on failure
      toast({
        title: 'Update failed',
        description: err.message || 'Could not save setting.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="relative overflow-hidden border-2 border-primary/25 bg-gradient-to-br from-card/90 via-card/70 to-primary/5 shadow-xl backdrop-blur-xl transition-all duration-300">
      {/* Decorative top gradient bar */}
      <div className={`h-1.5 w-full transition-colors duration-500 ${
        isEnabled ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'
      }`} />

      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl transition-all duration-300 ${
              isEnabled 
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/20' 
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            }`}>
              {isEnabled ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
            </div>
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                1 Student · 1 Email Per Day Rate Limit
                <Badge
                  variant={isEnabled ? 'default' : 'secondary'}
                  className={`text-xs font-semibold px-2.5 py-0.5 transition-all duration-300 ${
                    isEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'bg-amber-600 hover:bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  }`}
                >
                  {isEnabled ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      Active (Protected)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-white" />
                      Multi-Email Allowed
                    </span>
                  )}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-1">
                Real-time duplicate protection: limits attendance alert emails to exactly one per student per calendar day.
              </CardDescription>
            </div>
          </div>

          {/* Master Toggle Button */}
          <div className="flex items-center gap-3 bg-muted/40 p-2 sm:px-4 sm:py-2.5 rounded-2xl border border-border/60 self-start sm:self-center">
            <span className="text-xs sm:text-sm font-semibold">
              {isEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
              disabled={loading || isUpdating}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        {/* Explanation Banner */}
        <div className={`p-3.5 rounded-2xl border text-xs sm:text-sm leading-relaxed transition-all duration-300 ${
          isEnabled
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-900 dark:text-amber-200'
        }`}>
          <div className="flex items-start gap-2.5">
            <Zap className={`h-4 w-4 mt-0.5 flex-shrink-0 ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div>
              {isEnabled ? (
                <p>
                  <strong>Spam Protection Active:</strong> When a student is verified at gate scanner or kiosk, an email is sent to their parent. If the student passes the camera again later today, subsequent duplicate emails are automatically suppressed.
                </p>
              ) : (
                <p>
                  <strong>Unrestricted Mode:</strong> An email notification will be dispatched every time a student's attendance is recognized, even if multiple recognitions happen on the same day.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Live Daily Email Metric */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span>Today's Verified Parent Emails Sent: <strong>{emailsToday}</strong></span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRefreshingStats(true);
              fetchSettingAndStats();
            }}
            disabled={refreshingStats}
            className="h-7 text-xs gap-1.5 px-2 hover:bg-muted/60"
          >
            <RefreshCw className={`h-3 w-3 ${refreshingStats ? 'animate-spin' : ''}`} />
            Sync Stats
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyEmailFrequencySetting;
