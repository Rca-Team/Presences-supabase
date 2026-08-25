import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Siren, X, Flame, Lock, LogOut, Activity,
  HeartPulse, ShieldAlert, CheckCircle, Megaphone,
  Volume2, VolumeX, MapPin, Clock
} from 'lucide-react';
import { emergencyAlarmService, type AlertType } from '@/services/EmergencyAlarmService';

interface EmergencyAlert {
  id: string;
  event_type: string;
  notes: string | null;
  status: string | null;
  location: string | null;
  created_at: string;
}

interface EmergencyAlertRow {
  id: string;
  event_type: string;
  description: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  triggered_at?: string | null;
}

const mapEmergencyAlertRow = (row: EmergencyAlertRow): EmergencyAlert => {
  const meta = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : null;

  const notes = typeof meta?.notes === 'string' ? meta.notes : row.description;
  const location = typeof meta?.location === 'string' ? meta.location : null;

  return {
    id: row.id,
    event_type: row.event_type,
    status: row.status,
    notes,
    location,
    created_at: row.triggered_at || row.created_at,
  };
};

const ALERT_META: Record<string, {
  icon: React.ElementType;
  label: string;
  instruction: string;
  bgClass: string;
  pulseColor: string;
}> = {
  fire: { icon: Flame, label: '🔥 FIRE ALARM', instruction: 'Evacuate immediately. Use nearest exit. Do NOT use elevators.', bgClass: 'from-red-700 via-red-600 to-orange-600', pulseColor: 'bg-red-500' },
  lockdown: { icon: Lock, label: '🔒 LOCKDOWN', instruction: 'Lock all doors. Stay away from windows. Remain silent.', bgClass: 'from-amber-700 via-amber-600 to-yellow-600', pulseColor: 'bg-amber-500' },
  evacuation: { icon: LogOut, label: '🚪 EVACUATION', instruction: 'Leave the building now. Proceed to assembly point calmly.', bgClass: 'from-orange-700 via-orange-600 to-red-600', pulseColor: 'bg-orange-500' },
  earthquake: { icon: Activity, label: '🌍 EARTHQUAKE', instruction: 'DROP, COVER, HOLD ON. Get under sturdy furniture.', bgClass: 'from-purple-700 via-purple-600 to-indigo-600', pulseColor: 'bg-purple-500' },
  medical: { icon: HeartPulse, label: '🏥 MEDICAL EMERGENCY', instruction: 'First aid team respond. Keep corridors clear.', bgClass: 'from-pink-700 via-pink-600 to-rose-600', pulseColor: 'bg-pink-500' },
  intruder: { icon: ShieldAlert, label: '🚨 INTRUDER ALERT', instruction: 'Lock doors. Hide. Stay silent. Do NOT open doors.', bgClass: 'from-red-900 via-red-700 to-red-600', pulseColor: 'bg-red-600' },
  allclear: { icon: CheckCircle, label: '✅ ALL CLEAR', instruction: 'Emergency resolved. Resume normal activities.', bgClass: 'from-green-700 via-green-600 to-emerald-600', pulseColor: 'bg-green-500' },
  custom: { icon: Megaphone, label: '📢 ANNOUNCEMENT', instruction: 'Please listen for instructions.', bgClass: 'from-blue-700 via-blue-600 to-indigo-600', pulseColor: 'bg-blue-500' },
};

