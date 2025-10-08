/**
 * Chat Message Error Component
 *
 * Displays error state for failed AI model responses with:
 * - Visual error indicator
 * - User-friendly error message (from OpenRouter error handler)
 * - Suggestions for resolution
 * - Retry action (if transient error)
 *
 * Follows AI SDK v5 error handling patterns - displays sanitized error messages
 * from backend without exposing sensitive technical details.
 */

'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Types (matching OpenRouter error handler types)
// ============================================================================

export type MessageErrorType =
  | 'rate_limit'
  | 'model_unavailable'
  | 'invalid_request'
  | 'authentication'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'model_error'
  | 'unknown';

export type MessageError = {
  /** Error type from OpenRouter error handler */
  error?: string | MessageErrorType;
  /** User-friendly error message */
  errorMessage?: string;
  /** Error type (normalized) */
  errorType?: MessageErrorType;
  /** Technical details (JSON string) */
  errorDetails?: string;
  /** Whether error is transient (can retry) */
  isTransient?: boolean;
  /** Model ID */
  model?: string;
  /** Timestamp */
  timestamp?: string;
};

type ChatMessageErrorProps = {
  error: MessageError;
  modelName?: string;
  onRetry?: () => void;
  className?: string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize error type from various formats
 */
function normalizeErrorType(error: MessageError): MessageErrorType {
  // Check errorType first (most specific)
  if (error.errorType) {
    return error.errorType;
  }

  // Check error field (legacy format)
  if (error.error) {
    if (typeof error.error === 'string') {
      return error.error as MessageErrorType;
    }
  }

  return 'unknown';
}

// ============================================================================
// Component
// ============================================================================

export function ChatMessageError({
  error,
  modelName,
  onRetry,
  className,
}: ChatMessageErrorProps) {
  const t = useTranslations();
  const errorType = normalizeErrorType(error);
  const isTransient = error.isTransient ?? true; // Default to transient for backward compatibility

  // Get translation key based on error type
  const getErrorTitle = () => {
    switch (errorType) {
      case 'rate_limit':
        return t('chat.errors.rateLimitTitle');
      case 'model_unavailable':
        return t('chat.errors.modelUnavailableTitle');
      case 'timeout':
        return t('chat.errors.timeoutTitle');
      case 'network':
        return t('chat.errors.networkTitle');
      case 'empty_response':
        return t('chat.errors.emptyResponseTitle');
      case 'model_error':
        return t('chat.errors.modelErrorTitle');
      case 'invalid_request':
        return t('chat.errors.invalidRequestTitle');
      case 'authentication':
        return t('chat.errors.authenticationTitle');
      default:
        return t('chat.errors.unknownTitle');
    }
  };

  const getSolution = () => {
    switch (errorType) {
      case 'rate_limit':
        return t('chat.errors.rateLimitSolution');
      case 'model_unavailable':
        return t('chat.errors.modelUnavailableSolution');
      case 'timeout':
        return t('chat.errors.timeoutSolution');
      case 'network':
        return t('chat.errors.networkSolution');
      case 'empty_response':
        return t('chat.errors.emptyResponseSolution');
      case 'model_error':
        return t('chat.errors.modelErrorSolution');
      case 'invalid_request':
        return t('chat.errors.invalidRequestSolution');
      case 'authentication':
        return t('chat.errors.authenticationSolution');
      default:
        return t('chat.errors.unknownSolution');
    }
  };

  const title = getErrorTitle();
  const description = error.errorMessage || t('chat.errors.defaultDescription');
  const solution = getSolution();

  return (
    <Alert variant="destructive" className={cn('border-destructive/50', className)}>
      <AlertCircle className="size-4" />
      <AlertTitle className="flex items-center justify-between">
        <span className="text-sm">{title}</span>
        {isTransient && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="h-7 text-xs gap-1.5"
          >
            <RefreshCw className="size-3" />
            {t('chat.errors.retryAction')}
          </Button>
        )}
      </AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        <p className="text-sm">{description}</p>

        {modelName && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">
              {t('chat.errors.modelLabel')}
              :
            </span>
            {' '}
            {modelName}
          </p>
        )}

        {error.errorDetails && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium hover:underline">
              {t('chat.errors.technicalDetails')}
            </summary>
            <pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto">
              {error.errorDetails}
            </pre>
          </details>
        )}

        <div className="pt-2 border-t border-destructive/20">
          <p className="text-xs font-medium">
            {t('chat.errors.howToFix')}
            :
          </p>
          <p className="text-xs text-muted-foreground mt-1">{solution}</p>
        </div>

        {!isTransient && (
          <p className="text-xs text-muted-foreground italic">
            {t('chat.errors.nonRetryableHint')}
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
