import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'
import { toast } from 'sonner'

// Clean up only stale app-shell SWs from legacy builds.
// Keep /sw-push.js intact because it's required for emergency/background push.
const unregisterStaleServiceWorkers = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.map(async (r) => {
        const script = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
        const isLegacyAppSw = script.includes('/sw.js') || script.includes('/service-worker.js');
        const isPushSw = script.includes('/sw-push.js');
        if (isLegacyAppSw && !isPushSw) {
          await r.unregister();
        }
      }),
    );

    if ('caches' in window) {
      const keys = await caches.keys();
      const staleKeys = keys.filter(
        (k) =>
          k.includes('workbox') ||
          k.includes('precache') ||
          k.includes('runtime') ||
          k.includes('googleAnalytics'),
      );
      await Promise.all(staleKeys.map((k) => caches.delete(k)));
    }
  } catch (e) {
    // Best-effort only; do not block app startup.
    console.warn('Service worker cleanup skipped:', e);
  }
};

void unregisterStaleServiceWorkers();

// One-time local hard reset for remixed/forked projects:
// clears old session/auth/cache/face data so the app starts fresh.
const LOCAL_RESET_MARKER = 'presence_local_reset_v1_done';

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decoded = atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const sanitizeSupabaseAuthStorage = () => {
  try {
    if (typeof localStorage === 'undefined') return;

    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.includes('-auth-token')) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        keysToRemove.push(key);
        continue;
      }

      const accessToken = parsed?.access_token || parsed?.currentSession?.access_token;
      if (!accessToken || typeof accessToken !== 'string') {
        keysToRemove.push(key);
        continue;
      }

      const payload = decodeJwtPayload(accessToken);
      if (!payload?.sub) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (e) {
    console.warn('Auth storage sanitization skipped:', e);
  }
};

const resetLocalProjectDataOnce = () => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LOCAL_RESET_MARKER) === '1') {
      return;
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
      localStorage.setItem(LOCAL_RESET_MARKER, '1');
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    if (typeof indexedDB !== 'undefined' && 'deleteDatabase' in indexedDB) {
      indexedDB.deleteDatabase('FaceDescriptorCache');
    }

    // Remove any other legacy IndexedDB databases used by the app
    if (typeof indexedDB !== 'undefined' && (indexedDB as any).databases) {
      (indexedDB as any).databases().then((dbs: Array<{ name?: string }>) => {
        dbs.forEach((db) => {
          if (db.name) indexedDB.deleteDatabase(db.name);
        });
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Local project reset skipped:', e);
  }
};

resetLocalProjectDataOnce();
sanitizeSupabaseAuthStorage();


// Improved model loading with retry mechanism
const loadFaceModels = async (retries = 2, delay = 1500) => {
  let attempt = 0;

  // Dynamic import: keeps face-api.js + tfjs (~850kB) out of the entry chunk
  // so the first paint isn't blocked by parsing the model runtime.
  const { loadModels, areModelsLoaded } = await import('./services/FaceRecognitionService');
  
  while (attempt <= retries) {
    try {
      if (areModelsLoaded()) {
        console.log('Face recognition models already loaded');
        return true;
      }
      
      console.log(`Loading face recognition models (attempt ${attempt + 1}/${retries + 1})...`);
      await loadModels();
      console.log('Face recognition models loaded successfully');
      return true;
    } catch (err) {
      console.error(`Error loading face models (attempt ${attempt + 1}/${retries + 1}):`, err);
      
      if (attempt < retries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        // Increase delay for each retry using exponential backoff
        delay = delay * 1.5;
      }
      
      attempt++;
    }
  }
  
  console.error(`Failed to load face models after ${retries + 1} attempts`);
  return false;
}

// Global error handler to prevent white screens
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Initialize application
const initApp = () => {
  try {
    const root = document.getElementById("root");
    if (!root) {
      console.error('Root element not found');
      return;
    }
    
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    
    // Defer face model loading until the browser is idle so the first paint
    // and route hydration aren't blocked by a ~7MB model download.
    const scheduleModelLoad = () => {
      loadFaceModels().then(success => {
        if (!success) {
          toast.error('Failed to pre-load face recognition models. Some features may not work correctly.', {
            duration: 6000,
            id: 'face-models-error'
          });
        }
      });
    };
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(scheduleModelLoad, { timeout: 4000 });
    } else {
      setTimeout(scheduleModelLoad, 2500);
    }

  } catch (err) {
    console.error('Failed to initialize app:', err);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0f172a;color:#fff;font-family:sans-serif;padding:20px;text-align:center;">
        <div><h2>Something went wrong</h2><p style="color:#94a3b8;margin-top:8px;">Please refresh the page. If the issue persists, clear your browser cache.</p><button onclick="location.reload()" style="margin-top:16px;padding:8px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;">Refresh</button></div>
      </div>`;
    }
  }
}

// Start the application
initApp();
