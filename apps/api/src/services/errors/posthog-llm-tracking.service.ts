/**
 * PostHog LLM Tracking Service - Analytics & Observability
 *
 * ✅ OFFICIAL POSTHOG LLM ANALYTICS PATTERNS:
 * - Tracks $ai_generation events with comprehensive metrics
 * - Links to Session Replay via $session_id (Better Auth session ID)
 * - Supports prompt versioning for A/B testing
 * - Captures token usage, costs, and performance metrics
 * - AI SDK v6 compatible (usage + totalUsage distinction)
 *
 * ✅ SINGLE SOURCE OF TRUTH for LLM tracking:
 * - All PostHog event tracking logic centralized here
 * - Uses AI SDK types (LanguageModelUsage) instead of hardcoded types
 * - Uses Better Auth session ID for distinct ID tracking
 * - Reuses cost utilities from product-logic.service.ts
 * - Follows established service architecture patterns
 *
 * Reference: https://posthog.com/docs/llm-analytics/generations
 * AI SDK v6: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
 */

import { MessageRoles } from '@roundtable/shared/enums';
import type { LanguageModelUsage } from 'ai';
import { ulid } from 'ulid';
import * as z from 'zod';

import type {
  LLMGenerationResult,
  LLMInputMessage,
  LLMTrackingContext,
  LLMTrackingResult,
} from '@/common/schemas/llm-tracking';
import { ToolCallSchema } from '@/common/schemas/llm-tracking';
import { getPostHogClient } from '@/lib/analytics/posthog-server';
import { isObject, isTransientErrorFromObject } from '@/lib/utils';

// ============================================================================
// TYPES FOR POSTHOG INTEGRATION
// ============================================================================
// Note: These types are kept as TypeScript types (not Zod schemas) because:
// 1. They need to exactly match PostHog's internal $ai_tools format
// 2. z.passthrough()/catchall() creates incompatible index signature types
// 3. These are internal types used for PostHog event building

/**
 * Tool function parameters type (JSON Schema compatible)
 */
type ToolFunctionParameters = {
  type?: string;
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
  [key: string]: unknown;
};

/**
 * PostHog tool type (internal)
 */
type PostHogTool = {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: ToolFunctionParameters;
  };
};

/**
 * Optional tracking enrichment options type
 *
 * Note: This is kept as a type rather than Zod-inferred because:
 * 1. tools property needs to match LLMGenerationProperties exactly
 * 2. z.passthrough() creates incompatible types with internal properties type
 * 3. This is the public API that consumers use
 *
 * ✅ AI SDK TYPE REUSE: Uses LanguageModelUsage from 'ai' package
 */
export type LLMTrackingOptions = {
  // Add | undefined for exactOptionalPropertyTypes compatibility
  modelPricing?: { input: number; output: number } | undefined;
  customPricing?: {
    inputTokenPrice?: number;
    outputTokenPrice?: number;
    cacheReadTokenPrice?: number;
    cacheWriteTokenPrice?: number;
  };
  modelConfig?: {
    temperature?: number | undefined;
    maxTokens?: number | undefined;
  };
  promptTracking?: {
    promptId?: string;
    promptVersion?: string;
    systemPromptTokens?: number;
  };
  tools?: PostHogTool[];
  cacheCreationInputTokens?: number;
  totalUsage?: LanguageModelUsage | undefined;
  reasoningTokens?: number;
  providerUrls?: {
    baseUrl?: string;
    requestUrl?: string;
  };
  /**
   * JUSTIFIED: Record<string, unknown> is intentional here.
   * PostHog events accept arbitrary custom properties - this is the official escape hatch
   * for adding app-specific tracking data that doesn't fit predefined fields.
   * Constraining this would break PostHog's extensible analytics model.
   */
  additionalProperties?: Record<string, unknown>;
};

// ============================================================================
// POSTHOG PROPERTIES SCHEMA
// ============================================================================

/**
 * PostHog $ai_generation event properties
 * Reference: https://posthog.com/docs/llm-analytics/generations
 *
 * Note: All optional properties include `| undefined` for exactOptionalPropertyTypes compatibility
 */
type LLMGenerationProperties = {
  // Required properties
  $ai_trace_id: string;
  $ai_model: string;
  $ai_provider: string;
  $ai_input: LLMInputMessage[];
  $ai_input_tokens: number;
  $ai_output_choices: { role: string; content: { type: string; text: string }[] }[];
  $ai_output_tokens: number;
  $ai_latency: number;
  $ai_http_status?: number | undefined;
  $ai_is_error: boolean;

  // Session tracking
  $session_id?: string | undefined;

  // PostHog Official: Span identification for tree-view grouping
  $ai_span_id?: string | undefined; // Unique identifier for this generation
  $ai_parent_id?: string | undefined; // Parent trace/span ID for hierarchical grouping

  // Performance metrics
  $ai_temperature?: number | undefined;
  $ai_max_tokens?: number | undefined;
  $ai_stream?: boolean | undefined;
  $ai_cache_read_input_tokens?: number | undefined;
  $ai_cache_creation_input_tokens?: number | undefined; // Anthropic cache write tokens

  // Cost tracking
  $ai_input_cost_usd?: number | undefined;
  $ai_output_cost_usd?: number | undefined;
  $ai_total_cost_usd?: number | undefined; // PostHog Official: Total cost as separate property

  // PostHog Official: Custom pricing override properties (per token)
  // Use these to specify custom pricing when PostHog's automatic pricing doesn't apply
  $ai_input_token_price?: number | undefined; // Cost per input token in USD
  $ai_output_token_price?: number | undefined; // Cost per output token in USD
  $ai_cache_read_token_price?: number | undefined; // Cost per cached input token in USD
  $ai_cache_write_token_price?: number | undefined; // Cost per cache creation token in USD

  // PostHog Official: Provider URL tracking
  $ai_base_url?: string | undefined; // Base URL of the LLM provider
  $ai_request_url?: string | undefined; // Full URL of the request

  // Tool tracking
  $ai_tools?: {
    type: string;
    function: {
      name: string;
      description?: string | undefined;
      parameters?: {
        type?: string | undefined;
        properties?: Record<string, { type?: string | undefined; description?: string | undefined }>;
        required?: string[];
        [key: string]: unknown;
      };
    };
  }[] | undefined; // Available tools
  $ai_tools_count?: number | undefined;
  $ai_tool_calls?: { name: string; arguments: string }[] | undefined;
  $ai_tool_calls_count?: number | undefined;

  // Prompt tracking
  prompt_id?: string | undefined;
  prompt_version?: string | undefined;
  prompt_tokens_system?: number | undefined;

  // Trace metadata
  $ai_span_name?: string | undefined;

  // =====================================================================
  // APPLICATION-SPECIFIC PROPERTIES (Roundtable Context)
  // =====================================================================
  thread_id?: string | undefined;
  round_number?: number | undefined;
  participant_id?: string | undefined;
  participant_index?: number | undefined;
  participant_role?: string | null | undefined;
  model_name?: string | undefined;
  conversation_mode?: string | undefined;
  is_regeneration?: boolean | undefined;
  subscription_tier?: string | undefined;
  finish_reason?: string | undefined;
  response_length_chars?: number | undefined;
  response_length_words?: number | undefined;
  latency_ms?: number | undefined;
  tokens_per_second?: number | undefined;
  total_tokens?: number | undefined;
  total_input_tokens?: number | undefined;
  total_output_tokens?: number | undefined;
  total_tokens_cumulative?: number | undefined;
  is_multi_step?: boolean | undefined;
  has_reasoning?: boolean | undefined;
  reasoning_tokens?: number | undefined;
  cost_per_token?: number | undefined;
  total_cost_usd?: number | undefined;
  cost_per_second?: number | undefined;
  cache_hit_tokens?: number | undefined;
  cache_hit_rate?: number | undefined;
  has_cache_hit?: boolean | undefined;
  uses_dynamic_pricing?: boolean | undefined;
  response_id?: string | undefined;
};

