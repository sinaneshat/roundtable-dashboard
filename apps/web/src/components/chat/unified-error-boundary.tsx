import type { ErrorBoundaryContext } from '@roundtable/shared';
import { ErrorBoundaryContexts } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';
import type { ErrorInfo, ReactNode } from 'react';
import React, { Component } from 'react';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getWebappEnv } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';

/**
 * Check if PostHog is available for tracking
 * Returns false in local environment or SSR context
 */
function isPostHogAvailable(): boolean {
  // Skip in SSR context
  if (typeof window === 'undefined') {
    return false;
  }
  // Skip in local environment (PostHog not initialized)
  return getWebappEnv() !== WebAppEnvs.LOCAL;
}

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
  const t = useTranslations();

  switch (context) {
    case ErrorBoundaryContexts.CHAT:
      return t('errors.boundary.chat');
    case ErrorBoundaryContexts.MESSAGE_LIST:
      return t('errors.boundary.messageList');
    case ErrorBoundaryContexts.CONFIGURATION:
      return t('errors.boundary.configuration');
    case ErrorBoundaryContexts.PRE_SEARCH:
      return t('errors.boundary.preSearch');
    case ErrorBoundaryContexts.GENERAL:
    default:
      return t('errors.boundary.general');
  }
}

const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  context,
  error,
  errorInfo,
  onReset,
}) => {
  const t = useTranslations();
  const contextMessage = useContextMessage(context);

  return (
    <Card className="mx-auto max-w-2xl p-8">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <Icons.alertCircle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('errors.boundary.title')}</h2>
          <p className="text-muted-foreground">{contextMessage}</p>
        </div>

        {getWebappEnv() !== WebAppEnvs.PROD && error && (
          <details className="w-full rounded-lg bg-muted/50 p-4 text-left">
            <summary className="cursor-pointer font-medium">
              {t('errors.boundary.devDetailsLabel')}
            </summary>
            <div className="mt-4 space-y-2">
              <div>
                <strong>
                  {t('errors.boundary.errorLabel')}
                  :
                </strong>
                <pre className="mt-1 whitespace-pre-wrap text-sm">
                  {error.message}
                </pre>
              </div>
              {error.stack && (
                <div>
                  <strong>
                    {t('errors.boundary.stackLabel')}
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
                    {t('errors.boundary.componentStackLabel')}
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
            {t('errors.boundary.tryAgain')}
          </Button>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
          >
            {t('errors.boundary.refreshPage')}
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
      context: props.context || ErrorBoundaryContexts.GENERAL,
      error: null,
      errorInfo: null,
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<UnifiedErrorBoundaryState> {
    return {
      error,
      hasError: true,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    if (import.meta.env.MODE === 'production') {
      this.trackError(error, errorInfo);
    }
  }

  trackError = (error: Error, errorInfo: ErrorInfo) => {
    // Only capture if PostHog is available (not in local env or SSR)
    if (!isPostHogAvailable()) {
      return;
    }

    // Dynamically import PostHog to avoid bundling in initial load
    import('posthog-js')
      .then((mod) => {
        mod.default.capture('$exception', {
          $exception_message: error.message,
          $exception_source: 'react_error_boundary',
          $exception_stack_trace_raw: error.stack,
          $exception_type: error.name,
          componentStack: errorInfo.componentStack,
          context: this.state.context,
        });
      })
      .catch(() => {
        // Silently ignore PostHog import failures - error tracking is non-critical
      });
  };

  handleReset = () => {
    this.setState({
      error: null,
      errorInfo: null,
      hasError: false,
    });

    this.props.onReset?.();
  };

  override render() {
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

export function InlineErrorDisplay({
  error,
  onRetry,
  participantName,
}: {
  error: string;
  participantName?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
      <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
      <div className="flex-1">
        <span className="font-medium">{participantName || t('chat.errors.participant')}</span>
        <span className="text-sm text-muted-foreground ml-2">{error}</span>
      </div>
      {onRetry && (
        <Button onClick={onRetry} size="icon" variant="ghost" aria-label={t('accessibility.retry')}>
          <Icons.refreshCw />
        </Button>
      )}
    </div>
  );
}
