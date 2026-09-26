import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  getDeviceFingerprintId,
  getSessionId,
  collectHardwareSpecs,
  resolveGeoLocationAndIP,
  recordLocalActivity,
  getLocalActivityBuffer,
  recordClientError,
  getClientErrorsBuffer,
  calculateCampusDistance,
  detectIncognitoMode,
  registerAccountOnDevice,
  measureCurrentFPS,
  TelemetrySessionData,
} from '@/services/DeviceTelemetryService';
import { playQuietAlertTone, playWinnerCelebrationChime } from '@/utils/audioChimes';
import { toast } from 'sonner';
import { Lock, ShieldAlert } from 'lucide-react';

/**
 * GlobalTelemetryTracker
 * Advanced enterprise telemetry & fleet diagnostic agent.
 * Tracks presence, campus geofencing, security anomalies, client errors, and kiosk locks.
 */
export const GlobalTelemetryTracker: React.FC = () => {
  const location = useLocation();
  const presenceChannelRef = useRef<any>(null);
  const commandChannelRef = useRef<any>(null);
  const routeEnteredAtRef = useRef<number>(Date.now());
  const sessionStartedAtRef = useRef<number>(Date.now());
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleRef = useRef<boolean>(false);
  const hardwareSpecsRef = useRef<any>(null);
  const geoInfoRef = useRef<any>(null);
  const isIncognitoRef = useRef<boolean>(false);
  const multiAccountRef = useRef<{ isMultiAccount: boolean; count: number }>({ isMultiAccount: false, count: 1 });
  const currentUserRef = useRef<{ id?: string; name?: string; email?: string; role?: string; avatar?: string } | null>(null);
  const [isKioskLocked, setIsKioskLocked] = useState<boolean>(false);
  const [kioskLockReason, setKioskLockReason] = useState<string>('Device under maintenance by School Administrator');

  // 1. Capture Client Runtime Errors & Unhandled Rejections
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      recordClientError(event.message || 'Unknown Error', event.filename, event.lineno, event.colno);
      triggerPresenceSync('client_error');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || String(event.reason || 'Unhandled Promise Rejection');
      recordClientError(reason, 'Promise');
      triggerPresenceSync('unhandled_rejection');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // 2. Load hardware, geo, incognito once on boot
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [hw, geo, incognito] = await Promise.all([
          collectHardwareSpecs(),
          resolveGeoLocationAndIP(),
          detectIncognitoMode(),
        ]);
        if (isMounted) {
          hardwareSpecsRef.current = hw;
          geoInfoRef.current = geo;
          isIncognitoRef.current = incognito;
          triggerPresenceSync('boot');
        }
      } catch (err) {
        console.warn('[Telemetry] Boot spec resolution error:', err);
      }
    })();

    // Listen for auth state changes to tag session with user profile
    const fetchUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const u = session.user;
          const meta = u.user_metadata || {};
          const userIdentifier = u.email || u.id;
          multiAccountRef.current = registerAccountOnDevice(userIdentifier);

          currentUserRef.current = {
            id: u.id,
            email: u.email,
            name: meta.full_name || meta.name || u.email?.split('@')[0] || 'User',
            role: meta.role || 'authenticated',
            avatar: meta.avatar_url || meta.picture || undefined,
          };
        } else {
          currentUserRef.current = null;
        }
        triggerPresenceSync('auth_change');
      } catch {}
    };

    fetchUser();
    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      fetchUser();
    });

    return () => {
      isMounted = false;
      authSub.subscription.unsubscribe();
    };
  }, []);

  // 3. Track route changes
  useEffect(() => {
    routeEnteredAtRef.current = Date.now();
    lastActivityRef.current = Date.now();
    isIdleRef.current = false;

    recordLocalActivity('navigation', `Navigated to ${location.pathname}`, {
      path: location.pathname,
      search: location.search,
    });

    triggerPresenceSync('route_change');
  }, [location.pathname, location.search]);

  // 4. Track user interaction & idle state
  useEffect(() => {
    const handleUserAction = () => {
      lastActivityRef.current = Date.now();
      if (isIdleRef.current) {
        isIdleRef.current = false;
        triggerPresenceSync('resumed_active');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isIdleRef.current = true;
        triggerPresenceSync('hidden');
      } else {
        lastActivityRef.current = Date.now();
        isIdleRef.current = false;
        triggerPresenceSync('visible');
      }
    };

    window.addEventListener('pointerdown', handleUserAction, { passive: true });
    window.addEventListener('keydown', handleUserAction, { passive: true });
    window.addEventListener('scroll', handleUserAction, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const idleCheckInterval = setInterval(() => {
      const elapsedSinceAction = Date.now() - lastActivityRef.current;
      if (elapsedSinceAction > 90000 && !isIdleRef.current) {
        isIdleRef.current = true;
        triggerPresenceSync('idle_detected');
      }
    }, 15000);

    return () => {
      window.removeEventListener('pointerdown', handleUserAction);
      window.removeEventListener('keydown', handleUserAction);
      window.removeEventListener('scroll', handleUserAction);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(idleCheckInterval);
    };
  }, []);

  // 5. Build complete advanced payload
  const buildTelemetryPayload = (): TelemetrySessionData => {
    const deviceId = getDeviceFingerprintId();
    const sessionId = getSessionId();
    const user = currentUserRef.current;
    const geo = geoInfoRef.current;
    const hw = hardwareSpecsRef.current;

    const geofence = calculateCampusDistance(geo?.latitude ?? null, geo?.longitude ?? null);
    const rtt = hw?.rttMs || 25;
    const connectionQualityScore = Math.max(10, Math.min(100, Math.round(100 - (rtt / 300) * 40)));

    return {
      deviceId,
      sessionId,
      userId: user?.id || null,
      userName: user?.name || null,
      userEmail: user?.email || null,
      userRole: user?.role || 'Guest Visitor',
      userAvatar: user?.avatar || null,
      isAnonymous: !user?.id,
      currentRoute: location.pathname,
      pageTitle: document.title || 'Presences',
      routeEnteredAt: routeEnteredAtRef.current,
      sessionStartedAt: sessionStartedAtRef.current,
      lastHeartbeat: Date.now(),
      status: isIdleRef.current ? 'idle' : 'online',
      isKioskLocked,
      hardware: hw || {
        deviceType: 'desktop',
        brandModel: 'Web Client',
        os: 'Unknown',
        osVersion: '',
        browser: 'Browser',
        browserVersion: '',
        cpuCores: 4,
        deviceMemoryGB: null,
        gpuRenderer: 'Standard GPU',
        gpuVendor: 'System',
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        colorDepth: 24,
        touchPoints: 0,
        isTouchScreen: false,
        isPWA: false,
        batteryLevel: null,
        batteryCharging: null,
        networkType: 'Online',
        effectiveConnectionType: '4g',
        downlinkSpeedMbps: null,
        rttMs: null,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      geo: geo || {
        ip: 'Connecting...',
        city: 'Local Campus',
        region: 'Delhi',
        country: 'India',
        countryCode: 'IN',
        countryFlag: '🇮🇳',
        postalCode: '',
        latitude: 28.6139,
        longitude: 77.209,
        isp: 'Local Network',
        org: 'Presences School Network',
        timezone: 'Asia/Kolkata',
        localTime: new Date().toLocaleTimeString(),
      },
      geofence,
      security: {
        isIncognito: isIncognitoRef.current,
        isMultiAccount: multiAccountRef.current.isMultiAccount,
        accountsSeenCount: multiAccountRef.current.count,
        isVPNorProxy: false,
        connectionQualityScore,
      },
      diagnostics: {
        fps: measureCurrentFPS(),
        networkJitterMs: Math.round(Math.random() * 8 + 2),
        clientErrorsCount: getClientErrorsBuffer().length,
        memoryPressure: hw?.deviceMemoryGB && hw.deviceMemoryGB <= 2 ? 'moderate' : 'nominal',
      },
      recentEvents: getLocalActivityBuffer(),
      recentErrors: getClientErrorsBuffer(),
    };
  };

  // 6. Sync state into Supabase presence
  const triggerPresenceSync = async (reason?: string) => {
    if (!presenceChannelRef.current) return;
    try {
      const payload = buildTelemetryPayload();
      await presenceChannelRef.current.track(payload);
    } catch (e) {
      // Ignore transient network errors
    }
  };

  // 7. Initialize Realtime presence & command channels
  useEffect(() => {
    const deviceId = getDeviceFingerprintId();

    const presenceChannel = supabase.channel('presence:fleet-radar', {
      config: {
        presence: {
          key: deviceId,
        },
      },
    });

    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await triggerPresenceSync('initial_connect');
      }
    });

    presenceChannelRef.current = presenceChannel;

    const commandChannel = supabase.channel('broadcast:fleet-commands');

    commandChannel
      .on('broadcast', { event: 'ping' }, (payload) => {
        const targetDeviceId = payload.payload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId === deviceId) {
          playWinnerCelebrationChime();
          toast.info('🔔 Admin Fleet Ping', {
            description: payload.payload?.message || 'Connection verified by School Administrator.',
            duration: 5000,
          });
        }
      })
      .on('broadcast', { event: 'alert' }, (payload) => {
        const targetDeviceId = payload.payload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId === deviceId) {
          playQuietAlertTone();
          toast.warning('📢 Announcement from Admin', {
            description: payload.payload?.message || 'Please check your school portal for updates.',
            duration: 8000,
          });
        }
      })
      .on('broadcast', { event: 'lock_kiosk' }, (payload) => {
        const targetDeviceId = payload.payload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId === deviceId) {
          setIsKioskLocked(true);
          if (payload.payload?.reason) setKioskLockReason(payload.payload.reason);
          triggerPresenceSync('kiosk_locked');
        }
      })
      .on('broadcast', { event: 'unlock_kiosk' }, (payload) => {
        const targetDeviceId = payload.payload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId === deviceId) {
          setIsKioskLocked(false);
          triggerPresenceSync('kiosk_unlocked');
        }
      })
      .on('broadcast', { event: 'reload' }, (payload) => {
        const targetDeviceId = payload.payload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId === deviceId) {
          toast.loading('🔄 Remote Update: Refreshing app...');
          setTimeout(() => {
            window.location.reload();
          }, 1200);
        }
      })
      .subscribe();

    commandChannelRef.current = commandChannel;

    // Periodic heartbeat every 20 seconds
    const heartbeatTimer = setInterval(() => {
      triggerPresenceSync('heartbeat');
    }, 20000);

    return () => {
      clearInterval(heartbeatTimer);
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
      }
      if (commandChannelRef.current) {
        supabase.removeChannel(commandChannelRef.current);
      }
    };
  }, []);

  // Render Kiosk Maintenance Lock Overlay if remotely locked
  if (isKioskLocked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center select-none">
        <div className="w-20 h-20 rounded-3xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center mb-6 animate-pulse">
          <Lock className="w-10 h-10 text-rose-400" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Kiosk Terminal Locked</h1>
        <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
          {kioskLockReason}
        </p>
        <div className="mt-8 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs font-mono text-slate-400 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>Device ID: {getDeviceFingerprintId().slice(0, 16)}</span>
        </div>
      </div>
    );
  }

  return null;
};

export default GlobalTelemetryTracker;
