'use client';
import type { ChatStatus } from 'ai';
import { ArrowUp, Mic, Square, StopCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import {
  ChatInputAttachments,
  ChatInputDropzoneOverlay,
} from '@/components/chat/chat-input-attachments';
import { QuotaAlertExtension } from '@/components/chat/quota-alert-extension';
import { VoiceVisualization } from '@/components/chat/voice-visualization';
import { Button } from '@/components/ui/button';
import { useUsageStatsQuery } from '@/hooks/queries';
import {
  useAutoResizeTextarea,
  useKeyboardAwareScroll,
  useSpeechRecognition,
} from '@/hooks/utils';
import type { PendingAttachment } from '@/hooks/utils/use-chat-attachments';
import { useDragDrop } from '@/hooks/utils/use-drag-drop';
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
  /** Callback to register the attachment click handler (opens file picker) */
  onRegisterAttachmentClick?: (clickHandler: () => void) => void;
  /** Whether files are currently uploading - disables submit until complete */
  isUploading?: boolean;
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
  minHeight = 80,
  maxHeight = 240,
  // Quota alert extension
  quotaCheckType,
  // File attachment props
  attachments = EMPTY_ATTACHMENTS,
  onAddAttachments,
  onRemoveAttachment,
  enableAttachments = true,
  onRegisterAttachmentClick,
  isUploading = false,
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
  // isSubmitDisabled: Controls submit button - disabled during streaming, submitting, quota exceeded, or uploading
  const isInputDisabled = disabled || isQuotaExceeded;
  const isMicDisabled = disabled || isQuotaExceeded;
  const isSubmitDisabled = disabled || isStreaming || isQuotaExceeded || isUploading;
  const hasValidInput = (value.trim().length > 0 || attachments.length > 0) && participants.length > 0;

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

  // Register the attachment click handler with parent component
  useEffect(() => {
    if (onRegisterAttachmentClick && enableAttachments) {
      onRegisterAttachmentClick(handleAttachmentClick);
    }
  }, [onRegisterAttachmentClick, handleAttachmentClick, enableAttachments]);

  // Drag and drop support
  const { isDragging, dragHandlers } = useDragDrop(handleFilesSelected);

  // Auto-resizing textarea
  useAutoResizeTextarea(textareaRef, {
    value,
    minHeight,
    maxHeight,
  });

  // Mobile keyboard handling: Simple scroll into view on focus
  useKeyboardAwareScroll(textareaRef, { enabled: true });

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

  // When recording starts, save what was already there and reset hook
  const prevIsListening = useRef(false);
  useEffect(() => {
    if (!prevIsListening.current && isListening) {
      baseTextRef.current = value;
      resetTranscripts(); // Clear hook's accumulated transcripts
    }
    prevIsListening.current = isListening;
  }, [isListening, value, resetTranscripts]);

  // Real-time display: baseText + finalTranscript (from hook) + interimTranscript
  useEffect(() => {
    if (!isListening)
      return;

    const parts = [baseTextRef.current, finalTranscript, interimTranscript].filter(Boolean);
    const displayText = parts.join(' ').trim();

    if (displayText !== value) {
      onChange(displayText);
    }
  }, [isListening, finalTranscript, interimTranscript, value, onChange]);

  // When stopped, keep the final result
  useEffect(() => {
    if (prevIsListening.current && !isListening) {
      const parts = [baseTextRef.current, finalTranscript].filter(Boolean);
      onChange(parts.join(' ').trim());
    }
  }, [isListening, finalTranscript, onChange]);

  // AI SDK v5 Pattern: Use requestAnimationFrame for focus after DOM renders
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      });
      return () => cancelAnimationFrame(rafId);
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
          'border border-border',
          'bg-card',
          'shadow-lg',
          'transition-all duration-200',
          isSubmitDisabled && !isQuotaExceeded && 'cursor-not-allowed',
          isStreaming && 'ring-2 ring-primary/20', // Visual indicator during streaming
          className,
        )}
        {...(enableAttachments ? dragHandlers : {})}
      >
        {/* Dropzone overlay - covers entire chat input during drag */}
        {enableAttachments && <ChatInputDropzoneOverlay isDragging={isDragging} />}

        <div className="flex flex-col overflow-hidden h-full">
          {/* Quota Alert Extension - appears at top when quota exceeded */}
          {quotaCheckType && <QuotaAlertExtension checkType={quotaCheckType} />}

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
            <div className="relative flex items-end px-3 sm:px-4 py-3 sm:py-4">
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
                className="flex-1 bg-transparent border-0 text-sm sm:text-base focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60 disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto transition-all duration-200"
                style={{ minHeight: `${minHeight}px` }}
                aria-disabled={isInputDisabled}
                aria-label={isStreaming ? t('chat.input.streamingLabel') : t('chat.input.label')}
              />
            </div>

            {/* Toolbar and submit */}
            <div>
              <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                {/* Left side: Toolbar (AI Models + Mode + WebSearch) */}
                {toolbar && (
                  <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
                    {toolbar}
                  </div>
                )}

                {/* Right side: Speech + Submit buttons */}
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {/* Speech recognition button - always enabled during streaming */}
                  {enableSpeech && isSpeechSupported && (
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
                      title={isListening ? 'Stop recording' : t('chat.input.voiceInput')}
                    >
                      {isListening ? <StopCircle className="size-3.5 sm:size-4" /> : <Mic className="size-3.5 sm:size-4" />}
                    </Button>
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
