/**
 * PostHog LLM Observability Tracking
 *
 * Comprehensive tracking for LLM performance, usage, and costs following
 * official PostHog LLM analytics patterns.
 *
 * Features:
 * - Automatic $ai_generation event capture
 * - Token usage and cost tracking
 * - Performance monitoring (latency, throughput)
 * - Error tracking with trace linking
 * - Model performance comparison
 * - User-specific analytics
 *
 * Reference: https://posthog.com/docs/llm-analytics
 * Pattern: src/lib/posthog-llm-tracking.ts
 */

import { ulid } from 'ulid';

import { isTransientErrorFromObject } from '@/lib/utils/error-metadata-builders';

import { getDistinctIdFromCookie, getPostHogClient } from './posthog-server';

// ============================================================================
// TYPES
// ============================================================================

/**
 * LLM generation properties following PostHog official schema
 * Reference: https://posthog.com/docs/llm-analytics/generations
 *
 * PostHog Best Practices:
 * - Always include $ai_input and $ai_output_choices for observability
 * - Track $session_id to link with Session Replay
 * - Include prompt_id and prompt_version for A/B testing
 * - Use $ai_trace_id to link related operations
 */
export type LLMGenerationProperties = {
  // =========================================================================
  // REQUIRED PROPERTIES (PostHog Official)
  // =========================================================================
  $ai_trace_id: string; // Unique trace identifier (UUID)
  $ai_model: string; // Model ID (e.g., "anthropic/claude-sonnet-4.5")
  $ai_provider: string; // Provider (e.g., "openrouter", "openai")

  // =========================================================================
  // INPUT/OUTPUT TRACKING (PostHog Best Practice - Always Include)
  // =========================================================================
  $ai_input: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>;
  $ai_input_tokens: number;
  $ai_output_choices: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
  $ai_output_tokens: number;

  // =========================================================================
  // SESSION TRACKING (PostHog Best Practice - Link to Session Replay)
  // =========================================================================
  $session_id?: string; // PostHog session ID for linking to Session Replay

  // =========================================================================
  // PERFORMANCE METRICS
  // =========================================================================
  $ai_latency: number; // Response time in seconds (required for performance monitoring)
  $ai_http_status?: number;
  $ai_is_error: boolean;

  // Model configuration
  $ai_temperature?: number;
  $ai_max_tokens?: number;
  $ai_stream?: boolean;
  $ai_top_p?: number;
  $ai_frequency_penalty?: number;
  $ai_presence_penalty?: number;
  $ai_stop_sequences?: string[];

  // Cost tracking
  $ai_input_cost_usd?: number;
  $ai_output_cost_usd?: number;

  // Trace metadata
  $ai_span_name?: string; // Custom name for this generation
  $ai_base_url?: string;
  $ai_request_url?: string;

  // Cache tracking (for providers that support it)
  $ai_cache_read_input_tokens?: number;
  $ai_cache_write_input_tokens?: number;

  // =========================================================================
  // TOOL/FUNCTION CALLING TRACKING (PostHog Official)
  // =========================================================================
  $ai_tools_count?: number; // Number of tools available
  $ai_tool_calls?: Array<{ name: string; arguments: string }>;
  $ai_tool_calls_count?: number;

  // =========================================================================
  // PROMPT TRACKING (PostHog Best Practice for A/B Testing & Versioning)
  // =========================================================================
  prompt_id?: string; // Prompt template identifier (e.g., "customer_support_agent")
  prompt_version?: string; // Prompt version (e.g., "v2.3.1")
  prompt_tokens_system?: number; // System prompt tokens

  // =========================================================================
  // CUSTOM PROPERTIES (Application-Specific Context)
  // =========================================================================
  [key: string]: unknown;
};

/**
 * Context for LLM tracking
 *
 * Captures all relevant context for PostHog event enrichment
 */
export type LLMTrackingContext = {
  // =========================================================================
  // USER IDENTIFICATION (Required)
  // =========================================================================
  userId: string; // Internal user ID
  distinctId?: string; // PostHog distinct ID from cookie

  // =========================================================================
  // SESSION TRACKING (PostHog Best Practice)
  // =========================================================================
  sessionId?: string; // PostHog session ID for Session Replay linking

  // =========================================================================
  // CONVERSATION CONTEXT
  // =========================================================================
  threadId: string;
  roundNumber: number;
  threadMode: string;

  // =========================================================================
  // PARTICIPANT CONTEXT
  // =========================================================================
  participantId: string;
  participantIndex: number;
  participantRole?: string | null;

  // =========================================================================
  // MODEL CONTEXT
  // =========================================================================
  modelId: string;
  modelName?: string;

  // =========================================================================
  // REQUEST METADATA
  // =========================================================================
  isRegeneration?: boolean;
  userTier?: string;
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
// OPENROUTER COST CALCULATION
// ============================================================================

/**
 * OpenRouter model pricing (per 1M tokens)
 * These need to be updated periodically from OpenRouter's API or documentation
 *
 * Format: { modelId: { input: costPerMillionTokens, output: costPerMillionTokens } }
 */
const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic models
  'anthropic/claude-sonnet-4.5': { input: 3.0, output: 15.0 },
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-opus': { input: 15.0, output: 75.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },

  // OpenAI models
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4-turbo': { input: 10.0, output: 30.0 },
  'openai/gpt-4': { input: 30.0, output: 60.0 },
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // Google models
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-1.5-pro': { input: 1.25, output: 5.0 },

  // Meta models
  'meta-llama/llama-3.3-70b-instruct': { input: 0.35, output: 0.40 },
  'meta-llama/llama-3.1-405b-instruct': { input: 2.0, output: 2.0 },
};

