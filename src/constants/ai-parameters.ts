/**
 * AI Parameters Configuration
 *
 * ✅ SINGLE SOURCE OF TRUTH: All AI model parameters in one place
 * - Default parameters for AI models
 * - Mode-specific parameter overrides
 * - Title generation configuration
 * - Retry/timeout configuration
 *
 * Separated from schema files to follow separation of concerns.
 */

import type { ChatModeId } from '@/lib/config/chat-modes';

// ============================================================================
// Default AI Parameters
// ============================================================================

/**
 * Default AI parameters used across all modes unless overridden
 * These are fallback values when mode-specific params don't exist
 */
export const DEFAULT_AI_PARAMS = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.9,
} as const;

export type DefaultAIParams = typeof DEFAULT_AI_PARAMS;

// ============================================================================
// Mode-Specific AI Parameters
// ============================================================================

/**
 * Mode-specific AI parameters for maximum stability and consistency
 *
 * ✅ OPTIMIZED FOR STABILITY: Lower temperature = more deterministic outputs
 * ✅ FOCUSED SAMPLING: Lower topP = more focused, less random outputs
 * ✅ MODE-ALIGNED: Each mode has parameters tuned for its specific goals
 *
 * Temperature scale:
 * - 0.3-0.4: Highly deterministic (analyzing, solving)
 * - 0.5-0.6: Balanced creativity (debating)
 * - 0.6-0.7: Moderate creativity (brainstorming)
 *
 * TopP scale:
 * - 0.7-0.75: Very focused (analyzing, solving)
 * - 0.8: Balanced (debating)
 * - 0.85: Slightly diverse (brainstorming)
 */
export const MODE_SPECIFIC_AI_PARAMS: Record<ChatModeId, { temperature: number; topP: number; maxTokens: number }> = {
  analyzing: {
    temperature: 0.3, // Highly deterministic for logical analysis
    topP: 0.7, // Very focused sampling for consistent reasoning
    maxTokens: 4096,
  },
  brainstorming: {
    temperature: 0.6, // Moderate creativity for idea generation
    topP: 0.85, // Slightly diverse for creative exploration
    maxTokens: 4096,
  },
  debating: {
    temperature: 0.5, // Balanced for structured argumentation
    topP: 0.8, // Balanced sampling for logical counter-arguments
    maxTokens: 4096,
  },
  solving: {
    temperature: 0.4, // Low for practical, actionable solutions
    topP: 0.75, // Focused for concrete implementation steps
    maxTokens: 4096,
  },
} as const;

export type ModeSpecificAIParams = typeof MODE_SPECIFIC_AI_PARAMS;
export type AIModeParams = ModeSpecificAIParams[ChatModeId];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get AI parameters for a specific mode
 * Falls back to DEFAULT_AI_PARAMS if mode doesn't exist
 */
export function getAIParamsForMode(mode: string): { temperature: number; topP: number; maxTokens: number } {
  return MODE_SPECIFIC_AI_PARAMS[mode as ChatModeId] || DEFAULT_AI_PARAMS;
}

// ============================================================================
// Title Generation Configuration
// ============================================================================

/**
 * Configuration for AI-powered title generation
 * Uses fast, cheap models optimized for short text generation
 */
export const TITLE_GENERATION_CONFIG = {
  temperature: 0.3,
  maxTokens: 15,
  topP: 0.9,
  systemPrompt: 'Generate a 5-word title from this message. Title only, no quotes.',
  preferredModels: [
    'google/gemini-flash-1.5',
    'anthropic/claude-3-haiku',
    'qwen/qwen-2.5-72b-instruct',
    'anthropic/claude-3.5-sonnet',
  ],
} as const;

export type TitleGenerationConfig = typeof TITLE_GENERATION_CONFIG;

// ============================================================================
// Retry & Timeout Configuration
// ============================================================================

/**
 * Retry configuration for AI model requests
 * ✅ USER REQUIREMENT: 10 retry attempts with exponential backoff
 */
export const AI_RETRY_CONFIG = {
  maxAttempts: 10,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
} as const;

export type AIRetryConfig = typeof AI_RETRY_CONFIG;

/**
 * Timeout configuration for AI operations
 * Prevents hanging connections and ensures responsive UX
 */
export const AI_TIMEOUT_CONFIG = {
  perAttemptMs: 30000, // 30 seconds per attempt
  totalMs: 300000, // 5 minutes total for all retries
  moderatorAnalysisMs: 90000, // 90 seconds for moderator analysis (structured output generation)
} as const;

export type AITimeoutConfig = typeof AI_TIMEOUT_CONFIG;
