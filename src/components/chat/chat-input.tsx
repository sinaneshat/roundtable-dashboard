'use client';

import type { ChatStatus } from 'ai';
import { useTranslations } from 'next-intl';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef } from 'react';

import type { BorderVariant } from '@/api/core/enums';
import { AiSdkStatuses, BorderVariants, ComponentSizes, ComponentVariants, PlanTypes } from '@/api/core/enums';
import { ChatInputDropzoneOverlay } from '@/components/chat/chat-input-attachments';
import { ChatInputAttachments } from '@/components/chat/chat-input-attachments-lazy';
import { FreeTrialAlert } from '@/components/chat/free-trial-alert';
import { QuotaAlertExtension } from '@/components/chat/quota-alert-extension';
import { VoiceVisualization } from '@/components/chat/voice-visualization-lazy';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { STRING_LIMITS } from '@/constants';
import { useUsageStatsQuery } from '@/hooks/queries';
import type { PendingAttachment } from '@/hooks/utils';
import {
  useAutoResizeTextarea,
  useDragDrop,
  useFreeTrialState,
  useSpeechRecognition,
} from '@/hooks/utils';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { afterPaint } from '@/lib/ui/browser-timing';
import { cn } from '@/lib/ui/cn';

type ChatInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  status: ChatStatus;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  toolbar?: ReactNode;
  participants?: ParticipantConfig[];
  className?: string;
  enableSpeech?: boolean;
  minHeight?: number;
  maxHeight?: number;
  showCreditAlert?: boolean;
  attachments?: PendingAttachment[];
  onAddAttachments?: (files: File[]) => void;
  onRemoveAttachment?: (id: string) => void;
  enableAttachments?: boolean;
  attachmentClickRef?: RefObject<(() => void) | null>;
  isUploading?: boolean;
  isHydrating?: boolean;
  isSubmitting?: boolean;
  isModelsLoading?: boolean;
  hasHeaderToggle?: boolean;
  hideInternalAlerts?: boolean;
  borderVariant?: BorderVariant;
};

