import React from "react";

function isChunkMismatchError(error: any): boolean {
  const msg = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('mime type') ||
    msg.includes('text/html')
  );
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retryKey: string,
) {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isChunkMismatchError(error)) {
        const sessionKey = `presence:lazy-reload:${retryKey}`;
        let hasReloaded = false;
        try {
          hasReloaded = Boolean(sessionStorage.getItem(sessionKey));
        } catch {}

        if (!hasReloaded) {
          try {
            sessionStorage.setItem(sessionKey, '1');
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map((k) => caches.delete(k)));
            }
          } catch {}
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      }

      // One quick retry fallback
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        return await importer();
      } catch (secondError) {
        console.warn("Lazy chunk failed to load:", secondError);
        throw secondError;
      }
    }
  });
}

