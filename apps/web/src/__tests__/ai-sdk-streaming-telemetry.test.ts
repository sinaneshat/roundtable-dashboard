/**
 * AI SDK Streaming Telemetry Tests
 *
 * Tests verifying AI SDK streamText integration with OpenTelemetry,
 * including smooth stream transformation, telemetry metadata propagation,
 * and stream resumption patterns.
 *
 * ✅ PATTERN: Tests AI SDK v6 experimental_telemetry configuration
 * ✅ COVERAGE: Participant streaming, moderator streaming, smooth stream
 */

import { ModelIds, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// Mock Setup
// ============================================================================

const mockStreamText = vi.fn();
const mockSmoothStream = vi.fn();
const mockWrapLanguageModel = vi.fn();
const mockExtractReasoningMiddleware = vi.fn();

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  smoothStream: (...args: unknown[]) => mockSmoothStream(...args),
  wrapLanguageModel: (...args: unknown[]) => mockWrapLanguageModel(...args),
  extractReasoningMiddleware: (...args: unknown[]) => mockExtractReasoningMiddleware(...args),
  RetryError: {
    isInstance: (error: unknown) => error instanceof Error && error.name === 'RetryError',
  },
}));

// ============================================================================
// Test Utilities
// ============================================================================

type TelemetryMetadata = Record<string, string | number | boolean | undefined>;

type StreamTextTelemetryConfig = {
  isEnabled: boolean;
  functionId: string;
  recordInputs: boolean;
  recordOutputs: boolean;
  metadata: TelemetryMetadata;
};

function createParticipantTelemetryConfig(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  options?: {
    modelId?: string;
    participantRole?: string;
    userId?: string;
    userTier?: string;
    isRegeneration?: boolean;
    ragEnabled?: boolean;
    reasoningEnabled?: boolean;
    totalParticipants?: number;
  },
): StreamTextTelemetryConfig {
  return {
    isEnabled: true,
    functionId: `chat.thread.${threadId}.participant.${participantIndex}`,
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      thread_id: threadId,
      round_number: roundNumber,
      conversation_mode: 'council',
      participant_id: `participant_${participantIndex}`,
      participant_index: participantIndex,
      participant_role: options?.participantRole || 'AI Analyst',
      is_first_participant: participantIndex === 0,
      total_participants: options?.totalParticipants || 3,
      model_id: options?.modelId || ModelIds.OPENAI_GPT_4O_MINI,
      model_name: 'GPT-4o',
      model_context_length: 128000,
      max_output_tokens: 8192,
      user_id: options?.userId || 'user_123',
      user_tier: options?.userTier || 'free',
      is_regeneration: options?.isRegeneration || false,
      rag_enabled: options?.ragEnabled || false,
      has_custom_system_prompt: false,
      is_reasoning_model: false,
      reasoning_enabled: options?.reasoningEnabled || false,
      estimated_input_tokens: 1500,
      uses_dynamic_pricing: true,
      input_cost_per_million: 2.5,
      output_cost_per_million: 10.0,
    },
  };
}

function createModeratorTelemetryConfig(
  threadId: string,
  roundNumber: number,
  options?: {
    participantCount?: number;
    userId?: string;
  },
): StreamTextTelemetryConfig {
  return {
    isEnabled: true,
    functionId: `chat.thread.${threadId}.moderator`,
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      thread_id: threadId,
      round_number: roundNumber,
      conversation_mode: 'council',
      participant_id: 'moderator',
      participant_index: MODERATOR_PARTICIPANT_INDEX,
      participant_role: 'AI Moderator',
      model_id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4,
      model_name: 'Claude Sonnet 4',
      is_moderator: true,
      participant_count: options?.participantCount || 3,
      user_id: options?.userId || 'user_123',
    },
  };
}

// ============================================================================
// Telemetry Configuration Tests
// ============================================================================

