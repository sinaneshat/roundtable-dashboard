'use client';

import { ChevronDown, MessagesSquare, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { ChatMode } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { WebSearchToggle } from '@/components/chat/web-search-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  disabled = false,
}: ChatInputToolbarMenuProps) => {
  const t = useTranslations();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;

  if (isDesktop) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={onOpenModelModal}
          className="h-9 rounded-2xl gap-1.5 text-xs px-3"
        >
          <span>{t('chat.models.aiModels')}</span>
          <AvatarGroup
            participants={selectedParticipants}
            allModels={allModels}
            size="sm"
            maxVisible={3}
          />
        </Button>
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
        <WebSearchToggle
          enabled={enableWebSearch}
          onToggle={disabled ? undefined : onWebSearchToggle}
          disabled={disabled}
        />
      </div>
    );
  }

  // Mobile: Show dropdown menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-9 rounded-2xl gap-1.5 text-xs px-2.5',
            'hover:bg-white/10',
          )}
        >
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-56 bg-black/95 backdrop-blur-xl border-white/10"
      >
        <DropdownMenuLabel className="text-white/60">
          {t('chat.toolbar.options')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />

        {/* AI Models */}
        <DropdownMenuItem
          onClick={onOpenModelModal}
          className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
        >
          <Sparkles className="size-4" />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-white">
              {t('chat.models.aiModels')}
            </span>
            <span className="text-xs text-white/60 truncate">
              {selectedParticipants.length}
              {' '}
              {t('chat.toolbar.selected')}
            </span>
          </div>
          <AvatarGroup
            participants={selectedParticipants}
            allModels={allModels}
            size="sm"
            maxVisible={2}
          />
        </DropdownMenuItem>

        {/* Conversation Mode */}
        <DropdownMenuItem
          onClick={onOpenModeModal}
          className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
        >
          {ModeIcon && <ModeIcon className="size-4" />}
          <div className="flex flex-col flex-1">
            <span className="text-sm font-medium text-white">
              {t('chat.modes.mode')}
            </span>
            <span className="text-xs text-white/60">
              {currentMode?.label}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-white/10" />

        {/* Web Search Toggle */}
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onWebSearchToggle?.(!enableWebSearch);
          }}
          className="cursor-pointer hover:bg-white/10 focus:bg-white/10"
        >
          <MessagesSquare className="size-4" />
          <span className="text-sm font-medium text-white flex-1">
            {t('chat.webSearch.toggle')}
          </span>
          <div
            className={cn(
              'size-5 rounded-full border-2 flex items-center justify-center transition-colors',
              enableWebSearch
                ? 'bg-primary border-primary'
                : 'bg-transparent border-white/20',
            )}
          >
            {enableWebSearch && (
              <div className="size-2 rounded-full bg-white" />
            )}
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

ChatInputToolbarMenu.displayName = 'ChatInputToolbarMenu';
