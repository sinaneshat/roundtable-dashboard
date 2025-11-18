'use client';

import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { ChatMode } from '@/api/core/enums';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { AvatarGroup } from '@/components/chat/avatar-group';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { Badge } from '@/components/ui/badge';
import { getChatModeById } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';

type ChatInputEnhancedToolbarProps = {
  // Model selection
  selectedParticipants: ParticipantConfig[];
  allModels: EnhancedModelResponse[];
  onOpenModelModal: () => void;

  // Mode selection
  selectedMode: ChatMode;
  onOpenModeModal: () => void;

  // Web search
  enableWebSearch?: boolean;
  onWebSearchToggle?: (enabled: boolean) => void;

  // State
  disabled?: boolean;
};

/**
 * ChatInputEnhancedToolbar - Displays AI models and mode inline in chat input
 *
 * Matches screenshot design:
 * - "AI Models" label on left
 * - Model avatars (colored icons)
 * - Count badge for additional models (+3, etc.)
 * - "Debating" mode badge
 */
export const ChatInputEnhancedToolbar = memo(({
  selectedParticipants,
  allModels,
  onOpenModelModal,
  selectedMode,
  onOpenModeModal,
  enableWebSearch = false,
  onWebSearchToggle,
  disabled = false,
}: ChatInputEnhancedToolbarProps) => {
  const t = useTranslations();

  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;
  const participantCount = selectedParticipants.length;
  const visibleCount = 3;
  const extraCount = Math.max(0, participantCount - visibleCount);

  return (
    <div className="flex items-center gap-3">
      {/* AI Models Section */}
      <button
        type="button"
        onClick={onOpenModelModal}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 h-9 px-3 rounded-full',
          'bg-muted/40 border border-border/50',
          'hover:bg-muted/60 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {t('chat.models.aiModels')}
        </span>

        <div className="flex items-center gap-1.5">
          <AvatarGroup
            participants={selectedParticipants}
            allModels={allModels}
            size="sm"
            maxVisible={visibleCount}
          />

          {extraCount > 0 && (
            <Badge
              variant="secondary"
              className="h-6 min-w-[24px] rounded-full px-1.5 text-[10px] font-semibold"
            >
              +
              {extraCount}
            </Badge>
          )}
        </div>
      </button>

      {/* Mode Chip */}
      <button
        type="button"
        onClick={onOpenModeModal}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 h-9 px-3 rounded-full',
          'bg-muted/40 border border-border/50',
          'hover:bg-muted/60 transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        {ModeIcon && <ModeIcon className="size-3.5" />}
        <span className="text-xs font-medium">
          {currentMode?.label || t('chat.modes.mode')}
        </span>
      </button>

      {/* Web Search Button */}
      <button
        type="button"
        onClick={() => onWebSearchToggle?.(!enableWebSearch)}
        disabled={disabled}
        className={cn(
          'flex items-center justify-center rounded-full transition-colors',
          'size-9 p-0',
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
});

ChatInputEnhancedToolbar.displayName = 'ChatInputEnhancedToolbar';
