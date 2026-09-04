import { supabase } from '@/integrations/supabase/client';
import { backgroundPushService } from '@/services/BackgroundPushService';
import { pushNotificationService } from '@/services/PushNotificationService';
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
    console.log('Sending auto parent notification for:', { studentId, studentName, status });

    const { data, error } = await supabase.functions.invoke('auto-parent-notification', {
      body: {
        studentId,
        studentName,
        status,
        imageUrl
      }
    });

    if (error) {
      console.warn('Auto-parent-notification edge service status:', error.message || error);
      // Fallback: record an in-app notification row so notification history remains intact
      try {
        await supabase.from('notifications').insert({
          user_id: studentId,
          title: `Attendance Recorded: ${status.charAt(0).toUpperCase() + status.slice(1)}`,
          message: `${studentName} was marked ${status} at ${new Date().toLocaleTimeString()}.`,
          type: 'attendance',
          is_read: false,
          metadata: { student_id: studentId, status, source: 'ai-scan' },
        });
      } catch {
        /* ignore */
      }

      // Keep local operator feedback even if remote channels fail
      pushNotificationService
        .sendAttendanceNotification(studentName, status, 'Attendance', new Date())
        .catch(() => undefined);

      return { 
        success: false, 
        message: `Notification recorded locally` 
      };
    }

    console.log('Auto parent notification response:', data);

    // Also send background push notification (works even when app is closed)
    backgroundPushService.sendAttendanceAlert(
      studentId, studentName, status, 'School'
    ).catch(err => console.error('Background push failed:', err));

    // Instant local app push for the active operator session
    pushNotificationService
      .sendAttendanceNotification(studentName, status, 'Attendance', new Date())
      .catch(() => undefined);

    return { 
      success: data?.success || false, 
      message: data?.message || 'Notification processed' 
    };
  } catch (error) {
    console.error('Error in sendAutoParentNotification:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
};
