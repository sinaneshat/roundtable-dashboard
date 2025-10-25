'use client';

/**
 * Chat Error Boundary
 *
 * Error boundary specifically designed for chat flows.
 * Handles errors during:
 * - Thread creation
 * - Message loading
 * - Streaming failures
 * - Analysis generation
 *
 * Features:
 * - Graceful error recovery with retry functionality
 * - User-friendly error messages with translation support
 * - Automatic error logging
 * - Fallback UI that matches chat design
 *
 * Usage:
 * ```tsx
 * <ChatErrorBoundary fallback={<CustomErrorUI />}>
 *   <ChatComponents />
 * </ChatErrorBoundary>
 * ```
 */

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import React, { Component } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { chatContextLogger } from '@/lib/utils/chat-error-logger';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
};

/**
 * Chat Error Boundary Component
 * Class component required for error boundary functionality
 */
class ChatErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so next render shows fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error to our chat error logger
    chatContextLogger.error('UNKNOWN_ERROR', error, {
      componentStack: errorInfo.componentStack,
      phase: 'render',
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      errorInfo,
    });
  }

  handleReset = (): void => {
    // Reset error boundary state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <ChatErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Default fallback UI for chat error boundary
 */
function ChatErrorFallback({
  error,
  errorInfo,
  onReset,
}: {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
}) {
  const t = useTranslations();
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-5 text-destructive" />
            </div>
            <div>
              <CardTitle>{t('chat.errors.streamError')}</CardTitle>
              <CardDescription>
                {t('chat.errors.defaultDescription')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('chat.errors.technicalDetails')}</AlertTitle>
              <AlertDescription className="mt-2 space-y-2">
                <div className="font-mono text-xs">
                  <div className="font-semibold">{error.name}</div>
                  <div className="text-muted-foreground">{error.message}</div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {isDevelopment && errorInfo && (
            <Alert>
              <AlertTitle>Component Stack (Development Only)</AlertTitle>
              <AlertDescription>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
                  {errorInfo.componentStack}
                </pre>
              </AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="text-sm font-medium text-foreground mb-2">
              {t('chat.errors.howToFix')}
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>
                •
                {t('chat.errors.useRegenerateButton')}
              </li>
              <li>
                •
                {t('chat.errors.tryDifferentModel')}
              </li>
              <li>
                •
                {t('chat.errors.tryDifferentPrompt')}
              </li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button onClick={onReset} className="flex-1">
            <RefreshCw className="mr-2 size-4" />
            {t('chat.errors.retryAction')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Thread Creation Error Boundary
 * Specialized error boundary for thread creation flow
 */
export function ThreadCreationErrorBoundary({
  children,
  onError,
}: {
  children: ReactNode;
  onError?: (error: Error) => void;
}) {
  const t = useTranslations();

  return (
    <ChatErrorBoundary
      onError={(error, errorInfo) => {
        chatContextLogger.error('THREAD_CREATE_FAILED', error, {
          componentStack: errorInfo.componentStack,
        });
        if (onError) {
          onError(error);
        }
      }}
      fallback={(
        <div className="flex min-h-[50vh] items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-lg">
            <AlertCircle className="size-4" />
            <AlertTitle>{t('chat.error.generic')}</AlertTitle>
            <AlertDescription>
              {t('chat.errors.defaultDescription')}
            </AlertDescription>
          </Alert>
        </div>
      )}
    >
      {children}
    </ChatErrorBoundary>
  );
}

/**
 * Streaming Error Boundary
 * Specialized error boundary for message streaming
 */
export function StreamingErrorBoundary({
  children,
  onError,
  onRetry,
}: {
  children: ReactNode;
  onError?: (error: Error) => void;
  onRetry?: () => void;
}) {
  const t = useTranslations();

  return (
    <ChatErrorBoundary
      onError={(error, errorInfo) => {
        chatContextLogger.error('STREAM_FAILED', error, {
          componentStack: errorInfo.componentStack,
        });
        if (onError) {
          onError(error);
        }
      }}
      onReset={onRetry}
      fallback={(
        <div className="flex items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-lg">
            <AlertCircle className="size-4" />
            <AlertTitle>{t('chat.errors.streamError')}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{t('chat.errors.retryHint')}</p>
              {onRetry && (
                <Button onClick={onRetry} variant="outline" size="sm">
                  <RefreshCw className="mr-2 size-4" />
                  {t('chat.errors.retry')}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}
    >
      {children}
    </ChatErrorBoundary>
  );
}

export default ChatErrorBoundary;
