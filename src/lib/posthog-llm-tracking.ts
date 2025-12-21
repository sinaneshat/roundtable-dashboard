/**
 * PostHog LLM Observability Tracking
 *
 * Comprehensive tracking for LLM performance, usage, and costs following
 * official PostHog LLM analytics patterns.
 *
 * Reference: https://posthog.com/docs/llm-analytics
 */

import { ulid } from 'ulid';

import { isTransientErrorFromObject } from '@/lib/utils/error-metadata-builders';

import { getPostHogClient } from './posthog-server';

// ============================================================================
// TYPES
// ============================================================================

export type LLMGenerationProperties = {
  $ai_trace_id: string;
  $ai_model: string;
  $ai_provider: string;
  $ai_input: Array<{ role: string; content: string | Array<{ type: string; text: string }> }>;
  $ai_input_tokens: number;
  $ai_output_choices: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
  $ai_output_tokens: number;
  $session_id?: string;
  $ai_latency: number;
  $ai_http_status?: number;
  $ai_is_error: boolean;
  $ai_temperature?: number;
  $ai_max_tokens?: number;
  $ai_stream?: boolean;
  $ai_top_p?: number;
  $ai_frequency_penalty?: number;
  $ai_presence_penalty?: number;
  $ai_stop_sequences?: string[];
  $ai_input_cost_usd?: number;
  $ai_output_cost_usd?: number;
  $ai_span_name?: string;
  $ai_base_url?: string;
  $ai_request_url?: string;
  $ai_cache_read_input_tokens?: number;
  $ai_cache_write_input_tokens?: number;
  $ai_tools_count?: number;
  $ai_tool_calls?: Array<{ name: string; arguments: string }>;
  $ai_tool_calls_count?: number;
  prompt_id?: string;
  prompt_version?: string;
  prompt_tokens_system?: number;
  [key: string]: unknown;
};

export type LLMTrackingContext = {
  userId: string;
  distinctId?: string;
  sessionId?: string;
  threadId: string;
  roundNumber: number;
  threadMode: string;
  participantId: string;
  participantIndex: number;
  participantRole?: string | null;
  modelId: string;
  modelName?: string;
  isRegeneration?: boolean;
  userTier?: string;
};

export type LLMTrackingResult = {
  traceId: string;
  success: boolean;
  errorMessage?: string;
};

// ============================================================================
// OPENROUTER COST CALCULATION
// ============================================================================

const OPENROUTER_PRICING: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4.5': { input: 3.0, output: 15.0 },
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'anthropic/claude-3-opus': { input: 15.0, output: 75.0 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai/gpt-4-turbo': { input: 10.0, output: 30.0 },
  'openai/gpt-4': { input: 30.0, output: 60.0 },
  'openai/gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'google/gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'google/gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'meta-llama/llama-3.3-70b-instruct': { input: 0.35, output: 0.40 },
  'meta-llama/llama-3.1-405b-instruct': { input: 2.0, output: 2.0 },
};

export function calculateLLMCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const pricing = OPENROUTER_PRICING[modelId];

  if (!pricing) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

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

export function generateTraceId(): string {
  return `trace_${ulid()}`;
}

// ============================================================================
// LLM GENERATION TRACKING
// ============================================================================

