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
      console.error('Error calling auto-parent-notification function:', error);
      // Keep local operator feedback even if remote channels fail
      pushNotificationService
        .sendAttendanceNotification(studentName, status, 'Attendance', new Date())
        .catch(() => undefined);

      return { 
        success: false, 
        message: `Failed to send notification: ${error.message}` 
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
