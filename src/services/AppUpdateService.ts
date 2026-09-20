/**
 * AppUpdateService — Simple, Reliable Mobile & PWA Update Pusher
 *
 * 1. Automatically checks for Service Worker updates upon page focus and periodic interval.
 * 2. Receives real-time push broadcasts from Admins via Supabase Realtime Broadcast.
 * 3. Provides clean 1-tap cache invalidation and page reload without user hassle.
 */

import { supabase } from '@/integrations/supabase/client';

export interface AppUpdateDetails {
  version?: string;
  title?: string;
  description?: string;
  forced?: boolean;
  timestamp?: number;
}

type UpdateListener = (details: AppUpdateDetails | null) => void;

const UPDATE_BROADCAST_CHANNEL = 'presences_app_updates_broadcast';
const SETTING_KEY_APP_UPDATE = 'latest_app_version_announcement';
const CURRENT_APP_VERSION = 'v2.4.2';
const STORAGE_KEY_DISMISSED_UPDATE = 'presences_app_update_dismissed_version';
const STORAGE_KEY_PROMPTED_UPDATE = 'presences_app_update_prompted_version';

class AppUpdateManager {
  private listeners: Set<UpdateListener> = new Set();
  private pendingUpdate: AppUpdateDetails | null = null;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private bc: BroadcastChannel | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private hasInitialized = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;

    // 1. Listen for Service Worker lifecycle events (new worker waiting)
    this.setupServiceWorkerListeners();