// ============================================================================
// COST CALCULATION UTILITIES
// ============================================================================

/**
 * Model pricing structure for PostHog tracking
 * Prices are in USD per million tokens
 */
export type ModelPricingPerMillion = {
  input: number;
  output: number;
};

/**
 * Extract pricing from OpenRouter model config for PostHog tracking
 *
 * Converts per-token pricing (e.g., '0.00000030') to per-million format
 * for consistent cost tracking across all providers.
 *
 * @param model - Model object with pricing.prompt and pricing.completion
 * @returns Pricing per million tokens, or undefined if pricing not available
 */
export function extractModelPricing(
  model: { pricing: { prompt: string; completion: string } } | undefined,
): ModelPricingPerMillion | undefined {
  if (!model?.pricing) {
    return undefined;
  }

  const inputPerToken = Number.parseFloat(model.pricing.prompt);
  const outputPerToken = Number.parseFloat(model.pricing.completion);

  if (Number.isNaN(inputPerToken) || Number.isNaN(outputPerToken)) {
    return undefined;
  }

  return {
    input: inputPerToken * 1_000_000,
    output: outputPerToken * 1_000_000,
  };
}

/**
 * Calculate LLM cost based on token usage and pricing
 *
 * ✅ REUSABLE UTILITY: Accepts dynamic pricing from OpenRouter API
 * Pricing is per 1M tokens (input and output have different rates)
 *
 * @param inputTokens - Number of input tokens consumed
 * @param outputTokens - Number of output tokens generated
 * @param pricing - Model pricing (per 1M tokens)
 * @param pricing.input - Cost per 1M input tokens
 * @param pricing.output - Cost per 1M output tokens
 * @returns Cost breakdown in USD
 */
