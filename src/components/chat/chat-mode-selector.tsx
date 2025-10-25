'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBoolean } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getChatModeById, getChatModeOptions } from '@/lib/config/chat-modes';
import { cn } from '@/lib/ui/cn';

type ChatModeSelectorProps = {
  selectedMode: ChatModeId;
  onModeChange?: (mode: ChatModeId) => void;
  className?: string;
  disabled?: boolean; // ✅ STREAMING PROTECTION: Disable during streaming to prevent mid-stream mode changes
};

/**
 * ChatModeSelector - Icon-based mode selector matching toolbar button style
 *
 * Follows exact styling patterns from ChatParticipantsList:
 * - Same button variant, size, and spacing
 * - Icon + text label with responsive visibility
 * - Popover interaction with Command component
 * - Tooltip showing current mode description
 *
 * ✅ STREAMING PROTECTION: Disabled during streaming to prevent mode changes mid-conversation
 *
 * Pattern from: /src/components/chat/chat-participants-list.tsx:772-784
 */
export function ChatModeSelector({
  selectedMode,
  onModeChange,
  className,
  disabled = false,
}: ChatModeSelectorProps) {
  const t = useTranslations('chat.modes');
  const open = useBoolean(false);
  const chatModeOptions = getChatModeOptions();
  const currentMode = getChatModeById(selectedMode);
  const ModeIcon = currentMode?.icon;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <TooltipProvider>
        <Popover open={open.value} onOpenChange={open.setValue}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  className="h-8 sm:h-9 rounded-lg gap-1.5 sm:gap-2 text-xs relative px-3 sm:px-4"
                >
                  {ModeIcon && <ModeIcon className="size-3.5 sm:size-4" />}
                  <span className="hidden xs:inline sm:inline">
                    {currentMode?.label || t('mode')}
                  </span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>

            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <div className="font-semibold text-xs">{t('currentMode')}</div>
                <div className="text-xs">{currentMode?.label}</div>
                {currentMode?.metadata.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {currentMode.metadata.description}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[280px] p-0" align="start">
            <Command>
              <CommandList>
                <CommandGroup heading={t('chatModes')}>
                  {chatModeOptions.map((option) => {
                    const OptionIcon = option.icon;
                    const isSelected = option.value === selectedMode;

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => {
                          onModeChange?.(option.value);
                          open.onFalse();
                        }}
                        className="gap-2"
                      >
                        <Check
                          className={cn(
                            'size-4 flex-shrink-0',
                            isSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <OptionIcon className="size-4 flex-shrink-0" />
                        <span className="text-sm font-medium">{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TooltipProvider>
    </div>
  );
}
