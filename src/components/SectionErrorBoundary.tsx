import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { formatErrorMessage } from '@/utils/errorHandler';

interface SectionErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
  onReset?: () => void;
  className?: string;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * SectionErrorBoundary — Granular error containment for individual UI blocks.
 * Prevents an error in one panel/widget from breaking the rest of the view.
 */
export class SectionErrorBoundary extends React.Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[SectionErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const { fallbackTitle, fallbackMessage, className } = this.props;
      const errorDetail = this.state.error ? formatErrorMessage(this.state.error) : '';

      return (
        <div
          className={`rounded-2xl border border-destructive/20 bg-destructive/5 p-4 sm:p-5 text-center flex flex-col items-center justify-center gap-3 my-2 ${
            className || ''
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {fallbackTitle || 'Unable to display this section'}
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {fallbackMessage || errorDetail || 'A temporary display error occurred while rendering.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted active:scale-95"
          >
            <RefreshCw className="h-3 w-3 text-muted-foreground" />
            Retry Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SectionErrorBoundary;
