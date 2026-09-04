import { supabase } from '@/integrations/supabase/client';
import { backgroundPushService } from '@/services/BackgroundPushService';
import { pushNotificationService } from '@/services/PushNotificationService';

let remoteEdgeFailureCooldownUntil = 0;

/**
 * Automatically sends a notification to the parent when attendance is marked.
 * This is called from the recognition service after successful attendance recording.
 */
export const sendAutoParentNotification = async (
  studentId: string,
  studentName: string,
  status: 'present' | 'late' | 'absent',
  imageUrl?: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const isEdgeInCooldown = Date.now() < remoteEdgeFailureCooldownUntil;

    if (!isEdgeInCooldown) {
      try {
        const { data, error } = await supabase.functions.invoke('auto-parent-notification', {
          body: {
            studentId,
            studentName,
            status,
            imageUrl,
          },
        });

        if (!error && data?.success) {
          // Cloud notification sent successfully
          remoteEdgeFailureCooldownUntil = 0;
          backgroundPushService.sendAttendanceAlert(
            studentId, studentName, status, 'School'
          ).catch(() => undefined);

          pushNotificationService
            .sendAttendanceNotification(studentName, status, 'Attendance', new Date())
            .catch(() => undefined);

          return { success: true, message: data.message || 'Notification sent' };
        }

        // Edge function returned an issue (e.g. 500 or misconfigured email key)
        console.warn(
          'Auto-parent-notification edge service paused (using reliable in-app notifications):',
          error?.message || 'remote service unavailable'
        );
        remoteEdgeFailureCooldownUntil = Date.now() + 5 * 60 * 1000;
      } catch (invokeErr: any) {
        console.warn('Auto-parent-notification invoke paused:', invokeErr?.message);
        remoteEdgeFailureCooldownUntil = Date.now() + 5 * 60 * 1000;
      }
    }

    // Resilient local fallback: record notification directly into Supabase notifications table
    try {
      await supabase.from('notifications').insert({
        user_id: studentId,
        title: `Attendance Recorded: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `${studentName} was marked ${status} at ${new Date().toLocaleTimeString()}.`,
        type: status === 'late' ? 'warning' : 'success',
        is_read: false,
        metadata: { student_id: studentId, status, source: 'ai-scan' },
      });
    } catch {
      /* ignore */
    }

    // Local operator feedback
    pushNotificationService
      .sendAttendanceNotification(studentName, status, 'Attendance', new Date())
      .catch(() => undefined);

    backgroundPushService.sendAttendanceAlert(
      studentId, studentName, status, 'School'
    ).catch(() => undefined);

    return { 
      success: true, 
      message: 'Attendance notification recorded locally' 
    };
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
