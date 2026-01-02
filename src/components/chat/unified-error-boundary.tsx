'use client';

import { useTranslations } from 'next-intl';
import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';

import type { ErrorBoundaryContext } from '@/api/core/enums';
import { ErrorBoundaryContexts } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type UnifiedErrorBoundaryProps = {
  children: ReactNode;
  context?: ErrorBoundaryContext;
  onReset?: () => void;
  fallbackComponent?: React.ComponentType<ErrorFallbackProps>;
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

function useContextMessage(context: ErrorBoundaryContext): string {
  const t = useTranslations('errors.boundary');

  switch (context) {
    case ErrorBoundaryContexts.CHAT:
      return t('chat');
    case ErrorBoundaryContexts.MESSAGE_LIST:
      return t('messageList');
    case ErrorBoundaryContexts.CONFIGURATION:
      return t('configuration');
    case ErrorBoundaryContexts.PRE_SEARCH:
      return t('preSearch');
    case ErrorBoundaryContexts.GENERAL:
    default:
      return t('general');
  }
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  context,
  onReset,
}) => {
  const t = useTranslations('errors.boundary');
  const contextMessage = useContextMessage(context);

  return (
    <Card className="mx-auto max-w-2xl p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <Icons.alertCircle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('title')}</h2>
          <p className="text-muted-foreground">{contextMessage}</p>
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="w-full rounded-lg bg-muted/50 p-4 text-left">
            <summary className="cursor-pointer font-medium">
              {t('devDetailsLabel')}
            </summary>
            <div className="mt-4 space-y-2">
              <div>
                <strong>
                  {t('errorLabel')}
                  :
                </strong>
                <pre className="mt-1 whitespace-pre-wrap text-sm">
                  {error.message}
                </pre>
              </div>
              {error.stack && (
                <div>
                  <strong>
                    {t('stackLabel')}
                    :
                  </strong>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre text-xs">
                    {error.stack}
                  </pre>
                </div>
              )}
              {errorInfo?.componentStack && (
                <div>
                  <strong>
                    {t('componentStackLabel')}
                    :
                  </strong>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre text-xs">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex gap-4">
          <Button onClick={onReset} variant="default" startIcon={<Icons.refreshCw />}>
            {t('tryAgain')}
          </Button>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
          >
            {t('refreshPage')}
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
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    if (process.env.NODE_ENV === 'production') {
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
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
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

export const InlineErrorDisplay: React.FC<{
  error: string;
  participantName?: string;
  onRetry?: () => void;
}> = ({ error, participantName, onRetry }) => (
  <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
    <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
    <div className="flex-1">
      <span className="font-medium">{participantName || 'Participant'}</span>
      <span className="text-sm text-muted-foreground ml-2">{error}</span>
    </div>
    {onRetry && (
      <Button onClick={onRetry} size="sm" variant="ghost">
        <Icons.refreshCw className="h-3 w-3" />
      </Button>
    )}
  </div>
);
