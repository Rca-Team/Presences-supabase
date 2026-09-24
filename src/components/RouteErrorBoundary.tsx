import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw, Home, RotateCcw, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  formatErrorMessage,
  isRecoverableChunkOrNetworkError,
  performAppRecovery,
  generateErrorDiagnostics,
} from '@/utils/errorHandler';

interface Props {
  children: React.ReactNode;
  pathname?: string;
  pageTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  prevPathname?: string;
  showDetails: boolean;
  copied: boolean;
  recovering: boolean;
}

class RouteErrorBoundaryInner extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      prevPathname: props.pathname,
      showDetails: false,
      copied: false,
      recovering: false,
    };
  }

  static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
    // If the user navigated to another route, automatically reset the error state!
    if (nextProps.pathname !== prevState.prevPathname) {
      return {
        hasError: false,
        error: null,
        errorInfo: null,
        prevPathname: nextProps.pathname,
        showDetails: false,
        recovering: false,
      };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn(`[RouteErrorBoundary caught error on ${this.props.pathname || 'unknown route'}]:`, error, errorInfo);
    this.setState({ errorInfo });

    // Stale bundle / chunk loading auto-recovery
    if (isRecoverableChunkOrNetworkError(error)) {
      const CHUNK_KEY = 'presence:route-chunk-recovery';
      let attempts = 0;
      try {
        attempts = Number(sessionStorage.getItem(CHUNK_KEY) || '0');
      } catch {
        /* private mode */
      }

      if (attempts < 1) {
        try {
          sessionStorage.setItem(CHUNK_KEY, String(attempts + 1));
        } catch {
          /* ignore */
        }
        this.setState({ recovering: true });
        void performAppRecovery(false);
      }
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      recovering: false,
    });
  };

  handleReload = () => {
    this.setState({ recovering: true });
    void performAppRecovery(false);
  };

  handleCopy = async () => {
    try {
      const payload = generateErrorDiagnostics(this.state.error, this.state.errorInfo);
      await navigator.clipboard.writeText(payload);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (e) {
      console.error('Failed to copy diagnostics:', e);
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.state.recovering) {
        return (
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center min-h-[50vh]">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border/80 shadow-md">
              <RefreshCw className="h-5 w-5 text-primary animate-spin" />
              <p className="text-xs sm:text-sm font-semibold text-foreground">
                Updating page assets to latest version…
              </p>
            </div>
          </div>
        );
      }

      const userMessage = formatErrorMessage(this.state.error);

      return (
        <div className="w-full flex items-center justify-center px-4 py-8 sm:py-16 min-h-[60vh]">
          <div className="w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-8 text-center shadow-lg space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-inner">
              <AlertCircle className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                Unable to display this screen
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {userMessage}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={this.handleReset}
                className="h-9 rounded-xl text-xs font-bold gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Try Again
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReload}
                className="h-9 rounded-xl text-xs font-bold gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload Page
              </Button>
            </div>

            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (typeof window !== 'undefined') window.location.href = '/';
                }}
                className="w-full h-8 rounded-xl text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <Home className="h-3.5 w-3.5" />
                Return to Home
              </Button>
            </div>

            {/* Diagnostics toggle */}
            <div className="pt-2 border-t border-border/60 text-left">
              <button
                type="button"
                onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                className="w-full flex items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground py-1"
              >
                <span>Technical details</span>
                {this.state.showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>

              {this.state.showDetails && (
                <div className="mt-2 space-y-2 rounded-xl bg-muted/40 p-2.5 text-[10px] font-mono border border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-sans">Error Report</span>
                    <button
                      type="button"
                      onClick={this.handleCopy}
                      className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-sans"
                    >
                      {this.state.copied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                  <div className="text-amber-600 dark:text-amber-400 break-all select-text">
                    {this.state.error?.name}: {this.state.error?.message}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * RouteErrorBoundary — Wraps route components to catch and isolate any errors to that
 * specific page, keeping navigation bars, menus, and other routes functioning properly.
 */
export const RouteErrorBoundary: React.FC<{ children: React.ReactNode; pageTitle?: string }> = ({
  children,
  pageTitle,
}) => {
  const location = useLocation();
  return (
    <RouteErrorBoundaryInner pathname={location.pathname} pageTitle={pageTitle}>
      {children}
    </RouteErrorBoundaryInner>
  );
};

export default RouteErrorBoundary;
