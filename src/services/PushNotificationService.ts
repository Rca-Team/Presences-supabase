/**
 * Push Notification Service using Web Push API
 * Handles subscription, permission, and sending notifications for attendance alerts
 */

import { supabase } from '@/integrations/supabase/client';

const VAPID_PUBLIC_KEY = 'BKsMAcPZ7odGu3RkFoa_TqwLYMQxk9ceH2ieu6FmEe466BDHlnA4gwHZsa9P0a0PQBruQU3COI_Rgat-pzSNVKg';

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;

  private constructor() {}

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /**
   * Get current permission state
   */
  getPermissionState(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return 'denied';
    }

    const permission = await Notification.requestPermission();
    return permission;
  }

  /**
   * Register service worker for push notifications
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!this.isSupported()) return null;

    try {
      const existing = await navigator.serviceWorker.getRegistration('/');
      const existingScript = existing?.active?.scriptURL || existing?.waiting?.scriptURL || existing?.installing?.scriptURL || '';
      if (existing && existingScript.includes('/sw-push.js')) {
        this.registration = existing;
        return this.registration;
      }

      this.registration = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
      console.log('Service worker registered for push notifications');
      return this.registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<PushSubscriptionData | null> {
    if (!this.registration) {
      await this.registerServiceWorker();
    }

    if (!this.registration) return null;

    try {
      const existingSubscription = await this.registration.pushManager.getSubscription();
      
      if (existingSubscription) {
        this.subscription = existingSubscription;
        await this.saveSubscription(existingSubscription);
        return this.serializeSubscription(existingSubscription);
      }

      this.subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      });

      // Save subscription to database
      await this.saveSubscription(this.subscription);

      return this.serializeSubscription(this.subscription);
    } catch (error) {
      console.error('Push subscription failed:', error);
      return null;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    if (!this.subscription) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        this.subscription = await registration.pushManager.getSubscription();
      }
    }

    if (!this.subscription) return true;

    try {
      await this.subscription.unsubscribe();
      await this.removeSubscription();
      this.subscription = null;
      return true;
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      return false;
    }
  }

  /**
   * Show local notification (for testing/immediate alerts)
   */
  async showLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (Notification.permission !== 'granted') {
      await this.requestPermission();
    }

    if (Notification.permission === 'granted') {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'attendance-notification',
          ...options
        });
      } else {
        // Fallback to native notification
        new Notification(title, options);
      }
    }
  }

  /**
   * Send attendance notification
   */
  async sendAttendanceNotification(
    studentName: string,
    status: 'present' | 'late' | 'absent',
    category: string,
    timestamp: Date
  ): Promise<void> {
    const statusEmoji = status === 'present' ? '✅' : status === 'late' ? '⏰' : '❌';
    const statusText = status === 'present' ? 'marked present' : status === 'late' ? 'arrived late' : 'is absent';
    
    const timeString = timestamp.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    await this.showLocalNotification(`${statusEmoji} Attendance Update`, {
      body: `${studentName} ${statusText} in ${category} at ${timeString}`,
      icon: '/favicon.ico',
      data: {
        url: '/admin',
        studentName,
        status,
        category,
        timestamp: timestamp.toISOString()
      }
    });
  }

  /**
   * Save subscription to Supabase
   */
  private async saveSubscription(subscription: PushSubscription): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const serialized = this.serializeSubscription(subscription);
      
      // Use dedicated push_subscriptions table with proper unique constraint
      const payload = {
        user_id: session.user.id,
        endpoint: serialized.endpoint,
        keys_p256dh: serialized.keys.p256dh,
        keys_auth: serialized.keys.auth,
        updated_at: new Date().toISOString(),
      };

      const byEndpoint = await (supabase as any).from('push_subscriptions').upsert(payload, {
        onConflict: 'endpoint'
      });

      if (byEndpoint?.error) {
        await (supabase as any).from('push_subscriptions').upsert(payload, {
          onConflict: 'user_id'
        });
      }
    } catch (error) {
      console.error('Failed to save subscription:', error);
    }
  }

  /**
   * Remove subscription from database
   */
  private async removeSubscription(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      await (supabase as any).from('push_subscriptions')
        .delete()
        .eq('user_id', session.user.id);
    } catch (error) {
      console.error('Failed to remove subscription:', error);
    }
  }

  /**
   * Serialize PushSubscription to plain object
   */
  private serializeSubscription(subscription: PushSubscription): PushSubscriptionData {
    const key = subscription.getKey('p256dh');
    const auth = subscription.getKey('auth');

    return {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: key ? this.arrayBufferToBase64(key) : '',
        auth: auth ? this.arrayBufferToBase64(auth) : ''
      }
    };
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
}

export const pushNotificationService = PushNotificationService.getInstance();
