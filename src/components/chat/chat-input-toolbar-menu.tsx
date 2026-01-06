'use client';

import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';

import type { ChatMode } from '@/api/core/enums';
import { AvatarSizes, ComponentSizes, ComponentVariants } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
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
import { useIsMounted, useMediaQuery } from '@/hooks/utils';
import { getChatModeById } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { cn } from '@/lib/ui/cn';

type ChatInputToolbarMenuProps = {
  // Model selection
  selectedParticipants: ParticipantConfig[];
  allModels: EnhancedModelResponse[];
  onOpenModelModal: () => void;

  // Mode selection
  selectedMode: ChatMode;
  onOpenModeModal: () => void;

  // Web search
  enableWebSearch: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;

  // File attachments
  onAttachmentClick?: () => void;
  attachmentCount?: number;
  enableAttachments?: boolean;

  // Speech recognition (mobile only)
  isListening?: boolean;
  onToggleSpeech?: () => void;
  isSpeechSupported?: boolean;

  // State
  disabled?: boolean;
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
}: ChatInputToolbarMenuProps) => {
  const t = useTranslations();
  const isMounted = useIsMounted();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;
  const hasNoModelsSelected = selectedParticipants.length === 0;

  // Handle file input click
  const handleAttachClick = useCallback(() => {
    onAttachmentClick?.();
  }, [onAttachmentClick]);

  if (!isMounted) {
    return (
      <Button
        type="button"
        variant={ComponentVariants.GLASS}
        size={ComponentSizes.ICON}
        disabled={disabled}
        className="size-8"
      >
        <Icons.moreHorizontal className="size-4" />
      </Button>
    );
  }

  if (isDesktop) {
    return (
      <TooltipProvider delayDuration={800}>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={ComponentVariants.OUTLINE}
                size={ComponentSizes.SM}
                disabled={disabled}
                onClick={onOpenModelModal}
                className={cn(
                  'h-9 rounded-2xl gap-1.5 text-xs px-3 hover:bg-white/15',
                  hasNoModelsSelected && 'border-destructive text-destructive hover:bg-destructive/20',
                )}
              >
                {hasNoModelsSelected && <Icons.alertCircle className="size-3.5" />}
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
                size={ComponentSizes.SM}
                disabled={disabled}
                onClick={onOpenModeModal}
                className="h-9 rounded-2xl gap-1.5 text-xs px-3 hover:bg-white/15"
              >
                {ModeIcon && <ModeIcon className="size-4" />}
                <span>{currentMode?.label || t('chat.modes.mode')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('chat.toolbar.tooltips.mode')}</p>
            </TooltipContent>
          </Tooltip>

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
                    'size-9 hover:bg-white/15',
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={ComponentVariants.OUTLINE}
                size={ComponentSizes.ICON}
                disabled={disabled}
                onClick={() => onWebSearchToggle?.(!enableWebSearch)}
                className={cn(
                  'size-9 transition-colors hover:bg-white/15',
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
        </div>
      </TooltipProvider>
    );
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant={ComponentVariants.GLASS}
          size={ComponentSizes.ICON}
          disabled={disabled}
          className="size-8"
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
            onClick={onOpenModelModal}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              hasNoModelsSelected
                ? 'bg-destructive/10 border border-destructive/30 hover:bg-destructive/15'
                : 'bg-white/5 hover:bg-white/[0.07] active:bg-black/20',
            )}
          >
            <div className={cn(
              'flex items-center justify-center size-10 rounded-full',
              hasNoModelsSelected ? 'bg-destructive/20' : 'bg-cyan-500/10',
            )}
            >
              {hasNoModelsSelected
                ? <Icons.alertCircle className="size-5 text-destructive" />
                : <Icons.sparkles className="size-5 text-cyan-400" />}
            </div>
            <div className="flex flex-col flex-1 min-w-0 text-left">
              <span className={cn(
                'text-sm font-medium',
                hasNoModelsSelected ? 'text-destructive' : 'text-foreground',
              )}
              >
                {t('chat.models.aiModels')}
              </span>
              <span className={cn(
                'text-xs truncate',
                hasNoModelsSelected ? 'text-destructive/70' : 'text-muted-foreground',
              )}
              >
                {hasNoModelsSelected
                  ? t('chat.models.minimumRequired.description', { count: 1 })
                  : `${selectedParticipants.length} ${t('chat.toolbar.selected')}`}
              </span>
            </div>
            {!hasNoModelsSelected && (
              <AvatarGroup
                participants={selectedParticipants}
                allModels={allModels}
                size={AvatarSizes.SM}
                maxVisible={3}
                showCount={false}
                showOverflow
              />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenModeModal}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/[0.07] active:bg-black/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
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
                'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
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
                'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
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
  );
});

ChatInputToolbarMenu.displayName = 'ChatInputToolbarMenu';
