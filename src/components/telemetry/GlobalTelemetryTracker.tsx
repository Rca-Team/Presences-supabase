import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  getDeviceFingerprintId,
  getSessionId,
  collectHardwareSpecs,
  resolveGeoLocationAndIP,
  recordLocalActivity,
  getLocalActivityBuffer,
  TelemetrySessionData,
} from '@/services/DeviceTelemetryService';
import { playQuietAlertTone, playWinnerCelebrationChime } from '@/utils/audioChimes';
import { toast } from 'sonner';

/**
 * GlobalTelemetryTracker
 * Background presence & session heartbeat transmitter.
 * Tracks both authenticated staff and anonymous guests across all routes.
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
  const currentUserRef = useRef<{ id?: string; name?: string; email?: string; role?: string; avatar?: string } | null>(null);

  // Load hardware & geo once on boot
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [hw, geo] = await Promise.all([
          collectHardwareSpecs(),
          resolveGeoLocationAndIP(),
        ]);
        if (isMounted) {
          hardwareSpecsRef.current = hw;
          geoInfoRef.current = geo;
          triggerPresenceSync('boot');
        }
      } catch (err) {
        console.warn('[Telemetry] Spec resolution error:', err);
      }
    })();

    // Listen for auth state changes to tag session with user profile
    const fetchUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const u = session.user;
          const meta = u.user_metadata || {};
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

  // Track route changes
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

  // Track user interaction & idle state
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

    // Idle detection timer (after 90 seconds without touch/keys)
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

  // Build complete payload
  const buildTelemetryPayload = (): TelemetrySessionData => {
    const deviceId = getDeviceFingerprintId();
    const sessionId = getSessionId();
    const user = currentUserRef.current;

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
      hardware: hardwareSpecsRef.current || {
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
      geo: geoInfoRef.current || {
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
      recentEvents: getLocalActivityBuffer(),
    };
  };

  // Sync state into Supabase presence
  const triggerPresenceSync = async (reason?: string) => {
    if (!presenceChannelRef.current) return;
    try {
      const payload = buildTelemetryPayload();
      await presenceChannelRef.current.track(payload);
    } catch (e) {
      // Ignore transient network errors
    }
  };

  // Initialize Realtime channels
  useEffect(() => {
    const deviceId = getDeviceFingerprintId();

    // 1. Presence channel for real-time fleet roster
    const presenceChannel = supabase.channel('presence:fleet-radar', {
      config: {
        presence: {
          key: deviceId,
        },
      },
    });

    presenceChannel
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await triggerPresenceSync('initial_connect');
        }
      });

    presenceChannelRef.current = presenceChannel;

    // 2. Broadcast channel for remote fleet commands (Ping, Toast, Force Refresh)
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

    // Periodic heartbeat every 25 seconds
    const heartbeatTimer = setInterval(() => {
      triggerPresenceSync('heartbeat');
    }, 25000);

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

  return null;
};

export default GlobalTelemetryTracker;
