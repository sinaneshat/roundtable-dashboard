'use client';
import type { ChatStatus } from 'ai';
import { ArrowUp, Mic, Square, StopCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef } from 'react';

import {
  ChatInputAttachments,
  ChatInputDropzoneOverlay,
} from '@/components/chat/chat-input-attachments';
import { QuotaAlertExtension } from '@/components/chat/quota-alert-extension';
import { VoiceVisualization } from '@/components/chat/voice-visualization';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { STRING_LIMITS } from '@/constants/validation';
import { useUsageStatsQuery } from '@/hooks/queries';
import type { PendingAttachment } from '@/hooks/utils';
import {
  useAutoResizeTextarea,
  useDragDrop,
  useKeyboardAwareScroll,
  useSpeechRecognition,
} from '@/hooks/utils';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { afterPaint } from '@/lib/ui/browser-timing';
import { cn } from '@/lib/ui/cn';

const EMPTY_PARTICIPANTS: ParticipantConfig[] = [];

const EMPTY_ATTACHMENTS: PendingAttachment[] = [];

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  status: ChatStatus;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  toolbar?: React.ReactNode;
  participants?: ParticipantConfig[];
  onRemoveParticipant?: (participantId: string) => void;
  className?: string;
  // Speech recognition props
  enableSpeech?: boolean;
  minHeight?: number;
  maxHeight?: number;
  // Quota alert extension
  quotaCheckType?: 'threads' | 'messages';
  // File attachment props
  attachments?: PendingAttachment[];
  onAddAttachments?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  enableAttachments?: boolean;
  /** Ref to expose attachment click handler to parent (for toolbar integration) */
  attachmentClickRef?: React.MutableRefObject<(() => void) | null>;
  /** Whether files are currently uploading - disables submit until complete */
  isUploading?: boolean;
  /** Suppress validation errors during hydration (prevents flash of "no models" error) */
  isHydrating?: boolean;
};