export async function trackLLMGeneration(
  context: LLMTrackingContext,
  finishResult: {
    text: string;
    finishReason: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens?: number;
      cachedInputTokens?: number;
    };
    reasoning?: Array<{ type: 'reasoning'; text: string }>;
    toolCalls?: Array<{
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      args: unknown;
    }>;
    toolResults?: Array<{
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      result: unknown;
    }>;
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
    modelPricing?: { input: number; output: number };
    modelConfig?: {
      temperature?: number;
      maxTokens?: number;
    };
    promptTracking?: {
      promptId?: string;
      promptVersion?: string;
      systemPromptTokens?: number;
    };
    additionalProperties?: Record<string, unknown>;
  },
): Promise<LLMTrackingResult> {
  const posthog = getPostHogClient();

  if (!posthog) {
    return { traceId, success: false, errorMessage: 'PostHog not initialized' };
  }

  try {
    const latencyMs = performance.now() - startTime;
    const latencySeconds = latencyMs / 1000;

    const provider = context.modelId.split('/')[0] || 'unknown';

    const inputTokens = finishResult.usage?.inputTokens || 0;
    const outputTokens = finishResult.usage?.outputTokens || 0;
    const totalTokens = finishResult.usage?.totalTokens || (inputTokens + outputTokens);

    const cachedInputTokens = finishResult.usage?.cachedInputTokens;

    const reasoningText = finishResult.reasoning?.map(r => r.text).join('') || '';
    const reasoningTokens = reasoningText ? Math.ceil(reasoningText.length / 4) : 0;

    let inputCost = 0;
    let outputCost = 0;

    if (options?.modelPricing) {
      inputCost = (inputTokens / 1_000_000) * options.modelPricing.input;
      outputCost = (outputTokens / 1_000_000) * options.modelPricing.output;
    } else {
      const { inputCost: staticInputCost, outputCost: staticOutputCost } = calculateLLMCost(
        context.modelId,
        inputTokens,
        outputTokens,
      );
      inputCost = staticInputCost;
      outputCost = staticOutputCost;
    }

    const toolCalls = finishResult.toolCalls || [];
    const hasToolCalls = toolCalls.length > 0;

    const properties: LLMGenerationProperties = {
      $ai_trace_id: traceId,
      $ai_model: context.modelId,
      $ai_provider: provider,
      $ai_input: inputMessages,
      $ai_output_choices: [{
        role: 'assistant',
        content: [{ type: 'text', text: finishResult.text }],
      }],
      $ai_input_tokens: inputTokens,
      $ai_output_tokens: outputTokens,
      ...(context.sessionId && {
        $session_id: context.sessionId,
      }),
      ...(cachedInputTokens !== undefined && {
        $ai_cache_read_input_tokens: cachedInputTokens,
      }),
      $ai_latency: latencySeconds,
      $ai_http_status: 200,
      $ai_is_error: false,
      $ai_input_cost_usd: inputCost,
      $ai_output_cost_usd: outputCost,
      $ai_stream: true,
      $ai_max_tokens: options?.modelConfig?.maxTokens,
      ...(options?.modelConfig?.temperature !== undefined && {
        $ai_temperature: options.modelConfig.temperature,
      }),
      ...(hasToolCalls && {
        $ai_tool_calls_count: toolCalls.length,
        $ai_tool_calls: toolCalls.map(tc => ({
          name: tc.toolName,
          arguments: JSON.stringify(tc.args),
        })),
      }),
      ...(options?.promptTracking?.promptId && {
        prompt_id: options.promptTracking.promptId,
      }),
      ...(options?.promptTracking?.promptVersion && {
        prompt_version: options.promptTracking.promptVersion,
      }),
      ...(options?.promptTracking?.systemPromptTokens && {
        prompt_tokens_system: options.promptTracking.systemPromptTokens,
      }),
      $ai_span_name: `${context.threadMode}_round_${context.roundNumber}_participant_${context.participantIndex}`,
      $ai_base_url: 'https://openrouter.ai/api/v1',
      $ai_request_url: 'https://openrouter.ai/api/v1/chat/completions',
      thread_id: context.threadId,
      round_number: context.roundNumber,
      participant_id: context.participantId,
      participant_index: context.participantIndex,
      participant_role: context.participantRole || null,
      model_name: context.modelName || context.modelId,
      conversation_mode: context.threadMode,
      is_regeneration: context.isRegeneration || false,
      subscription_tier: context.userTier || 'free',
      finish_reason: finishResult.finishReason,
      response_length_chars: finishResult.text.length,
      response_length_words: finishResult.text.split(/\s+/).length,
      ...(reasoningTokens > 0 && {
        reasoning_tokens: reasoningTokens,
        reasoning_length_chars: reasoningText.length,
        has_reasoning: true,
      }),
      ...(hasToolCalls && {
        has_tool_calls: true,
        tool_names: toolCalls.map(tc => tc.toolName).join(','),
      }),
      latency_ms: latencyMs,
      tokens_per_second: latencySeconds > 0 ? outputTokens / latencySeconds : 0,
      total_tokens: totalTokens,
      cost_per_token: totalTokens > 0 ? (inputCost + outputCost) / totalTokens : 0,
      total_cost_usd: inputCost + outputCost,
      uses_dynamic_pricing: !!options?.modelPricing,
      ...(finishResult.response?.id && {
        response_id: finishResult.response.id,
      }),
      ...options?.additionalProperties,
    };

    posthog.capture({
      distinctId: context.distinctId || context.userId,
      event: '$ai_generation',
      properties,
    });

    await posthog.shutdown();

    return { traceId, success: true };
  } catch (error) {
    console.error('PostHog LLM tracking error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { traceId, success: false, errorMessage };
  }
}

// ============================================================================
// ERROR TRACKING
// ============================================================================

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
    const errorDetails: Record<string, unknown> = {
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack,
    };

    const httpError = error as Error & { statusCode?: number; responseBody?: string };
    if (httpError.statusCode) {
      errorDetails.http_status = httpError.statusCode;
    }
    if (httpError.responseBody) {
      errorDetails.response_body = httpError.responseBody;
    }

    posthog.capture({
      distinctId: context.distinctId || context.userId,
      event: '$exception',
      properties: {
        $exception_message: error.message,
        $exception_type: error.name,
        $exception_stack_trace_raw: error.stack,
        $ai_trace_id: traceId,
        thread_id: context.threadId,
        round_number: context.roundNumber,
        participant_id: context.participantId,
        participant_index: context.participantIndex,
        model_id: context.modelId,
        stage,
        ...errorDetails,
        error_category: 'llm_error',
        is_transient: isTransientErrorFromObject(error),
      },
    });

    await posthog.shutdown();
  } catch {
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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
    sessionId?: string;
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
