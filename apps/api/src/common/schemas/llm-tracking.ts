/**
 * LLM Tracking Schemas
 *
 * Centralized Zod schemas for PostHog LLM analytics tracking.
 * Single source of truth for generation tracking, tool calls, and usage metrics.
 */

import * as z from 'zod';

// ============================================================================
// Tracking Context Schema
// ============================================================================

/**
 * LLM tracking context schema - captures all relevant context for PostHog event enrichment
 */
export const LLMTrackingContextSchema = z.object({
  userId: z.string(),
  sessionId: z.string().optional(),
  threadId: z.string(),
  roundNumber: z.number().int().nonnegative(),
  threadMode: z.string(),
  participantId: z.string(),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable().optional(),
  modelId: z.string(),
  modelName: z.string().optional(),
  isRegeneration: z.boolean().optional(),
  userTier: z.string().optional(),
});

export type LLMTrackingContext = z.infer<typeof LLMTrackingContextSchema>;

// ============================================================================
// Token Usage Schemas
// ============================================================================

const InputTokenDetailsSchema = z.object({
  noCacheTokens: z.number().int().nonnegative().optional(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
});

const OutputTokenDetailsSchema = z.object({
  textTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
});

/**
 * Simplified usage schema for tracking purposes
 */
export const LLMTrackingUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  inputTokenDetails: InputTokenDetailsSchema.optional(),
  outputTokenDetails: OutputTokenDetailsSchema.optional(),
});

export type LLMTrackingUsage = z.infer<typeof LLMTrackingUsageSchema>;

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * AI SDK v6 Tool Call structure
 */
export const ToolCallSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * AI SDK v6 Tool Result structure
 */
export const ToolResultSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.unknown().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// ============================================================================
// Generation Result Schema
// ============================================================================

const ReasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
});

const LLMResponseMetadataSchema = z.object({
  id: z.string().optional(),
  modelId: z.string().optional(),
  timestamp: z.date().optional(),
});

/**
 * LLM generation result schema from AI SDK v6
 */
export const LLMGenerationResultSchema = z.object({
  text: z.string(),
  finishReason: z.string(),
  usage: LLMTrackingUsageSchema.optional(),
  reasoning: z.array(ReasoningPartSchema).optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
  response: LLMResponseMetadataSchema.optional(),
});

export type LLMGenerationResult = z.infer<typeof LLMGenerationResultSchema>;

// ============================================================================
// Input Message Schema
// ============================================================================

const ContentPartSchema = z.object({
  type: z.string(),
  text: z.string(),
});

/**
 * Input message schema for PostHog tracking
 */
export const LLMInputMessageSchema = z.object({
  role: z.string(),
  content: z.union([z.string(), z.array(ContentPartSchema)]),
});

export type LLMInputMessage = z.infer<typeof LLMInputMessageSchema>;

// ============================================================================
// Tracking Result Schema
// ============================================================================

/**
 * Result from LLM generation tracking
 */
export const LLMTrackingResultSchema = z.object({
  traceId: z.string(),
  success: z.boolean(),
  errorMessage: z.string().optional(),
});

export type LLMTrackingResult = z.infer<typeof LLMTrackingResultSchema>;
