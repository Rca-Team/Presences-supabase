import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Flame, Lock, LogOut, Activity, HeartPulse, ShieldAlert,
  CheckCircle, Megaphone, Loader2, Siren, AlertTriangle, 
  Volume2, Mic, Play, Square,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { emergencyAlarmService, type AlertType } from '@/services/EmergencyAlarmService';
import { backgroundPushService } from '@/services/BackgroundPushService';

interface AlertConfig {
  type: AlertType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  severity: 'critical' | 'high' | 'normal';
}

const ALERT_TYPES: AlertConfig[] = [
  {
    type: 'fire',
    label: 'Fire Alarm',
    description: 'Triggers fire evacuation protocol',
    icon: Flame,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/40',
    borderColor: 'border-red-200 dark:border-red-900/50',
    severity: 'critical',
  },
  {
    type: 'lockdown',
    label: 'Lockdown',
    description: 'Secure all rooms, no movement',
    icon: Lock,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-900/50',
    severity: 'critical',
  },
  {
    type: 'evacuation',
    label: 'Evacuation',
    description: 'Move to assembly points now',
    icon: LogOut,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/40',
    borderColor: 'border-orange-200 dark:border-orange-900/50',
    severity: 'critical',
  },
  {
    type: 'earthquake',
    label: 'Earthquake',
    description: 'Drop, Cover, Hold On protocol',
    icon: Activity,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-50 dark:bg-purple-950/40',
    borderColor: 'border-purple-200 dark:border-purple-900/50',
    severity: 'critical',
  },
  {
    type: 'medical',
    label: 'Medical Emergency',
    description: 'First aid team respond',
    icon: HeartPulse,
    color: 'text-pink-600 dark:text-pink-400',
    bgColor: 'bg-pink-50 dark:bg-pink-950/40',
    borderColor: 'border-pink-200 dark:border-pink-900/50',
    severity: 'high',
  },
  {
    type: 'intruder',
    label: 'Intruder Alert',
    description: 'Unknown person on campus',
    icon: ShieldAlert,
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-100 dark:bg-red-950/60',
    borderColor: 'border-red-300 dark:border-red-800/50',
    severity: 'critical',
  },
  {
    type: 'allclear',
    label: 'All Clear',
    description: 'Emergency resolved, resume normal',
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950/40',
    borderColor: 'border-green-200 dark:border-green-900/50',
    severity: 'normal',
  },
  {
    type: 'custom',
    label: 'Custom Alert',
    description: 'Send a custom announcement',
    icon: Megaphone,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-200 dark:border-blue-900/50',
    severity: 'high',
  },
];

interface ActiveEmergency {
  id: string;
  event_type: string;
  notes: string | null;
  location: string | null;
  created_at: string;
}

interface EmergencyEventRow {
  id: string;
  event_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  triggered_at?: string | null;
}

const parseEmergencyMeta = (metadata: unknown): { notes: string | null; location: string | null } => {
  if (!metadata || typeof metadata !== 'object') {
    return { notes: null, location: null };
  }

  const meta = metadata as Record<string, unknown>;
  const notes = typeof meta.notes === 'string' ? meta.notes : null;
  const location = typeof meta.location === 'string' ? meta.location : null;
  return { notes, location };
};

const mapEmergencyRow = (row: EmergencyEventRow): ActiveEmergency => {
  const { notes, location } = parseEmergencyMeta(row.metadata);
  return {
    id: row.id,
    event_type: row.event_type,
    notes: notes ?? row.description,
    location,
    created_at: row.triggered_at || row.created_at,
  };
};

