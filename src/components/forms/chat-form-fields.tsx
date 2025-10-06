/**
 * Chat Form Fields
 *
 * Reusable form field components that use useFormContext
 * Eliminates prop drilling and manual state management
 *
 * Following RHF best practices and patterns from /docs/frontend-patterns.md
 */

'use client';

import { useFormContext } from 'react-hook-form';

import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getChatModeOptions } from '@/lib/config/chat-modes';
import type { ChatInputFormData } from '@/lib/schemas/chat-forms';

// ============================================================================
// Participants Field
// ============================================================================

type ChatParticipantsFieldProps = {
  isStreaming?: boolean;
  className?: string;
};

/**
 * Chat Participants Field
 *
 * Uses form context to access and update participants
 * No prop drilling needed
 */
export function ChatParticipantsField({
  isStreaming,
  className,
}: ChatParticipantsFieldProps) {
  const { watch, setValue } = useFormContext<ChatInputFormData>();
  const participants = watch('participants');

  return (
    <ChatParticipantsList
      participants={participants}
      onParticipantsChange={newParticipants => setValue('participants', newParticipants)}
      isStreaming={isStreaming}
      className={className}
    />
  );
}

// ============================================================================
// Memories Field
// ============================================================================

type ChatMemoriesFieldProps = {
  className?: string;
};

/**
 * Chat Memories Field
 *
 * Uses form context to access and update memory IDs
 * No prop drilling needed
 */
export function ChatMemoriesField({ className }: ChatMemoriesFieldProps) {
  const { watch, setValue } = useFormContext<ChatInputFormData>();
  const memoryIds = watch('memoryIds') || [];

  return (
    <ChatMemoriesList
      selectedMemoryIds={memoryIds}
      onMemoryIdsChange={newMemoryIds => setValue('memoryIds', newMemoryIds)}
      className={className}
    />
  );
}

// ============================================================================
// Mode Field
// ============================================================================

type ChatModeFieldProps = {
  className?: string;
  size?: 'sm' | 'default';
  showLabel?: boolean;
};

/**
 * Chat Mode Field
 *
 * Uses form context to access and update mode
 * No prop drilling needed
 */
export function ChatModeField({
  className,
  size = 'sm',
  showLabel = true,
}: ChatModeFieldProps) {
  const { watch, setValue } = useFormContext<ChatInputFormData>();
  const mode = watch('mode');
  const chatModeOptions = getChatModeOptions();

  return (
    <Select
      value={mode}
      onValueChange={value => setValue('mode', value as typeof mode)}
    >
      <SelectTrigger
        size={size}
        className={className}
      >
        <SelectValue>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {(() => {
              const ModeIcon = chatModeOptions.find(m => m.value === mode)?.icon;
              return ModeIcon ? <ModeIcon className="size-3 sm:size-3.5" /> : null;
            })()}
            {showLabel && (
              <span className="text-xs font-medium hidden xs:inline sm:inline">
                {chatModeOptions.find(m => m.value === mode)?.label}
              </span>
            )}
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {chatModeOptions.map((modeOption) => {
          const ModeIcon = modeOption.icon;
          return (
            <SelectItem key={modeOption.value} value={modeOption.value}>
              <div className="flex items-center gap-2">
                <ModeIcon className="size-4" />
                <span>{modeOption.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
