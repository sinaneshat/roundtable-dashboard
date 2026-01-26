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
  isRegeneration: z.boolean().optional(),
  modelId: z.string(),
  modelName: z.string().optional(),
  participantId: z.string(),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable().optional(),
  roundNumber: z.number().int().nonnegative(),
  sessionId: z.string().optional(),
  threadId: z.string(),
  threadMode: z.string(),
  userId: z.string(),
  userTier: z.string().optional(),
});

export type LLMTrackingContext = z.infer<typeof LLMTrackingContextSchema>;

// ============================================================================
// Token Usage Schemas
// ============================================================================

const InputTokenDetailsSchema = z.object({
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  noCacheTokens: z.number().int().nonnegative().optional(),
});

const OutputTokenDetailsSchema = z.object({
  reasoningTokens: z.number().int().nonnegative().optional(),
  textTokens: z.number().int().nonnegative().optional(),
});

/**
 * Simplified usage schema for tracking purposes
 */
export const LLMTrackingUsageSchema = z.object({
  inputTokenDetails: InputTokenDetailsSchema.optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokenDetails: OutputTokenDetailsSchema.optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type LLMTrackingUsage = z.infer<typeof LLMTrackingUsageSchema>;

// ============================================================================
// Tool Schemas
// ============================================================================

/**
 * AI SDK v6 Tool Call structure
 */
export const ToolCallSchema = z.object({
  input: z.unknown(),
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.literal('tool-call'),
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * AI SDK v6 Tool Result structure
 */
export const ToolResultSchema = z.object({
  result: z.unknown().optional(),
  toolCallId: z.string(),
  toolName: z.string(),
  type: z.literal('tool-result'),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

// ============================================================================
// Generation Result Schema
// ============================================================================

const ReasoningPartSchema = z.object({
  text: z.string(),
  type: z.literal('reasoning'),
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
  finishReason: z.string(),
  reasoning: z.array(ReasoningPartSchema).optional(),
  response: LLMResponseMetadataSchema.optional(),
  text: z.string(),
  toolCalls: z.array(ToolCallSchema).optional(),
  toolResults: z.array(ToolResultSchema).optional(),
  usage: LLMTrackingUsageSchema.optional(),
});

export type LLMGenerationResult = z.infer<typeof LLMGenerationResultSchema>;

// ============================================================================
// Input Message Schema
// ============================================================================

const ContentPartSchema = z.object({
  text: z.string(),
  type: z.string(),
});

/**
 * Input message schema for PostHog tracking
 */
export const LLMInputMessageSchema = z.object({
  content: z.union([z.string(), z.array(ContentPartSchema)]),
  role: z.string(),
});

export type LLMInputMessage = z.infer<typeof LLMInputMessageSchema>;

// ============================================================================
// Tracking Result Schema
// ============================================================================

/**
 * Result from LLM generation tracking
 */
export const LLMTrackingResultSchema = z.object({
  errorMessage: z.string().optional(),
  success: z.boolean(),
  traceId: z.string(),
});

export type LLMTrackingResult = z.infer<typeof LLMTrackingResultSchema>;
