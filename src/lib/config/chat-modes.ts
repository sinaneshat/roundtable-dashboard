/**
 * Chat Modes UI Configuration
 *
 * Frontend-specific UI configuration for chat modes including icons, colors, and descriptions.
 * Imports enum definitions from centralized backend source.
 *
 * ✅ ENUM SOURCE: /src/api/core/enums.ts - Single source of truth for enum values
 * ✅ UI METADATA: This file adds UI-specific metadata (icons, colors, placeholders)
 * ✅ HELPER FUNCTIONS: UI utility functions for chat mode selection and display
 *
 * Reference: /docs/BACKEND_REFACTORING_ANALYSIS.md:40-88
 */

import type { LucideIcon } from 'lucide-react';
import { Lightbulb, Scale, Search, Target } from 'lucide-react';

import type { ChatMode, ThreadStatus } from '@/api/core/enums';
import {
  CHAT_MODE_ENUM_VALUES,
  CHAT_MODES,
  ChatModeSchema as chatModeSchema,
  THREAD_STATUS_ENUM_VALUES,
  THREAD_STATUSES,
  ThreadStatusSchema as threadStatusSchema,
} from '@/api/core/enums';

// ============================================================================
// Re-export Enum Definitions (for backward compatibility)
// ============================================================================

export { CHAT_MODE_ENUM_VALUES, CHAT_MODES, chatModeSchema, THREAD_STATUS_ENUM_VALUES, THREAD_STATUSES, threadStatusSchema };
export type ChatModeId = ChatMode;
export type { ThreadStatus };

// ============================================================================
// Chat Mode Configuration Types
// ============================================================================

export type ChatModeMetadata = {
  icon: LucideIcon;
  color: string;
  description: string;
  systemPromptHint: string;
  placeholder: string;
};

export type ChatModeConfig = {
  id: ChatModeId;
  label: string;
  value: ChatModeId;
  icon: LucideIcon;
  metadata: ChatModeMetadata;
  isEnabled: boolean;
  order: number;
};

// ============================================================================
// Chat Modes Configuration
// ============================================================================

/**
 * System prompt descriptions for each mode
 * These are used in the prompt engineering for multi-participant sessions
 */
export const CHAT_MODE_SYSTEM_PROMPTS: Record<ChatModeId, string> = {
  analyzing: 'You are participating in a multi-participant analytical discussion. Each participant brings their unique perspective. Reference other participants by their number (e.g., "As Participant 2 mentioned...") and build on the insights shared. Respond to both the user\'s query and other participants\' contributions.',
  brainstorming: 'You are participating in a multi-participant brainstorming session. Each participant contributes creative ideas. Reference other participants by their number (e.g., "Building on Participant 3\'s idea...") and add your unique perspective. Respond to both the user\'s query and other participants\' ideas.',
  debating: 'You are participating in a multi-participant debate. Each participant presents their arguments. Reference other participants by their number (e.g., "I disagree with Participant 1 because...") and engage critically. Respond to both the user\'s query and other participants\' arguments.',
  solving: 'You are participating in a multi-participant problem-solving discussion. Each participant proposes solutions. Reference other participants by their number (e.g., "Participant 2\'s approach is solid, but...") and build logically. Respond to both the user\'s query and other participants\' solutions.',
};

/**
 * Chat Modes Configuration
 * All available conversation modes with their UI and behavior settings
 *
 * ✅ Uses Zod-inferred ChatModeId for type safety
 * ✅ Compile-time validation of all mode IDs
 */
export const CHAT_MODE_CONFIGS: ChatModeConfig[] = [
  {
    id: 'brainstorming',
    label: 'Brainstorming',
    value: 'brainstorming',
    icon: Lightbulb,
    isEnabled: true,
    order: 1,
    metadata: {
      icon: Lightbulb,
      color: '#F59E0B',
      description: 'Generate creative ideas and explore possibilities together',
      systemPromptHint: 'Creative ideation with multiple perspectives',
      placeholder: 'What would you like to brainstorm about?',
    },
  },
  {
    id: 'analyzing',
    label: 'Analyzing',
    value: 'analyzing',
    icon: Search,
    isEnabled: true,
    order: 2,
    metadata: {
      icon: Search,
      color: '#3B82F6',
      description: 'Deep dive into topics with analytical perspectives',
      systemPromptHint: 'Detailed analysis from multiple angles',
      placeholder: 'What would you like to analyze?',
    },
  },
  {
    id: 'debating',
    label: 'Debating',
    value: 'debating',
    icon: Scale,
    isEnabled: true,
    order: 3,
    metadata: {
      icon: Scale,
      color: '#EF4444',
      description: 'Explore different viewpoints through structured debate',
      systemPromptHint: 'Critical discussion with opposing viewpoints',
      placeholder: 'What topic would you like to debate?',
    },
  },
  {
    id: 'solving',
    label: 'Problem Solving',
    value: 'solving',
    icon: Target,
    isEnabled: true,
    order: 4,
    metadata: {
      icon: Target,
      color: '#10B981',
      description: 'Work together to find practical solutions',
      systemPromptHint: 'Collaborative problem solving with action plans',
      placeholder: 'What problem would you like to solve?',
    },
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get chat mode configuration by ID
 */
export function getChatModeById(modeId: string): ChatModeConfig | undefined {
  return CHAT_MODE_CONFIGS.find(mode => mode.id === modeId || mode.value === modeId);
}

/**
 * Get enabled chat modes only
 */
export function getEnabledChatModes(): ChatModeConfig[] {
  return CHAT_MODE_CONFIGS.filter(mode => mode.isEnabled);
}

/**
 * Get chat mode label by ID
 */
export function getChatModeLabel(modeId: ChatModeId): string {
  const mode = getChatModeById(modeId);
  return mode?.label ?? modeId;
}

/**
 * Get chat mode icon by ID
 */
export function getChatModeIcon(modeId: ChatModeId): LucideIcon | undefined {
  const mode = getChatModeById(modeId);
  return mode?.icon;
}

/**
 * Get chat mode system prompt by ID
 */
export function getChatModeSystemPrompt(modeId: ChatModeId): string {
  return CHAT_MODE_SYSTEM_PROMPTS[modeId];
}

/**
 * Get default chat mode (first enabled mode)
 */
export function getDefaultChatMode(): ChatModeId {
  const firstEnabled = getEnabledChatModes()[0];
  return firstEnabled?.id ?? 'brainstorming';
}

// ============================================================================
// Type Exports
// ============================================================================

// ============================================================================
// Thread Status Helpers
// ============================================================================

/**
 * Validate if a string is an allowed thread status
 * ✅ Uses Zod schema for validation
 */
export function isValidThreadStatus(status: string): status is ThreadStatus {
  return threadStatusSchema.safeParse(status).success;
}

// ============================================================================
// UI Component Types
// ============================================================================

/**
 * Chat mode selection option for UI components
 */
export type ChatModeOption = {
  value: ChatModeId;
  label: string;
  icon: LucideIcon;
};

/**
 * Get chat mode options for select components
 */
export function getChatModeOptions(): ChatModeOption[] {
  return getEnabledChatModes().map(mode => ({
    value: mode.value,
    label: mode.label,
    icon: mode.icon,
  }));
}
