import React from 'react';

interface State {
  error: Error | null;
  recovering: boolean;
}

const CHUNK_KEY = 'presence:chunk-recovery';

function isChunkError(error: Error) {
  const msg = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return (
    msg.includes('dynamically imported module') ||
    msg.includes('failed to fetch') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('csssyntaxerror')
  );
}

/**
 * Top-level boundary. A failed lazy chunk (usually a stale deployment) is
 * recovered ONCE per session by clearing caches + unregistering the service
 * worker and reloading. Any further failure shows a retry card instead of
 * looping forever.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isChunkError(error)) {
      console.error('App error boundary caught:', error);
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
    this.setState({ error: null, recovering: false });
  };

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;

    if (recovering) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <p className="text-sm text-muted-foreground animate-pulse">
            Updating Presences to the latest version…
          </p>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
          <h1 className="text-lg font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || 'An unexpected error occurred while loading this view.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={this.reset}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform duration-200 hover:-translate-y-0.5"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
