import { ErrorCategories, ErrorTypes } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { useBoolean } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { getDisplayParticipantIndex } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import type { DbMessageMetadata } from '@/services/api';
import { isAssistantMessageMetadata } from '@/services/api';

type MessageErrorDetailsProps = {
  metadata: DbMessageMetadata | null | undefined;
  className?: string;
};

export function MessageErrorDetails({
  metadata,
  className,
}: MessageErrorDetailsProps) {
  const t = useTranslations();
  const showDetails = useBoolean(false);

  if (!metadata || !isAssistantMessageMetadata(metadata)) {
    return null;
  }

  const hasError = metadata.hasError || metadata.errorMessage;
  if (!hasError) {
    return null;
  }

  const providerMessage = metadata.providerMessage ?? null;
  const errorMessage = providerMessage || metadata.errorMessage || t('chat.errors.unexpectedError');
  const errorType: string = metadata.errorType || ErrorTypes.UNKNOWN;
  const model = metadata.model || t('chat.errors.unknownModel');
  const participantIndex = metadata.participantIndex;
  const aborted = metadata.aborted ?? false;

  const getErrorTitle = () => {
    if (aborted)
      return t('chat.errors.generationCancelled');
    if (errorType === ErrorTypes.EMPTY_RESPONSE || errorType === ErrorCategories.EMPTY_RESPONSE)
      return t('chat.errors.emptyResponse');
    if (errorType === ErrorTypes.RATE_LIMIT || errorType === ErrorCategories.RATE_LIMIT || errorType === ErrorCategories.PROVIDER_RATE_LIMIT)
      return t('chat.errors.rateLimitReached');
    if (errorType === ErrorTypes.CONTEXT_LENGTH)
      return t('chat.errors.contextTooLong');
    if (errorType === ErrorTypes.API_ERROR)
      return t('chat.errors.apiError');
    if (errorType === ErrorTypes.NETWORK || errorType === ErrorCategories.NETWORK || errorType === ErrorCategories.PROVIDER_NETWORK)
      return t('chat.errors.networkError');
    if (errorType === ErrorTypes.TIMEOUT)
      return t('chat.errors.requestTimeout');
    if (errorType === ErrorCategories.VALIDATION)
      return t('chat.errors.validationError');
    if (errorType === ErrorCategories.MODEL_NOT_FOUND)
      return t('chat.errors.modelNotFound');
    if (errorType === ErrorCategories.MODEL_CONTENT_FILTER || errorType === ErrorCategories.CONTENT_FILTER)
      return t('chat.errors.contentFiltered');
    if (errorType === ErrorCategories.AUTHENTICATION)
      return t('chat.errors.authenticationError');
    return t('chat.errors.generationFailed');
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
        {showDetails.value ? t('chat.errors.hideDetails') : t('chat.errors.showDetails')}
      </button>
      {showDetails.value && (
        <div className="mt-2 ml-6 space-y-1 text-xs text-destructive/70">
          <div className="flex gap-2">
            <span className="font-medium min-w-20">{t('chat.errors.errorType')}</span>
            <span className="font-mono">{errorType}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium min-w-20">{t('chat.errors.model')}</span>
            <span className="font-mono">{model}</span>
          </div>
          {participantIndex !== null && participantIndex !== undefined && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('chat.errors.participant')}</span>
              <span className="font-mono">
                #
                {getDisplayParticipantIndex(participantIndex)}
              </span>
            </div>
          )}
          {metadata.statusCode && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('chat.errors.statusCode')}</span>
              <span className="font-mono text-destructive">{metadata.statusCode}</span>
            </div>
          )}
          {providerMessage && (
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-destructive/20">
              <span className="font-medium">{t('chat.errors.providerMessage')}</span>
              <span className="text-xs text-destructive/80 leading-relaxed">{providerMessage}</span>
            </div>
          )}
          {aborted && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">{t('chat.errors.status')}</span>
              <span>{t('chat.errors.requestAborted')}</span>
            </div>
          )}
          {metadata?.responseBody && import.meta.env.MODE === 'development' && (
            <div className="mt-2 pt-2 border-t border-destructive/20">
              <div className="font-medium mb-1">{t('chat.errors.responseFromProvider')}</div>
              <pre className="p-2 bg-destructive/5 rounded text-[10px] overflow-auto max-h-24 font-mono">
                {metadata.responseBody}
              </pre>
            </div>
          )}
          {!aborted && (
            <div className="mt-2 pt-2 border-t border-destructive/20 text-xs">
              {(errorType === ErrorTypes.RATE_LIMIT || errorType === ErrorCategories.RATE_LIMIT) && (
                <div>
                  <p className="font-medium mb-1">{t('chat.errors.whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('chat.errors.waitAndRegenerate')}</li>
                    {providerMessage?.includes('add your own key') && (
                      <li>{t('chat.errors.addOwnApiKey')}</li>
                    )}
                  </ul>
                </div>
              )}
              {errorType === ErrorTypes.CONTEXT_LENGTH && (
                <p>{t('chat.errors.shortenMessage')}</p>
              )}
              {(errorType === ErrorTypes.NETWORK || errorType === ErrorCategories.NETWORK || errorType === ErrorCategories.PROVIDER_NETWORK) && (
                <p>{t('chat.errors.checkConnection')}</p>
              )}
              {errorType === ErrorTypes.TIMEOUT && (
                <p>{t('chat.errors.requestTookTooLong')}</p>
              )}
              {errorType === ErrorCategories.VALIDATION && (
                <div>
                  <p className="font-medium mb-1">{t('chat.errors.whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('chat.errors.validationHint')}</li>
                    <li>{t('chat.errors.tryDifferentModel')}</li>
                  </ul>
                </div>
              )}
              {errorType === ErrorCategories.MODEL_NOT_FOUND && (
                <p>{t('chat.errors.modelNotFoundHint')}</p>
              )}
              {(errorType === ErrorCategories.MODEL_CONTENT_FILTER || errorType === ErrorCategories.CONTENT_FILTER) && (
                <div>
                  <p className="font-medium mb-1">{t('chat.errors.whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('chat.errors.contentFilterHint')}</li>
                  </ul>
                </div>
              )}
              {(errorType === ErrorTypes.EMPTY_RESPONSE || errorType === ErrorCategories.EMPTY_RESPONSE) && (
                <div>
                  <p className="font-medium mb-1">{t('chat.errors.whatToDo')}</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>{t('chat.errors.tryDifferentModel')}</li>
                    <li>{t('chat.errors.tryDifferentPrompt')}</li>
                    <li>{t('chat.errors.useRegenerateButton')}</li>
                  </ul>
                </div>
              )}
              {(errorType === ErrorTypes.MODEL_UNAVAILABLE || errorType === ErrorTypes.API_ERROR || errorType === ErrorTypes.UNKNOWN || errorType === ErrorCategories.UNKNOWN) && (
                <p>{t('chat.errors.useRegenerateButton')}</p>
              )}
            </div>
          )}
          {import.meta.env.MODE === 'development' && metadata && (
            <details className="mt-2 pt-2 border-t border-destructive/20">
              <summary className="cursor-pointer font-medium text-destructive/60">{t('chat.errors.fullMetadata')}</summary>
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
