'use client';

import { AlertCircle } from 'lucide-react';
import { useState } from 'react';

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
  const [showDetails, setShowDetails] = useState(false);

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
  const model = String(metadata?.model || 'Unknown model');
  const participantIndex = typeof metadata?.participantIndex === 'number' ? metadata.participantIndex : null;
  const aborted = metadata?.aborted || false;

  // Determine user-friendly error title
  const getErrorTitle = () => {
    if (aborted)
      return 'Generation cancelled';
    if (errorType === 'rate_limit')
      return 'Rate limit reached';
    if (errorType === 'context_length')
      return 'Context too long';
    if (errorType === 'api_error')
      return 'API error';
    if (errorType === 'network')
      return 'Network error';
    if (errorType === 'timeout')
      return 'Request timeout';
    return 'Generation failed';
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
        onClick={() => setShowDetails(!showDetails)}
        className="ml-6 mt-1 text-xs text-destructive/60 hover:text-destructive/80 underline-offset-2 hover:underline"
      >
        {showDetails ? '− Hide details' : '+ Show details'}
      </button>

      {showDetails && (
        <div className="mt-2 ml-6 space-y-1 text-xs text-destructive/70">
          <div className="flex gap-2">
            <span className="font-medium min-w-20">Error Type:</span>
            <span className="font-mono">{errorType}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium min-w-20">Model:</span>
            <span className="font-mono">{model}</span>
          </div>
          {participantIndex !== null && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">Participant:</span>
              <span className="font-mono">
                #
                {participantIndex + 1}
              </span>
            </div>
          )}
          {metadata?.statusCode && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">Status code:</span>
              <span className="font-mono text-destructive">{metadata.statusCode}</span>
            </div>
          )}
          {providerMessage && (
            <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-destructive/20">
              <span className="font-medium">Provider message:</span>
              <span className="text-xs text-destructive/80 leading-relaxed">{providerMessage}</span>
            </div>
          )}
          {aborted && (
            <div className="flex gap-2">
              <span className="font-medium min-w-20">Status:</span>
              <span>Request was aborted</span>
            </div>
          )}
          {metadata?.responseBody && process.env.NODE_ENV === 'development' && (
            <div className="mt-2 pt-2 border-t border-destructive/20">
              <div className="font-medium mb-1">Response from AI provider:</div>
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
                  <p className="font-medium mb-1">💡 What to do:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/70">
                    <li>Wait a few moments and use the regenerate button below</li>
                    {providerMessage?.includes('add your own key') && (
                      <li>Or add your own API key to avoid rate limits</li>
                    )}
                  </ul>
                </div>
              )}
              {errorType === 'context_length' && (
                <p>💡 Try shortening your message or starting a new chat</p>
              )}
              {errorType === 'network' && (
                <p>💡 Check your connection and use regenerate button below</p>
              )}
              {errorType === 'timeout' && (
                <p>💡 Request took too long - use regenerate button below to retry</p>
              )}
              {(errorType === 'model_unavailable' || errorType === 'api_error' || errorType === 'unknown') && (
                <p>💡 Use regenerate button below to retry this round</p>
              )}
            </div>
          )}

          {/* Raw metadata for debugging */}
          {process.env.NODE_ENV === 'development' && metadata && (
            <details className="mt-2 pt-2 border-t border-destructive/20">
              <summary className="cursor-pointer font-medium text-destructive/60">Full metadata (dev only)</summary>
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