// ✅ RENDER OPTIMIZATION: Memoize ChatInput to prevent unnecessary re-renders
// ChatInput is used in multiple places and re-renders frequently due to parent state changes
// Memoizing prevents re-renders when props haven't changed
export const ChatInput = memo(({
  value,
  onChange,
  onSubmit,
  status,
  onStop,
  placeholder,
  disabled = false,
  autoFocus = false,
  toolbar,
  participants = EMPTY_PARTICIPANTS,
  onRemoveParticipant: _onRemoveParticipant,
  className,
  // Speech recognition props
  enableSpeech = true,
  minHeight = 72, // ~3 lines of text
  maxHeight = 200, // Scroll after ~8 lines
  // Quota alert extension
  quotaCheckType,
  // File attachment props
  attachments = EMPTY_ATTACHMENTS,
  onAddAttachments,
  onRemoveAttachment,
  enableAttachments = true,
  attachmentClickRef,
  isUploading = false,
  isHydrating = false,
}: ChatInputProps) => {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = status !== 'ready';

  // Check if quota is exceeded (from quota alert extension)
  const { data: statsData } = useUsageStatsQuery();
  const isQuotaExceeded = useMemo(() => {
    // Type guard: ensure statsData has the expected shape
    // Uses API response structure: { success: true, data: { threads, messages, ... } }
    if (
      !quotaCheckType
      || !statsData
      || typeof statsData !== 'object'
      || !('success' in statsData)
      || !statsData.success
      || !('data' in statsData)
      || !statsData.data
    ) {
      return false;
    }

    // Access data through properly narrowed type guards
    // The API response data shape is validated by type guards above
    const { data } = statsData;

    if (quotaCheckType === 'threads' && 'threads' in data && typeof data.threads === 'object' && data.threads !== null) {
      return data.threads.remaining === 0;
    }

    if (quotaCheckType === 'messages' && 'messages' in data && typeof data.messages === 'object' && data.messages !== null) {
      return data.messages.remaining === 0;
    }

    return false;
  }, [quotaCheckType, statsData]);

  // ✅ FIX: Split disabled states - textarea/mic always enabled during streaming
  // User can always type to prepare next message, even while AI is responding
  //
  // isInputDisabled: Controls textarea - only disabled for explicit disable or quota exceeded
  // isMicDisabled: Controls microphone - same as input, always available for voice input
  // isSubmitDisabled: Controls submit button - disabled during streaming, submitting, quota exceeded, uploading, or over limit
  const isInputDisabled = disabled || isQuotaExceeded;
  const isMicDisabled = disabled || isQuotaExceeded;

  // Character limit validation - aligned with backend MessageContentSchema
  const isOverLimit = value.length > STRING_LIMITS.MESSAGE_MAX;

  const isSubmitDisabled = disabled || isStreaming || isQuotaExceeded || isUploading || isOverLimit;
  const hasValidInput = (value.trim().length > 0 || attachments.length > 0) && participants.length > 0 && !isOverLimit;

  // File attachment handlers
  const handleFilesSelected = useCallback((files: File[]) => {
    if (onAddAttachments && files.length > 0) {
      onAddAttachments(files);
    }
  }, [onAddAttachments]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [handleFilesSelected]);

  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ✅ Sync ref after render commits (refs can't be updated during render)
  useEffect(() => {
    if (attachmentClickRef && enableAttachments) {
      attachmentClickRef.current = handleAttachmentClick;
    }
  }, [attachmentClickRef, enableAttachments, handleAttachmentClick]);

  // Drag and drop support
  const { isDragging, dragHandlers } = useDragDrop(handleFilesSelected);

  // Auto-resizing textarea
  useAutoResizeTextarea(textareaRef, {
    value,
    minHeight,
    maxHeight,
  });

  // ✅ AUTO-SCROLL DISABLED: No forced scrolling on mobile keyboard focus
  // User controls scroll position via manual scroll-to-bottom button
  useKeyboardAwareScroll(textareaRef, { enabled: false });

  // Speech recognition - simple pattern: base text + hook's accumulated transcripts
  const baseTextRef = useRef('');

  const {
    isListening,
    isSupported: isSpeechSupported,
    toggle: toggleSpeech,
    reset: resetTranscripts,
    audioLevels,
    finalTranscript,
    interimTranscript,
  } = useSpeechRecognition({
    continuous: true,
    enableAudioVisualization: true,
  });

  // ✅ REACT 19: useEffectEvent for onChange callback - stable reference, always latest value
  const onChangeEvent = useEffectEvent((newValue: string) => {
    onChange(newValue);
  });

  // ✅ CONSOLIDATED: Speech recognition state transitions (start/stop)
  // React 19: useEffectEvent removes onChange from deps - no re-subscription on parent re-render
  const prevIsListening = useRef(false);
  useEffect(() => {
    const wasListening = prevIsListening.current;
    prevIsListening.current = isListening;

    if (!wasListening && isListening) {
      // Recording STARTED - save base text and reset hook
      baseTextRef.current = value;
      resetTranscripts();
    } else if (wasListening && !isListening) {
      // Recording STOPPED - commit final result
      const parts = [baseTextRef.current, finalTranscript].filter(Boolean);
      onChangeEvent(parts.join(' ').trim());
    }
  }, [isListening, value, finalTranscript, resetTranscripts]); // ✅ onChange removed - accessed via useEffectEvent

  // Real-time display during listening: baseText + finalTranscript + interimTranscript
  // React 19: useEffectEvent removes onChange from deps
  useEffect(() => {
    if (!isListening)
      return;

    const parts = [baseTextRef.current, finalTranscript, interimTranscript].filter(Boolean);
    const displayText = parts.join(' ').trim();

    if (displayText !== value) {
      onChangeEvent(displayText);
    }
  }, [isListening, finalTranscript, interimTranscript, value]); // ✅ onChange removed - accessed via useEffectEvent

  // Focus textarea after DOM renders and paints
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      return afterPaint(() => textareaRef.current?.focus());
    }
    return undefined;
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitDisabled && hasValidInput) {
        // Create a properly typed synthetic FormEvent
        // FormEvent requires minimal properties: currentTarget, preventDefault, and type
        const form = e.currentTarget.form || e.currentTarget;
        const syntheticEvent: FormEvent<HTMLFormElement | HTMLTextAreaElement> = {
          bubbles: e.bubbles,
          cancelable: e.cancelable,
          currentTarget: form,
          defaultPrevented: true,
          eventPhase: e.eventPhase,
          isTrusted: e.isTrusted,
          nativeEvent: e.nativeEvent as Event,
          target: form,
          timeStamp: e.timeStamp,
          type: 'submit',
          preventDefault: () => {}, // No-op since already prevented above
          isDefaultPrevented: () => true,
          stopPropagation: () => e.stopPropagation(),
          isPropagationStopped: () => false,
          persist: () => {},
        };
        onSubmit(syntheticEvent);
      }
    }
  };

  // ✅ HYDRATION FIX: Don't show error during hydration (prevents flash before store initializes)
  const showNoModelsError = participants.length === 0 && !isQuotaExceeded && !isHydrating;

  return (
    <div className="w-full">
      {/* Hidden file input for attachment selection */}
      {enableAttachments && onAddAttachments && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          accept="image/*,application/pdf,text/*,.md,.json,.csv,.xml,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php"
        />
      )}

      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-2xl',
          'border border-white/[0.12]',
          'bg-card',
          'shadow-lg',
          'transition-all duration-200',
          isSubmitDisabled && !isQuotaExceeded && !isOverLimit && !showNoModelsError && 'cursor-not-allowed',
          (isOverLimit || showNoModelsError || isQuotaExceeded) && 'border-destructive',
          className,
        )}
        {...(enableAttachments ? dragHandlers : {})}
      >
        {/* Dropzone overlay - covers entire chat input during drag */}
        {enableAttachments && <ChatInputDropzoneOverlay isDragging={isDragging} />}

        <div className="flex flex-col overflow-hidden h-full">
          {/* Quota Alert Extension - appears at top when quota exceeded */}
          {quotaCheckType && <QuotaAlertExtension checkType={quotaCheckType} />}

          {/* No models selected alert - appears at top when no participants */}
          {showNoModelsError && (
            <div
              className={cn(
                'flex items-center gap-3 px-3 py-2',
                'border-0 border-b border-destructive/20 rounded-none rounded-t-2xl',
                'bg-destructive/10',
              )}
            >
              <p className="text-[10px] leading-tight text-destructive font-medium flex-1 min-w-0">
                {t('chat.input.noModelsSelected')}
              </p>
            </div>
          )}

          {/* Content limit alert - appears at top when message too long */}
          {isOverLimit && (
            <div
              className={cn(
                'flex items-center gap-3 px-3 py-2',
                'border-0 border-b border-destructive/20 rounded-none rounded-t-2xl',
                'bg-destructive/10',
              )}
            >
              <p className="text-[10px] leading-tight text-destructive font-medium flex-1 min-w-0">
                {t('chat.input.messageTooLong')}
              </p>
            </div>
          )}

          {/* Voice Visualization - appears at top when recording */}
          {enableSpeech && isSpeechSupported && (
            <VoiceVisualization
              isActive={isListening}
              audioLevels={audioLevels}
            />
          )}

          {/* File Attachments Preview - appears above textarea */}
          {/* Always show attachments if they exist; only enable removal when enableAttachments=true */}
          {attachments.length > 0 && (
            <ChatInputAttachments
              attachments={attachments}
              onRemove={enableAttachments ? onRemoveAttachment : undefined}
            />
          )}

          <form
            onSubmit={(e) => {
              if (isSubmitDisabled || !hasValidInput) {
                e.preventDefault();
                return;
              }
              onSubmit(e);
            }}
            className={cn(
              'flex flex-col h-full',
              isQuotaExceeded && 'opacity-50 pointer-events-none',
            )}
          >
            {/* Textarea */}
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                disabled={isInputDisabled}
                placeholder={
                  isStreaming
                    ? t('chat.input.streamingPlaceholder')
                    : isListening
                      ? t('chat.input.listeningPlaceholder')
                      : placeholder || t('chat.input.placeholder')
                }
                className={cn(
                  'w-full bg-transparent border-0 text-sm sm:text-base leading-relaxed',
                  'focus:outline-none focus:ring-0',
                  'placeholder:text-muted-foreground/60',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'resize-none scrollbar-thin',
                )}
                aria-disabled={isInputDisabled}
                aria-label={isStreaming ? t('chat.input.streamingLabel') : t('chat.input.label')}
                aria-invalid={isOverLimit}
              />
            </div>

            {/* Toolbar and submit */}
            <div>
              <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                {/* Left side: Toolbar */}
                <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
                  {toolbar}
                </div>

                {/* Right side: Speech + Submit buttons */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* Speech recognition button - always enabled during streaming */}
                  {enableSpeech && isSpeechSupported && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            size="icon"
                            variant={isListening ? 'default' : 'ghost'}
                            onClick={toggleSpeech}
                            disabled={isMicDisabled && !isListening}
                            className={cn(
                              'size-8 sm:size-9 shrink-0 rounded-full',
                              isListening && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse',
                            )}
                          >
                            {isListening ? <StopCircle className="size-3.5 sm:size-4" /> : <Mic className="size-3.5 sm:size-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {isListening
                              ? t('chat.toolbar.tooltips.stopRecording')
                              : t('chat.toolbar.tooltips.microphone')}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}

                  {/* Submit/Stop button */}
                  {isStreaming && onStop
                    ? (
                        <Button
                          type="button"
                          size="icon"
                          onClick={onStop}
                          className="size-9 sm:size-10 rounded-full shrink-0 touch-manipulation active:scale-95 transition-transform bg-white text-black hover:bg-white/90"
                          aria-label={t('chat.input.stopStreaming')}
                        >
                          <Square className="size-4 sm:size-5" />
                        </Button>
                      )
                    : (
                        <Button
                          type="submit"
                          size="icon"
                          disabled={isSubmitDisabled || !hasValidInput}
                          className="size-9 sm:size-10 rounded-full shrink-0 touch-manipulation active:scale-95 transition-transform disabled:active:scale-100 bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40"
                        >
                          <ArrowUp className="size-4 sm:size-5" />
                        </Button>
                      )}
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});
