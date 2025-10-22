'use client';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useBoolean } from '@/hooks/utils';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';

type MessageErrorDetailsProps = {
  metadata: UIMessageMetadata | null | undefined;
  className?: string;
};

/**
 * MessageErrorDetails - Comprehensive error display for failed AI generations
 *
 * Shows:
 * - User-friendly error message
 * - Error type (rate limit, API error, etc.)
 * - Detailed error information (expandable)
 * - Retry button for transient errors
 * - Model and participant information for debugging
 */
export function MessageErrorDetails({
  metadata,
  className,
}: MessageErrorDetailsProps) {
  const t = useTranslations('chat.errors');
  const showDetails = useBoolean(false);

  // Check if this message has an error
  const hasError = metadata?.hasError || metadata?.error || metadata?.errorMessage;

  if (!hasError) {
    return null;
  }

  // Extract error information from metadata (with type safety)
  // Prioritize providerMessage for most detailed error information
  const providerMessage = metadata?.providerMessage ? String(metadata.providerMessage) : null;
  const errorMessage = providerMessage
    || String(metadata?.errorMessage || metadata?.error || 'An unexpected error occurred');
  const errorType = String(metadata?.errorType || 'unknown');
  const model = String(metadata?.model || t('unknownModel'));
  const participantIndex = typeof metadata?.participantIndex === 'number' ? metadata.participantIndex : null;
  const aborted = metadata?.aborted || false;

  // Determine user-friendly error title
  const getErrorTitle = () => {
    if (aborted)
      return t('generationCancelled');
    if (errorType === 'empty_response')
      return t('emptyResponse');
    if (errorType === 'rate_limit')
      return t('rateLimitReached');
    if (errorType === 'context_length')
      return t('contextTooLong');
    if (errorType === 'api_error')
      return t('apiError');
    if (errorType === 'network')
      return t('networkError');
    if (errorType === 'timeout')
      return t('requestTimeout');
    return t('generationFailed');
  };

  return (
    <div className={`text-sm text-destructive/90 ${className || ''}`}>
      {/* Error message */}
      <div className="flex items-start gap-2">
        <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{getErrorTitle()}</p>
          <p className="text-xs mt-0.5 text-destructive/70">{errorMessage}</p>
        </div>
      </div>

      {/* Expandable details - simple text button */}
      <button
        type="button"
        onClick={showDetails.onToggle}
        className="ml-6 mt-1 text-xs text-destructive/60 hover:text-destructive/80 underline-offset-2 hover:underline"
      >
        {showDetails.value ? t('hideDetails') : t('showDetails')}
      </button>

      {showDetails.value && (
        <div className="mt-2 ml-6 space-y-1 text-xs text-destructive/70">
          <div className="flex gap-2">
            <span className="font-medium min-w-20">{t('errorType')}</span>
            <span className="font-mono">{errorType}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium min-w-20">{t('model')}</span>
            <span className="font-mono">{model}</span>
          </div>
          {participantIndex !== null && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('participant')}</span>
              <span className="font-mono">
                #
                {participantIndex + 1}
              </span>
            </div>
          )}
          {metadata?.statusCode && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('statusCode')}</span>
              <span className="font-mono text-destructive">{metadata.statusCode}</span>
            </div>
          )}
          {providerMessage && (
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-destructive/20">
              <span className="font-medium">{t('providerMessage')}</span>
              <span className="text-xs text-destructive/80 leading-relaxed">{providerMessage}</span>
            </div>
          )}
          {aborted && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('status')}</span>
              <span>{t('requestAborted')}</span>
            </div>
          )}
          {metadata?.responseBody && process.env.NODE_ENV === 'development' && (
            <div className="mt-2 pt-2 border-t border-destructive/20">
              <div className="font-medium mb-1">{t('responseFromProvider')}</div>
              <pre className="p-2 bg-destructive/5 rounded text-[10px] overflow-auto max-h-24 font-mono">
                {metadata.responseBody}
              </pre>
            </div>
          )}

          {/* Helpful suggestions */}
          {!aborted && (
            <div className="mt-2 pt-2 border-t border-destructive/20 text-xs">
              {errorType === 'rate_limit' && (
                <div>
                  <p className="font-medium mb-1">{t('whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('waitAndRegenerate')}</li>
                    {providerMessage?.includes('add your own key') && (
                      <li>{t('addOwnApiKey')}</li>
                    )}
                  </ul>
                </div>
              )}
              {errorType === 'context_length' && (
                <p>{t('shortenMessage')}</p>
              )}
              {errorType === 'network' && (
                <p>{t('checkConnection')}</p>
              )}
              {errorType === 'timeout' && (
                <p>{t('requestTookTooLong')}</p>
              )}
              {errorType === 'empty_response' && (
                <div>
                  <p className="font-medium mb-1">{t('whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('tryDifferentModel')}</li>
                    <li>{t('tryDifferentPrompt')}</li>
                    <li>{t('useRegenerateButton')}</li>
                  </ul>
                </div>
              )}
              {(errorType === 'model_unavailable' || errorType === 'api_error' || errorType === 'unknown') && (
                <p>{t('useRegenerateButton')}</p>
              )}
            </div>
          )}

          {/* Raw metadata for debugging */}
          {process.env.NODE_ENV === 'development' && metadata && (
            <details className="mt-2 pt-2 border-t border-destructive/20">
              <summary className="cursor-pointer font-medium text-destructive/60">{t('fullMetadata')}</summary>
              <pre className="mt-1 p-2 bg-destructive/5 rounded text-[10px] overflow-auto max-h-32 font-mono">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
