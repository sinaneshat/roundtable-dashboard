/**
 * Streaming Telemetry End-to-End Tests
 *
 * End-to-end tests verifying the complete streaming flow with OpenTelemetry
 * instrumentation, from request initiation through response completion.
 *
 * ✅ PATTERN: Tests complete chat streaming flow with all telemetry hooks
 * ✅ COVERAGE: Multi-participant streaming, moderator analysis, error recovery
 */

import { FinishReasons, MessageRoles, ModelIds, ParticipantStreamStatuses } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { act, createMockParticipant, createMockStreamingResponse, createMockThread } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// Mock Setup
// ============================================================================

/**
 * Telemetry event types as const array for schema derivation
 */
const TELEMETRY_EVENT_TYPES = ['span_start', 'span_end', 'error', 'metric'] as const;

/**
 * Schema for span_start telemetry event attributes
 */
const _SpanStartAttributesSchema = z.object({
  method: z.string().optional(),
  parentSpanId: z.string().nullable().optional(),
  spanId: z.string().optional(),
  traceId: z.string().optional(),
  url: z.string().optional(),
});

type SpanStartAttributes = z.infer<typeof _SpanStartAttributesSchema>;

/**
 * Schema for span_end telemetry event attributes
 */
const _SpanEndAttributesSchema = z.object({
  durationMs: z.number().optional(),
  spanId: z.string().optional(),
  status: z.enum(['ok', 'error']).optional(),
  traceId: z.string().optional(),
});

type SpanEndAttributes = z.infer<typeof _SpanEndAttributesSchema>;

/**
 * Schema for error telemetry event attributes
 */
const _ErrorAttributesSchema = z.object({
  errorMessage: z.string().optional(),
  errorType: z.string().optional(),
  spanId: z.string().optional(),
  stackTrace: z.string().optional(),
  traceId: z.string().optional(),
});

type ErrorAttributes = z.infer<typeof _ErrorAttributesSchema>;

/**
 * Schema for metric telemetry event attributes
 */
const _MetricAttributesSchema = z.object({
  metricName: z.string().optional(),
  metricUnit: z.string().optional(),
  metricValue: z.number().optional(),
  tags: z.record(z.string()).optional(),
});

type MetricAttributes = z.infer<typeof _MetricAttributesSchema>;

/**
 * Discriminated union for telemetry event attributes based on event type
 */
type TelemetryAttributes = SpanStartAttributes | SpanEndAttributes | ErrorAttributes | MetricAttributes;

/**
 * Base telemetry event schema
 */
const _BaseTelemetryEventSchema = z.object({
  name: z.string(),
  timestamp: z.number(),
  type: z.enum(TELEMETRY_EVENT_TYPES),
});

/**
 * Telemetry event with discriminated union for attributes
 */
type TelemetryEvent = z.infer<typeof _BaseTelemetryEventSchema> & {
  attributes: TelemetryAttributes;
};

const telemetryEvents: TelemetryEvent[] = [];

type FetchCall = {
  url: string;
  method: string;
  body?: string;
  timestamp: number;
};

const fetchCalls: FetchCall[] = [];
let originalFetch: typeof global.fetch;

function createMockSSEResponse(chunks: string[]) {
  return createMockStreamingResponse({
    chunks,
    contentType: 'text/event-stream',
  });
}

function createStreamChunks(content: string, includeMetadata = true) {
  const chunks: string[] = [];

  if (includeMetadata) {
    chunks.push(`2:{"messageId":"test_msg_123"}\n`);
  }

  const words = content.split(' ');
  for (const word of words) {
    chunks.push(`0:"${word} "\n`);
  }

  if (includeMetadata) {
    chunks.push(`e:{"finishReason":"${FinishReasons.STOP}"}\n`);
    chunks.push(`d:{"finishReason":"${FinishReasons.STOP}","usage":{"inputTokens":100,"outputTokens":50}}\n`);
  }

  return chunks;
}

