import React from 'react';
import { RefreshCw, Home, AlertTriangle, Sparkles } from 'lucide-react';

interface State {
  error: Error | null;
  recovering: boolean;
  errorInfo?: React.ErrorInfo | null;
}

const CHUNK_KEY = 'presence:chunk-recovery';

function isChunkOrNetworkError(error: Error) {
  const msg = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('csssyntaxerror') ||
    msg.includes('networkerror')
  );
}

/**
 * Enterprise AppErrorBoundary with auto-healing and graceful fallback.
 * Automatically recovers from stale Vite chunks, WebGL context drops,
 * or corrupted service worker caches without trapping the user in a blank white screen.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, recovering: false, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    if (!isChunkOrNetworkError(error)) {
      console.warn('App error boundary caught runtime exception:', error);
      return;
    }

    let attempts = 0;
    try {
      attempts = Number(sessionStorage.getItem(CHUNK_KEY) || '0');
    } catch {
      /* private mode */
    }

    if (attempts >= 1) return;

    try {
      sessionStorage.setItem(CHUNK_KEY, String(attempts + 1));
    } catch {
      /* ignore */
    }

    this.setState({ recovering: true });

    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.warn('Chunk recovery cleanup failed', err);
      } finally {
        window.location.reload();
      }
    })();
  }

  private reset = () => {
    this.setState({ error: null, recovering: false, errorInfo: null });
  };

  private handleHardReset = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      sessionStorage.clear();
    } catch (e) {
      console.warn('Hard reset cleanup error:', e);
    } finally {
      window.location.assign('/');
    }
  };

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;

    if (recovering) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-xl">
            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">
              Syncing Presences with the latest updates…
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 bg-background/95">
        <div className="max-w-md w-full rounded-3xl border border-border/80 bg-card p-6 sm:p-8 text-center shadow-2xl space-y-5">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Application Recovered
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {error.message || 'An unexpected rendering state was caught and safely contained.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
            <button
              onClick={this.reset}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:opacity-90 active:scale-[0.98]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try Again
            </button>
            <button
              onClick={this.handleHardReset}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-background/50 px-5 py-2.5 text-xs font-bold text-foreground transition-all hover:bg-muted active:scale-[0.98]"
            >
              <Home className="h-3.5 w-3.5 text-muted-foreground" />
              Clear Cache & Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
