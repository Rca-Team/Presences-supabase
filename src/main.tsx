import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import App from './App.tsx'
import './index.css'

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

      let parsed: {
        access_token?: unknown;
        currentSession?: { access_token?: unknown };
      };
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

sanitizeSupabaseAuthStorage();


// Global error handler to prevent white screens and recover from deployment chunk mismatches
window.addEventListener('error', (event) => {
  const errorMsg = String(event.error?.message || event.message || '');
  const isChunkOrScriptError =
    errorMsg.includes('Failed to load module script') ||
    errorMsg.includes('Expected a JavaScript-or-Wasm module script') ||
    errorMsg.includes('Loading chunk') ||
    errorMsg.includes('dynamically imported module') ||
    errorMsg.includes('Importing a module script failed');

  if (isChunkOrScriptError) {
    const lastReload = Number(sessionStorage.getItem('presence:stale_chunk_reload') || '0');
    if (!lastReload || Date.now() - lastReload > 6000) {
      sessionStorage.setItem('presence:stale_chunk_reload', String(Date.now()));
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.forEach((k) => caches.delete(k));
        });
      }
      window.location.reload();
      return;
    }
  }
  console.error('Global error caught:', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = String(event.reason?.message || event.reason || '');
  if (
    reason.includes('dynamically imported module') ||
    reason.includes('Loading chunk') ||
    reason.includes('Failed to fetch dynamically imported module')
  ) {
    const lastReload = Number(sessionStorage.getItem('presence:stale_chunk_reload') || '0');
    if (!lastReload || Date.now() - lastReload > 6000) {
      sessionStorage.setItem('presence:stale_chunk_reload', String(Date.now()));
      window.location.reload();
      return;
    }
  }
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
