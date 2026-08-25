import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { pushNotificationService } from '@/services/PushNotificationService';

/**
 * Global realtime notification listener.
 * Subscribes to attendance_records, gate_entries, emergency_events, visitors, late_entries
 * and pushes browser + push notifications for each event type.
 */
const RealtimeNotificationListener: React.FC = () => {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setCurrentUserId(data.user?.id ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const notify = useCallback(async (title: string, body: string, icon: string, tag: string, url = '/admin') => {
    // In-app toast
    toastRef.current({ title, description: body, duration: 6000 });

    // Browser push notification
    try {
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          await reg.showNotification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag,
            renotify: true,
            vibrate: [200, 100, 200],
            data: { url },
            silent: false,
          } as NotificationOptions);
        }
      }
    } catch (e) {
      console.warn('Push notification failed:', e);
    }
  }, []);

  useEffect(() => {
    // Auto-request permission on mount (non-blocking)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    pushNotificationService.registerServiceWorker().catch(() => {});

    const channel = supabase
      .channel('global-realtime-notifications')
      // ─── Attendance Records ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance_records' }, (payload) => {
        const r = payload.new as any;
        const name = r.device_info?.metadata?.name || r.device_info?.employee_id || 'Someone';
        const cat = r.category || 'Unknown';
        const time = new Date(r.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (r.status === 'present') {
          notify(`✅ ${name} Present`, `Marked present in ${cat} at ${time}`, '✅', `att-present-${r.id}`, '/admin');
        } else if (r.status === 'late') {
          notify(`⏰ ${name} Late`, `Arrived late in ${cat} at ${time}`, '⏰', `att-late-${r.id}`, '/admin');
        } else if (r.status === 'absent') {
          notify(`❌ ${name} Absent`, `Marked absent in ${cat}`, '❌', `att-absent-${r.id}`, '/admin');
        }
      })
      // ─── Gate Entries ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gate_entries' }, (payload) => {
        const g = payload.new as any;
        const time = new Date(g.entry_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        if (g.is_recognized && g.student_name) {
          notify(`🚪 Gate Entry: ${g.student_name}`, `Entered via ${g.gate_name || 'Main Gate'} at ${time}`, '🚪', `gate-${g.id}`, '/gate');
        } else if (!g.is_recognized) {
          notify(
            '🚨 Unknown Person at Gate!',
            `Unrecognized face detected at ${g.gate_name || 'Main Gate'} at ${time}. Confidence: ${g.confidence ? Math.round(g.confidence * 100) + '%' : 'N/A'}`,
            '🚨',
            `gate-unknown-${g.id}`,
            '/gate'
          );
        }
      })
      // ─── Late Entries with Reason ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'late_entries' }, (payload) => {
        const l = payload.new as any;
        const name = l.student_name || 'A student';
        const reason = l.reason_detail || l.reason || 'No reason given';
        notify(`📝 Late Entry: ${name}`, `Reason: ${reason}`, '📝', `late-${l.id}`, '/admin');
      })
      // ─── Visitors ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visitors' }, (payload) => {
        const v = payload.new as any;
        notify(`👤 New Visitor: ${v.name}`, `Purpose: ${v.purpose}. Status: ${v.status || 'Pending'}`, '👤', `visitor-${v.id}`, '/admin');
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visitors' }, (payload) => {
        const v = payload.new as any;
        if (v.check_in_time && !payload.old?.check_in_time) {
          notify(`✅ Visitor Checked In: ${v.name}`, `${v.name} has entered the campus`, '✅', `visitor-in-${v.id}`, '/admin');
        }
        if (v.check_out_time && !payload.old?.check_out_time) {
          notify(`👋 Visitor Left: ${v.name}`, `${v.name} has left the campus`, '👋', `visitor-out-${v.id}`, '/admin');
        }
      })
      // ─── Emergency Events ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_events' }, (payload) => {
        const e = payload.new as any;
        const labels: Record<string, string> = {
          fire: '🔥 FIRE ALARM', lockdown: '🔒 LOCKDOWN', earthquake: '🌍 EARTHQUAKE',
          medical: '🏥 MEDICAL', intruder: '🚫 INTRUDER', evacuation: '🚨 EVACUATION',
          allclear: '✅ ALL CLEAR', custom: '📢 ALERT',
        };
        const title = labels[e.event_type] || '📢 EMERGENCY';
        const notes = typeof e?.metadata?.notes === 'string' ? e.metadata.notes : null;
        const description = typeof e?.description === 'string' ? e.description : null;
        notify(
          title,
          notes || description || `Emergency alert triggered at ${new Date(e.created_at).toLocaleTimeString()}`,
          '🚨',
          `emergency-${e.id}`,
          '/admin'
        );
      })
      // ─── Notifications table (admin-sent) ───
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        const n = payload.new as any;
        if (n.type === 'push_subscription') return;

        if (n.user_id && currentUserId && n.user_id !== currentUserId) return;

        const destination = n.type === 'broadcast' || n.type === 'admin_notification' ? '/profile' : '/admin';
        notify(`🔔 ${n.title || 'New update'}`, n.message || 'You have a new notification.', '🔔', `notif-${n.id}`, destination);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [notify, currentUserId]);

  return null; // Invisible listener
};

export default RealtimeNotificationListener;
