import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pushNotificationService } from '@/services/PushNotificationService';
import { motion, AnimatePresence } from 'framer-motion';

interface NotificationPermissionGateProps {
  children: React.ReactNode;
}

const NotificationPermissionGate: React.FC<NotificationPermissionGateProps> = ({ children }) => {
  const [showBanner, setShowBanner] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

    if (Notification.permission === 'granted') {
      // Already enabled — silently ensure subscription
      pushNotificationService.registerServiceWorker().then(() => pushNotificationService.subscribe()).catch(() => {});
    } else if (Notification.permission === 'default') {
      setShowBanner(true);
    }
  }, []);

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const perm = await pushNotificationService.requestPermission();
      if (perm === 'granted') {
        await pushNotificationService.registerServiceWorker();
        await pushNotificationService.subscribe();
        pushNotificationService.showLocalNotification('🔔 Notifications Enabled!', {
          body: "You'll receive real-time alerts for attendance, emergencies & security.",
          tag: 'welcome-notification',
        });
      }
      setShowBanner(false);
    } catch {
      setShowBanner(false);
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bell className="h-4 w-4 shrink-0" />
              <span>Enable notifications to get real-time attendance & emergency alerts</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleEnable}
                disabled={isRequesting}
                className="bg-white text-blue-700 hover:bg-blue-50 font-semibold text-xs h-8 px-4"
              >
                {isRequesting ? 'Enabling...' : 'Enable'}
              </Button>
              <button
                onClick={() => setShowBanner(false)}
                className="text-white/70 hover:text-white text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
};

export default NotificationPermissionGate;
