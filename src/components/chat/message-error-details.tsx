'use client';

import { useTranslations } from 'next-intl';

import { ErrorCategories, ErrorTypes } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import type { DbMessageMetadata } from '@/db/schemas/chat-metadata';
import { isAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { useBoolean } from '@/hooks/utils';
import { getDisplayParticipantIndex } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type MessageErrorDetailsProps = {
  metadata: DbMessageMetadata | null | undefined;
  className?: string;
};

export function MessageErrorDetails({
  metadata,
  className,
}: MessageErrorDetailsProps) {
  const t = useTranslations('chat.errors');
  const showDetails = useBoolean(false);

  if (!metadata || !isAssistantMessageMetadata(metadata)) {
    return null;
  }

  const hasError = metadata.hasError || metadata.errorMessage;
  if (!hasError) {
    return null;
  }

  const providerMessage = metadata.providerMessage ?? null;
  const errorMessage = providerMessage || metadata.errorMessage || t('unexpectedError');
  const errorType: string = metadata.errorType || ErrorTypes.UNKNOWN;
  const model = metadata.model || t('unknownModel');
  const participantIndex = metadata.participantIndex;
  const aborted = metadata.aborted || false;

  const getErrorTitle = () => {
    if (aborted)
      return t('generationCancelled');
    if (errorType === ErrorTypes.EMPTY_RESPONSE || errorType === ErrorCategories.EMPTY_RESPONSE)
      return t('emptyResponse');
    if (errorType === ErrorTypes.RATE_LIMIT || errorType === ErrorCategories.RATE_LIMIT || errorType === ErrorCategories.PROVIDER_RATE_LIMIT)
      return t('rateLimitReached');
    if (errorType === ErrorTypes.CONTEXT_LENGTH)
      return t('contextTooLong');
    if (errorType === ErrorTypes.API_ERROR)
      return t('apiError');
    if (errorType === ErrorTypes.NETWORK || errorType === ErrorCategories.NETWORK || errorType === ErrorCategories.PROVIDER_NETWORK)
      return t('networkError');
    if (errorType === ErrorTypes.TIMEOUT)
      return t('requestTimeout');
    if (errorType === ErrorCategories.VALIDATION)
      return t('validationError');
    if (errorType === ErrorCategories.MODEL_NOT_FOUND)
      return t('modelNotFound');
    if (errorType === ErrorCategories.MODEL_CONTENT_FILTER || errorType === ErrorCategories.CONTENT_FILTER)
      return t('contentFiltered');
    if (errorType === ErrorCategories.AUTHENTICATION)
      return t('authenticationError');
    return t('generationFailed');
  };

  return (
    <div className={cn('text-sm text-destructive/90', className)}>
      <div className="flex items-start gap-2">
        <Icons.alertCircle className="size-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{getErrorTitle()}</p>
          <p className="text-xs mt-0.5 text-destructive/70">{errorMessage}</p>
        </div>
      </div>
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
          {participantIndex !== null && participantIndex !== undefined && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('participant')}</span>
              <span className="font-mono">
                #
                {getDisplayParticipantIndex(participantIndex)}
              </span>
            </div>
          )}
          {metadata.statusCode && (
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
          {metadata.responseBody && process.env.NODE_ENV === 'development' && (
            <div className="mt-2 pt-2 border-t border-destructive/20">
              <div className="font-medium mb-1">{t('responseFromProvider')}</div>
              <pre className="p-2 bg-destructive/5 rounded text-[10px] overflow-auto max-h-24 font-mono">
                {metadata.responseBody}
              </pre>
            </div>
          )}
          {!aborted && (
            <div className="mt-2 pt-2 border-t border-destructive/20 text-xs">
              {(errorType === ErrorTypes.RATE_LIMIT || errorType === ErrorCategories.RATE_LIMIT) && (
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
              {errorType === ErrorTypes.CONTEXT_LENGTH && (
                <p>{t('shortenMessage')}</p>
              )}
              {(errorType === ErrorTypes.NETWORK || errorType === ErrorCategories.NETWORK || errorType === ErrorCategories.PROVIDER_NETWORK) && (
                <p>{t('checkConnection')}</p>
              )}
              {errorType === ErrorTypes.TIMEOUT && (
                <p>{t('requestTookTooLong')}</p>
              )}
              {errorType === ErrorCategories.VALIDATION && (
                <div>
                  <p className="font-medium mb-1">{t('whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('validationHint')}</li>
                    <li>{t('tryDifferentModel')}</li>
                  </ul>
                </div>
              )}
              {errorType === ErrorCategories.MODEL_NOT_FOUND && (
                <p>{t('modelNotFoundHint')}</p>
              )}
              {(errorType === ErrorCategories.MODEL_CONTENT_FILTER || errorType === ErrorCategories.CONTENT_FILTER) && (
                <div>
                  <p className="font-medium mb-1">{t('whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('contentFilterHint')}</li>
                  </ul>
                </div>
              )}
              {(errorType === ErrorTypes.EMPTY_RESPONSE || errorType === ErrorCategories.EMPTY_RESPONSE) && (
                <div>
                  <p className="font-medium mb-1">{t('whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('tryDifferentModel')}</li>
                    <li>{t('tryDifferentPrompt')}</li>
                    <li>{t('useRegenerateButton')}</li>
                  </ul>
                </div>
              )}
              {(errorType === ErrorTypes.MODEL_UNAVAILABLE || errorType === ErrorTypes.API_ERROR || errorType === ErrorTypes.UNKNOWN || errorType === ErrorCategories.UNKNOWN) && (
                <p>{t('useRegenerateButton')}</p>
              )}
            </div>
          )}
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
