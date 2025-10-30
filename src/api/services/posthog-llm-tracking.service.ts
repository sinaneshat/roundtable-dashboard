/**
 * PostHog LLM Tracking Service - Analytics & Observability
 *
 * ✅ OFFICIAL POSTHOG LLM ANALYTICS PATTERNS:
 * - Tracks $ai_generation events with comprehensive metrics
 * - Links to Session Replay via $session_id (Better Auth session ID)
 * - Supports prompt versioning for A/B testing
 * - Captures token usage, costs, and performance metrics
 * - AI SDK v5 compatible (usage + totalUsage distinction)
 *
 * ✅ SINGLE SOURCE OF TRUTH for LLM tracking:
 * - All PostHog event tracking logic centralized here
 * - Uses AI SDK types (LanguageModelUsage) instead of hardcoded types
 * - Uses Better Auth session ID for distinct ID tracking
 * - Reuses cost utilities from product-logic.service.ts
 * - Follows established service architecture patterns
 *
 * Reference: https://posthog.com/docs/llm-analytics/generations
 * AI SDK v5: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
 */

import type { LanguageModelUsage } from 'ai';
import { ulid } from 'ulid';

import { getPostHogClient } from '@/lib/posthog-server';

// ============================================================================
// TYPE DEFINITIONS (Using AI SDK Types)
// ============================================================================

/**
 * ✅ AI SDK V5 TYPE REUSE: Use LanguageModelUsage from AI SDK
 * Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/language-model-usage
 *
 * This replaces our hardcoded AISDKTokenUsage type with the official AI SDK type
 * Ensures type consistency across the codebase
 */
export type { LanguageModelUsage } from 'ai';

/**
 * ✅ AI SDK V5 TOOL TYPES: Use official AI SDK tool types
 * Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool-call-part
 */
export type { ToolCallPart, ToolResultPart } from 'ai';

/**
 * LLM tracking context - captures all relevant context for PostHog event enrichment
 *
 * ✅ Better Auth Integration: Uses Better Auth session ID for distinct ID
 */
export type LLMTrackingContext = {
  // User identification (Better Auth session ID for distinct ID)
  userId: string;
  sessionId?: string; // Better Auth session.id - used as PostHog distinct ID (optional)

  // Conversation context
  threadId: string;
  roundNumber: number;
  threadMode: string;

  // Participant context
  participantId: string;
  participantIndex: number;
  participantRole?: string | null;

  // Model context
  modelId: string;
  modelName?: string;

  // Request metadata
  isRegeneration?: boolean;
  userTier?: string;
};

/**
 * LLM generation result from AI SDK v5
 *
 * ✅ AI SDK TYPE FLEXIBILITY: Uses flexible types to accommodate different AI SDK return types
 */
export type LLMGenerationResult = {
  text: string;
  finishReason: string;
  usage?: LanguageModelUsage;
  reasoning?: Array<{ type: 'reasoning'; text: string }>;
  toolCalls?: unknown; // Flexible type to accommodate different AI SDK versions
  toolResults?: unknown; // Flexible type to accommodate different AI SDK versions
  response?: {
    id?: string;
    modelId?: string;
    timestamp?: Date;
  };
};

/**
 * Input message format for PostHog tracking
 */
export type LLMInputMessage = {
  role: string;
  content: string | Array<{ type: string; text: string }>;
};

/**
 * Optional tracking enrichment options
 *
 * ✅ AI SDK TYPE REUSE: Uses LanguageModelUsage from AI SDK for totalUsage
 */
export type LLMTrackingOptions = {
  // Dynamic model pricing from OpenRouter API (per 1M tokens)
  modelPricing?: { input: number; output: number };

  // Model configuration
  modelConfig?: {
    temperature?: number;
    maxTokens?: number;
  };

  // Prompt tracking for A/B testing
  promptTracking?: {
    promptId?: string;
    promptVersion?: string;
    systemPromptTokens?: number;
  };

  // ✅ PostHog Official: Available tools/functions for the LLM
  tools?: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters?: unknown;
    };
  }>;

  // ✅ PostHog Official: Anthropic cache creation tokens (write to cache)
  cacheCreationInputTokens?: number;

  // ✅ AI SDK v5: Total usage across all steps (uses LanguageModelUsage type)
  totalUsage?: LanguageModelUsage;

  // Reasoning tokens (from AI SDK or estimated)
  reasoningTokens?: number;

  // Additional custom properties
  additionalProperties?: Record<string, unknown>;
};