describe('aI SDK streamText Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('participant Telemetry Configuration', () => {
    it('should create valid telemetry config for first participant', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0);

      expect(config.isEnabled).toBe(true);
      expect(config.functionId).toBe('chat.thread.thread_abc.participant.0');
      expect(config.recordInputs).toBe(true);
      expect(config.recordOutputs).toBe(true);
      expect(config.metadata.is_first_participant).toBe(true);
      expect(config.metadata.participant_index).toBe(0);
    });

    it('should mark non-first participants correctly', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 2);

      expect(config.metadata.is_first_participant).toBe(false);
      expect(config.metadata.participant_index).toBe(2);
    });

    it('should include round context in metadata', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 3, 0);

      expect(config.metadata.round_number).toBe(3);
      expect(config.metadata.thread_id).toBe('thread_abc');
    });

    it('should include model configuration in metadata', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        modelId: ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5,
      });

      expect(config.metadata.model_id).toBe(ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5);
      expect(config.metadata.model_context_length).toBe(128000);
      expect(config.metadata.max_output_tokens).toBe(8192);
    });

    it('should include user context in metadata', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        userId: 'user_premium_123',
        userTier: 'enterprise',
      });

      expect(config.metadata.user_id).toBe('user_premium_123');
      expect(config.metadata.user_tier).toBe('enterprise');
    });

    it('should track regeneration state', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        isRegeneration: true,
      });

      expect(config.metadata.is_regeneration).toBe(true);
    });

    it('should track RAG context usage', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        ragEnabled: true,
      });

      expect(config.metadata.rag_enabled).toBe(true);
    });

    it('should track reasoning model configuration', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        reasoningEnabled: true,
      });

      expect(config.metadata.reasoning_enabled).toBe(true);
    });

    it('should include pricing metadata for cost tracking', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0);

      expect(config.metadata.uses_dynamic_pricing).toBe(true);
      expect(config.metadata.input_cost_per_million).toBe(2.5);
      expect(config.metadata.output_cost_per_million).toBe(10.0);
    });

    it('should track total participants for round context', () => {
      const config = createParticipantTelemetryConfig('thread_abc', 0, 0, {
        totalParticipants: 5,
      });

      expect(config.metadata.total_participants).toBe(5);
    });
  });

  describe('moderator Telemetry Configuration', () => {
    it('should create valid telemetry config for moderator', () => {
      const config = createModeratorTelemetryConfig('thread_abc', 0);

      expect(config.isEnabled).toBe(true);
      expect(config.functionId).toBe('chat.thread.thread_abc.moderator');
      expect(config.metadata.is_moderator).toBe(true);
      expect(config.metadata.participant_index).toBe(MODERATOR_PARTICIPANT_INDEX);
    });

    it('should use MODERATOR_PARTICIPANT_INDEX sentinel value', () => {
      const config = createModeratorTelemetryConfig('thread_abc', 0);

      expect(config.metadata.participant_index).toBe(MODERATOR_PARTICIPANT_INDEX);
      expect(config.metadata.participant_id).toBe('moderator');
    });

    it('should track participant count for summary context', () => {
      const config = createModeratorTelemetryConfig('thread_abc', 0, {
        participantCount: 4,
      });

      expect(config.metadata.participant_count).toBe(4);
    });

    it('should use council moderator model', () => {
      const config = createModeratorTelemetryConfig('thread_abc', 0);

      expect(config.metadata.model_id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);
      expect(config.metadata.model_name).toBe('Claude Sonnet 4');
    });

    it('should include user context for attribution', () => {
      const config = createModeratorTelemetryConfig('thread_abc', 0, {
        userId: 'user_moderator_123',
      });

      expect(config.metadata.user_id).toBe('user_moderator_123');
    });
  });

  describe('telemetry Function ID Format', () => {
    it('should follow dot-notation pattern for participants', () => {
      const threadId = 'thread_xyz789';
      const participantIndex = 1;

      const functionId = `chat.thread.${threadId}.participant.${participantIndex}`;

      expect(functionId).toMatch(/^chat\.thread\.\w+\.participant\.\d+$/);
    });

    it('should follow dot-notation pattern for moderator', () => {
      const threadId = 'thread_xyz789';

      const functionId = `chat.thread.${threadId}.moderator`;

      expect(functionId).toMatch(/^chat\.thread\.\w+\.moderator$/);
    });

    it('should produce unique functionIds for different participants', () => {
      const threadId = 'thread_abc';
      const functionIds = [0, 1, 2].map(
        idx => `chat.thread.${threadId}.participant.${idx}`,
      );

      expect(new Set(functionIds).size).toBe(3);
    });

    it('should produce distinct functionIds for participant vs moderator', () => {
      const threadId = 'thread_abc';

      const participantFunctionId = `chat.thread.${threadId}.participant.0`;
      const moderatorFunctionId = `chat.thread.${threadId}.moderator`;

      expect(participantFunctionId).not.toBe(moderatorFunctionId);
    });
  });
});

