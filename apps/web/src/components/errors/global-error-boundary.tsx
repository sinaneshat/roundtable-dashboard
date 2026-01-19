import posthog from 'posthog-js';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

/**
 * Check if PostHog is available for tracking
 */
function isPostHogAvailable(): boolean {
  if (typeof window === 'undefined')
    return false;
  return getWebappEnv() !== WEBAPP_ENVS.LOCAL;
}

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

/**
 * Global Error Boundary
 *
 * Shows detailed error info in local/preview environments for debugging.
 * Shows generalized error message in production for security.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });

    // Track error to PostHog
    if (isPostHogAvailable()) {
      posthog.capture('$exception', {
        $exception_message: error.message,
        $exception_stack_trace_raw: error.stack,
        $exception_type: error.name,
        $exception_source: 'global_error_boundary',
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : '',
      });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo } = this.state;
      const isProd = getWebappEnv() === WEBAPP_ENVS.PROD;

      return (
        <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4 sm:p-8">
          <div className="w-full max-w-3xl">
            {/* Error Card */}
            <div className="rounded-2xl border border-destructive/30 bg-card/80 backdrop-blur-sm p-6 sm:p-10 shadow-xl">
              {/* Header */}
              <div className="flex flex-col items-center text-center mb-8">
                <div className="rounded-full bg-destructive/10 p-4 mb-4">
                  <Icons.triangleAlert className="size-10 text-destructive" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-destructive mb-2">
                  Something went wrong
                </h1>
                <p className="text-muted-foreground text-base sm:text-lg max-w-md">
                  An unexpected error occurred. Please try again or return home.
                </p>
              </div>

              {/* Error Details - Development Only */}
              {!isProd && error && (
                <details className="w-full rounded-xl bg-destructive/5 border border-destructive/20 mb-8 overflow-hidden">
                  <summary className="cursor-pointer px-5 py-4 font-medium text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2">
                    <Icons.chevronRight className="size-4 transition-transform [details[open]>&]:rotate-90" />
                    <span>Error Details</span>
                    <Badge variant="outline" className="ml-auto font-mono text-xs">
                      {error.name || 'Error'}
                    </Badge>
                  </summary>
                  <div className="px-5 pb-5 space-y-4 border-t border-destructive/10">
                    <div className="pt-4">
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Message</p>
                      <pre className="overflow-x-auto rounded-lg bg-black/20 p-4 text-sm text-destructive/90 font-mono whitespace-pre-wrap break-words">
                        {error.message || error.toString()}
                      </pre>
                    </div>
                    {error.stack && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Stack Trace</p>
                        <pre className="overflow-auto rounded-lg bg-black/20 p-4 text-xs text-muted-foreground font-mono max-h-64 whitespace-pre">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                    {errorInfo?.componentStack && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Component Stack</p>
                        <pre className="overflow-auto rounded-lg bg-black/20 p-4 text-xs text-muted-foreground font-mono max-h-48 whitespace-pre">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                    {typeof window !== 'undefined' && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">URL</p>
                        <pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-xs text-muted-foreground font-mono">
                          {window.location.href}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="default"
                  size="lg"
                  onClick={this.handleReset}
                  startIcon={<Icons.refreshCw className="size-4" />}
                  className="min-w-[140px]"
                >
                  Reload Page
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => window.history.back()}
                  startIcon={<Icons.arrowLeft className="size-4" />}
                  className="min-w-[140px]"
                >
                  Go Back
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
