import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, BellRing, Check, X, Smartphone, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { pushNotificationService } from '@/services/PushNotificationService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface PushNotificationSettingsProps {
  className?: string;
  compact?: boolean;
}

const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({ 
  className,
  compact = false 
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkNotificationStatus();
  }, []);

  const checkNotificationStatus = async () => {
    const supported = pushNotificationService.isSupported();
    setIsSupported(supported);
    
    if (supported) {
      setPermission(pushNotificationService.getPermissionState());
      
      // Check if already subscribed
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      }
    }
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    
    try {
      const perm = await pushNotificationService.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        await pushNotificationService.registerServiceWorker();
        const subscription = await pushNotificationService.subscribe();
        
        if (subscription) {
          setIsSubscribed(true);
          toast({
            title: "Notifications enabled",
            description: "You'll receive real-time attendance alerts",
          });

          // Send test notification
          await pushNotificationService.showLocalNotification('🔔 Notifications Enabled', {
            body: 'You will now receive real-time attendance alerts!',
            icon: '/favicon.ico'
          });
        }
      } else if (perm === 'denied') {
        toast({
          title: "Permission denied",
          description: "Please enable notifications in browser settings",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast({
        title: "Error",
        description: "Failed to enable notifications",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsLoading(true);
    
    try {
      const success = await pushNotificationService.unsubscribe();
      
      if (success) {
        setIsSubscribed(false);
        toast({
          title: "Notifications disabled",
          description: "You won't receive push notifications anymore",
        });
      }
    } catch (error) {
      console.error('Error disabling notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    await pushNotificationService.sendAttendanceNotification(
      'John Doe',
      'present',
      'Category A',
      new Date()
    );
  };

  if (compact) {
    return (
      <div className={cn("flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/50", className)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            isSubscribed 
              ? "bg-primary/10 text-primary" 
              : "bg-muted text-muted-foreground"
          )}>
            {isSubscribed ? <BellRing className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </div>
          <div>
            <p className="font-medium text-sm">Push Notifications</p>
            <p className="text-xs text-muted-foreground">
              {isSubscribed ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
        <Switch
          checked={isSubscribed}
          onCheckedChange={isSubscribed ? handleDisableNotifications : handleEnableNotifications}
          disabled={isLoading || !isSupported}
        />
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
              isSubscribed 
                ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground" 
                : "bg-muted"
            )}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={isSubscribed ? 'on' : 'off'}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                >
                  {isSubscribed ? (
                    <BellRing className="w-6 h-6" />
                  ) : (
                    <BellOff className="w-6 h-6 text-muted-foreground" />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div>
              <CardTitle className="text-lg">Push Notifications</CardTitle>
              <CardDescription>Real-time attendance alerts</CardDescription>
            </div>
          </div>
          <Badge variant={isSubscribed ? "default" : "secondary"}>
            {isSubscribed ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isSupported ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">Push notifications are not supported in your browser.</p>
          </div>
        ) : permission === 'denied' ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 text-warning-foreground">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Notifications blocked</p>
              <p className="text-xs opacity-80">Enable in browser settings to receive alerts</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm">Enable push notifications</span>
              </div>
              <Switch
                checked={isSubscribed}
                onCheckedChange={isSubscribed ? handleDisableNotifications : handleEnableNotifications}
                disabled={isLoading}
              />
            </div>

            {isSubscribed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="h-px bg-border" />
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">You'll be notified about:</p>
                  <ul className="space-y-1">
                    {[
                      'New attendance records',
                      'Late arrivals',
                      'Absence alerts',
                      'Daily summaries'
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleTestNotification}
                  className="w-full"
                >
                  <Bell className="w-4 h-4 mr-2" />
                  Send Test Notification
                </Button>
              </motion.div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PushNotificationSettings;