const EMPTY_PARTICIPANTS: ParticipantConfig[] = [];
const EMPTY_ATTACHMENTS: PendingAttachment[] = [];

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
  className,
  enableSpeech = true,
  minHeight = 72,
  maxHeight = 200,
  showCreditAlert = false,
  attachments = EMPTY_ATTACHMENTS,
  onAddAttachments,
  onRemoveAttachment,
  enableAttachments = true,
  attachmentClickRef,
  isUploading = false,
  isHydrating = false,
  isSubmitting = false,
  isModelsLoading = false,
  hasHeaderToggle = false,
  hideInternalAlerts = false,
  borderVariant = BorderVariants.DEFAULT,
}: ChatInputProps) => {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = status !== AiSdkStatuses.READY;
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { isFreeUser, hasUsedTrial } = useFreeTrialState();

  const isQuotaExceeded = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }

    const { credits, plan } = statsData.data;
    if (plan?.type !== PlanTypes.PAID) {
      return false;
    }
    return credits.available <= 0;
  }, [statsData]);

  const isFreeUserBlocked = isFreeUser && hasUsedTrial;

  const isInputDisabled = disabled || isQuotaExceeded || isFreeUserBlocked;
  const isMicDisabled = disabled || isQuotaExceeded || isFreeUserBlocked;
  const isOverLimit = value.length > STRING_LIMITS.MESSAGE_MAX;
  const isSubmitDisabled = disabled || isStreaming || isQuotaExceeded || isUploading || isOverLimit || isSubmitting || isLoadingStats || isFreeUserBlocked;
  const hasValidInput = (value.trim().length > 0 || attachments.length > 0) && participants.length > 0 && !isOverLimit;

  const handleFilesSelected = useCallback((files: File[]) => {
    if (onAddAttachments && files.length > 0) {
      onAddAttachments(files);
    }
  }, [onAddAttachments]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFilesSelected(files);
    e.target.value = '';
  }, [handleFilesSelected]);

  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Paste handler for clipboard file attachments (Cmd+V / Ctrl+V)
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!enableAttachments || !onAddAttachments)
      return;

    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      handleFilesSelected(files);
    }
  }, [enableAttachments, onAddAttachments, handleFilesSelected]);

  useEffect(() => {
    if (attachmentClickRef && enableAttachments) {
      attachmentClickRef.current = handleAttachmentClick;
    }
  }, [attachmentClickRef, enableAttachments, handleAttachmentClick]);

  const { isDragging, dragHandlers } = useDragDrop(handleFilesSelected);

  useAutoResizeTextarea(textareaRef, {
    value,
    minHeight,
    maxHeight,
  });

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

  const onChangeEvent = useEffectEvent((newValue: string) => {
    onChange(newValue);
  });

  const prevIsListening = useRef(false);
  useEffect(() => {
    const wasListening = prevIsListening.current;
    prevIsListening.current = isListening;

    if (!wasListening && isListening) {
      baseTextRef.current = value;
      resetTranscripts();
    } else if (wasListening && !isListening) {
      const parts = [baseTextRef.current, finalTranscript].filter(Boolean);
      onChangeEvent(parts.join(' ').trim());
    }
  }, [isListening, value, finalTranscript, resetTranscripts]);

  useEffect(() => {
    if (!isListening)
      return;

    const parts = [baseTextRef.current, finalTranscript, interimTranscript].filter(Boolean);
    const displayText = parts.join(' ').trim();

    if (displayText !== value) {
      onChangeEvent(displayText);
    }
  }, [isListening, finalTranscript, interimTranscript, value]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      return afterPaint(() => textareaRef.current?.focus({ preventScroll: true }));
    }
    return undefined;
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitDisabled && hasValidInput) {
        const form = e.currentTarget.form || e.currentTarget;
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as FormEvent<HTMLFormElement>;
        Object.defineProperty(submitEvent, 'currentTarget', { value: form, writable: false });
        Object.defineProperty(submitEvent, 'target', { value: form, writable: false });
        onSubmit(submitEvent);
      }
    }
  };

  const showNoModelsError = participants.length === 0 && !isQuotaExceeded && !isHydrating && !isModelsLoading;

  return (
    <div className="w-full">
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
          'border',
          'bg-card',
          'shadow-lg',
          'transition-all duration-200',
          isSubmitDisabled && !isQuotaExceeded && !isOverLimit && !showNoModelsError && 'cursor-not-allowed',
          // When header handles alerts, use passed borderVariant for consistent borders
          hideInternalAlerts && borderVariant === BorderVariants.SUCCESS && 'border-green-500/30',
          hideInternalAlerts && borderVariant === BorderVariants.WARNING && 'border-amber-500/30',
          hideInternalAlerts && borderVariant === BorderVariants.ERROR && 'border-destructive',
          // When no header, apply borders based on internal state
          !hideInternalAlerts && (isOverLimit || showNoModelsError || (isQuotaExceeded && !isFreeUser)) && 'border-destructive',
          !hideInternalAlerts && isFreeUser && !isOverLimit && !showNoModelsError && (hasUsedTrial ? 'border-amber-500/30' : 'border-green-500/30'),
          className,
        )}
        {...(enableAttachments ? dragHandlers : {})}
      >
        {enableAttachments && <ChatInputDropzoneOverlay isDragging={isDragging} />}

        <div className="flex flex-col overflow-hidden h-full">
          {showCreditAlert && !hideInternalAlerts && <QuotaAlertExtension hasHeaderToggle={hasHeaderToggle} />}
          {isFreeUser && !hideInternalAlerts && <FreeTrialAlert hasHeaderToggle={hasHeaderToggle} />}
          {showNoModelsError && (
            <div
              className={cn(
                'flex items-center gap-3 px-3 py-2',
                'border-0 border-b border-destructive/20',
                'bg-destructive/10',
                // No top rounding when header is present (hideInternalAlerts means header handles top)
                hideInternalAlerts ? 'rounded-none' : 'rounded-t-2xl',
              )}
            >
              <p className="text-[10px] leading-tight text-destructive font-medium flex-1 min-w-0">
                {t('chat.input.noModelsSelected')}
              </p>
            </div>
          )}

          {isOverLimit && (
            <div
              className={cn(
                'flex items-center gap-3 px-3 py-2',
                'border-0 border-b border-destructive/20',
                'bg-destructive/10',
                // No top rounding when header is present
                hideInternalAlerts ? 'rounded-none' : 'rounded-t-2xl',
              )}
            >
              <p className="text-[10px] leading-tight text-destructive font-medium flex-1 min-w-0">
                {t('chat.input.messageTooLong')}
              </p>
            </div>
          )}

          {enableSpeech && isSpeechSupported && (
            <VoiceVisualization
              isActive={isListening}
              audioLevels={audioLevels}
              hasAlertAbove={hideInternalAlerts || showCreditAlert || isFreeUser || showNoModelsError || isOverLimit}
            />
          )}

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
            <div className="px-3 sm:px-4 py-3 sm:py-4">
              <textarea
                ref={textareaRef}
                dir="auto"
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
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

            <div>
              <div className="px-3 sm:px-4 py-2 sm:py-3 flex items-center gap-2 sm:gap-3">
                <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
                  {toolbar}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {enableSpeech && isSpeechSupported && (
                    <Button
                      type="button"
                      size={ComponentSizes.ICON}
                      variant={isListening ? ComponentVariants.DEFAULT : ComponentVariants.GHOST}
                      onClick={toggleSpeech}
                      disabled={isMicDisabled && !isListening}
                      title={isListening
                        ? t('chat.toolbar.tooltips.stopRecording')
                        : t('chat.toolbar.tooltips.microphone')}
                      className={cn(
                        'size-8 sm:size-9 shrink-0 rounded-full',
                        isListening && 'bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse',
                      )}
                    >
                      {isListening ? <Icons.stopCircle className="size-3.5 sm:size-4" /> : <Icons.mic className="size-3.5 sm:size-4" />}
                    </Button>
                  )}

                  {isStreaming && onStop
                    ? (
                        <Button
                          type="button"
                          variant={ComponentVariants.WHITE}
                          size={ComponentSizes.ICON}
                          onClick={onStop}
                          className="size-9 sm:size-10 shrink-0 touch-manipulation active:scale-95 transition-transform"
                          aria-label={t('chat.input.stopStreaming')}
                        >
                          <Icons.square className="size-4 sm:size-5" />
                        </Button>
                      )
                    : (
                        <Button
                          type="submit"
                          variant={ComponentVariants.WHITE}
                          size={ComponentSizes.ICON}
                          disabled={isSubmitDisabled || !hasValidInput}
                          className="size-9 sm:size-10 shrink-0 touch-manipulation active:scale-95 transition-transform disabled:active:scale-100 disabled:bg-white/20 disabled:text-white/40"
                          aria-label={isSubmitting ? t('chat.input.submitting') : t('chat.input.send')}
                        >
                          {isSubmitting
                            ? <Icons.loader className="size-4 sm:size-5 animate-spin" />
                            : <Icons.arrowUp className="size-4 sm:size-5" />}
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

ChatInput.displayName = 'ChatInput';
