'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { ChatMode } from '@/api/core/enums';
import { ChatModes } from '@/api/core/enums';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CHAT_MODE_CONFIGS } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';

/**
 * ConversationModeModal Component
 *
 * Reusable modal for selecting conversation modes with icon, title, and description.
 * Follows established dialog patterns from src/components/ui/dialog.tsx and
 * chat components like chat-mode-selector.tsx.
 *
 * Features:
 * - Single selection with visual feedback (blue border highlight)
 * - Icon + title + description for each mode
 * - Full keyboard accessibility via Radix Dialog
 * - Translation key integration
 * - Dark theme compatible
 *
 * @example
 * ```tsx
 * <ConversationModeModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   selectedMode="brainstorming"
 *   onModeSelect={(mode) => {
 *     console.log('Selected:', mode);
 *     setIsOpen(false);
 *   }}
 * />
 * ```
 */

export type ConversationModeModalProps = {
  /** Controls dialog open/close state */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Currently selected mode (for highlighting) */
  selectedMode?: ChatMode;
  /** Callback when a mode is selected */
  onModeSelect: (mode: ChatMode) => void;
  /** Optional className for dialog content */
  className?: string;
  /** Optional children to render below mode options */
  children?: ReactNode;
};

export function ConversationModeModal({
  open,
  onOpenChange,
  selectedMode,
  onModeSelect,
  className,
  children,
}: ConversationModeModalProps) {
  const t = useTranslations('chat.modes.modal');

  // Get enabled modes from configuration
  const enabledModes = CHAT_MODE_CONFIGS.filter(mode => mode.isEnabled).sort(
    (a, b) => a.order - b.order,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('!max-w-md !w-[calc(100vw-2.5rem)]', className)}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col py-4">
          {enabledModes.map((mode) => {
            const ModeIcon = mode.icon;
            const isSelected = selectedMode === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onModeSelect(mode.id)}
                className={cn(
                  'flex items-center gap-3 p-3 text-left w-full rounded-lg',
                  'cursor-pointer transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                  !isSelected && 'hover:bg-white/5 hover:backdrop-blur-sm',
                  isSelected && 'bg-white/10',
                )}
                aria-pressed={isSelected}
              >
                <div
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    mode.id === ChatModes.DEBATING && 'bg-blue-500/20',
                    mode.id === ChatModes.BRAINSTORMING && 'bg-yellow-500/20',
                    mode.id === ChatModes.SOLVING && 'bg-green-500/20',
                    mode.id === ChatModes.ANALYZING && 'bg-purple-500/20',
                  )}
                >
                  <ModeIcon
                    className={cn(
                      'size-4',
                      mode.id === ChatModes.DEBATING && 'text-blue-400',
                      mode.id === ChatModes.BRAINSTORMING && 'text-yellow-400',
                      mode.id === ChatModes.SOLVING && 'text-green-400',
                      mode.id === ChatModes.ANALYZING && 'text-purple-400',
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-normal">{mode.label}</h3>
                  <p className="text-xs text-muted-foreground">
                    {mode.metadata.description}
                  </p>
                </div>
              </button>
            );
          })}
        </DialogBody>

        {children}
      </DialogContent>
    </Dialog>
  );
}
