'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ChatModeId } from '@/lib/config/chat-modes';
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
  selectedMode?: ChatModeId;
  /** Callback when a mode is selected */
  onModeSelect: (mode: ChatModeId) => void;
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
        glass={true}
        className={cn('!max-w-md !w-[calc(100vw-2.5rem)]', className)}
      >
        <DialogHeader glass>
          <DialogTitle className="text-xl">{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        <DialogBody glass className="flex flex-col gap-2.5 py-4">
          {enabledModes.map((mode) => {
            const ModeIcon = mode.icon;
            const isSelected = selectedMode === mode.id;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => onModeSelect(mode.id)}
                className={cn(
                  'flex items-start gap-4 p-4 text-left w-full rounded-xl',
                  'cursor-pointer transition-all duration-200',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
                  !isSelected && 'hover:bg-white/10',
                  isSelected && 'bg-primary/10 hover:bg-primary/15',
                )}
                aria-pressed={isSelected}
              >
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full',
                    mode.id === 'debating' && 'bg-blue-500/20',
                    mode.id === 'brainstorming' && 'bg-yellow-500/20',
                    mode.id === 'solving' && 'bg-green-500/20',
                    mode.id === 'analyzing' && 'bg-purple-500/20',
                  )}
                >
                  <ModeIcon
                    className={cn(
                      'size-6',
                      mode.id === 'debating' && 'text-blue-400',
                      mode.id === 'brainstorming' && 'text-yellow-400',
                      mode.id === 'solving' && 'text-green-400',
                      mode.id === 'analyzing' && 'text-purple-400',
                    )}
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <h3 className="text-sm font-semibold">{mode.label}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
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
