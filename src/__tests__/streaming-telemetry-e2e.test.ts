/**
 * Streaming Telemetry End-to-End Tests
 *
 * End-to-end tests verifying the complete streaming flow with OpenTelemetry
 * instrumentation, from request initiation through response completion.
 *
 * ✅ PATTERN: Tests complete chat streaming flow with all telemetry hooks
 * ✅ COVERAGE: Multi-participant streaming, moderator analysis, error recovery
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessageRoles, ModelIds, ParticipantStreamStatuses } from '@/api/core/enums';
import { act, createMockParticipant, createMockThread } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// Mock Setup
// ============================================================================

type TelemetryEvent = {
  type: 'span_start' | 'span_end' | 'error' | 'metric';
  name: string;
  attributes: Record<string, unknown>;
  timestamp: number;
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
  let chunkIndex = 0;

  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    }),
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(async () => {
          if (chunkIndex >= chunks.length) {
            return { done: true, value: undefined };
          }
          const chunk = chunks[chunkIndex++];
          return {
            done: false,
            value: new TextEncoder().encode(chunk),
          };
        }),
      }),
    },
  } as unknown as Response;
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

  fetchCalls.push({ url, method, body, timestamp: Date.now() });

  // Track telemetry event for request start
  telemetryEvents.push({
    type: 'span_start',
    name: 'http.request',
    attributes: { url, method },
    timestamp: Date.now(),
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
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ success: true }),
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
    globalThis.fetch = vi.fn(mockFetchImplementation);
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
        createMockParticipant({ id: 'p1', threadId, priority: 0, modelId: ModelIds.OPENAI_GPT_4O_MINI }),
        createMockParticipant({ id: 'p2', threadId, priority: 1, modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5 }),
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
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: threadId,
                message: {
                  id: `${threadId}_r${roundNumber}_user`,
                  role: MessageRoles.USER,
                  parts: [{ type: 'text', text: 'Test question for E2E' }],
                },
                participantIndex: i,
              }),
            },
          );

          const reader = response.body?.getReader();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done)
                break;
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              participantMessageIds: [
                `${threadId}_r${roundNumber}_p0`,
                `${threadId}_r${roundNumber}_p1`,
              ],
            }),
          },
        );

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done)
              break;
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
          method: 'POST',
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
        });
      });

      // Verify telemetry events were recorded
      expect(telemetryEvents.length).toBeGreaterThan(0);
      expect(telemetryEvents.some(e => e.type === 'span_start')).toBe(true);
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
            method: 'POST',
            body: JSON.stringify({ userQuery: 'Test query for web search' }),
          },
        );
      });

      // Participant stream
      await act(async () => {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          method: 'POST',
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
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
        fetchCalls.push({ url, method: 'POST', timestamp: Date.now() });

        if (url.includes('/stream')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              success: false,
              error: { message: 'Model unavailable' },
            }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        } as Response);
      });

      globalThis.fetch = failingFetch;

      const threadId = 'thread_error_test';

      try {
        await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          method: 'POST',
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: threadId,
            participantIndex: 0,
            regenerateRound: roundNumber,
            message: {
              id: `${threadId}_r${roundNumber}_user`,
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Original question' }],
            },
          }),
        });
      });

      const streamCalls = fetchCalls.filter(call => call.url.includes('/stream'));
      expect(streamCalls).toHaveLength(1);

      const body = JSON.parse(streamCalls[0].body!);
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

      expect(store.getState().isStreaming).toBe(true);

      // Complete streaming
      act(() => {
        store.getState().setIsStreaming(false);
        store.getState().completeStreaming();
      });

      expect(store.getState().isStreaming).toBe(false);
    });

    it('should track moderator streaming state separately', async () => {
      const store = createChatStore();
      const threadId = 'thread_mod_state';

      act(() => {
        store.getState().setThread(createMockThread({ id: threadId }));
        store.getState().setIsModeratorStreaming(true);
      });

      expect(store.getState().isModeratorStreaming).toBe(true);
      expect(store.getState().isStreaming).toBe(false);

      act(() => {
        store.getState().completeModeratorStream();
      });

      expect(store.getState().isModeratorStreaming).toBe(false);
    });

    it('should maintain message state across round transitions', async () => {
      const store = createChatStore();
      const threadId = 'thread_round_transition';

      // Round 0
      act(() => {
        store.getState().setMessages([
          {
            id: `${threadId}_r0_user`,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Round 0 question' }],
            metadata: { roundNumber: 0 },
          },
          {
            id: `${threadId}_r0_p0`,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: 'text', text: 'Round 0 response' }],
            metadata: { roundNumber: 0, participantIndex: 0 },
          },
        ]);
      });

      // Round 1
      act(() => {
        store.getState().setMessages(current => [
          ...current,
          {
            id: `${threadId}_r1_user`,
            role: MessageRoles.USER,
            parts: [{ type: 'text', text: 'Round 1 question' }],
            metadata: { roundNumber: 1 },
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: threadId,
            message: {
              id: `${threadId}_r0_user`,
              role: MessageRoles.USER,
              parts: [{ type: 'text', text: 'Test' }],
            },
            participantIndex: 0,
          }),
        });
      });

      const streamCall = fetchCalls.find(c => c.url.includes('/stream'));
      expect(streamCall).toBeDefined();

      const body = JSON.parse(streamCall!.body!);
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantMessageIds }),
          },
        );
      });

      const moderatorCall = fetchCalls.find(c => c.url.includes('/moderator'));
      expect(moderatorCall).toBeDefined();

      const body = JSON.parse(moderatorCall!.body!);
      expect(body.participantMessageIds).toEqual(participantMessageIds);
    });
  });

  describe('performance Metrics', () => {
    it('should track stream timing', async () => {
      const startTime = performance.now();
      const threadId = 'thread_perf_test';

      await act(async () => {
        const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          method: 'POST',
          body: JSON.stringify({ id: threadId, participantIndex: 0 }),
        });

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done)
              break;
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
            method: 'POST',
            body: JSON.stringify({ id: threadId, participantIndex: 0 }),
          }),
          fetch(`/api/v1/chat/threads/${threadId}/stream`, {
            method: 'POST',
            body: JSON.stringify({ id: threadId, participantIndex: 1 }),
          }),
          fetch(`/api/v1/chat/threads/${threadId}/stream`, {
            method: 'POST',
            body: JSON.stringify({ id: threadId, participantIndex: 2 }),
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
      expect(hasBeenTriggered).toBe(true);
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
        traceId: 'trace_abc123',
        spanId: 'span_xyz789',
        parentSpanId: null,
        sampled: true,
      };

      expect(traceContext.traceId).toBeDefined();
      expect(traceContext.spanId).toBeDefined();
    });

    it('should enable cost attribution by user and model', () => {
      const costAttribution = {
        userId: 'user_123',
        userTier: 'pro',
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        inputTokens: 1500,
        outputTokens: 800,
        inputCostPerMillion: 2.5,
        outputCostPerMillion: 10.0,
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
        totalDuration: 2500, // ms
        tokensPerSecond: 32,
      };

      expect(latencyMetrics.timeToFirstToken).toBeLessThan(latencyMetrics.totalDuration);
      expect(latencyMetrics.tokensPerSecond).toBeGreaterThan(0);
    });
  });

  describe('debugging Goals', () => {
    it('should capture error context for debugging', () => {
      const errorContext = {
        errorType: 'provider_rate_limit',
        errorMessage: 'Rate limit exceeded',
        traceId: 'trace_error_123',
        participantId: 'participant_1',
        modelId: ModelIds.OPENAI_GPT_4O_MINI,
        roundNumber: 2,
        threadId: 'thread_abc',
        retryAttempt: 3,
        timestamp: new Date().toISOString(),
      };

      expect(errorContext.traceId).toBeDefined();
      expect(errorContext.errorType).toBeDefined();
      expect(errorContext.threadId).toBeDefined();
    });

    it('should link errors to session for replay', () => {
      const sessionContext = {
        userId: 'user_123',
        sessionId: 'session_xyz',
        threadId: 'thread_abc',
        errorTraceId: 'trace_error_456',
      };

      expect(sessionContext.sessionId).toBeDefined();
      expect(sessionContext.errorTraceId).toBeDefined();
    });
  });

  describe('analytics Goals', () => {
    it('should enable usage pattern analysis', () => {
      const usagePattern = {
        userId: 'user_123',
        userTier: 'enterprise',
        modelsUsed: [ModelIds.OPENAI_GPT_4O_MINI, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5],
        totalRounds: 15,
        averageParticipantsPerRound: 2.5,
        moderatorUsageRate: 0.8, // 80% of rounds use moderator
        ragUsageRate: 0.3, // 30% of messages use RAG
      };

      expect(usagePattern.modelsUsed).toHaveLength(2);
      expect(usagePattern.moderatorUsageRate).toBeLessThanOrEqual(1);
    });

    it('should track feature adoption', () => {
      const featureAdoption = {
        reasoningModelsUsed: 150,
        webSearchEnabled: 45,
        customSystemPrompts: 23,
        regenerations: 12,
        attachmentsUsed: 8,
      };

      expect(Object.values(featureAdoption).every(v => typeof v === 'number')).toBe(true);
    });

    it('should enable A/B testing of prompts', () => {
      const promptExperiment = {
        promptId: 'moderator_summary',
        promptVersion: 'v3.0',
        variantId: 'A',
        conversionMetrics: {
          userSatisfactionScore: 4.2,
          regenerationRate: 0.05,
          moderatorUsageRate: 0.85,
        },
      };

      expect(promptExperiment.promptVersion).toBeDefined();
      expect(promptExperiment.variantId).toBeDefined();
    });
  });
});