/**
 * Calculate cost in USD based on token usage
 *
 * @param modelId - Full model ID (e.g., "anthropic/claude-sonnet-4.5")
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns { inputCost, outputCost, totalCost } in USD
 */
export function calculateLLMCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = OPENROUTER_PRICING[modelId];

  if (!pricing) {
    // Unknown model - return zero costs
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  // Convert per-million pricing to per-token pricing
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

// ============================================================================
// TRACE ID MANAGEMENT
// ============================================================================

/**
 * Generate a unique trace ID for LLM tracking
 * Trace IDs link related events (generation, errors, embeddings)
 */
export function generateTraceId(): string {
  return `trace_${ulid()}`;
}

// ============================================================================
// LLM GENERATION TRACKING
// ============================================================================

/**
 * Track LLM generation event with comprehensive metrics
 *
 * Following PostHog official best practices:
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
 * @param finishResult.text - Generated text content
 * @param finishResult.finishReason - Why generation finished (stop, length, etc.)
 * @param finishResult.usage - Token usage information
 * @param finishResult.usage.inputTokens - Number of input tokens consumed
 * @param finishResult.usage.outputTokens - Number of output tokens generated
 * @param finishResult.usage.totalTokens - Total tokens consumed (optional)
 * @param finishResult.usage.cachedInputTokens - Cached input tokens (prompt caching, optional)
 * @param finishResult.reasoning - Reasoning steps for o1/o3/DeepSeek models (optional)
 * @param finishResult.toolCalls - Tool calls made during generation (optional)
 * @param finishResult.toolResults - Results from tool calls (optional)
 * @param finishResult.response - Response metadata from provider (optional)
 * @param finishResult.response.id - Response ID from provider (optional)
 * @param finishResult.response.modelId - Model ID from provider (optional)
 * @param finishResult.response.timestamp - Response timestamp (optional)
 * @param inputMessages - Input messages (PostHog best practice - always include)
 * @param traceId - Unique trace identifier (UUID)
 * @param startTime - Timestamp when generation started (performance.now())
 * @param options - Optional tracking enrichment (pricing, config, prompts)
 * @param options.modelPricing - Model pricing from OpenRouter API (optional)
 * @param options.modelPricing.input - Cost per 1M input tokens (optional)
 * @param options.modelPricing.output - Cost per 1M output tokens (optional)
 * @param options.modelConfig - Model configuration tracking (optional)
 * @param options.modelConfig.temperature - Temperature setting (optional)
 * @param options.modelConfig.maxTokens - Max tokens setting (optional)
 * @param options.promptTracking - Prompt tracking for A/B testing (optional)
 * @param options.promptTracking.promptId - Prompt identifier (optional)
 * @param options.promptTracking.promptVersion - Prompt version (optional)
 * @param options.promptTracking.systemPromptTokens - System prompt token count (optional)
 * @param options.additionalProperties - Additional custom properties (optional)
 */
export async function trackLLMGeneration(
  context: LLMTrackingContext,
  finishResult: {
    text: string;
    finishReason: string;
    // AI SDK v5 usage format (inputTokens/outputTokens)
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens?: number;
      // Cache tokens (Anthropic/OpenAI prompt caching)
      cachedInputTokens?: number; // AI SDK v5 renamed from cacheReadInputTokens
    };
    // Reasoning tokens (o1/o3/DeepSeek models)
    reasoning?: Array<{ type: 'reasoning'; text: string }>;
    // Tool calls (AI SDK v5)
    toolCalls?: Array<{
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: unknown;
    }>;
    // Tool results (AI SDK v5)
    toolResults?: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      result: unknown;
    }>;
    // Response metadata (AI SDK v5)
    response?: {
      id?: string;
      modelId?: string;
      timestamp?: Date;
    };
  },
  inputMessages: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>,
  traceId: string,
  startTime: number,
  options?: {
    // Model pricing from OpenRouter API (dynamic)
    modelPricing?: { input: number; output: number };
    // Model configuration tracking
    modelConfig?: {
      temperature?: number;
      maxTokens?: number;
    };
    // Prompt tracking (PostHog best practice for A/B testing)
    promptTracking?: {
      promptId?: string; // e.g., "customer_support_agent"
      promptVersion?: string; // e.g., "v2.3.1"
      systemPromptTokens?: number;
    };
    // Additional custom properties
    additionalProperties?: Record<string, unknown>;
  },
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
    // AI SDK V5 TOKEN USAGE (Direct Mapping)
    // =========================================================================
    const inputTokens = finishResult.usage?.inputTokens || 0;
    const outputTokens = finishResult.usage?.outputTokens || 0;
    const totalTokens = finishResult.usage?.totalTokens || (inputTokens + outputTokens);

    // Cache tokens (Anthropic/OpenAI prompt caching)
    const cachedInputTokens = finishResult.usage?.cachedInputTokens;

    // Reasoning tokens (o1/o3/DeepSeek models)
    const reasoningText = finishResult.reasoning?.map(r => r.text).join('') || '';
    const reasoningTokens = reasoningText ? Math.ceil(reasoningText.length / 4) : 0;

    // =========================================================================
    // COST CALCULATION (Dynamic or Static Pricing)
    // =========================================================================
    let inputCost = 0;
    let outputCost = 0;

    if (options?.modelPricing) {
      // Use dynamic pricing from OpenRouter API
      inputCost = (inputTokens / 1_000_000) * options.modelPricing.input;
      outputCost = (outputTokens / 1_000_000) * options.modelPricing.output;
    } else {
      // Fallback to static pricing table
      const { inputCost: staticInputCost, outputCost: staticOutputCost } = calculateLLMCost(
        context.modelId,
        inputTokens,
        outputTokens,
      );
      inputCost = staticInputCost;
      outputCost = staticOutputCost;
    }

    // =========================================================================
    // TOOL CALLS (AI SDK v5)
    // =========================================================================
    const toolCalls = finishResult.toolCalls || [];
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

      // POSTHOG BEST PRACTICE: Always include input/output for observability
      $ai_input: inputMessages,
      $ai_output_choices: [{
        role: 'assistant',
        content: [{ type: 'text', text: finishResult.text }],
      }],

      // REQUIRED: Token usage
      $ai_input_tokens: inputTokens,
      $ai_output_tokens: outputTokens,

      // POSTHOG BEST PRACTICE: Session linking for Session Replay
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

      // Cost tracking (PostHog analytics)
      $ai_input_cost_usd: inputCost,
      $ai_output_cost_usd: outputCost,

      // Model configuration
      $ai_stream: true, // Our implementation always streams
      $ai_max_tokens: options?.modelConfig?.maxTokens,
      ...(options?.modelConfig?.temperature !== undefined && {
        $ai_temperature: options.modelConfig.temperature,
      }),

      // Tool/function calling tracking
      ...(hasToolCalls && {
        $ai_tool_calls_count: toolCalls.length,
        $ai_tool_calls: toolCalls.map(tc => ({
          name: tc.toolName,
          arguments: JSON.stringify(tc.args),
        })),
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
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',

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

      // Reasoning tokens (o1/o3/DeepSeek models)
      ...(reasoningTokens > 0 && {
        reasoning_tokens: reasoningTokens,
        reasoning_length_chars: reasoningText.length,
        has_reasoning: true,
      }),

      // Tool usage (if applicable)
      ...(hasToolCalls && {
        has_tool_calls: true,
        tool_names: toolCalls.map(tc => tc.toolName).join(','),
      }),

      // Performance indicators
      latency_ms: latencyMs,
      tokens_per_second: latencySeconds > 0 ? outputTokens / latencySeconds : 0,
      total_tokens: totalTokens,

      // Cost efficiency (PostHog analytics)
      cost_per_token: totalTokens > 0 ? (inputCost + outputCost) / totalTokens : 0,
      total_cost_usd: inputCost + outputCost,

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
    posthog.capture({
      distinctId: context.distinctId || context.userId,
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
    posthog.capture({
      distinctId: context.distinctId || context.userId,
      event: '$exception',
      properties: {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,

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
 * @see isTransientErrorFromObject in error-metadata-builders
 */
function isTransientError(error: Error): boolean {
  return isTransientErrorFromObject(error);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract distinct ID from request cookie header
 * Wrapper around posthog-server utility
 */
export function extractDistinctIdFromRequest(cookieHeader: string | null): string {
  return getDistinctIdFromCookie(cookieHeader);
}

/**
 * Better Auth Session ID for PostHog Tracking
 *
 * PostHog Best Practice: Include $session_id to link LLM events with Session Replay
 * Reference: https://posthog.com/docs/llm-analytics/link-session-replay
 *
 * Using Better Auth session IDs provides:
 * - Stable session identifier across requests
 * - Already available in authentication context (no cookie parsing needed)
 * - Consistent with application's authentication pattern
 * - Simpler and more reliable than parsing PostHog cookies
 *
 * Note: Better Auth session.id is passed directly from the handler context
 * where it's already extracted via authenticateSession() middleware
 */

/**
 * Create comprehensive tracking context from handler data
 *
 * Helper function to build LLMTrackingContext with all required fields
 */
export function createTrackingContext(
  userId: string,
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
    distinctId?: string;
    sessionId?: string; // PostHog session ID for Session Replay linking
    modelName?: string;
    isRegeneration?: boolean;
    userTier?: string;
  },
): LLMTrackingContext {
  return {
    userId,
    distinctId: options?.distinctId,
    sessionId: options?.sessionId,
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