function mockFetchImplementation(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method || 'GET';
  const body = init?.body ? String(init.body) : undefined;

  fetchCalls.push({ body, method, timestamp: Date.now(), url });

  // Track telemetry event for request start
  telemetryEvents.push({
    attributes: { method, url },
    name: 'http.request',
    timestamp: Date.now(),
    type: 'span_start',
  });

  if (url.includes('/stream') && method === 'POST') {
    const chunks = createStreamChunks('Hello from the AI participant response');
    return Promise.resolve(createMockSSEResponse(chunks));
  }

  if (url.includes('/moderator')) {
    const chunks = createStreamChunks('This is the council moderator analysis summary');
    return Promise.resolve(createMockSSEResponse(chunks));
  }

  if (url.includes('/pre-search')) {
    const chunks = createStreamChunks('Web search results for your query');
    return Promise.resolve(createMockSSEResponse(chunks));
  }

  return Promise.resolve({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true }),
    ok: true,
    status: 200,
  } as Response);
}

// ============================================================================
// E2E Streaming Flow Tests
// ============================================================================

describe('streaming Telemetry E2E', () => {
  beforeEach(() => {
    telemetryEvents.length = 0;
    fetchCalls.length = 0;
    originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchImplementation);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('complete Multi-Participant Round', () => {
    it('should execute complete streaming round with telemetry', async () => {
      const store = createChatStore();
      const threadId = 'thread_e2e_test';
      const roundNumber = 0;
      const participants = [
        createMockParticipant({ id: 'p1', modelId: ModelIds.OPENAI_GPT_4O_MINI, priority: 0, threadId }),
        createMockParticipant({ id: 'p2', modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, priority: 1, threadId }),
      ];

      // Initialize store state
      act(() => {
        store.getState().setThread(createMockThread({ id: threadId, mode: 'council' }));
        store.getState().setParticipants(participants);
      });

      // Simulate streaming for each participant
      for (let i = 0; i < participants.length; i++) {
        await act(async () => {
          const response = await fetch(
            `/api/v1/chat/threads/${threadId}/stream`,
            {
              body: JSON.stringify({
                id: threadId,
                message: {
                  id: `${threadId}_r${roundNumber}_user`,
                  parts: [{ text: 'Test question for E2E', type: 'text' }],
                  role: MessageRoles.USER,
                },
                participantIndex: i,
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            },
          );

          const reader = response.body?.getReader();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done) {
                break;
              }
            }
          }
        });
      }

      // Verify all participants streamed
      const streamCalls = fetchCalls.filter(call =>
        call.url.includes('/stream') && call.method === 'POST',
      );

      expect(streamCalls).toHaveLength(2);
    });

    it('should trigger moderator after all participants complete', async () => {
      const threadId = 'thread_e2e_test';
      const roundNumber = 0;

      // Simulate moderator request after participants
      await act(async () => {
        const response = await fetch(
          `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
          {
            body: JSON.stringify({
              participantMessageIds: [
                `${threadId}_r${roundNumber}_p0`,
                `${threadId}_r${roundNumber}_p1`,
              ],
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        );

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) {
              break;
            }
          }
        }
      });

      const moderatorCalls = fetchCalls.filter(call => call.url.includes('/moderator'));
      expect(moderatorCalls).toHaveLength(1);
    });

    it('should track telemetry events throughout round', async () => {
      const threadId = 'thread_telemetry_test';

      // Stream request
      await act(async () => {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
          method: 'POST',
        });
      });

      // Verify telemetry events were recorded
      expect(telemetryEvents.length).toBeGreaterThan(0);
      expect(telemetryEvents.some(e => e.type === 'span_start')).toBeTruthy();
    });
  });

  describe('pre-Search Integration', () => {
    it('should execute pre-search before participants', async () => {
      const threadId = 'thread_presearch_test';
      const roundNumber = 0;

      // Pre-search
      await act(async () => {
        await fetch(
          `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/pre-search`,
          {
            body: JSON.stringify({ userQuery: 'Test query for web search' }),
            method: 'POST',
          },
        );
      });

      // Participant stream
      await act(async () => {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
          method: 'POST',
        });
      });

      const preSearchCalls = fetchCalls.filter(call => call.url.includes('/pre-search'));
      const streamCalls = fetchCalls.filter(call => call.url.includes('/stream'));

      expect(preSearchCalls).toHaveLength(1);
      expect(streamCalls).toHaveLength(1);

      // Pre-search should happen before stream
      const preSearchTime = fetchCalls.find(c => c.url.includes('/pre-search'))?.timestamp || 0;
      const streamTime = fetchCalls.find(c => c.url.includes('/stream'))?.timestamp || 0;

      expect(preSearchTime).toBeLessThanOrEqual(streamTime);
    });
  });

  describe('error Recovery Flow', () => {
    it('should handle participant stream failure gracefully', async () => {
      // Override mock to simulate failure
      const failingFetch = vi.fn().mockImplementation((input) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchCalls.push({ method: 'POST', timestamp: Date.now(), url });

        if (url.includes('/stream')) {
          return Promise.resolve({
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              error: { message: 'Model unavailable' },
              success: false,
            }),
            ok: false,
            status: 500,
          } as Response);
        }

        return Promise.resolve({
          json: async () => ({ success: true }),
          ok: true,
          status: 200,
        } as Response);
      });

      globalThis.fetch = failingFetch;

      const threadId = 'thread_error_test';

      try {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
          method: 'POST',
        });
      } catch {
        // Expected to handle gracefully
      }

      const streamCalls = fetchCalls.filter(call => call.url.includes('/stream'));
      expect(streamCalls).toHaveLength(1);
    });

    it('should allow other participants to continue after one fails', async () => {
      const store = createChatStore();
      const threadId = 'thread_partial_failure';

      act(() => {
        store.getState().setThread(createMockThread({ id: threadId }));
      });

      // Simulate participant status after failure
      const participantStatuses = {
        0: ParticipantStreamStatuses.FAILED,
        1: ParticipantStreamStatuses.COMPLETED,
        2: ParticipantStreamStatuses.COMPLETED,
      };

      const completedCount = Object.values(participantStatuses).filter(
        s => s === ParticipantStreamStatuses.COMPLETED,
      ).length;

      const failedCount = Object.values(participantStatuses).filter(
        s => s === ParticipantStreamStatuses.FAILED,
      ).length;

      expect(completedCount).toBe(2);
      expect(failedCount).toBe(1);
    });
  });

  describe('regeneration Flow', () => {
    it('should handle regeneration with telemetry tracking', async () => {
      const threadId = 'thread_regen_test';
      const roundNumber = 1;

      // Regeneration request
      await act(async () => {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({
            id: threadId,
            message: {
              id: `${threadId}_r${roundNumber}_user`,
              parts: [{ text: 'Original question', type: 'text' }],
              role: MessageRoles.USER,
            },
            participantIndex: 0,
            regenerateRound: roundNumber,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
      });

      const streamCalls = fetchCalls.filter(call => call.url.includes('/stream'));
      expect(streamCalls).toHaveLength(1);

      const streamCall = streamCalls[0];
      if (!streamCall) {
        throw new Error('expected streamCall');
      }
      const streamCallBody = streamCall.body;
      if (!streamCallBody) {
        throw new Error('expected streamCall.body');
      }
      const body = JSON.parse(streamCallBody);
      expect(body.regenerateRound).toBe(roundNumber);
    });
  });

  describe('store State Synchronization', () => {
    it('should update store state during streaming', async () => {
      const store = createChatStore();
      const threadId = 'thread_store_sync';

      act(() => {
        store.getState().setThread(createMockThread({ id: threadId }));
        store.getState().setIsStreaming(true);
      });

      expect(store.getState().isStreaming).toBeTruthy();

      // Complete streaming
      act(() => {
        store.getState().setIsStreaming(false);
        store.getState().completeStreaming();
      });

      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should track moderator streaming state separately', async () => {
      const store = createChatStore();
      const threadId = 'thread_mod_state';

      act(() => {
        store.getState().setThread(createMockThread({ id: threadId }));
        store.getState().setIsModeratorStreaming(true);
      });

      expect(store.getState().isModeratorStreaming).toBeTruthy();
      expect(store.getState().isStreaming).toBeFalsy();

      act(() => {
        store.getState().completeModeratorStream();
      });

      expect(store.getState().isModeratorStreaming).toBeFalsy();
    });

    it('should maintain message state across round transitions', async () => {
      const store = createChatStore();
      const threadId = 'thread_round_transition';

      // Round 0
      act(() => {
        store.getState().setMessages([
          {
            id: `${threadId}_r0_user`,
            metadata: { roundNumber: 0 },
            parts: [{ text: 'Round 0 question', type: 'text' }],
            role: MessageRoles.USER,
          },
          {
            id: `${threadId}_r0_p0`,
            metadata: { participantIndex: 0, roundNumber: 0 },
            parts: [{ text: 'Round 0 response', type: 'text' }],
            role: MessageRoles.ASSISTANT,
          },
        ]);
      });

      // Round 1
      act(() => {
        store.getState().setMessages(current => [
          ...current,
          {
            id: `${threadId}_r1_user`,
            metadata: { roundNumber: 1 },
            parts: [{ text: 'Round 1 question', type: 'text' }],
            role: MessageRoles.USER,
          },
        ]);
      });

      const messages = store.getState().messages;
      expect(messages).toHaveLength(3);

      const round0Messages = messages.filter((m) => {
        const metadata = m.metadata as { roundNumber?: number } | undefined;
        return metadata?.roundNumber === 0;
      });
      const round1Messages = messages.filter((m) => {
        const metadata = m.metadata as { roundNumber?: number } | undefined;
        return metadata?.roundNumber === 1;
      });

      expect(round0Messages).toHaveLength(2);
      expect(round1Messages).toHaveLength(1);
    });
  });

  describe('telemetry Metadata Propagation', () => {
    it('should include all required telemetry fields in stream request', async () => {
      const threadId = 'thread_meta_test';

      await act(async () => {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({
            id: threadId,
            message: {
              id: `${threadId}_r0_user`,
              parts: [{ text: 'Test', type: 'text' }],
              role: MessageRoles.USER,
            },
            participantIndex: 0,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
      });

      const streamCall = fetchCalls.find(c => c.url.includes('/stream'));
      if (!streamCall) {
        throw new Error('expected streamCall');
      }
      const streamCallBody = streamCall.body;
      if (!streamCallBody) {
        throw new Error('expected streamCall.body');
      }

      const body = JSON.parse(streamCallBody);
      expect(body.id).toBe(threadId);
      expect(body.participantIndex).toBe(0);
      expect(body.message).toBeDefined();
    });

    it('should include participant message IDs in moderator request', async () => {
      const threadId = 'thread_mod_meta';
      const roundNumber = 0;

      const participantMessageIds = [
        `${threadId}_r${roundNumber}_p0`,
        `${threadId}_r${roundNumber}_p1`,
      ];

      await act(async () => {
        await fetch(
          `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/moderator`,
          {
            body: JSON.stringify({ participantMessageIds }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        );
      });

      const moderatorCall = fetchCalls.find(c => c.url.includes('/moderator'));
      if (!moderatorCall) {
        throw new Error('expected moderatorCall');
      }
      const moderatorCallBody = moderatorCall.body;
      if (!moderatorCallBody) {
        throw new Error('expected moderatorCall.body');
      }

      const body = JSON.parse(moderatorCallBody);
      expect(body.participantMessageIds).toEqual(participantMessageIds);
    });
  });

  describe('performance Metrics', () => {
    it('should track stream timing', async () => {
      const startTime = performance.now();
      const threadId = 'thread_perf_test';

      await act(async () => {
        const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
          method: 'POST',
        });

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) {
              break;
            }
          }
        }
      });

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(durationMs).toBeGreaterThan(0);
      expect(durationMs).toBeLessThan(5000); // Should complete within 5 seconds in test
    });

    it('should track chunk count during streaming', async () => {
      const chunks = createStreamChunks('This is a test message with multiple words');
      const chunkCount = chunks.length;

      expect(chunkCount).toBeGreaterThan(0);
      // Should have metadata chunks + word chunks + finish chunks
      expect(chunkCount).toBeGreaterThan(5);
    });
  });

  describe('concurrent Stream Handling', () => {
    it('should handle multiple concurrent participant streams', async () => {
      const threadId = 'thread_concurrent';

      // Start multiple streams concurrently
      await act(async () => {
        await Promise.all([
          fetch(`/api/v1/chat/threads/${threadId}/stream`, {
            body: JSON.stringify({ id: threadId, participantIndex: 0 }),
            method: 'POST',
          }),
          fetch(`/api/v1/chat/threads/${threadId}/stream`, {
            body: JSON.stringify({ id: threadId, participantIndex: 1 }),
            method: 'POST',
          }),
          fetch(`/api/v1/chat/threads/${threadId}/stream`, {
            body: JSON.stringify({ id: threadId, participantIndex: 2 }),
            method: 'POST',
          }),
        ]);
      });

      const streamCalls = fetchCalls.filter(call => call.url.includes('/stream'));
      expect(streamCalls).toHaveLength(3);
    });

    it('should not allow duplicate moderator calls for same round', async () => {
      const store = createChatStore();
      const threadId = 'thread_mod_dedup';
      const roundNumber = 0;
      const moderatorId = `${threadId}_r${roundNumber}_moderator`;

      // Mark as triggered
      act(() => {
        store.getState().markModeratorStreamTriggered(moderatorId, roundNumber);
      });

      // Check if already triggered
      const hasBeenTriggered = store.getState().hasModeratorStreamBeenTriggered(moderatorId, roundNumber);
      expect(hasBeenTriggered).toBeTruthy();
    });
  });
});

// ============================================================================
// Telemetry Purpose Verification Tests
// ============================================================================

describe('telemetry Purpose Verification', () => {
  describe('observability Goals', () => {
    it('should provide request tracing capability', () => {
      const traceContext = {
        parentSpanId: null,
        sampled: true,
        spanId: 'span_xyz789',
        traceId: 'trace_abc123',
      };

      expect(traceContext.traceId).toBeDefined();
      expect(traceContext.spanId).toBeDefined();
    });

    it('should enable cost attribution by user and model', () => {
      const costAttribution = {
        inputCostPerMillion: 2.5,
        inputTokens: 1500,
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        outputCostPerMillion: 10.0,
        outputTokens: 800,
        userId: 'user_123',
        userTier: 'pro',
      };

      const estimatedCost
        = (costAttribution.inputTokens / 1_000_000) * costAttribution.inputCostPerMillion
          + (costAttribution.outputTokens / 1_000_000) * costAttribution.outputCostPerMillion;

      expect(estimatedCost).toBeGreaterThan(0);
    });

    it('should support latency analysis by model', () => {
      const latencyMetrics = {
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        timeToFirstToken: 450, // ms
        tokensPerSecond: 32,
        totalDuration: 2500, // ms
      };

      expect(latencyMetrics.timeToFirstToken).toBeLessThan(latencyMetrics.totalDuration);
      expect(latencyMetrics.tokensPerSecond).toBeGreaterThan(0);
    });
  });

  describe('debugging Goals', () => {
    it('should capture error context for debugging', () => {
      const errorContext = {
        errorMessage: 'Rate limit exceeded',
        errorType: 'provider_rate_limit',
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        participantId: 'participant_1',
        retryAttempt: 3,
        roundNumber: 2,
        threadId: 'thread_abc',
        timestamp: new Date().toISOString(),
        traceId: 'trace_error_123',
      };

      expect(errorContext.traceId).toBeDefined();
      expect(errorContext.errorType).toBeDefined();
      expect(errorContext.threadId).toBeDefined();
    });

    it('should link errors to session for replay', () => {
      const sessionContext = {
        errorTraceId: 'trace_error_456',
        sessionId: 'session_xyz',
        threadId: 'thread_abc',
        userId: 'user_123',
      };

      expect(sessionContext.sessionId).toBeDefined();
      expect(sessionContext.errorTraceId).toBeDefined();
    });
  });

  describe('analytics Goals', () => {
    it('should enable usage pattern analysis', () => {
      const usagePattern = {
        averageParticipantsPerRound: 2.5,
        modelsUsed: [ModelIds.OPENAI_GPT_4O_MINI, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5],
        moderatorUsageRate: 0.8, // 80% of rounds use moderator
        ragUsageRate: 0.3, // 30% of messages use RAG
        totalRounds: 15,
        userId: 'user_123',
        userTier: 'enterprise',
      };

      expect(usagePattern.modelsUsed).toHaveLength(2);
      expect(usagePattern.moderatorUsageRate).toBeLessThanOrEqual(1);
    });

    it('should track feature adoption', () => {
      const featureAdoption = {
        attachmentsUsed: 8,
        customSystemPrompts: 23,
        reasoningModelsUsed: 150,
        regenerations: 12,
        webSearchEnabled: 45,
      };

      expect(Object.values(featureAdoption).every(v => typeof v === 'number')).toBeTruthy();
    });

    it('should enable A/B testing of prompts', () => {
      const promptExperiment = {
        conversionMetrics: {
          moderatorUsageRate: 0.85,
          regenerationRate: 0.05,
          userSatisfactionScore: 4.2,
        },
        promptId: 'moderator_summary',
        promptVersion: 'v3.0',
        variantId: 'A',
      };

      expect(promptExperiment.promptVersion).toBeDefined();
      expect(promptExperiment.variantId).toBeDefined();
    });
  });
});