    // 2. Cross-tab broadcast channel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.bc = new BroadcastChannel('presences_app_updates_cross_tab');
        this.bc.onmessage = (e) => {
          if (e.data?.action === 'app_update_available') {
            this.setPendingUpdate(e.data.details || { version: CURRENT_APP_VERSION });
          } else if (e.data?.action === 'force_reload') {
            void this.applyUpdate(true);
          }
        };
      }
    } catch {}

    // 3. Supabase Realtime Broadcast for Admin-initiated updates
    try {
      this.channel = supabase.channel(UPDATE_BROADCAST_CHANNEL, {
        config: { broadcast: { ack: false, self: false } },
      });

      this.channel
        .on('broadcast', { event: 'new_app_update' }, (payload: any) => {
          const details: AppUpdateDetails = payload?.payload || {};
          if (details.forced) {
            void this.applyUpdate(true);
          } else {
            this.setPendingUpdate(details);
          }
        })
        .subscribe();
    } catch (e) {
      console.warn('[AppUpdateService] Realtime channel subscription skipped:', e);
    }

    // 4. Initial check on focus and periodic (every 10 minutes)
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.checkForUpdates());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkForUpdates();
        }
      });
      this.checkInterval = setInterval(() => this.checkForUpdates(), 10 * 60 * 1000);
      this.checkForUpdates();
    }
  }

  private setupServiceWorkerListeners() {
    if (!('serviceWorker' in navigator)) return;

    // Check existing registration
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // If a worker is already waiting, trigger update
      if (reg.waiting) {
        this.setPendingUpdate({
          version: CURRENT_APP_VERSION,
          title: 'Update Ready to Install',
          description: 'A new version of Presences is downloaded. Tap update to apply.',
        });
      }

      // Listen for when a new installing worker transitions to waiting
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.setPendingUpdate({
              version: CURRENT_APP_VERSION,
              title: 'New Update Downloaded',
              description: 'Fresh improvements and speed optimizations are ready.',
            });
          }
        });
      });
    });
  }

  /**
   * Check for Service Worker updates from server
   */
  public async checkForUpdates(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false;

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          this.setPendingUpdate({
            version: CURRENT_APP_VERSION,
            title: 'New Update Available',
            description: 'Tap to update to the latest version.',
          });
          return true;
        }
      }
    } catch {}

    return false;
  }

  /**
   * Broadcast an app update from Admin to all connected mobile apps / devices
   */
  public async broadcastAppUpdate(details: {
    version?: string;
    title?: string;
    description?: string;
    forced?: boolean;
  }): Promise<boolean> {
    const payload: AppUpdateDetails = {
      version: details.version || CURRENT_APP_VERSION,
      title: details.title || 'App Update Available',
      description: details.description || 'New features and bug fixes have been deployed.',
      forced: Boolean(details.forced),
      timestamp: Date.now(),
    };

    // 1. Supabase Realtime Broadcast
    try {
      if (this.channel) {
        await this.channel.send({
          type: 'broadcast',
          event: 'new_app_update',
          payload,
        });
      }
    } catch (e) {
      console.warn('[AppUpdateService] Broadcast send error:', e);
    }

    // 2. Cross-tab broadcast
    try {
      if (this.bc) {
        this.bc.postMessage({ action: 'app_update_available', details: payload });
      }
    } catch {}

    // 3. Persist setting in Supabase for late-joining clients
    try {
      const { data: existing } = await supabase
        .from('attendance_settings')
        .select('id')
        .eq('key', SETTING_KEY_APP_UPDATE)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('attendance_settings')
          .update({
            value: payload as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('attendance_settings')
          .insert({
            key: SETTING_KEY_APP_UPDATE,
            value: payload as any,
          });
      }
    } catch {}

    return true;
  }

  /**
   * 1-Tap Update Application:
   * - Clears caches
   * - Activates waiting service worker
   * - Hard-refreshes page
   */
  public async applyUpdate(forced = false): Promise<void> {
    try {
      // Clear dismissal flags upon successful upgrade
      try {
        localStorage.removeItem(STORAGE_KEY_DISMISSED_UPDATE);
        sessionStorage.removeItem(STORAGE_KEY_PROMPTED_UPDATE);
      } catch {}

      // 1. Notify waiting service workers to skip waiting
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        regs.forEach((reg) => {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      }

      // 2. Clear workbox / precache caches so latest assets load fresh
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
              .filter((k) => k.includes('workbox') || k.includes('precache') || k.includes('runtime'))
              .map((k) => caches.delete(k))
        );
      }
    } catch {}

    // 3. Clear pending state
    this.pendingUpdate = null;
    this.notifyListeners();

    // 4. Clean reload
    setTimeout(() => {
      window.location.reload();
    }, forced ? 100 : 300);
  }

  /**
   * Dismiss the update and remember choice so user is asked only ONCE.
   */
  public dismissUpdate() {
    if (this.pendingUpdate) {
      try {
        const updateKey =
          this.pendingUpdate.version ||
          (this.pendingUpdate.timestamp ? String(this.pendingUpdate.timestamp) : 'dismissed_update');
        localStorage.setItem(STORAGE_KEY_DISMISSED_UPDATE, updateKey);
      } catch {}
    }
    this.pendingUpdate = null;
    this.notifyListeners();
  }

  /**
   * Set pending update with One-Time Prompt Protection.
   * If already dismissed or already prompted in this session, do not harass user.
   */
  public setPendingUpdate(details: AppUpdateDetails | null) {
    if (!details) {
      this.pendingUpdate = null;
      this.notifyListeners();
      return;
    }

    const updateKey =
      details.version ||
      (details.timestamp ? String(details.timestamp) : 'release_update');

    // If not a forced update, respect one-time ask logic:
    if (!details.forced) {
      try {
        const dismissedKey = localStorage.getItem(STORAGE_KEY_DISMISSED_UPDATE);
        if (dismissedKey === updateKey) {
          // User already dismissed this update — DO NOT prompt again!
          return;
        }

        const promptedKey = sessionStorage.getItem(STORAGE_KEY_PROMPTED_UPDATE);
        if (promptedKey === updateKey && this.pendingUpdate === null) {
          // Already presented once during this session — DO NOT prompt again!
          return;
        }
      } catch {}
    }

    // Mark as prompted in session
    try {
      sessionStorage.setItem(STORAGE_KEY_PROMPTED_UPDATE, updateKey);
    } catch {}

    this.pendingUpdate = details;
    this.notifyListeners();
  }

  public getPendingUpdate(): AppUpdateDetails | null {
    return this.pendingUpdate;
  }

  public subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    listener(this.pendingUpdate);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l(this.pendingUpdate));
  }
}

export const appUpdateService = new AppUpdateManager();
