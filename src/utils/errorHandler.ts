/**
 * Enterprise Error Handling & Diagnostics Utility
 * Handles React runtime exceptions, PostgREST/Supabase error decoding,
 * Network diagnostics, and safe automatic recovery.
 */

const KNOWN_REACT_ERRORS: Record<string, string> = {
  '300': 'Rendered fewer hooks than expected (a Hook was called conditionally or after an early return).',
  '310': 'Rendered more hooks than during the previous render.',
  '306': 'Rendered more hooks than expected.',
  '185': 'Maximum update depth exceeded (an infinite loop was triggered by setState during render).',
  '31': 'Objects are not valid as a React child (tried to render an object directly in JSX).',
  '418': 'Hydration error: The server HTML did not match the client-rendered tree.',
  '423': 'Hydration failed because the initial UI does not match what was rendered on the server.',
  '425': 'Text content does not match server-rendered HTML.',
  '152': 'A cross-origin error was thrown.',
  '130': 'Element type is invalid: expected a string or class/function but got undefined.',
  '321': 'Invalid hook call (Hooks can only be called inside the body of a function component).',
};

const POSTGRES_ERRORS: Record<string, string> = {
  '23505': 'A record with this identifier already exists.',
  '23503': 'Referenced student or class record was not found.',
  '42501': 'Permission denied: Your account role is not authorized for this operation.',
  'PGRST116': 'No matching record was found in the database.',
  '22P02': 'Invalid data format or ID format provided.',
  '40001': 'Database transaction conflict. Please retry the action.',
  '57014': 'Database query timeout. The server took too long to respond.',
};

/**
 * Parses and returns a user-friendly explanation of any error object or string.
 */
export function formatErrorMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred.';
  if (typeof error === 'string') return cleanRawMessage(error);

  const err = error as Record<string, any>;
  const rawMsg = String(err.message || err.error_description || err.details || err.hint || '').trim();

  // Check for React minified error code
  const reactExplanation = extractReactInvariantError(rawMsg);
  if (reactExplanation) {
    return reactExplanation;
  }

  // Check for Postgres / PostgREST error codes
  if (err.code && POSTGRES_ERRORS[String(err.code)]) {
    return POSTGRES_ERRORS[String(err.code)];
  }

  // Check for common network/browser errors
  const lowerMsg = rawMsg.toLowerCase();
  if (lowerMsg.includes('failed to fetch') || lowerMsg.includes('networkerror') || lowerMsg.includes('load failed')) {
    return 'Network connection issue. Please check your internet or retry in a moment.';
  }
  if (lowerMsg.includes('jwt expired') || lowerMsg.includes('invalid refresh token') || lowerMsg.includes('session expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lowerMsg.includes('dynamically imported module') || lowerMsg.includes('loading chunk')) {
    return 'A new version of the application is available. Updating assets...';
  }

  return rawMsg ? cleanRawMessage(rawMsg) : 'An unexpected error occurred.';
}

/**
 * Extracts and decodes Minified React invariant error codes from error messages.
 */
export function extractReactInvariantError(message: string): string | null {
  if (!message) return null;
  const match = message.match(/invariant=(\d+)/i) || message.match(/Minified React error #(\d+)/i);
  if (match && match[1]) {
    const code = match[1];
    const explanation = KNOWN_REACT_ERRORS[code];
    if (explanation) {
      return `React Error #${code}: ${explanation}`;
    }
    return `React Error #${code}: Component rendering invariant violated.`;
  }
  return null;
}

function cleanRawMessage(msg: string): string {
  return msg
    .replace(/^Error:\s*/i, '')
    .replace(/visit https:\/\/reactjs\.org[^\s]+/gi, '')
    .trim();
}

/**
 * Checks if the error is caused by stale deployment chunks or network drops.
 */
export function isRecoverableChunkOrNetworkError(error: unknown): boolean {
  if (!error) return false;
  const msg = `${(error as any)?.name ?? ''} ${(error as any)?.message ?? ''} ${String(error)}`.toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('csssyntaxerror') ||
    msg.includes('networkerror') ||
    msg.includes('expected a javascript-or-wasm') ||
    msg.includes('chunk_reload')
  );
}

/**
 * Performs a safe cache clear and asset synchronization without getting stuck in infinite reload loops.
 */
export async function performAppRecovery(hardReset = false): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if (hardReset) {
      sessionStorage.clear();
      localStorage.removeItem('presence:chunk_reload_ts');
      localStorage.removeItem('presence:chunk-recovery');
      window.location.assign('/');
      return;
    }
  } catch (err) {
    console.warn('[Presences Recovery] Storage flush warning:', err);
  }

  window.location.reload();
}

/**
 * Generates structured diagnostics for copy-to-clipboard or user support.
 */
export function generateErrorDiagnostics(
  error: Error | null,
  errorInfo?: { componentStack?: string } | null,
  context?: Record<string, unknown>
): string {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A',
    error: {
      name: error?.name || 'Error',
      message: error?.message || 'Unknown',
      stack: error?.stack || 'No stack available',
      decoded: error?.message ? formatErrorMessage(error.message) : undefined,
    },
    componentStack: errorInfo?.componentStack?.trim() || 'Not available',
    context: context || {},
  };

  return JSON.stringify(diagnostics, null, 2);
}