/**
 * Result from LLM generation tracking
 */
export type LLMTrackingResult = {
  traceId: string;
  success: boolean;
  errorMessage?: string;
};

// ============================================================================
// POSTHOG PROPERTIES SCHEMA
// ============================================================================

/**
 * PostHog $ai_generation event properties
 * Reference: https://posthog.com/docs/llm-analytics/generations
 */
type LLMGenerationProperties = {
  // Required properties
  $ai_trace_id: string;
  $ai_model: string;
  $ai_provider: string;
  $ai_input: LLMInputMessage[];
  $ai_input_tokens: number;
  $ai_output_choices: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
  $ai_output_tokens: number;
  $ai_latency: number;
  $ai_http_status?: number;
  $ai_is_error: boolean;

  // Session tracking
  $session_id?: string;

  // ✅ PostHog Official: Span identification for tree-view grouping
  $ai_span_id?: string; // Unique identifier for this generation
  $ai_parent_id?: string; // Parent trace/span ID for hierarchical grouping

  // Performance metrics
  $ai_temperature?: number;
  $ai_max_tokens?: number;
  $ai_stream?: boolean;
  $ai_cache_read_input_tokens?: number;
  $ai_cache_creation_input_tokens?: number; // Anthropic cache write tokens

  // Cost tracking
  $ai_input_cost_usd?: number;
  $ai_output_cost_usd?: number;
  $ai_total_cost_usd?: number; // ✅ PostHog Official: Total cost as separate property

  // Tool tracking
  $ai_tools?: Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>; // ✅ Available tools
  $ai_tools_count?: number;
  $ai_tool_calls?: Array<{ name: string; arguments: string }>;
  $ai_tool_calls_count?: number;

  // Prompt tracking
  prompt_id?: string;
  prompt_version?: string;
  prompt_tokens_system?: number;

  // Trace metadata
  $ai_span_name?: string;

  // Custom properties
  [key: string]: unknown;
};

