import { useState, useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/services/PushNotificationService';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  requestPermission: () => Promise<NotificationPermission>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendNotification: (title: string, options?: NotificationOptions) => Promise<void>;
  sendAttendanceNotification: (
    studentName: string,
    status: 'present' | 'late' | 'absent',
    category: string,
    timestamp: Date
  ) => Promise<void>;
}

export const usePushNotifications = (): UsePushNotificationsReturn => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      const supported = pushNotificationService.isSupported();
      setIsSupported(supported);

      if (supported) {
        setPermission(pushNotificationService.getPermissionState());

        // Check subscription status
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      }
    };

    checkStatus();
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    const perm = await pushNotificationService.requestPermission();
    setPermission(perm);
    return perm;
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const perm = await requestPermission();
      
      if (perm !== 'granted') {
        return false;
      }

      await pushNotificationService.registerServiceWorker();
      const subscription = await pushNotificationService.subscribe();
      
      const success = !!subscription;
      setIsSubscribed(success);
      return success;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [requestPermission]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const success = await pushNotificationService.unsubscribe();
      if (success) {
        setIsSubscribed(false);
      }
      return success;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sendNotification = useCallback(async (title: string, options?: NotificationOptions): Promise<void> => {
    await pushNotificationService.showLocalNotification(title, options);
  }, []);

  const sendAttendanceNotification = useCallback(async (
    studentName: string,
    status: 'present' | 'late' | 'absent',
    category: string,
    timestamp: Date
  ): Promise<void> => {
    await pushNotificationService.sendAttendanceNotification(studentName, status, category, timestamp);
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    requestPermission,
    subscribe,
    unsubscribe,
    sendNotification,
    sendAttendanceNotification
  };
};