const EmergencyAlertPanel: React.FC = () => {
  const { toast } = useToast();
  const { trigger: haptic } = useHapticFeedback();
  const [selectedAlert, setSelectedAlert] = useState<AlertConfig | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState<{ type: string; time: Date; message?: string }[]>([]);
  const [enableVoice, setEnableVoice] = useState(true);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [activeEmergency, setActiveEmergency] = useState<ActiveEmergency | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Fetch active emergency on mount + realtime
  React.useEffect(() => {
    const fetchActive = async () => {
      const { data } = await supabase
        .from('emergency_events')
        .select('id, event_type, description, metadata, created_at, triggered_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      setActiveEmergency(data && data.length > 0 ? mapEmergencyRow(data[0] as EmergencyEventRow) : null);
    };
    fetchActive();

    const channel = supabase
      .channel('admin-emergency-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_events' }, () => {
        fetchActive();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const resolveEmergency = async () => {
    if (!activeEmergency) return;
    setIsResolving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Update existing alert to resolved
      const { error } = await supabase
        .from('emergency_events')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: session?.user?.id || null,
        })
        .eq('id', activeEmergency.id);

      if (error) throw error;

      // Also send an All Clear event
      await supabase.from('emergency_events').insert({
        event_type: 'allclear',
        triggered_by: session?.user?.id || null,
        status: 'resolved',
        title: 'All Clear',
        severity: 'normal',
        description: 'Emergency resolved by admin.',
        metadata: {
          notes: 'Emergency resolved by admin.',
          location: 'School-wide',
          trigger_method: 'admin_panel',
        },
      });

      // Ensure background push is also sent when resolving emergency,
      // so closed tabs/devices receive the all-clear in real time.
      void backgroundPushService.broadcastEmergency(
        'allclear',
        'Emergency resolved by admin.',
        'School-wide',
      );

      setActiveEmergency(null);
      haptic('success');
      toast({ title: '✅ Emergency Resolved', description: 'All Clear signal sent to all devices.' });
    } catch (e) {
      console.error('Failed to resolve:', e);
      toast({ title: 'Failed to resolve', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsResolving(false);
    }
  };

  const handleAlertSelect = (alert: AlertConfig) => {
    haptic('selection');
    setSelectedAlert(alert);
    setCustomMessage('');
    setConfirmOpen(true);
  };

  const handlePreviewSiren = (type: AlertType) => {
    if (isPreviewPlaying) {
      emergencyAlarmService.stopAlarm();
      setIsPreviewPlaying(false);
    } else {
      emergencyAlarmService.previewSiren(type);
      setIsPreviewPlaying(true);
      setTimeout(() => setIsPreviewPlaying(false), 2500);
    }
  };

  const handlePreviewVoice = (type: AlertType) => {
    emergencyAlarmService.previewAnnouncement(type, customMessage || undefined);
  };

  const sendEmergencyNotifications = async (subject: string, body: string, eventType: string) => {
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('user_id, display_name, parent_name, parent_email, parent_phone, phone, metadata')
      .or('parent_email.not.is.null,parent_phone.not.is.null,phone.not.is.null');

    if (error || !rows?.length) return;

    const requests = rows
      .filter((r) => r.user_id)
      .map((row: any) => {
        const fallbackPhone = row?.metadata?.parent_phone || row.phone || null;
        return supabase.functions.invoke('send-notification', {
          body: {
            recipient: {
              email: row.parent_email || null,
              phone: row.parent_phone || fallbackPhone,
              name: row.parent_name || `Parent of ${row.display_name || 'Student'}`,
            },
            message: { subject, body },
            student: {
              id: row.user_id,
              name: row.display_name || 'Student',
              status: eventType,
            },
            targetUserId: row.user_id,
          },
        });
      });

    await Promise.allSettled(requests);
  };

  const sendEmergencyAlert = async () => {
    if (!selectedAlert) return;

    setIsSending(true);
    haptic('error'); // Strong vibration for emergency

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 1. Map alert types to DB-allowed values
      const eventTypeMap: Record<string, string> = {
        fire: 'fire', lockdown: 'lockdown', evacuation: 'evacuation',
        earthquake: 'earthquake', medical: 'medical', intruder: 'intruder',
        allclear: 'allclear', custom: 'custom',
      };
      const dbEventType = eventTypeMap[selectedAlert.type] || 'other';

      const { error: dbError } = await supabase.from('emergency_events').insert({
        event_type: dbEventType,
        triggered_by: session?.user?.id || null,
        status: selectedAlert.type === 'allclear' ? 'resolved' : 'active',
        title: selectedAlert.label,
        severity: selectedAlert.severity,
        description: customMessage || selectedAlert.description,
        metadata: {
          notes: customMessage || null,
          location: 'School-wide',
          trigger_method: 'admin_panel',
        },
      });

      if (dbError) throw dbError;

      // 2. Send REAL background push notifications to ALL subscribers (works even when app is closed)
      backgroundPushService.broadcastEmergency(
        selectedAlert.type,
        customMessage || undefined,
        'School-wide'
      ).then(result => {
        console.log(`Emergency push sent to ${result.sent} devices`);
      }).catch(err => console.error('Background push failed:', err));

      // 3. Trigger local notification via service worker for this device
      const registration =
        (await navigator.serviceWorker?.getRegistration('/')) ||
        (await navigator.serviceWorker?.getRegistration());
      if (registration?.active) {
        registration.active.postMessage({
          type: 'EMERGENCY_ALERT',
          alertType: selectedAlert.type,
          message: customMessage || undefined,
        });
      }

      const alertMeta = ALERT_TYPES.find(a => a.type === selectedAlert.type);
      const title = `🚨 ${alertMeta?.label || 'Emergency Alert'}`;
      const body = customMessage || alertMeta?.description || 'Emergency alert triggered.';

      await sendEmergencyNotifications(title, body, dbEventType);

      // 3. Also show via Notification API directly as fallback
      if (Notification.permission === 'granted' && registration) {
        await registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `emergency-${selectedAlert.type}`,
          silent: false,
          data: { url: '/admin', alertType: selectedAlert.type, emergency: true },
        } as NotificationOptions);
      }

      setRecentAlerts(prev => [
        { type: selectedAlert.type, time: new Date(), message: customMessage || undefined },
        ...prev.slice(0, 9),
      ]);

      toast({
        title: '🚨 Alert Sent!',
        description: `${selectedAlert.label} alert broadcast to all connected devices.`,
      });
    } catch (error) {
      console.error('Failed to send alert:', error);
      toast({
        title: 'Failed to send alert',
        description: 'Please try again or check your connection.',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
      setConfirmOpen(false);
      setSelectedAlert(null);
      setCustomMessage('');
    }
  };

  return (
    <Card className="bg-card border-border shadow-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border bg-gradient-to-r from-red-600 to-orange-600">
        <CardTitle className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Siren className="w-5 h-5" />
          </div>
          <div>
            <span>Emergency Alert System</span>
            <p className="text-sm font-normal text-white/70">
              Broadcast alerts to all devices with alarm sounds
            </p>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Active Emergency - Resolve Button */}
        {activeEmergency && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border-2 border-destructive bg-destructive/10 space-y-3"
          >
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center"
              >
                <Siren className="w-5 h-5 text-destructive" />
              </motion.div>
              <div className="flex-1">
                <p className="font-bold text-destructive text-sm uppercase tracking-wide">
                  ⚠️ Active Emergency: {activeEmergency.event_type}
                </p>
                <p className="text-xs text-muted-foreground">
                  Since {new Date(activeEmergency.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {activeEmergency.location && ` • ${activeEmergency.location}`}
                </p>
                {activeEmergency.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">"{activeEmergency.notes}"</p>
                )}
              </div>
            </div>
            <Button
              onClick={resolveEmergency}
              disabled={isResolving}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
              size="lg"
            >
              {isResolving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Resolving...</>
              ) : (
                <><CheckCircle className="w-5 h-5" /> Stop Emergency &amp; Send All Clear</>
              )}
            </Button>
          </motion.div>
        )}

        {/* Warning Banner */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">Use Responsibly</p>
            <p className="text-xs text-muted-foreground">
              Alerts are sent to ALL connected devices with alarm vibrations and notifications, even when the app is in background.
            </p>
          </div>
        </div>

        {/* Alert Type Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ALERT_TYPES.map((alert) => {
            const Icon = alert.icon;
            return (
              <motion.button
                key={alert.type}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAlertSelect(alert)}
                className={`relative p-4 rounded-xl border-2 ${alert.bgColor} ${alert.borderColor} text-left transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring`}
              >
                {alert.severity === 'critical' && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
                <Icon className={`w-7 h-7 ${alert.color} mb-2`} />
                <p className={`text-sm font-bold ${alert.color}`}>{alert.label}</p>
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{alert.description}</p>
                <Badge
                  variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'high' ? 'default' : 'secondary'}
                  className="mt-2 text-[9px] px-1.5 py-0"
                >
                  {alert.severity}
                </Badge>
              </motion.button>
            );
          })}
        </div>

        {/* Recent Alerts */}
        {recentAlerts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Recent Alerts (this session)</Label>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {recentAlerts.map((alert, i) => {
                const config = ALERT_TYPES.find(a => a.type === alert.type);
                const Icon = config?.icon || Megaphone;
                return (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 text-sm">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${config?.color || 'text-muted-foreground'}`} />
                    <span className="font-medium flex-1">{config?.label || alert.type}</span>
                    {alert.message && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{alert.message}</span>}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {alert.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Siren className="w-5 h-5" />
              Confirm {selectedAlert?.label}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will send a <strong>{selectedAlert?.label}</strong> alert to <strong>ALL devices</strong> with
                the app installed, including <strong>loud alarm sirens</strong>, <strong>voice announcements</strong>, 
                vibrations, and push notifications.
              </p>

              {/* Preview buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewSiren(selectedAlert!.type as AlertType)}
                  className="gap-1.5 text-xs"
                >
                  {isPreviewPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isPreviewPlaying ? 'Stop' : 'Preview Siren'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewVoice(selectedAlert!.type as AlertType)}
                  className="gap-1.5 text-xs"
                >
                  <Mic className="w-3 h-3" />
                  Preview Voice
                </Button>
              </div>

              {/* Voice toggle */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Voice Announcement</span>
                </div>
                <Switch checked={enableVoice} onCheckedChange={setEnableVoice} />
              </div>

              <div>
                <Label className="mb-1.5 block text-sm">Custom message (optional)</Label>
                <Textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={`Additional instructions (will be spoken aloud if voice is enabled)...`}
                  className="min-h-[80px]"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={sendEmergencyAlert}
              disabled={isSending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Siren className="w-4 h-4 mr-2" />
                  Send Alert Now
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default EmergencyAlertPanel;
