/**
 * Chat Modes UI Configuration
 *
 * Frontend-specific UI configuration for chat modes including icons, colors, and descriptions.
 * Imports enum definitions from centralized backend source.
 *
 * ✅ ENUM SOURCE: /src/api/core/enums.ts - Single source of truth for enum values
 * ✅ UI METADATA: This file ONLY contains UI-specific metadata (icons, colors, placeholders)
 * ✅ HELPER FUNCTIONS: UI utility functions for chat mode selection and display
 * ✅ NO DUPLICATION: All enums imported from /src/api/core/enums.ts
 *
 * Reference: COMPREHENSIVE REFACTORING ANALYSIS:2.1
 */

import type { LucideIcon } from 'lucide-react';
import { Lightbulb, Scale, Search, Target } from 'lucide-react';

import type { ChatMode } from '@/api/core/enums';
import { ChatModes, DEFAULT_CHAT_MODE as DEFAULT_MODE_FROM_ENUM } from '@/api/core/enums';

// ============================================================================
// Type Alias for Chat Mode ID
// ============================================================================

/**
 * Chat mode ID type alias
 * ✅ Import ChatMode from /src/api/core/enums.ts instead of using this alias
 */
export type ChatModeId = ChatMode;

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
  [ChatModes.ANALYZING]: 'You are participating in a multi-participant analytical discussion. Each participant brings their unique perspective. Reference other participants by their number (e.g., "As Participant 2 mentioned...") and build on the insights shared. Respond to both the user\'s query and other participants\' contributions.',
  [ChatModes.BRAINSTORMING]: 'You are participating in a multi-participant brainstorming session. Each participant contributes creative ideas. Reference other participants by their number (e.g., "Building on Participant 3\'s idea...") and add your unique perspective. Respond to both the user\'s query and other participants\' ideas.',
  [ChatModes.DEBATING]: 'You are participating in a multi-participant debate. Each participant presents their arguments. Reference other participants by their number (e.g., "I disagree with Participant 1 because...") and engage critically. Respond to both the user\'s query and other participants\' arguments.',
  [ChatModes.SOLVING]: 'You are participating in a multi-participant problem-solving discussion. Each participant proposes solutions. Reference other participants by their number (e.g., "Participant 2\'s approach is solid, but...") and build logically. Respond to both the user\'s query and other participants\' solutions.',
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
    id: ChatModes.BRAINSTORMING,
    label: 'Brainstorming',
    value: ChatModes.BRAINSTORMING,
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
    id: ChatModes.ANALYZING,
    label: 'Analyzing',
    value: ChatModes.ANALYZING,
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
    id: ChatModes.DEBATING,
    label: 'Debating',
    value: ChatModes.DEBATING,
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
    id: ChatModes.SOLVING,
    label: 'Problem Solving',
    value: ChatModes.SOLVING,
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
 * Default chat mode constant
 * ✅ SINGLE SOURCE: Re-export from /src/api/core/enums.ts
 * ✅ TYPE-SAFE: Uses ChatMode enum from /src/api/core/enums.ts
 */
export const DEFAULT_CHAT_MODE: ChatModeId = DEFAULT_MODE_FROM_ENUM;

/**
 * Get default chat mode
 * ✅ Returns constant from enum file
 */
export function getDefaultChatMode(): ChatModeId {
  return DEFAULT_CHAT_MODE;
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
