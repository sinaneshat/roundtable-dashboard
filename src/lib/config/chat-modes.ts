/**
 * Chat Mode Configuration
 *
 * UI metadata and configuration for chat modes.
 * Enums defined in @/api/core/enums/chat, this file provides UI metadata.
 */

import { z } from 'zod';

import type { ChatMode } from '@/api/core/enums';
import { ChatModes, ChatModeSchema, DEFAULT_CHAT_MODE } from '@/api/core/enums';
import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';

// ============================================================================
// CHAT MODE METADATA TYPES (Zod-first)
// ============================================================================

export const ChatModeMetadataSchema = z.object({
  color: z.string(),
  description: z.string(),
  systemPromptHint: z.string(),
  placeholder: z.string(),
});

// Non-serializable fields that can't be in Zod schema
export type ChatModeMetadataExtensions = {
  icon: Icon;
};

export type ChatModeMetadata = z.infer<typeof ChatModeMetadataSchema> & ChatModeMetadataExtensions;

export const ChatModeConfigSchema = z.object({
  id: ChatModeSchema,
  label: z.string(),
  value: ChatModeSchema,
  isEnabled: z.boolean(),
  order: z.number().int(),
  metadata: ChatModeMetadataSchema,
});

// Non-serializable fields that can't be in Zod schema
export type ChatModeConfigExtensions = {
  icon: Icon;
  metadata: ChatModeMetadata;
};

export type ChatModeConfig = z.infer<typeof ChatModeConfigSchema> & ChatModeConfigExtensions;

// ============================================================================
// CHAT MODE CONFIGURATIONS
// ============================================================================

export const CHAT_MODE_CONFIGS: readonly ChatModeConfig[] = [
  {
    id: ChatModes.BRAINSTORMING,
    label: 'Brainstorming',
    value: ChatModes.BRAINSTORMING,
    icon: Icons.lightbulb,
    isEnabled: true,
    order: 1,
    metadata: {
      icon: Icons.lightbulb,
      color: '#F59E0B',
      description: 'AI models spark off each other\'s ideas, building and branching in real-time',
      systemPromptHint: 'Creative ideation with multiple perspectives',
      placeholder: 'What problem needs fresh perspectives?',
    },
  },
  {
    id: ChatModes.ANALYZING,
    label: 'Analyzing',
    value: ChatModes.ANALYZING,
    icon: Icons.search,
    isEnabled: true,
    order: 2,
    metadata: {
      icon: Icons.search,
      color: '#3B82F6',
      description: 'Models examine the question from different angles, challenging each other\'s framings',
      systemPromptHint: 'Detailed analysis from multiple angles',
      placeholder: 'What topic would benefit from multiple angles?',
    },
  },
  {
    id: ChatModes.DEBATING,
    label: 'Debating',
    value: ChatModes.DEBATING,
    icon: Icons.scale,
    isEnabled: true,
    order: 3,
    metadata: {
      icon: Icons.scale,
      color: '#EF4444',
      description: 'Models surface genuine disagreement—and explain why they see things differently',
      systemPromptHint: 'Critical discussion with opposing viewpoints',
      placeholder: 'What question has reasonable people disagreeing?',
    },
  },
  {
    id: ChatModes.SOLVING,
    label: 'Problem Solving',
    value: ChatModes.SOLVING,
    icon: Icons.target,
    isEnabled: true,
    order: 4,
    metadata: {
      icon: Icons.target,
      color: '#10B981',
      description: 'Models build on each other\'s proposals to move toward actionable recommendations',
      systemPromptHint: 'Collaborative problem solving with action plans',
      placeholder: 'What decision needs different viewpoints weighed?',
    },
  },
] as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getChatModeById(modeId: string): ChatModeConfig | undefined {
  return CHAT_MODE_CONFIGS.find(mode => mode.id === modeId || mode.value === modeId);
}

export function getEnabledChatModes(): ChatModeConfig[] {
  return CHAT_MODE_CONFIGS.filter(mode => mode.isEnabled);
}

export function getChatModeLabel(modeId: ChatMode): string {
  const mode = getChatModeById(modeId);
  return mode?.label ?? modeId;
}

export function getChatModeIcon(modeId: ChatMode): Icon | undefined {
  const mode = getChatModeById(modeId);
  return mode?.icon;
}

export function getDefaultChatMode(): ChatMode {
  return DEFAULT_CHAT_MODE;
}

// ============================================================================
// CHAT MODE OPTIONS (for selectors, Zod-first)
// ============================================================================

export const ChatModeOptionSchema = z.object({
  value: ChatModeSchema,
  label: z.string(),
});

// Non-serializable fields that can't be in Zod schema
export type ChatModeOptionExtensions = {
  icon: Icon;
};

export type ChatModeOption = z.infer<typeof ChatModeOptionSchema> & ChatModeOptionExtensions;

export function getChatModeOptions(): ChatModeOption[] {
  return getEnabledChatModes().map(mode => ({
    value: mode.value,
    label: mode.label,
    icon: mode.icon,
  }));
}
