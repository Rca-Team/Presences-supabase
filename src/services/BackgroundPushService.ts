/**
 * Background Push Service - sends server-side push notifications
 * that work even when the app/website is closed.
 * Uses the backend edge function to deliver Web Push to all subscribers.
 */

import { supabase } from '@/integrations/supabase/client';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  alertType?: string;
  targetUserIds?: string[];
}

class BackgroundPushService {
  private static instance: BackgroundPushService;

  private async getAccessToken(): Promise<string | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('Push auth session check failed:', error.message);
      return null;
    }

    return data.session?.access_token ?? null;
  }

  static getInstance(): BackgroundPushService {
    if (!BackgroundPushService.instance) {
      BackgroundPushService.instance = new BackgroundPushService();
    }
    return BackgroundPushService.instance;
  }

  /**
   * Send push notification via server (works even when app is closed)
   */
  async sendPush(payload: PushPayload): Promise<{ success: boolean; sent: number }> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        // Recognition flows can run without an authenticated operator session.
        // Skip server push in that case instead of triggering noisy 401 errors.
        console.warn('Skipping server push: no authenticated session found');
        return { success: false, sent: 0 };
      }

      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          alertType: payload.alertType,
          targetUserIds: payload.targetUserIds,
        },
      });

      if (error) {
        const message = (error as { message?: string })?.message || String(error);
        if (message.includes('401') || message.includes('403') || message.includes('Unauthorized') || message.includes('Forbidden')) {
          console.warn('Push notification skipped due to permission/auth mismatch:', message);
          return { success: false, sent: 0 };
        }

        console.error('Push notification error:', error);
        return { success: false, sent: 0 };
      }

      console.log('Push sent:', data);
      return { success: true, sent: data?.sent || 0 };
    } catch (err) {
      console.error('Failed to send push:', err);
      return { success: false, sent: 0 };
    }
  }

  /**
   * Broadcast emergency alert to ALL subscribers
   */
  async broadcastEmergency(
    alertType: string,
    message?: string,
    location?: string
  ): Promise<{ success: boolean; sent: number }> {
    const alertLabels: Record<string, string> = {
      fire: '🔥 FIRE ALARM',
      lockdown: '🔒 LOCKDOWN ALERT',
      evacuation: '🚨 EVACUATION ORDER',
      earthquake: '⚠️ EARTHQUAKE ALERT',
      medical: '🏥 MEDICAL EMERGENCY',
      intruder: '🚫 INTRUDER ALERT',
      allclear: '✅ ALL CLEAR',
      custom: '📢 SCHOOL ALERT',
    };

    const alertBodies: Record<string, string> = {
      fire: 'Fire emergency! Evacuate immediately via nearest exit.',
      lockdown: 'School lockdown initiated. Stay inside, lock doors, stay quiet.',
      evacuation: 'Immediate evacuation required. Proceed to assembly point.',
      earthquake: 'Drop, Cover, Hold On! Move to safe zones immediately.',
      medical: 'Medical emergency reported. First aid team respond immediately.',
      intruder: 'Unknown intruder detected on campus. Initiate safety protocol.',
      allclear: 'Emergency resolved. Resume normal activities.',
      custom: 'Important announcement from administration.',
    };

    return this.sendPush({
      title: alertLabels[alertType] || '📢 School Alert',
      body: message || alertBodies[alertType] || 'Important alert from your school.',
      alertType,
      data: {
        url: '/admin',
        alertType,
        emergency: true,
        location,
      },
    });
  }

  /**
   * Send attendance notification to specific user
   */
  async sendAttendanceAlert(
    userId: string,
    studentName: string,
    status: 'present' | 'late' | 'absent',
    category: string
  ): Promise<{ success: boolean; sent: number }> {
    const emoji = status === 'present' ? '✅' : status === 'late' ? '⏰' : '❌';
    const statusText = status === 'present' ? 'marked present' : status === 'late' ? 'arrived late' : 'is absent';

    return this.sendPush({
      title: `${emoji} Attendance Update`,
      body: `${studentName} ${statusText} in ${category}`,
      targetUserIds: [userId],
      data: {
        url: '/admin',
        studentName,
        status,
        category,
      },
    });
  }

  /**
   * Send stranger/unknown person alert to admins
   */
  async sendStrangerAlert(location?: string): Promise<{ success: boolean; sent: number }> {
    // Get admin user IDs
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    const adminIds = admins?.map((a) => a.user_id) || [];

    return this.sendPush({
      title: '🚫 Unknown Person Detected',
      body: `An unrecognized person was detected${location ? ` at ${location}` : ''}. Please verify.`,
      targetUserIds: adminIds,
      data: {
        url: '/admin',
        type: 'stranger_alert',
        location,
      },
    });
  }
}

export const backgroundPushService = BackgroundPushService.getInstance();
