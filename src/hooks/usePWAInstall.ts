import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('Mobile Device');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ua = navigator.userAgent || '';
    const android = /Android/i.test(ua);
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const mobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) || window.innerWidth <= 840;

    setIsAndroid(android);
    setIsIOS(ios);
    setIsMobile(mobile);
    setDeviceLabel(android ? 'Android Phone' : ios ? 'iPhone / iOS' : 'Mobile Phone');

    // Check if running inside installed native app / standalone PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      Boolean((window as any).Capacitor?.isNativePlatform());

    setIsInstalled(isStandalone);

    // If already installed or on desktop or admin secret radar, don't show install banner
    if (isStandalone || !mobile) {
      setShowPrompt(false);
      return;
    }

    // Check session dismissal (allows showing on EVERY new visit / session)
    const sessionDismissed = sessionStorage.getItem('presences_mobile_install_dismissed') === 'true';

    // BeforeInstallPrompt listener for Android / Chromium browsers
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);

      if (!sessionDismissed && !isStandalone) {
        setTimeout(() => setShowPrompt(true), 1200);
      }
    };

    // App installed listener
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // For iOS or Android devices where beforeinstallprompt doesn't fire immediately
    if (!sessionDismissed && !isStandalone) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 1500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) {
      // Fallback for browsers without direct prompt API
      return false;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        setIsInstalled(true);
        setShowPrompt(false);
      }

      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch (error) {
      console.error('Error installing PWA:', error);
      return false;
    }
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    try {
      sessionStorage.setItem('presences_mobile_install_dismissed', 'true');
    } catch {}
  }, []);

  return {
    isInstallable: isInstallable || (isIOS && !isInstalled) || (isAndroid && !isInstalled),
    isInstalled,
    isIOS,
    isAndroid,
    isMobile,
    deviceLabel,
    hasNativePrompt: Boolean(deferredPrompt),
    showPrompt: showPrompt && !isInstalled && isMobile,
    install,
    dismissPrompt,
  };
};