export function calculateLLMCost(
  inputTokens: number,
  outputTokens: number,
  pricing: { input: number; output: number },
): { inputCost: number; outputCost: number; totalCost: number } {
  // Convert per-million pricing to per-token
  const inputCostPerToken = pricing.input / 1_000_000;
  const outputCostPerToken = pricing.output / 1_000_000;

  const inputCost = inputTokens * inputCostPerToken;
  const outputCost = outputTokens * outputCostPerToken;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Estimate reasoning tokens from text length
 *
 * Rough estimation: 1 token ≈ 4 characters
 * Used as fallback when AI SDK doesn't provide reasoning token count
 *
 * @param reasoningText - Combined reasoning text
 * @returns Estimated token count
 */
export function estimateReasoningTokens(reasoningText: string) {
  return Math.ceil(reasoningText.length / 4);
}

// ============================================================================
// TRACE ID MANAGEMENT
// ============================================================================

/**
 * Generate a unique trace ID for LLM tracking
 *
 * Trace IDs link related events (generation, errors, embeddings)
 * Format: trace_{ulid}
 */
export function generateTraceId() {
  return `trace_${ulid()}`;
}

// ============================================================================
// TRACKING CONTEXT CREATION
// ============================================================================

/**
 * Create comprehensive tracking context from handler data
 *
 * ✅ Better Auth Integration: Uses Better Auth session.id as PostHog distinct ID
 * Helper function to build LLMTrackingContext with all required fields
 *
 * @param userId - User ID from Better Auth
 * @param sessionId - Better Auth session.id (used as PostHog distinct ID)
 * @param threadId - Chat thread ID
 * @param roundNumber - Current round number
 * @param participant - Participant information
 * @param participant.id - Unique participant identifier
 * @param participant.modelId - AI model identifier
 * @param participant.role - Optional participant role
 * @param participantIndex - Participant index
 * @param threadMode - Thread mode (roundtable, sequential, etc.)
 * @param options - Optional tracking metadata
 * @param options.modelName - Human-readable model name
 * @param options.isRegeneration - Whether this is a regeneration request
 * @param options.userTier - User subscription tier
 */
export function createTrackingContext(
  userId: string,
  sessionId: string | undefined, // ✅ Better Auth session.id - optional, fallback to userId
  threadId: string,
  roundNumber: number,
  participant: {
    id: string;
    modelId: string;
    role?: string | null;
  },
  participantIndex: number,
  threadMode: string,
  options?: {
    modelName?: string;
    isRegeneration?: boolean;
    userTier?: string;
  },
): LLMTrackingContext {
  return {
    isRegeneration: options?.isRegeneration,
    modelId: participant.modelId,
    modelName: options?.modelName,
    participantId: participant.id,
    participantIndex,
    participantRole: participant.role,
    roundNumber,
    sessionId, // ✅ Better Auth session.id - used as PostHog distinct ID (optional)
    threadId,
    threadMode,
    userId,
    userTier: options?.userTier,
  };
}

// ============================================================================
// LLM GENERATION TRACKING
// ============================================================================

/**
 * Track LLM generation event with comprehensive metrics
 *
 * ✅ OFFICIAL POSTHOG PATTERNS:
 * - Always includes input/output tracking for observability
 * - Links to Session Replay via $session_id
 * - Tracks prompt ID/version for A/B testing
 * - Captures cache tokens (Anthropic/OpenAI prompt caching)
 * - Tracks reasoning tokens (o1/o3/DeepSeek models)
 * - Supports dynamic pricing via OpenRouter API
 * - AI SDK v6 compatible (handles both usage and totalUsage)
 *
 * Reference: https://posthog.com/docs/llm-analytics/generations
 * AI SDK v6: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
 *
 * @param context - Tracking context (user, thread, participant, session)
 * @param finishResult - AI SDK v6 finish result from streamText/generateText
 * @param inputMessages - Input messages (PostHog best practice - always include)
 * @param traceId - Unique trace identifier
 * @param startTime - Timestamp when generation started (performance.now())
 * @param options - Optional tracking enrichment (pricing, config, prompts)
 */
export async function trackLLMGeneration(
  context: LLMTrackingContext,
  finishResult: LLMGenerationResult,
  inputMessages: LLMInputMessage[],
  traceId: string,
  startTime: number,
  options?: LLMTrackingOptions,
): Promise<LLMTrackingResult> {
  const posthog = getPostHogClient();

  if (!posthog) {
    // PostHog not initialized (non-production env)
    return { errorMessage: 'PostHog not initialized', success: false, traceId };
  }

  try {
    // =========================================================================
    // PERFORMANCE METRICS
    // =========================================================================
    const latencyMs = performance.now() - startTime;
    const latencySeconds = latencyMs / 1000;

    // =========================================================================
    // MODEL CONTEXT
    // =========================================================================
    // Extract provider from modelId (e.g., "anthropic" from "anthropic/claude-sonnet-4.5")
    const provider = context.modelId.split('/')[0] || 'unknown';

    // =========================================================================
    // AI SDK V6 TOKEN USAGE (Final Step Only)
    // =========================================================================
    // In AI SDK v6:
    // - usage: Contains token usage from the FINAL STEP only
    // - totalUsage: Contains CUMULATIVE token usage across ALL STEPS (multi-step reasoning)
    const inputTokens = finishResult.usage?.inputTokens || 0;
    const outputTokens = finishResult.usage?.outputTokens || 0;
    const totalTokens = finishResult.usage?.totalTokens || (inputTokens + outputTokens);

    // Cache tokens (Anthropic/OpenAI prompt caching)
    // AI SDK v6: cache metrics in inputTokenDetails
    const cacheReadTokens = finishResult.usage?.inputTokenDetails?.cacheReadTokens;

    // =========================================================================
    // AI SDK V6 MULTI-STEP TRACKING (Cumulative Usage)
    // =========================================================================
    // Use totalUsage for cumulative metrics (if available)
    // For single-step generations, totalUsage === usage
    // For multi-step reasoning (e.g., o1, o3), totalUsage includes ALL steps
    const totalUsage = options?.totalUsage || finishResult.usage;
    const totalInputTokens = totalUsage?.inputTokens || inputTokens;
    const totalOutputTokens = totalUsage?.outputTokens || outputTokens;
    const cumulativeTotalTokens = totalUsage?.totalTokens || totalTokens;

    // Multi-step detection
    const isMultiStep = totalUsage && (cumulativeTotalTokens !== totalTokens);

    // =========================================================================
    // COST CALCULATION (Dynamic or Zero if pricing unavailable)
    // =========================================================================
    // Use totalUsage for cost calculation to capture full multi-step cost
    let inputCost = 0;
    let outputCost = 0;

    if (options?.modelPricing) {
      const costs = calculateLLMCost(totalInputTokens, totalOutputTokens, options.modelPricing);
      inputCost = costs.inputCost;
      outputCost = costs.outputCost;
    }

    // =========================================================================
    // REASONING TOKENS (AI SDK v6: use outputTokenDetails.reasoningTokens)
    // =========================================================================
    // Priority: SDK's outputTokenDetails > options.reasoningTokens fallback
    const reasoningTokens
      = finishResult.usage?.outputTokenDetails?.reasoningTokens
        ?? options?.reasoningTokens
        ?? 0;
    const hasReasoning = reasoningTokens > 0;

    // =========================================================================
    // TOOL CALLS (AI SDK v6)
    // =========================================================================
    // ✅ ZOD VALIDATION: Validate tool calls array with Zod schema
    const rawToolCalls = Array.isArray(finishResult.toolCalls) ? finishResult.toolCalls : [];
    const toolCalls = rawToolCalls
      .map(tc => ToolCallSchema.safeParse(tc))
      .filter(result => result.success)
      .map(result => result.data);
    const hasToolCalls = toolCalls.length > 0;

    // =========================================================================
    // BUILD POSTHOG EVENT PROPERTIES (Official Schema)
    // =========================================================================
    const properties: LLMGenerationProperties = {
      // POSTHOG BEST PRACTICE: Always include input/output for observability
      $ai_input: inputMessages,
      // REQUIRED: Token usage
      $ai_input_tokens: inputTokens,
      // REQUIRED: Model and Provider
      $ai_model: context.modelId,

      $ai_output_choices: [{
        content: [{ text: finishResult.text, type: 'text' }],
        role: MessageRoles.ASSISTANT,
      }],
      $ai_output_tokens: outputTokens,

      $ai_parent_id: traceId, // Parent is the trace (enables tree-view in PostHog UI)
      $ai_provider: provider,

      // ✅ POSTHOG OFFICIAL: Span identification for tree-view grouping
      $ai_span_id: `span_${ulid()}`, // Unique identifier for this generation
      // REQUIRED: Trace ID (links related operations)
      $ai_trace_id: traceId,

      // ✅ BETTER AUTH SESSION LINKING: Use Better Auth session.id for Session Replay
      // This provides stable, reliable session tracking across requests
      ...(context.sessionId && {
        $session_id: context.sessionId,
      }),

      // Cache token tracking (Anthropic/OpenAI prompt caching)
      // AI SDK v6: use cacheReadTokens from inputTokenDetails
      ...(cacheReadTokens !== undefined && {
        $ai_cache_read_input_tokens: cacheReadTokens,
      }),

      $ai_http_status: 200, // Successful completion
      // ✅ POSTHOG OFFICIAL: Cost tracking with separate total_cost_usd
      $ai_input_cost_usd: inputCost,
      $ai_is_error: false,

      // REQUIRED: Performance metrics
      $ai_latency: latencySeconds,
      $ai_max_tokens: options?.modelConfig?.maxTokens,
      $ai_output_cost_usd: outputCost,

      // Model configuration
      $ai_stream: true, // Our implementation always streams
      $ai_total_cost_usd: inputCost + outputCost, // PostHog requires this as separate property
      ...(options?.modelConfig?.temperature !== undefined && {
        $ai_temperature: options.modelConfig.temperature,
      }),

      // ✅ POSTHOG OFFICIAL: Available tools for LLM
      ...(options?.tools && options.tools.length > 0 && {
        $ai_tools: options.tools,
        $ai_tools_count: options.tools.length,
      }),

      // Tool/function calling tracking
      ...(hasToolCalls && {
        $ai_tool_calls: toolCalls.map(tc => ({
          arguments: JSON.stringify(tc.input), // AI SDK v6: uses 'input' not 'args'
          name: tc.toolName,
        })),
        $ai_tool_calls_count: toolCalls.length,
      }),

      // ✅ POSTHOG OFFICIAL: Anthropic cache creation tokens (write to cache)
      ...(options?.cacheCreationInputTokens !== undefined && {
        $ai_cache_creation_input_tokens: options.cacheCreationInputTokens,
      }),

      // ✅ POSTHOG OFFICIAL: Custom pricing override (per token)
      // Use when PostHog's automatic pricing doesn't apply to your provider
      ...(options?.customPricing?.inputTokenPrice !== undefined && {
        $ai_input_token_price: options.customPricing.inputTokenPrice,
      }),
      ...(options?.customPricing?.outputTokenPrice !== undefined && {
        $ai_output_token_price: options.customPricing.outputTokenPrice,
      }),
      ...(options?.customPricing?.cacheReadTokenPrice !== undefined && {
        $ai_cache_read_token_price: options.customPricing.cacheReadTokenPrice,
      }),
      ...(options?.customPricing?.cacheWriteTokenPrice !== undefined && {
        $ai_cache_write_token_price: options.customPricing.cacheWriteTokenPrice,
      }),

      // ✅ POSTHOG OFFICIAL: Provider URL tracking for debugging
      ...(options?.providerUrls?.baseUrl && {
        $ai_base_url: options.providerUrls.baseUrl,
      }),
      ...(options?.providerUrls?.requestUrl && {
        $ai_request_url: options.providerUrls.requestUrl,
      }),

      // POSTHOG BEST PRACTICE: Prompt tracking for A/B testing
      ...(options?.promptTracking?.promptId && {
        prompt_id: options.promptTracking.promptId,
      }),
      ...(options?.promptTracking?.promptVersion && {
        prompt_version: options.promptTracking.promptVersion,
      }),
      ...(options?.promptTracking?.systemPromptTokens && {
        prompt_tokens_system: options.promptTracking.systemPromptTokens,
      }),

      // Trace metadata
      $ai_span_name: `${context.threadMode}_round_${context.roundNumber}_participant_${context.participantIndex}`,

      cache_hit_rate: cacheReadTokens && inputTokens
        ? cacheReadTokens / inputTokens
        : 0,
      // ✅ CACHING METRICS: Track cache hit rate for cost optimization
      // AI SDK v6: use cacheReadTokens from inputTokenDetails
      cache_hit_tokens: cacheReadTokens || 0,
      conversation_mode: context.threadMode,
      // ✅ TOKEN EFFICIENCY METRICS: Useful for cost optimization
      cost_per_second: latencySeconds > 0 ? (inputCost + outputCost) / latencySeconds : 0,
      // Cost efficiency (PostHog analytics) - based on cumulative usage
      cost_per_token: cumulativeTotalTokens > 0 ? (inputCost + outputCost) / cumulativeTotalTokens : 0,
      // Finish reason (PostHog analytics)
      finish_reason: finishResult.finishReason,
      has_cache_hit: !!(cacheReadTokens && cacheReadTokens > 0),
      // ✅ REASONING TOKENS: Track both SDK count and manual calculation
      has_reasoning: hasReasoning,

      is_multi_step: isMultiStep,

      is_regeneration: context.isRegeneration || false,

      // Performance indicators
      latency_ms: latencyMs,
      model_name: context.modelName || context.modelId,

      participant_id: context.participantId,
      participant_index: context.participantIndex,
      participant_role: context.participantRole || null,

      reasoning_tokens: reasoningTokens,
      // Response metrics
      response_length_chars: finishResult.text.length,
      response_length_words: finishResult.text.split(/\s+/).length,
      round_number: context.roundNumber,

      // POSTHOG BEST PRACTICE: Track subscription tier for cost analysis
      subscription_tier: context.userTier || 'free',
      // =====================================================================
      // APPLICATION-SPECIFIC PROPERTIES (Roundtable Context)
      // =====================================================================
      thread_id: context.threadId,

      tokens_per_second: latencySeconds > 0 ? totalOutputTokens / latencySeconds : 0,
      total_cost_usd: inputCost + outputCost,

      // ✅ AI SDK V6 MULTI-STEP TRACKING: Include totalUsage for cumulative metrics
      // This is essential for cost tracking and analytics of multi-step reasoning models
      total_input_tokens: totalInputTokens,

      total_output_tokens: totalOutputTokens,
      total_tokens: totalTokens,
      total_tokens_cumulative: cumulativeTotalTokens,

      // Pricing source indicator
      uses_dynamic_pricing: !!options?.modelPricing,

      // AI SDK v6 response metadata
      ...(finishResult.response?.id && {
        response_id: finishResult.response.id,
      }),

      // Additional custom properties (flexible extension point)
      ...options?.additionalProperties,
    };

    // Capture the generation event
    // ✅ BETTER AUTH DISTINCT ID: Use Better Auth session.id as PostHog distinct ID
    // This provides stable, consistent user identification across requests
    posthog.capture({
      distinctId: context.sessionId || context.userId, // Better Auth session.id, fallback to userId
      event: '$ai_generation',
      properties,
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
    return { success: true, traceId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { errorMessage, success: false, traceId };
  }
}

// ============================================================================
// ERROR TRACKING
// ============================================================================

/**
 * Track LLM-related errors with trace linking
 *
 * Links errors to the LLM trace for debugging and analysis
 *
 * @param context - Tracking context
 * @param error - Error object
 * @param traceId - Trace ID to link error to
 * @param stage - Stage where error occurred (e.g., "streaming", "validation", "processing")
 */
export async function trackLLMError(
  context: LLMTrackingContext,
  error: Error,
  traceId: string,
  stage: string,
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return;
  }

  try {
    // ✅ ZOD VALIDATION: Extract error details with proper type safety
    const HttpErrorPropsSchema = z.object({
      responseBody: z.string().optional(),
      statusCode: z.number().optional(),
    });

    type ErrorDetails = {
      error_message: string;
      error_name: string;
      error_stack?: string | undefined;
      http_status?: number | undefined;
      response_body?: string | undefined;
    };

    const baseErrorDetails: ErrorDetails = {
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack,
    };

    const errorDetails: ErrorDetails = isObject(error)
      ? (() => {
          const httpProps = HttpErrorPropsSchema.safeParse(error);
          return httpProps.success
            ? {
                ...baseErrorDetails,
                ...(httpProps.data.statusCode !== undefined && { http_status: httpProps.data.statusCode }),
                ...(httpProps.data.responseBody !== undefined && { response_body: httpProps.data.responseBody }),
              }
            : baseErrorDetails;
        })()
      : baseErrorDetails;

    // Capture exception with trace linking
    // ✅ BETTER AUTH DISTINCT ID: Use Better Auth session.id as PostHog distinct ID
    posthog.capture({
      distinctId: context.sessionId || context.userId, // Better Auth session.id, fallback to userId
      event: '$exception',
      properties: {
        $exception_message: error.message,
        $exception_stack_trace_raw: error.stack,
        $exception_type: error.name,

        // ✅ BETTER AUTH SESSION LINKING: Use Better Auth session.id for Session Replay
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Link to LLM trace
        $ai_trace_id: traceId,

        model_id: context.modelId,
        participant_id: context.participantId,
        participant_index: context.participantIndex,
        round_number: context.roundNumber,
        stage,
        // Context
        thread_id: context.threadId,

        // Error details
        ...errorDetails,

        // Categorization
        error_category: 'llm_error',
        is_transient: isTransientErrorFromObject(error),
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// RAG EMBEDDING TRACKING
// ============================================================================

/**
 * Track embedding generation event ($ai_embedding)
 *
 * ✅ POSTHOG OFFICIAL: Track embedding calls for RAG systems
 * Reference: https://posthog.com/docs/llm-analytics/embeddings
 *
 * Use this when:
 * - Generating embeddings for user queries (search)
 * - Generating embeddings for documents (indexing)
 * - Any text-to-vector conversion operation
 *
 * @param context - Basic tracking context (user, session)
 * @param context.userId - User ID for tracking
 * @param context.sessionId - Session ID for tracking (optional)
 * @param params - Embedding parameters
 * @param params.input - Text to embed (string or array)
 * @param params.model - Embedding model (e.g., "@cf/baai/bge-base-en-v1.5")
 * @param params.provider - Provider (e.g., "cloudflare", "openai", "cohere")
 * @param params.inputTokens - Number of input tokens
 * @param params.traceId - Trace ID to link with related operations
 * @param params.spanName - Operation name (e.g., "embed_user_query", "index_document")
 * @param params.parentId - Parent span/trace ID for tree-view grouping
 * @param latencyMs - Operation latency in milliseconds
 * @param options - Optional tracking enrichment
 * @param options.totalCostUsd - Cost in USD (if applicable)
 * @param options.additionalProperties - Custom properties
 */
export async function trackEmbedding(
  context: { userId: string; sessionId?: string },
  params: {
    input: string | string[];
    model: string;
    provider: string;
    inputTokens: number;
    traceId: string;
    spanName?: string;
    parentId?: string;
  },
  latencyMs: number,
  options?: {
    totalCostUsd?: number;
    additionalProperties?: Record<string, unknown>;
  },
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return; // PostHog not initialized (non-production env)
  }

  try {
    const latencySeconds = latencyMs / 1000;

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_embedding',
      properties: {
        $ai_input: params.input,
        $ai_input_tokens: params.inputTokens,
        $ai_model: params.model,
        $ai_provider: params.provider,
        $ai_span_id: `span_${ulid()}`,
        // Required properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        $ai_http_status: 200,
        $ai_is_error: false,
        // Performance
        $ai_latency: latencySeconds,

        // Cost tracking (if applicable)
        ...(options?.totalCostUsd !== undefined && {
          $ai_total_cost_usd: options.totalCostUsd,
        }),

        // Metadata
        ...(params.spanName && {
          $ai_span_name: params.spanName,
        }),
        ...(params.parentId && {
          $ai_parent_id: params.parentId,
        }),

        // Additional properties
        ...options?.additionalProperties,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// SPAN TRACKING (Tool Calls, RAG Operations, etc.)
// ============================================================================

/**
 * Track atomic operations within AI workflows ($ai_span)
 *
 * ✅ POSTHOG OFFICIAL: Track discrete operations within traces
 * Reference: https://posthog.com/docs/llm-analytics/spans
 *
 * Use this for:
 * - Tool/function calls
 * - Vector search operations
 * - Data retrieval steps
 * - Preprocessing/postprocessing operations
 *
 * @param context - Basic tracking context
 * @param context.userId - User ID for tracking
 * @param context.sessionId - Session ID for tracking (optional)
 * @param params - Span parameters
 * @param params.traceId - Trace ID to link with
 * @param params.spanName - Operation name (e.g., "vector_search", "tool_call")
 * @param params.inputState - Input state (any JSON-serializable data)
 * @param params.outputState - Output state (any JSON-serializable data)
 * @param params.parentId - Parent trace/span ID
 * @param latencyMs - Operation latency in milliseconds
 * @param options - Optional tracking enrichment
 * @param options.isError - Whether operation failed
 * @param options.error - Error details
 * @param options.additionalProperties - Custom properties
 */
export async function trackSpan(
  context: { userId: string; sessionId?: string },
  params: {
    traceId: string;
    spanName: string;
    inputState: unknown;
    outputState: unknown;
    parentId?: string;
  },
  latencyMs: number,
  options?: {
    isError?: boolean;
    error?: Error;
    additionalProperties?: Record<string, unknown>;
  },
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return; // PostHog not initialized (non-production env)
  }

  try {
    const latencySeconds = latencyMs / 1000;

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_span',
      properties: {
        $ai_input_state: params.inputState,
        $ai_output_state: params.outputState,
        $ai_span_id: `span_${ulid()}`,
        $ai_span_name: params.spanName,
        // Required properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        $ai_is_error: options?.isError || false,
        // Performance
        $ai_latency: latencySeconds,

        // Error details
        ...(options?.error && {
          $ai_error: {
            message: options.error.message,
            name: options.error.name,
            stack: options.error.stack,
          },
        }),

        // Tree-view grouping
        ...(params.parentId && {
          $ai_parent_id: params.parentId,
        }),

        // Additional properties
        ...options?.additionalProperties,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// TRACE TRACKING ($ai_trace)
// ============================================================================

/**
 * Track explicit trace event for grouping related AI operations
 *
 * ✅ POSTHOG OFFICIAL: $ai_trace provides explicit trace grouping
 * Reference: https://posthog.com/docs/llm-analytics/traces
 *
 * Use this when:
 * - Starting a new AI workflow (conversation round, analysis, etc.)
 * - Grouping multiple related operations under a single trace
 * - Capturing input/output state for complex workflows
 *
 * @param context - Basic tracking context
 * @param context.userId - User ID for tracking
 * @param context.sessionId - Session ID for tracking (optional)
 * @param params - Trace parameters
 * @param params.traceId - Unique trace identifier
 * @param params.traceName - Human-readable trace name
 * @param params.inputState - Initial input state (any JSON-serializable data)
 * @param params.outputState - Final output state (any JSON-serializable data)
 * @param latencyMs - Total trace duration in milliseconds
 * @param options - Optional tracking enrichment
 * @param options.isError - Whether trace failed
 * @param options.error - Error details
 * @param options.additionalProperties - Custom properties
 */
export async function trackTrace(
  context: { userId: string; sessionId?: string },
  params: {
    traceId: string;
    traceName: string;
    inputState: unknown;
    outputState: unknown;
  },
  latencyMs: number,
  options?: {
    isError?: boolean;
    error?: Error;
    additionalProperties?: Record<string, unknown>;
  },
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return; // PostHog not initialized (non-production env)
  }

  try {
    const latencySeconds = latencyMs / 1000;

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_trace',
      properties: {
        $ai_input_state: params.inputState,
        $ai_output_state: params.outputState,
        // Required trace properties
        $ai_trace_id: params.traceId,
        $ai_trace_name: params.traceName,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        $ai_is_error: options?.isError || false,
        // Performance
        $ai_latency: latencySeconds,

        // Error details
        ...(options?.error && {
          $ai_error: {
            message: options.error.message,
            name: options.error.name,
            stack: options.error.stack,
          },
        }),

        // Additional properties
        ...options?.additionalProperties,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// FEEDBACK TRACKING ($ai_feedback)
// ============================================================================

/**
 * Track user feedback on AI-generated content
 *
 * ✅ POSTHOG OFFICIAL: $ai_feedback captures user ratings and feedback
 * Reference: https://posthog.com/docs/llm-analytics/feedback
 *
 * Use this when:
 * - User rates a response (thumbs up/down, stars, etc.)
 * - User provides qualitative feedback on AI output
 * - Tracking quality metrics for AI generations
 *
 * @param context - Basic tracking context
 * @param context.userId - User ID for tracking
 * @param context.sessionId - Session ID for tracking (optional)
 * @param params - Feedback parameters
 * @param params.traceId - Trace ID of the AI generation being rated
 * @param params.score - Numeric score (e.g., 1-5, 0-1, -1 to 1)
 * @param params.feedbackType - Type of feedback (e.g., 'rating', 'thumbs', 'text')
 * @param params.comment - Optional text feedback/comment
 * @param params.generationId - Optional specific generation ID being rated
 * @param options - Optional tracking enrichment
 * @param options.feedbackCategory - Category of feedback (e.g., 'accuracy', 'helpfulness', 'tone')
 * @param options.additionalProperties - Custom properties
 */
export async function trackFeedback(
  context: { userId: string; sessionId?: string },
  params: {
    traceId: string;
    score: number;
    feedbackType: 'rating' | 'thumbs' | 'text' | 'custom';
    comment?: string;
    generationId?: string;
  },
  options?: {
    feedbackCategory?: string;
    additionalProperties?: Record<string, unknown>;
  },
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return; // PostHog not initialized (non-production env)
  }

  try {
    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_feedback',
      properties: {
        $ai_feedback_score: params.score,
        $ai_feedback_type: params.feedbackType,
        // Required feedback properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Optional feedback details
        ...(params.comment && {
          $ai_feedback_comment: params.comment,
        }),
        ...(params.generationId && {
          $ai_generation_id: params.generationId,
        }),
        ...(options?.feedbackCategory && {
          $ai_feedback_category: options.feedbackCategory,
        }),

        // Additional properties
        ...options?.additionalProperties,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// METRIC TRACKING ($ai_metric)
// ============================================================================

/**
 * Track custom AI metrics for observability
 *
 * ✅ POSTHOG OFFICIAL: $ai_metric captures custom AI performance metrics
 * Reference: https://posthog.com/docs/llm-analytics/metrics
 *
 * Use this when:
 * - Tracking custom performance metrics (e.g., quality scores, accuracy)
 * - Recording aggregate metrics for a trace or generation
 * - Capturing business-specific AI KPIs
 *
 * @param context - Basic tracking context
 * @param context.userId - User ID for tracking
 * @param context.sessionId - Session ID for tracking (optional)
 * @param params - Metric parameters
 * @param params.traceId - Trace ID to associate metric with
 * @param params.metricName - Name of the metric
 * @param params.metricValue - Numeric value of the metric
 * @param params.metricUnit - Unit of measurement (optional)
 * @param options - Optional tracking enrichment
 * @param options.additionalProperties - Custom properties
 */
export async function trackMetric(
  context: { userId: string; sessionId?: string },
  params: {
    traceId: string;
    metricName: string;
    metricValue: number;
    metricUnit?: string;
  },
  options?: {
    additionalProperties?: Record<string, unknown>;
  },
): Promise<void> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return; // PostHog not initialized (non-production env)
  }

  try {
    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_metric',
      properties: {
        $ai_metric_name: params.metricName,
        $ai_metric_value: params.metricValue,
        // Required metric properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Optional metric details
        ...(params.metricUnit && {
          $ai_metric_unit: params.metricUnit,
        }),

        // Additional properties
        ...options?.additionalProperties,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail - don't break the application
  }
}

// ============================================================================
// PRE-SEARCH / WEB SEARCH TRACKING
// ============================================================================

/**
 * Pre-search tracking context
 *
 * ✅ POSTHOG OFFICIAL: Tracks web search operations as $ai_span events
 * Web searches are spans within the larger conversation trace
 */
export type PreSearchTrackingContext = {
  userId: string;
  sessionId?: string;
  threadId: string;
  roundNumber: number;
  userQuery: string;
  userTier?: string;
};

/**
 * Pre-search tracking result
 */
export type PreSearchTrackingResult = {
  traceId: string;
  parentSpanId: string;
};

/**
 * Initialize pre-search tracking and return trace/span IDs
 *
 * ✅ POSTHOG OFFICIAL: Creates parent span for all pre-search operations
 * Allows grouping of query generation, web searches, and results in tree-view
 */
export function initializePreSearchTracking(): PreSearchTrackingResult {
  return {
    parentSpanId: `span_${ulid()}`,
    traceId: generateTraceId(),
  };
}

/**
 * Track query generation as $ai_span
 *
 * ✅ POSTHOG OFFICIAL: Track AI query generation for web search
 * This captures the AI's decision-making for multi-query generation
 */
export async function trackQueryGeneration(
  context: PreSearchTrackingContext,
  params: {
    traceId: string;
    parentSpanId: string;
    queriesGenerated: number;
    analysisRationale: string;
    complexity: string;
    modelId: string;
  },
  latencyMs: number,
  usage?: LanguageModelUsage,
  options?: {
    isError?: boolean;
    error?: Error;
    fallbackUsed?: boolean;
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  try {
    const latencySeconds = latencyMs / 1000;
    const provider = params.modelId.split('/')[0] || 'unknown';

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_span',
      properties: {
        $ai_parent_id: params.parentSpanId,
        $ai_span_id: `span_${ulid()}`,
        $ai_span_name: 'query_generation',
        // Required span properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && { $session_id: context.sessionId }),

        // Input/Output state
        $ai_input_state: { user_query: context.userQuery },
        $ai_is_error: options?.isError || false,

        // Performance
        $ai_latency: latencySeconds,
        $ai_model: params.modelId,
        $ai_output_state: {
          analysis_rationale: params.analysisRationale,
          complexity: params.complexity,
          queries_generated: params.queriesGenerated,
        },
        $ai_provider: provider,

        // Token usage (if available from AI SDK)
        ...(usage && {
          $ai_input_tokens: usage.inputTokens,
          $ai_output_tokens: usage.outputTokens,
        }),

        // Error details
        ...(options?.error && {
          $ai_error: {
            message: options.error.message,
            name: options.error.name,
          },
        }),

        fallback_used: options?.fallbackUsed || false,
        operation_type: 'pre_search_query_generation',
        round_number: context.roundNumber,
        subscription_tier: context.userTier || 'free',
        // Custom properties
        thread_id: context.threadId,
        user_query: context.userQuery,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail
  }
}

/**
 * Track web search execution as $ai_span
 *
 * ✅ POSTHOG OFFICIAL: Track individual web search operations
 * Captures search query, results count, and timing
 */
export async function trackWebSearchExecution(
  context: PreSearchTrackingContext,
  params: {
    traceId: string;
    parentSpanId: string;
    searchQuery: string;
    searchIndex: number;
    totalSearches: number;
    resultsCount: number;
    searchDepth: string;
  },
  latencyMs: number,
  options?: {
    isError?: boolean;
    error?: Error;
    cacheHit?: boolean;
    searchCostUsd?: number;
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  try {
    const latencySeconds = latencyMs / 1000;

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_span',
      properties: {
        $ai_parent_id: params.parentSpanId,
        $ai_span_id: `span_${ulid()}`,
        $ai_span_name: `web_search_${params.searchIndex + 1}_of_${params.totalSearches}`,
        // Required span properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && { $session_id: context.sessionId }),

        // Input/Output state
        $ai_input_state: {
          search_depth: params.searchDepth,
          search_index: params.searchIndex,
          search_query: params.searchQuery,
        },
        $ai_is_error: options?.isError || false,

        // Performance
        $ai_latency: latencySeconds,
        $ai_output_state: {
          cache_hit: options?.cacheHit || false,
          results_count: params.resultsCount,
        },

        // ✅ POSTHOG OFFICIAL: Web search cost tracking
        ...(options?.searchCostUsd !== undefined && {
          $ai_web_search_cost_usd: options.searchCostUsd,
        }),

        // Error details
        ...(options?.error && {
          $ai_error: {
            message: options.error.message,
            name: options.error.name,
          },
        }),

        cache_hit: options?.cacheHit || false,
        operation_type: 'web_search_execution',
        results_count: params.resultsCount,
        round_number: context.roundNumber,
        search_depth: params.searchDepth,
        search_index: params.searchIndex,
        search_query: params.searchQuery,
        subscription_tier: context.userTier || 'free',
        // Custom properties
        thread_id: context.threadId,
        total_searches: params.totalSearches,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail
  }
}

/**
 * Track complete pre-search operation
 *
 * ✅ POSTHOG OFFICIAL: Summary event for entire pre-search flow
 * Links all child spans and provides aggregate metrics
 */
export async function trackPreSearchComplete(
  context: PreSearchTrackingContext,
  params: {
    traceId: string;
    parentSpanId: string;
    totalQueries: number;
    successfulSearches: number;
    failedSearches: number;
    totalResults: number;
    totalWebSearchCostUsd?: number;
  },
  totalLatencyMs: number,
  options?: {
    isError?: boolean;
    error?: Error;
    errorCategory?: string | undefined;
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  try {
    const latencySeconds = totalLatencyMs / 1000;

    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: '$ai_span',
      properties: {
        $ai_span_id: params.parentSpanId, // Use parent span ID for the summary
        $ai_span_name: 'pre_search_complete',
        // Required span properties
        $ai_trace_id: params.traceId,

        // Session linking
        ...(context.sessionId && { $session_id: context.sessionId }),

        // Input/Output state
        $ai_input_state: { user_query: context.userQuery },
        $ai_is_error: options?.isError || false,

        // Performance
        $ai_latency: latencySeconds,
        $ai_output_state: {
          failed_searches: params.failedSearches,
          successful_searches: params.successfulSearches,
          total_queries: params.totalQueries,
          total_results: params.totalResults,
        },

        // ✅ POSTHOG OFFICIAL: Total web search cost
        ...(params.totalWebSearchCostUsd !== undefined && {
          $ai_web_search_cost_usd: params.totalWebSearchCostUsd,
        }),

        // Error details
        ...(options?.error && {
          $ai_error: {
            message: options.error.message,
            name: options.error.name,
          },
        }),

        failed_searches: params.failedSearches,
        operation_type: 'pre_search_summary',
        round_number: context.roundNumber,
        subscription_tier: context.userTier || 'free',
        success_rate: params.totalQueries > 0
          ? params.successfulSearches / params.totalQueries
          : 0,
        successful_searches: params.successfulSearches,
        // Custom properties
        thread_id: context.threadId,
        total_queries: params.totalQueries,
        total_results: params.totalResults,
        user_query: context.userQuery,
        ...(options?.errorCategory && { error_category: options.errorCategory }),
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail
  }
}

// ============================================================================
// ROUND & THREAD LIFECYCLE TRACKING
// ============================================================================

/**
 * Track round completion event
 *
 * ✅ POSTHOG OFFICIAL: Track when a conversation round completes
 * Captures aggregate metrics for the entire round
 */
export async function trackRoundComplete(
  context: {
    userId: string;
    sessionId?: string;
    threadId: string;
    roundNumber: number;
    threadMode: string;
    userTier?: string;
  },
  params: {
    participantCount: number;
    totalTokens: number;
    totalCostUsd: number;
    hasWebSearch: boolean;
    hasAnalysis: boolean;
    roundDurationMs: number;
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  try {
    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: 'round_complete',
      properties: {
        // Session linking
        ...(context.sessionId && { $session_id: context.sessionId }),

        // Efficiency metrics
        cost_per_participant: params.participantCount > 0
          ? params.totalCostUsd / params.participantCount
          : 0,
        has_analysis: params.hasAnalysis,
        has_web_search: params.hasWebSearch,
        // Metrics
        participant_count: params.participantCount,

        round_duration_seconds: params.roundDurationMs / 1000,
        round_number: context.roundNumber,
        subscription_tier: context.userTier || 'free',
        // Round context
        thread_id: context.threadId,
        thread_mode: context.threadMode,
        tokens_per_participant: params.participantCount > 0
          ? params.totalTokens / params.participantCount
          : 0,

        total_cost_usd: params.totalCostUsd,
        total_tokens: params.totalTokens,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail
  }
}

/**
 * Track thread creation event
 *
 * ✅ POSTHOG OFFICIAL: Track when a new conversation thread is created
 */
export async function trackThreadCreated(
  context: {
    userId: string;
    sessionId?: string;
    threadId: string;
    threadMode: string;
    userTier?: string;
  },
  params: {
    participantCount: number;
    enableWebSearch: boolean;
    models: string[];
  },
): Promise<void> {
  const posthog = getPostHogClient();
  if (!posthog) {
    return;
  }

  try {
    posthog.capture({
      distinctId: context.sessionId || context.userId,
      event: 'thread_created',
      properties: {
        // Session linking
        ...(context.sessionId && { $session_id: context.sessionId }),

        enable_web_search: params.enableWebSearch,
        models: params.models,
        // Configuration
        participant_count: params.participantCount,

        subscription_tier: context.userTier || 'free',
        // Thread context
        thread_id: context.threadId,
        thread_mode: context.threadMode,
        unique_models: [...new Set(params.models)].length,
      },
    });

    // Events auto-flush due to flushAt: 1 config - no shutdown needed
  } catch {
    // Silently fail
  }
}
