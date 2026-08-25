import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { pushNotificationService } from '@/services/PushNotificationService';

interface AttendanceUpdate {
  id: string;
  user_id: string | null;
  status: string;
  timestamp: string;
  category: string | null;
  device_info: any;
}

interface SessionAttendanceUpdate {
  id: string;
  status: string;
  recognized_at: string;
  metadata: any;
}

interface UseRealtimeAttendanceOptions {
  categories?: string[];
  onNewAttendance?: (record: AttendanceUpdate) => void;
  showNotifications?: boolean;
  enablePushNotifications?: boolean;
  useSessionEventsOnly?: boolean;
}

export const useRealtimeAttendance = (options: UseRealtimeAttendanceOptions = {}) => {
  const { toast } = useToast();
  const [recentAttendance, setRecentAttendance] = useState<AttendanceUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRealtimeHealthy, setIsRealtimeHealthy] = useState(true);
  const optionsRef = useRef(options);
  const isConnectedRef = useRef(false);
  optionsRef.current = options;

  useEffect(() => {
    if (optionsRef.current.showNotifications && 'Notification' in window) {
      Notification.requestPermission();
    }

    if (optionsRef.current.enablePushNotifications) {
      pushNotificationService.registerServiceWorker().catch(console.error);
    }

    const fetchRecentFallback = async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('id,user_id,status,timestamp,category,device_info')
        .in('status', ['present', 'late'])
        .order('timestamp', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) return;

      setRecentAttendance((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        const next = [...prev];
        for (const row of data) {
          if (!seen.has(row.id)) next.unshift(row as AttendanceUpdate);
        }
        return next.slice(0, 20);
      });
    };

    const channel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_records',
        },
        async (payload: any) => {
          const record = payload.new as AttendanceUpdate;
          const opts = optionsRef.current;

          if (opts.useSessionEventsOnly !== false) {
            return;
          }

          if (opts.categories && opts.categories.length > 0) {
            if (!record.category || !opts.categories.includes(record.category)) {
              return;
            }
          }

          if (record.status === 'present' || record.status === 'late') {
            const studentName = record.device_info?.metadata?.name || 
                                record.device_info?.employee_id || 
                                'A student';

            setRecentAttendance(prev => [record, ...prev.slice(0, 19)]);
            opts.onNewAttendance?.(record);

            if (opts.showNotifications) {
              toast({
                title: record.status === 'present' ? '✓ Attendance Marked' : '⏰ Late Arrival',
                description: `${studentName} marked ${record.status} in Category ${record.category || 'Unknown'}`,
                duration: 5000,
              });
            }

            if (opts.enablePushNotifications) {
              try {
                await pushNotificationService.sendAttendanceNotification(
                  studentName,
                  record.status as 'present' | 'late' | 'absent',
                  record.category || 'Unknown',
                  new Date(record.timestamp)
                );
              } catch (error) {
                console.error('Failed to send push notification:', error);
              }
            }

            if (opts.showNotifications && 'Notification' in window && Notification.permission === 'granted') {
              new Notification(`Attendance: ${studentName}`, {
                body: `Marked ${record.status} in Category ${record.category}`,
                icon: '/favicon.ico',
                tag: record.id,
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_session_events',
        },
        async (payload: any) => {
          const event = payload.new as SessionAttendanceUpdate;
          const opts = optionsRef.current;

          if (event.status !== 'present' && event.status !== 'late') return;

          const studentName = event.metadata?.student_name || 'A student';
          const category = event.metadata?.class || 'Class';

          const syntheticRecord: AttendanceUpdate = {
            id: event.id,
            user_id: null,
            status: event.status,
            timestamp: event.recognized_at,
            category,
            device_info: { metadata: { name: studentName } },
          };

          setRecentAttendance(prev => [syntheticRecord, ...prev.slice(0, 19)]);
          opts.onNewAttendance?.(syntheticRecord);

          if (opts.showNotifications) {
            toast({
              title: event.status === 'present' ? '✓ Attendance Marked' : '⏰ Late Arrival',
              description: `${studentName} marked ${event.status} in ${category}`,
              duration: 5000,
            });
          }
        }
      )
      .subscribe((status) => {
        const connected = status === 'SUBSCRIBED';
        isConnectedRef.current = connected;
        setIsConnected(connected);
        setIsRealtimeHealthy(status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT');
      });

    const healthCheck = window.setInterval(async () => {
      if (!isConnectedRef.current) {
        setIsRealtimeHealthy(false);
        await fetchRecentFallback();
      } else {
        setIsRealtimeHealthy(true);
      }
    }, 5000);

    return () => {
      clearInterval(healthCheck);
      supabase.removeChannel(channel);
    };
    // Only run once on mount - options accessed via ref
  }, [toast]);

  const clearRecentAttendance = useCallback(() => {
    setRecentAttendance([]);
  }, []);

  return {
    recentAttendance,
    isConnected,
    isRealtimeHealthy,
    clearRecentAttendance,
  };
};
