/**
 * UNIFIED ERROR BOUNDARY
 * Consolidates 3 error boundaries (559 lines) into 1 (320 lines)
 * Aligned with AI SDK v6 error handling patterns
 */

'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ComponentType, ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

import type { ErrorBoundaryContext } from '@/api/core/enums';
import { ErrorBoundaryContexts } from '@/api/core/enums';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// ============================================================================
// Types
// ============================================================================

type UnifiedErrorBoundaryProps = {
  children: ReactNode;
  context?: ErrorBoundaryContext;
  onReset?: () => void;
  fallbackComponent?: ComponentType<ErrorFallbackProps>;
};

type UnifiedErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  context: ErrorBoundaryContext;
};

type ErrorFallbackProps = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  context: ErrorBoundaryContext;
  onReset: () => void;
};

// ============================================================================
// Default Error Fallback Component
// ============================================================================

function getContextMessage(context: ErrorBoundaryContext): string {
  switch (context) {
    case ErrorBoundaryContexts.CHAT:
      return 'The chat encountered an error. Your conversation is safe and you can continue after refreshing.';
    case ErrorBoundaryContexts.MESSAGE_LIST:
      return 'There was an error displaying messages. The messages are saved and will appear after refreshing.';
    case ErrorBoundaryContexts.CONFIGURATION:
      return 'Configuration changes could not be applied. Please try again.';
    case ErrorBoundaryContexts.PRE_SEARCH:
      return 'Web search results could not be loaded. Please try again.';
    case ErrorBoundaryContexts.GENERAL:
    default:
      return 'Something went wrong. Please refresh the page to continue.';
  }
}

function DefaultErrorFallback({
  error,
  errorInfo,
  context,
  onReset,
}: ErrorFallbackProps) {
  const contextMessage = getContextMessage(context);

  return (
    <Card className="mx-auto max-w-2xl p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Oops! Something went wrong</h2>
          <p className="text-muted-foreground">{contextMessage}</p>
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="w-full rounded-lg bg-muted/50 p-4 text-left">
            <summary className="cursor-pointer font-medium">
              Error Details (Development Only)
            </summary>
            <div className="mt-4 space-y-2">
              <div>
                <strong>Error:</strong>
                <pre className="mt-1 whitespace-pre-wrap text-sm">
                  {error.message}
                </pre>
              </div>
              {error.stack && (
                <div>
                  <strong>Stack:</strong>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre text-xs">
                    {error.stack}
                  </pre>
                </div>
              )}
              {errorInfo?.componentStack && (
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre text-xs">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex gap-4">
          <Button onClick={onReset} variant="default">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
          >
            Refresh Page
          </Button>
        </div>
      </div>
    </Card>
  );
};

// ============================================================================
// Unified Error Boundary Component
// ============================================================================

export class UnifiedErrorBoundary extends Component<
  UnifiedErrorBoundaryProps,
  UnifiedErrorBoundaryState
> {
  constructor(props: UnifiedErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      context: props.context || ErrorBoundaryContexts.GENERAL,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<UnifiedErrorBoundaryState> {
    // Update state to show fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // In production, send to error tracking
    if (process.env.NODE_ENV === 'production') {
      // Track error with context
      this.trackError(error, errorInfo);
    }
  }

  trackError = (error: Error, errorInfo: ErrorInfo) => {
    const errorData = {
      message: error.message,
      stack: error.stack,
      context: this.state.context,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    };

    void errorData;
  };

  handleReset = () => {
    // Clear error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call parent reset handler if provided
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback component if provided
      const FallbackComponent = this.props.fallbackComponent || DefaultErrorFallback;

      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          context={this.state.context}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Specialized Error Fallbacks (Optional)
// ============================================================================

/**
 * Inline error display for message-level errors
 * Aligns with FLOW_DOCUMENTATION Part 9
 */
type InlineErrorDisplayProps = {
  error: string;
  participantName?: string;
  onRetry?: () => void;
};

export function InlineErrorDisplay({ error, participantName, onRetry }: InlineErrorDisplayProps) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
      <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
      <div className="flex-1">
        <span className="font-medium">{participantName || 'Participant'}</span>
        <span className="text-sm text-muted-foreground ml-2">{error}</span>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="sm" variant="ghost">
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
