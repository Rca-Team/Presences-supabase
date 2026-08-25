import React from "react";

// Retry a failed dynamic import once with a small delay before giving up.
// We deliberately DO NOT call window.location.reload() here — a hard reload
// on chunk errors causes reload loops when a stale service worker or CDN
// keeps serving broken references. React's error boundary handles the
// final failure gracefully instead.
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  _retryKey: string,
) {
  return React.lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      // One quick retry — handles transient network / chunk hiccups.
      await new Promise((resolve) => setTimeout(resolve, 400));
      try {
        return await importer();
      } catch (secondError) {
        console.error("Lazy chunk failed to load after retry:", secondError);
        throw secondError;
      }
    }
  });
}