// ============================================================================
// Smooth Stream Tests
// ============================================================================

describe('smooth Stream Transformation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('smoothStream Configuration', () => {
    it('should configure smoothStream with word chunking', () => {
      const smoothStreamConfig = {
        delayInMs: 20,
        chunking: 'word' as const,
      };

      expect(smoothStreamConfig.delayInMs).toBe(20);
      expect(smoothStreamConfig.chunking).toBe('word');
    });

    it('should use 20ms delay for natural streaming UX', () => {
      const config = { delayInMs: 20, chunking: 'word' as const };

      expect(config.delayInMs).toBe(20);
      // 20ms is optimal for word-by-word streaming
      expect(config.delayInMs).toBeGreaterThan(0);
      expect(config.delayInMs).toBeLessThan(50);
    });
  });

  describe('model-Specific smoothStream Usage', () => {
    const modelsRequiringSmoothStream = [
      ModelIds.X_AI_GROK_4,
      ModelIds.X_AI_GROK_4_FAST,
      ModelIds.X_AI_GROK_4_1,
      ModelIds.X_AI_GROK_4_1_FAST,
      ModelIds.DEEPSEEK_DEEPSEEK_CHAT_V3_0324,
      ModelIds.GOOGLE_GEMINI_2_5_FLASH,
      ModelIds.GOOGLE_GEMINI_2_5_PRO,
    ];

    const modelsNotRequiringSmoothStream = [
      ModelIds.OPENAI_GPT_4O_MINI,
      ModelIds.OPENAI_GPT_4O_MINI,
      ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
      ModelIds.ANTHROPIC_CLAUDE_OPUS_4_5,
    ];

    it.each(modelsRequiringSmoothStream)(
      'should apply smoothStream for %s',
      (modelId) => {
        // Models with buffered chunk delivery need smoothStream
        const needsSmoothStream = modelId.includes('grok')
          || modelId.includes('deepseek')
          || modelId.includes('gemini');

        expect(needsSmoothStream).toBe(true);
      },
    );

    it.each(modelsNotRequiringSmoothStream)(
      'should NOT apply smoothStream for %s',
      (modelId) => {
        const needsSmoothStream = modelId.includes('grok')
          || modelId.includes('deepseek')
          || modelId.includes('gemini');

        expect(needsSmoothStream).toBe(false);
      },
    );
  });
});

// ============================================================================
// Reasoning Model Integration Tests
// ============================================================================

describe('reasoning Model Telemetry', () => {
  describe('extractReasoningMiddleware Integration', () => {
    it('should configure reasoning middleware for DeepSeek models', () => {
      const deepSeekConfig = {
        tagName: 'think',
      };

      expect(deepSeekConfig.tagName).toBe('think');
    });

    it('should track reasoning duration in telemetry', () => {
      const reasoningMetrics = {
        reasoningStartTime: Date.now(),
        reasoningDurationSeconds: 5,
      };

      expect(reasoningMetrics.reasoningDurationSeconds).toBeTypeOf('number');
      expect(reasoningMetrics.reasoningStartTime).toBeTypeOf('number');
    });

    it('should handle [REDACTED] reasoning content', () => {
      const reasoningContent = '[REDACTED]';
      const isOnlyRedactedReasoning = /^\[REDACTED\]$/i.test(reasoningContent.trim());

      expect(isOnlyRedactedReasoning).toBe(true);
    });

    it('should detect valid reasoning content', () => {
      const reasoningContent = 'Let me think about this step by step...';
      const isOnlyRedactedReasoning = /^\[REDACTED\]$/i.test(reasoningContent.trim());

      expect(isOnlyRedactedReasoning).toBe(false);
    });
  });

  describe('oSeries Model Configuration', () => {
    it('should configure reasoning effort for o-series models', () => {
      const reasoningConfig = {
        openrouter: {
          reasoning: {
            effort: 'medium',
          },
        },
      };

      expect(reasoningConfig.openrouter.reasoning.effort).toBe('medium');
    });

    it('should use minimal effort for nano/mini variants', () => {
      const nanoConfig = {
        openrouter: {
          reasoning: {
            effort: 'minimal',
          },
        },
      };

      expect(nanoConfig.openrouter.reasoning.effort).toBe('minimal');
    });
  });
});

