/**
 * Chat Mode Configuration
 *
 * UI metadata and configuration for chat modes.
 * Enums defined in @/api/core/enums/chat, this file provides UI metadata.
 */

import type { ChatMode } from '@roundtable/shared';
import { ChatModes, ChatModeSchema, DEFAULT_CHAT_MODE } from '@roundtable/shared';
import { z } from 'zod';

import type { Icon } from '@/components/icons';
import { Icons } from '@/components/icons';

// ============================================================================
// CHAT MODE METADATA TYPES (Zod-first)
// ============================================================================

export const ChatModeMetadataSchema = z.object({
  color: z.string(),
  description: z.string(),
  placeholder: z.string(),
  systemPromptHint: z.string(),
});

// Non-serializable fields that can't be in Zod schema
export type ChatModeMetadataExtensions = {
  icon: Icon;
};

export type ChatModeMetadata = z.infer<typeof ChatModeMetadataSchema> & ChatModeMetadataExtensions;

export const ChatModeConfigSchema = z.object({
  id: ChatModeSchema,
  isEnabled: z.boolean(),
  label: z.string(),
  metadata: ChatModeMetadataSchema,
  order: z.number().int(),
  value: ChatModeSchema,
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
    icon: Icons.lightbulb,
    id: ChatModes.BRAINSTORMING,
    isEnabled: true,
    label: 'Brainstorming',
    metadata: {
      color: '#F59E0B',
      description: 'AI models spark off each other\'s ideas, building and branching in real-time',
      icon: Icons.lightbulb,
      placeholder: 'What problem needs fresh perspectives?',
      systemPromptHint: 'Creative ideation with multiple perspectives',
    },
    order: 1,
    value: ChatModes.BRAINSTORMING,
  },
  {
    icon: Icons.search,
    id: ChatModes.ANALYZING,
    isEnabled: true,
    label: 'Analyzing',
    metadata: {
      color: '#3B82F6',
      description: 'Models examine the question from different angles, challenging each other\'s framings',
      icon: Icons.search,
      placeholder: 'What topic would benefit from multiple angles?',
      systemPromptHint: 'Detailed analysis from multiple angles',
    },
    order: 2,
    value: ChatModes.ANALYZING,
  },
  {
    icon: Icons.scale,
    id: ChatModes.DEBATING,
    isEnabled: true,
    label: 'Debating',
    metadata: {
      color: '#EF4444',
      description: 'Models surface genuine disagreement—and explain why they see things differently',
      icon: Icons.scale,
      placeholder: 'What question has reasonable people disagreeing?',
      systemPromptHint: 'Critical discussion with opposing viewpoints',
    },
    order: 3,
    value: ChatModes.DEBATING,
  },
  {
    icon: Icons.target,
    id: ChatModes.SOLVING,
    isEnabled: true,
    label: 'Problem Solving',
    metadata: {
      color: '#10B981',
      description: 'Models build on each other\'s proposals to move toward actionable recommendations',
      icon: Icons.target,
      placeholder: 'What decision needs different viewpoints weighed?',
      systemPromptHint: 'Collaborative problem solving with action plans',
    },
    order: 4,
    value: ChatModes.SOLVING,
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
  label: z.string(),
  value: ChatModeSchema,
});

// Non-serializable fields that can't be in Zod schema
export type ChatModeOptionExtensions = {
  icon: Icon;
};

export type ChatModeOption = z.infer<typeof ChatModeOptionSchema> & ChatModeOptionExtensions;

export function getChatModeOptions(): ChatModeOption[] {
  return getEnabledChatModes().map(mode => ({
    icon: mode.icon,
    label: mode.label,
    value: mode.value,
  }));
}
