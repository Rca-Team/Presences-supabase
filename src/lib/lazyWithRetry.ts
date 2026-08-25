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
      const errorMsg = String(error?.message || error || '');
      const isChunkError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('Loading chunk') ||
        errorMsg.includes('MIME type') ||
        errorMsg.includes('Failed to fetch') ||
        error?.name === 'TypeError';

      // If we haven't reloaded yet for this section, clear stale cache and perform a one-time fresh reload
      if (!hasReloaded && isChunkError && typeof window !== 'undefined') {
        sessionStorage.setItem(sessionKey, Date.now().toString());

        // Update service workers if active
        if ('serviceWorker' in navigator) {
          try {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const reg of regs) {
              await reg.update();
            }
          } catch (_) {}
        }

        // Cache-busting reload to get current index.html and fresh chunk URLs
        window.location.reload();

        // Return an unresolved promise while the browser reloads
        return new Promise<{ default: T }>(() => {});
      }

      // One quick retry with backoff
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const res = await importer();
        if (typeof window !== 'undefined') sessionStorage.removeItem(sessionKey);
        return res;
      } catch (secondError) {
        console.error(`[lazyWithRetry] Permanent failure loading chunk ${retryKey}:`, secondError);
        if (typeof window !== 'undefined') sessionStorage.removeItem(sessionKey);
        throw secondError;
      }
    }
  });
}

export default lazyWithRetry;
