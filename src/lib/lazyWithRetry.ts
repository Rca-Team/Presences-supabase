import React from "react";

// Retry a failed dynamic import and auto-recover from stale service workers / CDN hash updates
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retryKey: string,
) {
  return React.lazy(async () => {
    const sessionKey = `retry_chunk_${retryKey}`;
    try {
      return await importer();
    } catch (error: any) {
      console.warn(`[lazyWithRetry] Dynamic chunk load failed for ${retryKey}:`, error);

      const hasReloaded = typeof window !== 'undefined' ? sessionStorage.getItem(sessionKey) : null;
      const errorMsg = String(error?.message || error || '').toLowerCase();
      const isChunkError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('loading chunk') ||
        errorMsg.includes('mime type') ||
        errorMsg.includes('failed to fetch') ||
        errorMsg.includes('importing a module script failed') ||
        errorMsg.includes('expected a javascript-or-wasm') ||
        error?.name === 'TypeError';

      const reloadKey = 'presence:global_chunk_reload';
      const lastReload = typeof window !== 'undefined' ? Number(sessionStorage.getItem(reloadKey) || '0') : 0;
      const now = Date.now();

      // If a deployment occurred and chunk hashes changed, clear SW & cache and reload once
      if (isChunkError && typeof window !== 'undefined' && now - lastReload > 12000) {
        sessionStorage.setItem(reloadKey, String(now));

        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((reg) => reg.unregister()));
          } catch (_) {}
        }
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch (_) {}
        }

        // Cache-busting reload to get latest deployed index.html & chunks
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }

      // One retry with slight backoff
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        return await importer();
      } catch (secondError) {
        console.error(`[lazyWithRetry] Error loading chunk ${retryKey}:`, secondError);
        throw secondError;
      }
    }
  });
}

export default lazyWithRetry;
