// Simplified auth storage for self-hosted deployment.
// Automatically evicts expired auth tokens so anonymous or public requests do not fail with 401 Unauthorized.
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          try {
            const parsed = JSON.parse(item);
            if (parsed?.expires_at && parsed.expires_at * 1000 < Date.now()) {
              keysToRemove.push(key);
            }
          } catch {
            keysToRemove.push(key);
          }
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  return localStorage;
}
