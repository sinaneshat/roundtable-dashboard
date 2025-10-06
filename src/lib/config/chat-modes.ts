/**
 * Chat Modes Configuration
 * Single source of truth for all conversation modes
 *
 * ✅ SINGLE SOURCE OF TRUTH for all allowed modes
 * ✅ Enum-based type safety - impossible to use invalid modes
 * ✅ Compile-time validation - typos caught before runtime
 * ✅ Centralized configuration for UI and business logic
 *
 * Following the same pattern as models-config.ts
 */

import type { LucideIcon } from 'lucide-react';
import { Lightbulb, Scale, Search, Target } from 'lucide-react';

// ============================================================================
// ALLOWED MODES ENUM - Single Source of Truth
// ============================================================================

/**
 * Allowed Chat Mode IDs
 *
 * This is the ONLY place where mode IDs are defined.
 * ✅ Adding a mode here makes it available throughout the app
 * ✅ TypeScript prevents using any mode not listed here
 * ✅ No typos possible - compile-time safety
 */
export const AllowedChatMode = {
  ANALYZING: 'analyzing',
  BRAINSTORMING: 'brainstorming',
  DEBATING: 'debating',
  SOLVING: 'solving',
} as const;

/**
 * Type-safe Chat Mode
 * Only allows mode IDs defined in AllowedChatMode enum
 */
export type ChatModeId = typeof AllowedChatMode[keyof typeof AllowedChatMode];

/**
 * Get all allowed chat mode values as an array
 */
export const ALLOWED_CHAT_MODES = Object.values(AllowedChatMode) as readonly ChatModeId[];

/**
 * Tuple of chat modes for database enum definition
 * This is used in Drizzle schema to ensure database and TypeScript types match
 */
export const CHAT_MODE_ENUM_VALUES = Object.values(AllowedChatMode) as [ChatModeId, ...ChatModeId[]];

/**
 * Validate if a string is an allowed chat mode
 * Type guard with compile-time safety
 */
export function isValidChatMode(mode: string): mode is ChatModeId {
  return ALLOWED_CHAT_MODES.includes(mode as ChatModeId);
}

/**
 * Assert that a chat mode is valid (throws if not)
 * Use for runtime validation when receiving modes from external sources
 */
export function assertValidChatMode(mode: string): asserts mode is ChatModeId {
  if (!isValidChatMode(mode)) {
    throw new Error(
      `Invalid chat mode: "${mode}". `
      + `Allowed modes: ${ALLOWED_CHAT_MODES.join(', ')}. `
      + `Add new modes to AllowedChatMode enum in chat-modes.ts`,
    );
  }
}

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
 * ✅ Uses AllowedChatMode enum for type safety
 * ✅ Compile-time validation of all mode IDs
 */
export const CHAT_MODES: ChatModeConfig[] = [
  {
    id: AllowedChatMode.BRAINSTORMING,
    label: 'Brainstorming',
    value: AllowedChatMode.BRAINSTORMING,
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
    id: AllowedChatMode.ANALYZING,
    label: 'Analyzing',
    value: AllowedChatMode.ANALYZING,
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
    id: AllowedChatMode.DEBATING,
    label: 'Debating',
    value: AllowedChatMode.DEBATING,
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
    id: AllowedChatMode.SOLVING,
    label: 'Problem Solving',
    value: AllowedChatMode.SOLVING,
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
  return CHAT_MODES.find(mode => mode.id === modeId || mode.value === modeId);
}

/**
 * Get enabled chat modes only
 */
export function getEnabledChatModes(): ChatModeConfig[] {
  return CHAT_MODES.filter(mode => mode.isEnabled);
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
  return firstEnabled?.id ?? AllowedChatMode.BRAINSTORMING;
}

// ============================================================================
// Type Exports
// ============================================================================

// ============================================================================
// Thread Status Types - Single Source of Truth
// ============================================================================

/**
 * Allowed Thread Status Values
 * Single source of truth for thread lifecycle states
 */
export const AllowedThreadStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted',
} as const;

/**
 * Type-safe Thread Status
 */
export type ThreadStatus = typeof AllowedThreadStatus[keyof typeof AllowedThreadStatus];

/**
 * Array of thread status values
 */
export const ALLOWED_THREAD_STATUSES = Object.values(AllowedThreadStatus) as readonly ThreadStatus[];

/**
 * Tuple of thread statuses for database enum definition
 */
export const THREAD_STATUS_ENUM_VALUES = Object.values(AllowedThreadStatus) as [ThreadStatus, ...ThreadStatus[]];

/**
 * Validate if a string is an allowed thread status
 */
export function isValidThreadStatus(status: string): status is ThreadStatus {
  return ALLOWED_THREAD_STATUSES.includes(status as ThreadStatus);
}

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * Re-export as ThreadMode for backward compatibility with existing code
 * This allows gradual migration from ThreadMode to ChatModeId
 */
export type ThreadMode = ChatModeId;

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
