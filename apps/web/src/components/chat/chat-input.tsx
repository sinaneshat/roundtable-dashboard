import type { BorderVariant } from '@roundtable/shared';
import { AiSdkStatuses, BorderVariants, ComponentSizes, ComponentVariants, PlanTypes } from '@roundtable/shared';
import type { ChatStatus } from 'ai';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { ChatInputDropzoneOverlay } from '@/components/chat/chat-input-attachments';
import { ChatInputAttachments } from '@/components/chat/chat-input-attachments-lazy';
import { VoiceVisualization } from '@/components/chat/voice-visualization-lazy';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { STRING_LIMITS } from '@/constants';
import { useUsageStatsQuery } from '@/hooks/queries';
import type { PendingAttachment } from '@/hooks/utils';
import {
  useAutoResizeTextarea,
  useCreditEstimation,
  useDragDrop,
  useFreeTrialState,
  useSpeechRecognition,
} from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
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
  hideInternalAlerts?: boolean;
  borderVariant?: BorderVariant;
  autoMode?: boolean;
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
  showCreditAlert: _showCreditAlert = false,
  attachments = EMPTY_ATTACHMENTS,
  onAddAttachments,
  onRemoveAttachment,
  enableAttachments = true,
  attachmentClickRef,
  isUploading = false,
  isHydrating = false,
  isSubmitting = false,
  isModelsLoading = false,
  hideInternalAlerts: _hideInternalAlerts = false,
  borderVariant = BorderVariants.DEFAULT,
  autoMode = false,
}: ChatInputProps) => {
  const t = useTranslations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStreaming = status !== AiSdkStatuses.READY;
  const { data: statsData, isLoading: isLoadingStats } = useUsageStatsQuery();
  const { isFreeUser, hasUsedTrial } = useFreeTrialState();

  // Real-time credit estimation based on selected models and their pricing tiers
  const creditEstimate = useCreditEstimation({
    participants,
    autoMode: false,
    enableWebSearch: false,
  });

  const isQuotaExceeded = useMemo(() => {
    if (!statsData?.success || !statsData.data) {
      return false;
    }
    const { plan } = statsData.data;
    if (plan?.type !== PlanTypes.PAID) {
      return false;
    }
    // Block if user can't afford the estimated credits for this round
    return !creditEstimate.canAfford;
  }, [statsData, creditEstimate.canAfford]);

  const isFreeUserBlocked = isFreeUser && hasUsedTrial;

  const isInputDisabled = disabled || isQuotaExceeded || isFreeUserBlocked;
  const isMicDisabled = disabled || isQuotaExceeded || isFreeUserBlocked;
  const isOverLimit = value.length > STRING_LIMITS.MESSAGE_MAX;
  const isSubmitDisabled = disabled || isStreaming || isQuotaExceeded || isUploading || isOverLimit || isSubmitting || isLoadingStats || creditEstimate.isLoading || isFreeUserBlocked;
  // In auto mode, skip participant validation - AI will select models based on prompt
  const hasValidInput = (value.trim().length > 0 || attachments.length > 0) && (autoMode || participants.length > 0) && !isOverLimit;

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
        const form = e.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
    }
  };

  // Don't show "no models" error in auto mode - AI will select models based on prompt
  const showNoModelsError = !autoMode && participants.length === 0 && !isQuotaExceeded && !isHydrating && !isModelsLoading;

  return (
    <div className="w-full">
      {/* Always render file input to prevent hydration mismatch - it's hidden anyway */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={enableAttachments && onAddAttachments ? handleFileInputChange : undefined}
        className="hidden"
        accept="image/*,application/pdf,text/*,.md,.json,.csv,.xml,.html,.css,.js,.ts,.jsx,.tsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php"
        disabled={!enableAttachments || !onAddAttachments}
      />

      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          'rounded-2xl',
          'border',
          'bg-card',
          'shadow-lg',
          'transition-all duration-200',
          isSubmitDisabled && !isQuotaExceeded && !isOverLimit && !showNoModelsError && 'cursor-not-allowed',
          // Border colors passed from parent via borderVariant
          borderVariant === BorderVariants.SUCCESS && 'border-green-500/30',
          borderVariant === BorderVariants.WARNING && 'border-amber-500/30',
          borderVariant === BorderVariants.ERROR && 'border-destructive/30',
          className,
        )}
        {...(enableAttachments ? dragHandlers : {})}
      >
        {enableAttachments && <ChatInputDropzoneOverlay isDragging={isDragging} />}

        <div className="flex flex-col overflow-hidden h-full">

          {enableSpeech && isSpeechSupported && (
            <VoiceVisualization
              isActive={isListening}
              audioLevels={audioLevels}
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
              e.preventDefault();
              if (isSubmitDisabled || !hasValidInput) {
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
