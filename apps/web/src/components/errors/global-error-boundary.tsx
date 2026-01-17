import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { getWebappEnv, WEBAPP_ENVS } from '@/lib/config/base-urls';

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

      return (
        <div className="flex min-h-[50vh] items-center justify-center p-4">
          <div className="w-full max-w-2xl space-y-4">
            <Alert variant="destructive">
              <Icons.triangleAlert className="size-5" />
              <AlertTitle className="text-lg font-semibold">
                Something went wrong
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-sm">
                  An unexpected error occurred. Please try again.
                </p>

                {/* Show error details only in local/preview for debugging, hide in prod for security */}
                {error && getWebappEnv() !== WEBAPP_ENVS.PROD && (
                  <div className="mt-4 space-y-2">
                    <details className="rounded-lg bg-destructive/10 p-3" open>
                      <summary className="cursor-pointer text-sm font-medium">
                        Error Details
                      </summary>
                      <div className="mt-2 space-y-2">
                        <div className="text-xs">
                          <strong>Error:</strong>
                          <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs max-h-32">
                            {error.message || error.toString()}
                          </pre>
                        </div>
                        {error.stack && (
                          <div className="text-xs">
                            <strong>Stack Trace:</strong>
                            <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs max-h-48">
                              {error.stack}
                            </pre>
                          </div>
                        )}
                        {errorInfo?.componentStack && (
                          <div className="text-xs">
                            <strong>Component Stack:</strong>
                            <pre className="mt-1 overflow-auto rounded bg-black/10 p-2 text-xs max-h-48">
                              {errorInfo.componentStack}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={this.handleReset}
                    startIcon={<Icons.refreshCw />}
                  >
                    Reload Page
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.history.back()}
                  >
                    Go Back
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
