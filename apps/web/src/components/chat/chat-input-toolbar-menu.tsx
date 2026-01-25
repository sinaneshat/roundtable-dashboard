import type { ChatMode } from '@roundtable/shared';
import { AvatarSizes, ComponentSizes, ComponentVariants } from '@roundtable/shared';
import { memo, useCallback } from 'react';

import { AvatarGroup } from '@/components/chat/avatar-group';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getChatModeById } from '@/lib/config/chat-modes';
import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config/participant-limits';
import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';
import type { Model } from '@/services/api';

type ChatInputToolbarMenuProps = {
  selectedParticipants: ParticipantConfig[];
  allModels: Model[];
  onOpenModelModal: () => void;
  selectedMode: ChatMode;
  onOpenModeModal: () => void;
  enableWebSearch: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;
  onAttachmentClick?: () => void;
  attachmentCount?: number;
  enableAttachments?: boolean;
  isListening?: boolean;
  onToggleSpeech?: () => void;
  isSpeechSupported?: boolean;
  disabled?: boolean;
  isModelsLoading?: boolean;
  autoMode?: boolean;
};

export const ChatInputToolbarMenu = memo(({
  selectedParticipants,
  allModels,
  onOpenModelModal,
  selectedMode,
  onOpenModeModal,
  enableWebSearch,
  onWebSearchToggle,
  onAttachmentClick,
  attachmentCount = 0,
  enableAttachments = true,
  isListening = false,
  onToggleSpeech,
  isSpeechSupported = false,
  disabled = false,
  isModelsLoading = false,
  autoMode = false,
}: ChatInputToolbarMenuProps) => {
  const t = useTranslations();

  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;
  const hasNoModelsSelected = !autoMode && selectedParticipants.length < MIN_PARTICIPANTS_REQUIRED;

  const handleAttachClick = useCallback(() => {
    onAttachmentClick?.();
  }, [onAttachmentClick]);

  return (
    <>
      <TooltipProvider delayDuration={800}>
        <div className="hidden md:flex items-center gap-2">
          {!autoMode && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={ComponentVariants.OUTLINE}
                    disabled={disabled}
                    onClick={onOpenModelModal}
                    className={cn(
                      'h-10 sm:h-9 gap-1.5 text-xs px-3 hover:bg-white/15',
                      hasNoModelsSelected && 'border-destructive text-destructive hover:bg-destructive/20',
                    )}
                    startIcon={hasNoModelsSelected ? <Icons.alertCircle /> : undefined}
                  >
                    <span>{t('chat.models.models')}</span>
                    {!hasNoModelsSelected && (
                      <AvatarGroup
                        participants={selectedParticipants}
                        allModels={allModels}
                        size={AvatarSizes.SM}
                        maxVisible={5}
                        showCount={false}
                        showOverflow
                      />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('chat.toolbar.tooltips.models')}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={ComponentVariants.OUTLINE}
                    disabled={disabled}
                    onClick={onOpenModeModal}
                    className="h-10 sm:h-9 gap-1.5 text-xs px-3 hover:bg-white/15"
                    startIcon={ModeIcon ? <ModeIcon /> : undefined}
                  >
                    <span>{currentMode?.label || t('chat.modes.mode')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{t('chat.toolbar.tooltips.mode')}</p>
                </TooltipContent>
              </Tooltip>
            </>
          )}

          {onAttachmentClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={ComponentVariants.OUTLINE}
                  size={ComponentSizes.ICON}
                  disabled={disabled || !enableAttachments}
                  onClick={handleAttachClick}
                  className={cn(
                    'size-10 sm:size-9 hover:bg-white/15',
                    attachmentCount > 0 && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20',
                  )}
                >
                  <Icons.paperclip className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {enableAttachments
                    ? t('chat.toolbar.tooltips.attach')
                    : t('chat.toolbar.tooltips.attachDisabled')}
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {!autoMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={ComponentVariants.OUTLINE}
                  size={ComponentSizes.ICON}
                  disabled={disabled}
                  onClick={() => onWebSearchToggle?.(!enableWebSearch)}
                  aria-label={enableWebSearch ? t('chat.toolbar.tooltips.webSearchEnabled') : t('chat.toolbar.tooltips.webSearch')}
                  aria-pressed={enableWebSearch}
                  data-testid="web-search-toggle"
                  className={cn(
                    'size-10 sm:size-9 transition-colors hover:bg-white/15',
                    enableWebSearch
                      ? 'border-blue-500/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/25'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icons.globe className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">
                  {enableWebSearch
                    ? t('chat.toolbar.tooltips.webSearchEnabled')
                    : t('chat.toolbar.tooltips.webSearch')}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      <div className="flex md:hidden items-center gap-1.5">
        {autoMode
          ? (
              onAttachmentClick && (
                <Button
                  type="button"
                  variant={ComponentVariants.GLASS}
                  size={ComponentSizes.ICON}
                  disabled={disabled || !enableAttachments}
                  onClick={handleAttachClick}
                  className={cn(
                    'size-10',
                    attachmentCount > 0 && 'border-primary/50 bg-primary/10 text-primary',
                  )}
                  aria-label={t('chat.input.attachFiles')}
                >
                  <Icons.paperclip className="size-4" />
                </Button>
              )
            )
          : (
              <>
                <Button
                  type="button"
                  variant={ComponentVariants.GLASS}
                  size={ComponentSizes.SM}
                  disabled={disabled}
                  onClick={onOpenModelModal}
                  className={cn(
                    'h-10 px-2.5 gap-1',
                    hasNoModelsSelected && !isModelsLoading && 'border-destructive/50 bg-destructive/10',
                  )}
                  loading={isModelsLoading}
                  startIcon={hasNoModelsSelected && !isModelsLoading ? <Icons.alertCircle className="text-destructive" /> : undefined}
                >
                  {!isModelsLoading && !hasNoModelsSelected && (
                    <AvatarGroup
                      participants={selectedParticipants}
                      allModels={allModels}
                      size={AvatarSizes.SM}
                      maxVisible={3}
                      showCount={false}
                      showOverflow
                    />
                  )}
                </Button>

                <Drawer>
                  <DrawerTrigger asChild>
                    <Button
                      type="button"
                      variant={ComponentVariants.GLASS}
                      size={ComponentSizes.ICON}
                      disabled={disabled}
                      className="size-10"
                      aria-label={t('accessibility.moreOptions')}
                    >
                      <Icons.moreHorizontal className="size-4" />
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent glass>
                    <DrawerHeader className="pb-4">
                      <DrawerTitle className="text-base font-semibold text-foreground">
                        {t('chat.toolbar.options')}
                      </DrawerTitle>
                    </DrawerHeader>

                    <div className="px-5 pb-5 space-y-3">
                      <button
                        type="button"
                        onClick={onOpenModeModal}
                        className="w-full flex items-center gap-4 p-4 min-h-14 rounded-2xl bg-white/5 hover:bg-white/[0.07] active:bg-black/20 transition-colors touch-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-center justify-center size-10 rounded-full bg-purple-500/10">
                          {ModeIcon && <ModeIcon className="size-5 text-purple-400" />}
                        </div>
                        <div className="flex flex-col flex-1 text-left">
                          <span className="text-sm font-medium text-foreground">
                            {t('chat.modes.mode')}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {currentMode?.label}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onWebSearchToggle?.(!enableWebSearch)}
                        className={cn(
                          'w-full flex items-center gap-4 p-4 min-h-14 rounded-2xl transition-colors touch-feedback',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          enableWebSearch
                            ? 'bg-blue-500/20 hover:bg-blue-500/25 active:bg-blue-500/30'
                            : 'bg-white/5 hover:bg-white/[0.07] active:bg-black/20',
                        )}
                      >
                        <div className={cn(
                          'flex items-center justify-center size-10 rounded-full transition-colors',
                          enableWebSearch ? 'bg-blue-500/20' : 'bg-blue-500/10',
                        )}
                        >
                          <Icons.globe className={cn(
                            'size-5 transition-colors',
                            enableWebSearch ? 'text-blue-300' : 'text-blue-400',
                          )}
                          />
                        </div>
                        <span className={cn(
                          'text-sm font-medium flex-1 text-left transition-colors',
                          enableWebSearch ? 'text-blue-100' : 'text-foreground',
                        )}
                        >
                          {t('chat.webSearch.toggle')}
                        </span>
                        {enableWebSearch && (
                          <div className="size-2 rounded-full bg-blue-400" />
                        )}
                      </button>

                      {onAttachmentClick && (
                        <button
                          type="button"
                          onClick={handleAttachClick}
                          disabled={!enableAttachments}
                          className={cn(
                            'w-full flex items-center gap-4 p-4 min-h-14 rounded-2xl transition-colors touch-feedback',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            !enableAttachments && 'opacity-50 cursor-not-allowed',
                            attachmentCount > 0
                              ? 'bg-amber-500/20 hover:bg-amber-500/25 active:bg-amber-500/30'
                              : 'bg-white/5 hover:bg-white/[0.07] active:bg-black/20',
                          )}
                        >
                          <div className={cn(
                            'flex items-center justify-center size-10 rounded-full transition-colors',
                            attachmentCount > 0 ? 'bg-amber-500/20' : 'bg-amber-500/10',
                          )}
                          >
                            <Icons.paperclip className={cn(
                              'size-5 transition-colors',
                              attachmentCount > 0 ? 'text-amber-300' : 'text-amber-400',
                            )}
                            />
                          </div>
                          <span className={cn(
                            'text-sm font-medium flex-1 text-left transition-colors',
                            attachmentCount > 0 ? 'text-amber-100' : 'text-foreground',
                          )}
                          >
                            {t('chat.input.attachFiles')}
                          </span>
                        </button>
                      )}

                      {onToggleSpeech && (
                        <button
                          type="button"
                          onClick={onToggleSpeech}
                          disabled={!isSpeechSupported}
                          className={cn(
                            'w-full flex items-center gap-4 p-4 min-h-14 rounded-2xl transition-colors touch-feedback',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            !isSpeechSupported && 'opacity-50 cursor-not-allowed',
                            isListening
                              ? 'bg-red-500/20 hover:bg-red-500/25 active:bg-red-500/30'
                              : 'bg-white/5 hover:bg-white/[0.07] active:bg-black/20',
                          )}
                        >
                          <div className={cn(
                            'flex items-center justify-center size-10 rounded-full',
                            isListening ? 'bg-red-500/20' : 'bg-green-500/10',
                          )}
                          >
                            {isListening
                              ? <Icons.stopCircle className="size-5 text-red-400" />
                              : <Icons.mic className="size-5 text-green-400" />}
                          </div>
                          <span className={cn(
                            'text-sm font-medium flex-1 text-left transition-colors',
                            isListening ? 'text-red-100' : 'text-foreground',
                          )}
                          >
                            {isListening ? t('chat.input.stopRecording') : t('chat.input.voiceInput')}
                          </span>
                          {isListening && (
                            <div className="size-2 rounded-full bg-red-500 animate-pulse" />
                          )}
                        </button>
                      )}
                    </div>
                  </DrawerContent>
                </Drawer>
              </>
            )}
      </div>
    </>
  );
});

ChatInputToolbarMenu.displayName = 'ChatInputToolbarMenu';
