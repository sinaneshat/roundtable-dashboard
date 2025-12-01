'use client';

import { Globe, Mic, MoreHorizontal, Paperclip, Sparkles, StopCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback, useEffect, useState } from 'react';

import type { ChatMode } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/utils';
import { getChatModeById } from '@/lib/config/chat-modes';
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
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [mounted, setMounted] = useState(false);

  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;

  // Handle file input click
  const handleAttachClick = useCallback(() => {
    onAttachmentClick?.();
  }, [onAttachmentClick]);

  // Prevent hydration mismatch by only showing responsive behavior after mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks-extra/no-direct-set-state-in-use-effect -- Required pattern to prevent SSR hydration mismatch
    setMounted(true);
  }, []);

  // After mount, show desktop version
  if (mounted && isDesktop) {
    return (
      <div className="flex items-center gap-2">
        {/* Models button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onOpenModelModal}
          className="h-9 rounded-2xl gap-1.5 text-xs px-3"
        >
          <span>{t('chat.models.models')}</span>
          <AvatarGroup
            participants={selectedParticipants}
            allModels={allModels}
            size="sm"
            maxVisible={3}
          />
        </Button>
        {/* Mode button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onOpenModeModal}
          className="h-9 rounded-2xl gap-1.5 text-xs px-3"
        >
          {ModeIcon && <ModeIcon className="size-4" />}
          <span>{currentMode?.label || t('chat.modes.mode')}</span>
        </Button>
        {/* Attach button */}
        {enableAttachments && onAttachmentClick && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleAttachClick}
            className={cn(
              'flex items-center justify-center rounded-full transition-colors',
              'h-9 w-9 p-0',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              attachmentCount > 0
                ? 'bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20 hover:border-primary/60'
                : 'bg-muted/40 border border-border/50 hover:bg-muted/60',
            )}
          >
            <Paperclip className="size-4" />
          </button>
        )}
        {/* Web search toggle */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onWebSearchToggle?.(!enableWebSearch)}
          className={cn(
            'flex items-center justify-center rounded-full transition-colors',
            'h-9 w-9 p-0',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            enableWebSearch
              ? 'bg-primary/10 border border-primary/50 text-primary hover:bg-primary/20 hover:border-primary/60'
              : 'bg-muted/40 border border-border/50 hover:bg-muted/60',
          )}
        >
          <Globe className="size-4" />
        </button>
      </div>
    );
  }

  // Mobile version (default during SSR and for mobile devices)
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex items-center justify-center size-8 rounded-full',
            'bg-white/5 hover:bg-white/10 active:bg-white/15',
            'transition-colors disabled:opacity-50',
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DrawerTrigger>
      <DrawerContent glass>
        <DrawerHeader className="pb-4">
          <DrawerTitle className="text-base font-semibold text-foreground">
            {t('chat.toolbar.options')}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-5 pb-20 space-y-3" style={{ paddingBottom: '20px' }}>
          {/* AI Models */}
          <button
            type="button"
            onClick={onOpenModelModal}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <div className="flex items-center justify-center size-10 rounded-full bg-cyan-500/10">
              <Sparkles className="size-5 text-cyan-400" />
            </div>
            <div className="flex flex-col flex-1 min-w-0 text-left">
              <span className="text-sm font-medium text-foreground">
                {t('chat.models.aiModels')}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {selectedParticipants.length}
                {' '}
                {t('chat.toolbar.selected')}
              </span>
            </div>
            <AvatarGroup
              participants={selectedParticipants}
              allModels={allModels}
              size="sm"
              maxVisible={3}
            />
          </button>

          {/* Conversation Mode */}
          <button
            type="button"
            onClick={onOpenModeModal}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
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

          {/* Web Search Toggle */}
          <button
            type="button"
            onClick={() => onWebSearchToggle?.(!enableWebSearch)}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
              enableWebSearch
                ? 'bg-blue-500/20 hover:bg-blue-500/25 active:bg-blue-500/30'
                : 'bg-white/5 hover:bg-white/10 active:bg-white/15',
            )}
          >
            <div className={cn(
              'flex items-center justify-center size-10 rounded-full transition-colors',
              enableWebSearch ? 'bg-blue-500/20' : 'bg-blue-500/10',
            )}
            >
              <Globe className={cn(
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

          {/* Attach Files - Mobile drawer option */}
          {enableAttachments && onAttachmentClick && (
            <button
              type="button"
              onClick={handleAttachClick}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
                attachmentCount > 0
                  ? 'bg-amber-500/20 hover:bg-amber-500/25 active:bg-amber-500/30'
                  : 'bg-white/5 hover:bg-white/10 active:bg-white/15',
              )}
            >
              <div className={cn(
                'flex items-center justify-center size-10 rounded-full transition-colors',
                attachmentCount > 0 ? 'bg-amber-500/20' : 'bg-amber-500/10',
              )}
              >
                <Paperclip className={cn(
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

          {/* Voice Input - Mobile only */}
          {onToggleSpeech && (
            <button
              type="button"
              onClick={onToggleSpeech}
              disabled={!isSpeechSupported}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-2xl transition-colors',
                !isSpeechSupported && 'opacity-50 cursor-not-allowed',
                isListening
                  ? 'bg-red-500/20 hover:bg-red-500/25 active:bg-red-500/30'
                  : 'bg-white/5 hover:bg-white/10 active:bg-white/15',
              )}
            >
              <div className={cn(
                'flex items-center justify-center size-10 rounded-full',
                isListening ? 'bg-red-500/20' : 'bg-green-500/10',
              )}
              >
                {isListening
                  ? <StopCircle className="size-5 text-red-400" />
                  : <Mic className="size-5 text-green-400" />}
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