// ============================================================================
// COST CALCULATION UTILITIES
// ============================================================================

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
export function estimateReasoningTokens(reasoningText: string): number {
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
export function generateTraceId(): string {
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
    userId,
    sessionId, // ✅ Better Auth session.id - used as PostHog distinct ID (optional)
    threadId,
    roundNumber,
    participantId: participant.id,
    participantIndex,
    participantRole: participant.role,
    modelId: participant.modelId,
    modelName: options?.modelName,
    threadMode,
    isRegeneration: options?.isRegeneration,
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
 * - AI SDK v5 compatible (handles both usage and totalUsage)
 *
 * Reference: https://posthog.com/docs/llm-analytics/generations
 * AI SDK v5: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text
 *
 * @param context - Tracking context (user, thread, participant, session)
 * @param finishResult - AI SDK v5 finish result from streamText/generateText
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
    return { traceId, success: false, errorMessage: 'PostHog not initialized' };
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
    // AI SDK V5 TOKEN USAGE (Final Step Only)
    // =========================================================================
    // In AI SDK v5:
    // - usage: Contains token usage from the FINAL STEP only
    // - totalUsage: Contains CUMULATIVE token usage across ALL STEPS (multi-step reasoning)
    const inputTokens = finishResult.usage?.inputTokens || 0;
    const outputTokens = finishResult.usage?.outputTokens || 0;
    const totalTokens = finishResult.usage?.totalTokens || (inputTokens + outputTokens);

    // Cache tokens (Anthropic/OpenAI prompt caching)
    const cachedInputTokens = finishResult.usage?.cachedInputTokens;

    // =========================================================================
    // AI SDK V5 MULTI-STEP TRACKING (Cumulative Usage)
    // =========================================================================
    // Use totalUsage for cumulative metrics (if available)
    // For single-step generations, totalUsage === usage
    // For multi-step reasoning (e.g., o1, o3, DeepSeek R1), totalUsage includes ALL steps
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
    // REASONING TOKENS
    // =========================================================================
    const reasoningTokens = options?.reasoningTokens || 0;
    const hasReasoning = reasoningTokens > 0;

    // =========================================================================
    // TOOL CALLS (AI SDK v5)
    // =========================================================================
    const toolCalls = (Array.isArray(finishResult.toolCalls) ? finishResult.toolCalls : []) as Array<{
      toolName: string;
      input: unknown;
    }>;
    const hasToolCalls = toolCalls.length > 0;

    // =========================================================================
    // BUILD POSTHOG EVENT PROPERTIES (Official Schema)
    // =========================================================================
    const properties: LLMGenerationProperties = {
      // REQUIRED: Trace ID (links related operations)
      $ai_trace_id: traceId,
      // REQUIRED: Model and Provider
      $ai_model: context.modelId,
      $ai_provider: provider,

      // ✅ POSTHOG OFFICIAL: Span identification for tree-view grouping
      $ai_span_id: `span_${ulid()}`, // Unique identifier for this generation
      $ai_parent_id: traceId, // Parent is the trace (enables tree-view in PostHog UI)

      // POSTHOG BEST PRACTICE: Always include input/output for observability
      $ai_input: inputMessages,
      $ai_output_choices: [{
        role: 'assistant',
        content: [{ type: 'text', text: finishResult.text }],
      }],

      // REQUIRED: Token usage
      $ai_input_tokens: inputTokens,
      $ai_output_tokens: outputTokens,

      // ✅ BETTER AUTH SESSION LINKING: Use Better Auth session.id for Session Replay
      // This provides stable, reliable session tracking across requests
      ...(context.sessionId && {
        $session_id: context.sessionId,
      }),

      // Cache token tracking (Anthropic/OpenAI prompt caching)
      ...(cachedInputTokens !== undefined && {
        $ai_cache_read_input_tokens: cachedInputTokens,
      }),

      // REQUIRED: Performance metrics
      $ai_latency: latencySeconds,
      $ai_http_status: 200, // Successful completion
      $ai_is_error: false,

      // ✅ POSTHOG OFFICIAL: Cost tracking with separate total_cost_usd
      $ai_input_cost_usd: inputCost,
      $ai_output_cost_usd: outputCost,
      $ai_total_cost_usd: inputCost + outputCost, // PostHog requires this as separate property

      // Model configuration
      $ai_stream: true, // Our implementation always streams
      $ai_max_tokens: options?.modelConfig?.maxTokens,
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
        $ai_tool_calls_count: toolCalls.length,
        $ai_tool_calls: toolCalls.map(tc => ({
          name: tc.toolName,
          arguments: JSON.stringify(tc.input), // AI SDK v5: uses 'input' not 'args'
        })),
      }),

      // ✅ POSTHOG OFFICIAL: Anthropic cache creation tokens (write to cache)
      ...(options?.cacheCreationInputTokens !== undefined && {
        $ai_cache_creation_input_tokens: options.cacheCreationInputTokens,
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

      // =====================================================================
      // APPLICATION-SPECIFIC PROPERTIES (Roundtable Context)
      // =====================================================================
      thread_id: context.threadId,
      round_number: context.roundNumber,
      participant_id: context.participantId,
      participant_index: context.participantIndex,
      participant_role: context.participantRole || null,
      model_name: context.modelName || context.modelId,
      conversation_mode: context.threadMode,
      is_regeneration: context.isRegeneration || false,

      // POSTHOG BEST PRACTICE: Track subscription tier for cost analysis
      subscription_tier: context.userTier || 'free',

      // Finish reason (PostHog analytics)
      finish_reason: finishResult.finishReason,

      // Response metrics
      response_length_chars: finishResult.text.length,
      response_length_words: finishResult.text.split(/\s+/).length,

      // Performance indicators
      latency_ms: latencyMs,
      tokens_per_second: latencySeconds > 0 ? totalOutputTokens / latencySeconds : 0,
      total_tokens: totalTokens,

      // ✅ AI SDK V5 MULTI-STEP TRACKING: Include totalUsage for cumulative metrics
      // This is essential for cost tracking and analytics of multi-step reasoning models
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_tokens_cumulative: cumulativeTotalTokens,
      is_multi_step: isMultiStep,

      // ✅ REASONING TOKENS: Track both SDK count and manual calculation
      has_reasoning: hasReasoning,
      reasoning_tokens: reasoningTokens,

      // Cost efficiency (PostHog analytics) - based on cumulative usage
      cost_per_token: cumulativeTotalTokens > 0 ? (inputCost + outputCost) / cumulativeTotalTokens : 0,
      total_cost_usd: inputCost + outputCost,

      // ✅ TOKEN EFFICIENCY METRICS: Useful for cost optimization
      cost_per_second: latencySeconds > 0 ? (inputCost + outputCost) / latencySeconds : 0,

      // ✅ CACHING METRICS: Track cache hit rate for cost optimization
      cache_hit_tokens: cachedInputTokens || 0,
      cache_hit_rate: cachedInputTokens && inputTokens
        ? cachedInputTokens / inputTokens
        : 0,
      has_cache_hit: !!(cachedInputTokens && cachedInputTokens > 0),

      // Pricing source indicator
      uses_dynamic_pricing: !!options?.modelPricing,

      // AI SDK v5 response metadata
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

    // Shutdown to flush events (important for serverless)
    await posthog.shutdown();

    return { traceId, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { traceId, success: false, errorMessage };
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
    // Extract error details
    const errorDetails: Record<string, unknown> = {
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack,
    };

    // Check for HTTP status code in error
    const httpError = error as Error & { statusCode?: number; responseBody?: string };
    if (httpError.statusCode) {
      errorDetails.http_status = httpError.statusCode;
    }
    if (httpError.responseBody) {
      errorDetails.response_body = httpError.responseBody;
    }

    // Capture exception with trace linking
    // ✅ BETTER AUTH DISTINCT ID: Use Better Auth session.id as PostHog distinct ID
    posthog.capture({
      distinctId: context.sessionId || context.userId, // Better Auth session.id, fallback to userId
      event: '$exception',
      properties: {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,

        // ✅ BETTER AUTH SESSION LINKING: Use Better Auth session.id for Session Replay
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Link to LLM trace
        $ai_trace_id: traceId,

        // Context
        thread_id: context.threadId,
        round_number: context.roundNumber,
        participant_id: context.participantId,
        participant_index: context.participantIndex,
        model_id: context.modelId,
        stage,

        // Error details
        ...errorDetails,

        // Categorization
        error_category: 'llm_error',
        is_transient: isTransientError(error),
      },
    });

    await posthog.shutdown();
  } catch {
    // Silently fail - don't break the application
  }
}

/**
 * Determine if an error is transient (retriable)
 */
function isTransientError(error: Error): boolean {
  const httpError = error as Error & { statusCode?: number };
  const statusCode = httpError.statusCode;

  // Rate limits and server errors are transient
  if (statusCode === 429 || statusCode === 503 || statusCode === 502) {
    return true;
  }

  // Network errors are transient
  if (error.message.includes('network') || error.message.includes('timeout')) {
    return true;
  }

  return false;
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
        // Required properties
        $ai_trace_id: params.traceId,
        $ai_span_id: `span_${ulid()}`,
        $ai_model: params.model,
        $ai_provider: params.provider,
        $ai_input: params.input,
        $ai_input_tokens: params.inputTokens,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Performance
        $ai_latency: latencySeconds,
        $ai_http_status: 200,
        $ai_is_error: false,

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

    await posthog.shutdown();
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
        // Required properties
        $ai_trace_id: params.traceId,
        $ai_span_id: `span_${ulid()}`,
        $ai_span_name: params.spanName,
        $ai_input_state: params.inputState,
        $ai_output_state: params.outputState,

        // Session linking
        ...(context.sessionId && {
          $session_id: context.sessionId,
        }),

        // Performance
        $ai_latency: latencySeconds,
        $ai_is_error: options?.isError || false,

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

    await posthog.shutdown();
  } catch {
    // Silently fail - don't break the application
  }
}