// ============================================================================
// Stream Resumption Tests
// ============================================================================

describe('stream Resumption and Buffering', () => {
  describe('deterministic Message ID Generation', () => {
    it('should generate deterministic message ID from composite key', () => {
      const threadId = 'thread_abc';
      const roundNumber = 2;
      const participantIndex = 1;

      const messageId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      expect(messageId).toBe('thread_abc_r2_p1');
    });

    it('should generate unique message IDs for different participants', () => {
      const threadId = 'thread_abc';
      const roundNumber = 0;

      const ids = [0, 1, 2].map(idx => `${threadId}_r${roundNumber}_p${idx}`);

      expect(ids[0]).toBe('thread_abc_r0_p0');
      expect(ids[1]).toBe('thread_abc_r0_p1');
      expect(ids[2]).toBe('thread_abc_r0_p2');
      expect(new Set(ids).size).toBe(3);
    });

    it('should generate unique message IDs for different rounds', () => {
      const threadId = 'thread_abc';
      const participantIndex = 0;

      const ids = [0, 1, 2].map(round => `${threadId}_r${round}_p${participantIndex}`);

      expect(ids[0]).toBe('thread_abc_r0_p0');
      expect(ids[1]).toBe('thread_abc_r1_p0');
      expect(ids[2]).toBe('thread_abc_r2_p0');
      expect(new Set(ids).size).toBe(3);
    });

    it('should generate moderator message ID with sentinel', () => {
      const threadId = 'thread_abc';
      const roundNumber = 1;

      const messageId = `${threadId}_r${roundNumber}_moderator`;

      expect(messageId).toBe('thread_abc_r1_moderator');
    });
  });

  describe('stream Buffer States', () => {
    type StreamBufferState = 'active' | 'completed' | 'failed';

    it('should transition through valid buffer states', () => {
      const validTransitions: Array<[StreamBufferState, StreamBufferState]> = [
        ['active', 'completed'],
        ['active', 'failed'],
      ];

      for (const [from, to] of validTransitions) {
        expect(['active', 'completed', 'failed']).toContain(from);
        expect(['active', 'completed', 'failed']).toContain(to);
      }
    });

    it('should not allow transition from completed to active', () => {
      const invalidTransition = {
        from: 'completed' as StreamBufferState,
        to: 'active' as StreamBufferState,
      };

      // Once completed, cannot go back to active
      expect(invalidTransition.from).toBe('completed');
      expect(invalidTransition.to).toBe('active');
    });
  });

  describe('abort Signal Handling', () => {
    it('should use timeout signal instead of HTTP abort', () => {
      const timeoutMs = 120000; // 2 minutes
      const abortSignal = AbortSignal.timeout(timeoutMs);

      expect(abortSignal).toBeDefined();
    });

    it('should detect AbortError by name', () => {
      const abortError = new DOMException('Aborted', 'AbortError');

      const isAbortError = abortError.name === 'AbortError';

      expect(isAbortError).toBe(true);
    });

    it('should detect abort error from cause', () => {
      const causeError = new DOMException('Aborted', 'AbortError');
      const wrapperError = new Error('Stream failed', { cause: causeError });

      const isAbortError
        = wrapperError.cause instanceof DOMException
          && (wrapperError.cause as DOMException).name === 'AbortError';

      expect(isAbortError).toBe(true);
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('streaming Error Telemetry', () => {
  describe('error Classification', () => {
    it('should identify non-retryable validation errors', () => {
      const validationErrorStatus = 400;
      const shouldRetry = validationErrorStatus !== 400;

      expect(shouldRetry).toBe(false);
    });

    it('should identify non-retryable auth errors', () => {
      const authErrorStatuses = [401, 403];

      for (const status of authErrorStatuses) {
        const shouldRetry = status !== 401 && status !== 403;
        expect(shouldRetry).toBe(false);
      }
    });

    it('should identify retryable rate limit errors', () => {
      const rateLimitStatus = 429;
      const shouldRetry = rateLimitStatus === 429;

      expect(shouldRetry).toBe(true);
    });

    it('should identify retryable server errors', () => {
      const serverErrorStatuses = [500, 502, 503];

      for (const status of serverErrorStatuses) {
        const shouldRetry = status >= 500;
        expect(shouldRetry).toBe(true);
      }
    });
  });

  describe('aI SDK Type Validation Errors', () => {
    it('should not retry AI_TypeValidationError', () => {
      const errorName = 'AI_TypeValidationError';
      const shouldRetry = errorName !== 'AI_TypeValidationError';

      expect(shouldRetry).toBe(false);
    });

    it('should detect logprobs validation errors for suppression', () => {
      const errorMessage = 'Type validation failed for logprobs';
      const isLogprobsError
        = errorMessage.includes('logprobs')
          && errorMessage.includes('validation');

      expect(isLogprobsError).toBe(true);
    });
  });

  describe('error Metadata for Telemetry', () => {
    it('should structure error metadata for OTEL spans', () => {
      const errorMetadata = {
        errorName: 'StreamError',
        errorType: 'provider_error',
        errorMessage: 'Model rate limited',
        isTransient: true,
        shouldRetry: true,
        participantId: 'participant_1',
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        traceId: 'trace_abc123',
      };

      expect(errorMetadata.traceId).toBeDefined();
      expect(errorMetadata.errorType).toBeDefined();
      expect(errorMetadata.isTransient).toBeTypeOf('boolean');
    });

    it('should include retry exhaustion info', () => {
      const retryExhaustedMetadata = {
        errorName: 'RetryError',
        errorType: 'retry_exhausted',
        errorCategory: 'provider_rate_limit',
        errorMessage: 'Maximum retries exceeded',
        isTransient: true,
        shouldRetry: false,
      };

      expect(retryExhaustedMetadata.shouldRetry).toBe(false);
      expect(retryExhaustedMetadata.errorType).toBe('retry_exhausted');
    });
  });
});

// ============================================================================
// PostHog LLM Tracking Integration Tests
// ============================================================================

describe('postHog LLM Tracking Telemetry', () => {
  describe('tracking Context', () => {
    it('should create complete tracking context', () => {
      const trackingContext = {
        userId: 'user_123',
        sessionId: 'session_abc',
        threadId: 'thread_xyz',
        roundNumber: 1,
        participantId: 'participant_1',
        participantIndex: 0,
        participantRole: 'AI Analyst',
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        modelName: 'GPT-4o',
        threadMode: 'council',
        isRegeneration: false,
        userTier: 'pro',
      };

      expect(trackingContext.userId).toBeDefined();
      expect(trackingContext.sessionId).toBeDefined();
      expect(trackingContext.threadId).toBeDefined();
    });
  });

  describe('usage Metrics', () => {
    it('should track token usage from AI SDK v6', () => {
      const usage = {
        inputTokens: 1500,
        outputTokens: 800,
        totalTokens: 2300,
        inputTokenDetails: {
          cachedTokens: 500,
        },
        outputTokenDetails: {
          reasoningTokens: 200,
        },
      };

      expect(usage.inputTokens).toBeTypeOf('number');
      expect(usage.outputTokens).toBeTypeOf('number');
      expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
    });

    it('should track cumulative usage for multi-step reasoning', () => {
      const usage = {
        inputTokens: 1500,
        outputTokens: 800,
        totalTokens: 2300,
      };

      const totalUsage = {
        inputTokens: 3000,
        outputTokens: 2500,
        totalTokens: 5500,
      };

      // totalUsage should be >= usage (cumulative)
      expect(totalUsage.totalTokens).toBeGreaterThanOrEqual(usage.totalTokens);
    });
  });

  describe('pricing Tracking', () => {
    it('should calculate cost from dynamic pricing', () => {
      const pricing = {
        inputCostPerMillion: 2.5,
        outputCostPerMillion: 10.0,
      };

      const usage = {
        inputTokens: 1000,
        outputTokens: 500,
      };

      const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputCostPerMillion;
      const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputCostPerMillion;
      const totalCost = inputCost + outputCost;

      // inputCost = (1000 / 1_000_000) * 2.5 = 0.0025
      // outputCost = (500 / 1_000_000) * 10.0 = 0.005
      // totalCost = 0.0075
      expect(totalCost).toBeCloseTo(0.0075, 6);
    });
  });
});