const EmergencyAlertListener: React.FC = () => {
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const handleIncomingAlert = useCallback((alert: EmergencyAlert) => {
    setActiveAlert(alert);
    setElapsedSeconds(0);

    // Start full alarm: siren + voice + vibration
    emergencyAlarmService.startAlarm(
      alert.event_type as AlertType,
      alert.notes || undefined
    );

    // Push notification via service worker
    triggerServiceWorkerNotification(alert);

    // Auto-dismiss all-clear after 8 seconds
    if (alert.event_type === 'allclear') {
      setTimeout(() => dismissAlert(), 8000);
    }
  }, []);

  useEffect(() => {
    // Check for active emergency on mount
    const checkActive = async () => {
      const { data } = await supabase
        .from('emergency_events')
        .select('id, event_type, description, status, metadata, created_at, triggered_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        handleIncomingAlert(mapEmergencyAlertRow(data[0] as EmergencyAlertRow));
      }
    };
    checkActive();

    const channel = supabase
      .channel('emergency-alerts-global')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'emergency_events' },
        (payload) => handleIncomingAlert(mapEmergencyAlertRow(payload.new as EmergencyAlertRow))
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'emergency_events' },
        (payload) => {
          const updated = mapEmergencyAlertRow(payload.new as EmergencyAlertRow);
          if (updated.status === 'resolved' || updated.status === 'false_alarm') {
            // Auto-dismiss when resolved
            if (activeAlert?.id === updated.id || !activeAlert) {
              dismissAlert();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      emergencyAlarmService.stopAlarm();
    };
  }, [handleIncomingAlert]);

  // Elapsed time counter
  useEffect(() => {
    if (!activeAlert || activeAlert.event_type === 'allclear') return;
    const timer = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [activeAlert]);

  const triggerServiceWorkerNotification = async (alert: EmergencyAlert) => {
    try {
      const registration =
        (await navigator.serviceWorker?.getRegistration('/')) ||
        (await navigator.serviceWorker?.getRegistration());
      if (registration?.active) {
        registration.active.postMessage({
          type: 'EMERGENCY_ALERT',
          alertType: alert.event_type,
          message: alert.notes || undefined,
        });
      }
      if (Notification.permission === 'granted' && registration) {
        const meta = ALERT_META[alert.event_type] || ALERT_META.custom;
        await registration.showNotification(meta.label, {
          body: alert.notes || meta.instruction,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `emergency-${alert.event_type}`,
          silent: false,
          requireInteraction: true,
          data: { url: '/admin', alertType: alert.event_type, emergency: true },
        } as NotificationOptions);
      }
    } catch (e) {
      console.warn('Could not trigger SW notification:', e);
    }
  };

  const dismissAlert = () => {
    emergencyAlarmService.stopAlarm();
    setActiveAlert(null);
    setIsMuted(false);
    setElapsedSeconds(0);
  };

  const toggleMute = () => {
    if (isMuted) {
      emergencyAlarmService.startAlarm(
        (activeAlert?.event_type || 'custom') as AlertType,
        activeAlert?.notes || undefined
      );
    } else {
      emergencyAlarmService.stopAlarm();
    }
    setIsMuted(!isMuted);
  };

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const meta = activeAlert ? (ALERT_META[activeAlert.event_type] || ALERT_META.custom) : null;
  const Icon = meta?.icon || Siren;
  const isCritical = activeAlert?.event_type !== 'allclear';

  return (
    <AnimatePresence>
      {activeAlert && meta && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[99999] flex flex-col"
        >
          {/* Full-screen pulsing background */}
          <motion.div
            animate={isCritical ? { opacity: [0.85, 0.95, 0.85] } : { opacity: 0.92 }}
            transition={isCritical ? { repeat: Infinity, duration: 1.5 } : {}}
            className={`absolute inset-0 bg-gradient-to-br ${meta.bgClass}`}
          />

          {/* Scanning line animation for critical alerts */}
          {isCritical && (
            <motion.div
              animate={{ y: ['0vh', '100vh'] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
              className="absolute inset-x-0 h-1 bg-white/30 blur-sm z-10"
            />
          )}

          {/* Content */}
          <div className="relative z-20 flex flex-col items-center justify-center flex-1 p-6 text-center text-white">
            {/* Pulsing icon */}
            <motion.div
              animate={isCritical ? {
                scale: [1, 1.25, 1],
                boxShadow: ['0 0 0 0 rgba(255,255,255,0.4)', '0 0 0 30px rgba(255,255,255,0)', '0 0 0 0 rgba(255,255,255,0)'],
              } : {}}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-6"
            >
              <Icon className="w-12 h-12 sm:w-16 sm:h-16 text-white drop-shadow-lg" />
            </motion.div>

            {/* Alert title */}
            <motion.h1
              animate={isCritical ? { scale: [1, 1.02, 1] } : {}}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-3xl sm:text-5xl font-black tracking-widest mb-3 drop-shadow-2xl"
            >
              {meta.label}
            </motion.h1>

            {/* Instruction */}
            <p className="text-lg sm:text-2xl font-semibold text-white/90 max-w-md mb-4 leading-relaxed">
              {meta.instruction}
            </p>

            {/* Custom message */}
            {activeAlert.notes && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-black/30 backdrop-blur-md rounded-2xl px-6 py-4 max-w-sm mb-4 border border-white/20"
              >
                <p className="text-base sm:text-lg font-medium text-white/95 italic">
                  "{activeAlert.notes}"
                </p>
              </motion.div>
            )}

            {/* Location */}
            {activeAlert.location && (
              <div className="flex items-center gap-2 text-white/80 mb-4">
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">{activeAlert.location}</span>
              </div>
            )}

            {/* Timer */}
            {isCritical && (
              <div className="flex items-center gap-2 text-white/70 mb-8">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-mono tabular-nums">
                  Active for {formatElapsed(elapsedSeconds)}
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                onClick={toggleMute}
                variant="ghost"
                className="bg-white/15 hover:bg-white/25 text-white border border-white/20 gap-2 h-12 px-5 rounded-xl"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                {isMuted ? 'Unmute' : 'Mute Alarm'}
              </Button>

              <Button
                onClick={dismissAlert}
                variant="ghost"
                className="bg-white/20 hover:bg-white/30 text-white border border-white/30 gap-2 h-12 px-5 rounded-xl font-bold"
              >
                <X className="w-5 h-5" />
                Dismiss
              </Button>
            </div>

            {/* Blinking dots at bottom */}
            {isCritical && (
              <div className="flex gap-2 mt-8">
                {[0, 0.3, 0.6].map((delay, i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1.2, delay }}
                    className={`w-3 h-3 rounded-full ${meta.pulseColor}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Timestamp footer */}
          <div className="relative z-20 text-center pb-6 text-white/50 text-xs">
            Triggered at {new Date(activeAlert.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EmergencyAlertListener;
