import React from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Home,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Terminal,
  RotateCcw,
} from 'lucide-react';
import {
  formatErrorMessage,
  isRecoverableChunkOrNetworkError,
  performAppRecovery,
  generateErrorDiagnostics,
} from '@/utils/errorHandler';

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  recovering: boolean;
  showDetails: boolean;
  copied: boolean;
  retryCount: number;
}

const CHUNK_KEY = 'presence:chunk-recovery';

/**
 * Enterprise AppErrorBoundary with auto-healing, diagnostics, and graceful fallback.
 * Prevents full-screen crashes, automatically resolves stale build chunks,
 * and provides 1-tap copy diagnostics for fast debugging.
 */
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = {
    error: null,
    errorInfo: null,
    recovering: false,
    showDetails: false,
    copied: false,
    retryCount: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    if (!isRecoverableChunkOrNetworkError(error)) {
      console.warn('[AppErrorBoundary caught exception]:', error);
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
    void performAppRecovery(false);
  }

  private handleSoftRetry = () => {
    this.setState((prev) => ({
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  private handleReload = () => {
    this.setState({ recovering: true });
    void performAppRecovery(false);
  };

  private handleHardReset = () => {
    this.setState({ recovering: true });
    void performAppRecovery(true);
  };

  private handleCopyDiagnostics = async () => {
    try {
      const payload = generateErrorDiagnostics(this.state.error, this.state.errorInfo);
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch (err) {
      console.error('Failed to copy diagnostics:', err);
    }
  };

  render() {
    const { error, recovering, showDetails, copied, errorInfo } = this.state;
    if (!error) return this.props.children;

    if (recovering) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-xl">
            <RefreshCw className="h-5 w-5 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">
              Updating & synchronizing application assets…
            </p>
          </div>
        </div>
      );
    }

    const friendlyMessage = formatErrorMessage(error);

    return (
      <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 py-8 bg-background/95 safe-area-inset">
        <div className="max-w-lg w-full rounded-3xl border border-border/80 bg-card p-6 sm:p-8 text-center shadow-2xl space-y-5">
          {/* Status Badge */}
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shadow-inner">
            <AlertTriangle className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">
              Application Recovered
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {friendlyMessage}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleSoftRetry}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition hover:opacity-90 active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try Again
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-background px-4 py-2.5 text-xs font-bold text-foreground transition hover:bg-muted active:scale-[0.98]"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Reload App
            </button>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={this.handleHardReset}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition active:scale-[0.98]"
            >
              <Home className="h-3.5 w-3.5" />
              Clear Cache & Return Home
            </button>
          </div>

          {/* Collapsible Technical Diagnostics Drawer */}
          <div className="pt-2 border-t border-border/60 text-left">
            <button
              type="button"
              onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-1 transition"
            >
              <span className="flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Technical Diagnostics
              </span>
              {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showDetails && (
              <div className="mt-2.5 space-y-2.5 rounded-xl bg-muted/50 p-3 text-[11px] font-mono border border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Error Details</span>
                  <button
                    type="button"
                    onClick={this.handleCopyDiagnostics}
                    className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[10px] font-sans font-semibold text-foreground border border-border shadow-xs hover:bg-muted transition active:scale-95"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 text-muted-foreground" />
                        Copy Diagnostics
                      </>
                    )}
                  </button>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 text-foreground/90 whitespace-pre-wrap break-all pr-1 select-text">
                  <div className="text-amber-500 font-semibold">{error.name}: {error.message}</div>
                  {errorInfo?.componentStack && (
                    <div className="text-muted-foreground text-[10px] opacity-80 mt-1">
                      {errorInfo.componentStack.slice(0, 500)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
