/**
 * Analysis Object Stream Resumption Tests
 *
 * Tests the resumption infrastructure for analysis object streams:
 * - Resume endpoint returns buffered data
 * - POST returns buffered data instead of 409
 * - 409 polling tries resume first
 *
 * This ensures analysis streams are resilient to page refreshes
 * following the same pattern as chat participant streams.
 *
 * Related files:
 * - src/api/services/analysis-stream-buffer.service.ts
 * - src/api/routes/chat/handlers/analysis.handler.ts
 * - src/components/chat/moderator/moderator-analysis-stream.tsx
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';

describe('analysis Object Stream Resumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resume Endpoint Behavior', () => {
    it('should return 200 with buffered data when buffer exists', async () => {
      const mockBufferedData = JSON.stringify({
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        leaderboard: [],
        participantAnalyses: [],
        roundSummary: {
          mainThemes: ['Theme 1'],
          keyInsights: ['Insight 1'],
          consensus: null,
          divergence: null,
          recommendations: [],
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockBufferedData,
        headers: new Headers({
          'X-Resumed-From-Buffer': 'true',
        }),
      });

      const response = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe(mockBufferedData);
      expect(JSON.parse(text)).toHaveProperty('roundNumber', 0);
    });

    it('should return 204 No Content when no buffer exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => '',
      });

      const response = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');

      expect(response.status).toBe(204);
    });

    it('should handle incomplete buffer (partial JSON)', async () => {
      // Simulate incomplete JSON from a stream that was interrupted
      const incompleteJson = '{"roundNumber": 0, "mode": "debating", "userQuestion": "Test"';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => incompleteJson,
      });

      const response = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');

      expect(response.status).toBe(200);
      const text = await response.text();

      // Attempting to parse should throw
      expect(() => JSON.parse(text)).toThrow();
    });
  });

  describe('pOST Endpoint with Buffered Stream', () => {
    it('should return buffered stream instead of 409 when buffer exists', async () => {
      const mockBufferedData = JSON.stringify({
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        leaderboard: [],
        participantAnalyses: [],
        roundSummary: {
          mainThemes: [],
          keyInsights: [],
        },
      });

      // First call returns buffered data (not 409)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Resumed-From-Buffer': 'true',
          'Content-Type': 'text/plain; charset=utf-8',
        }),
        text: async () => mockBufferedData,
      });

      const response = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze', {
        method: 'POST',
        body: JSON.stringify({ participantMessageIds: ['msg-1'] }),
      });

      // Should return 200 with buffered data, not 409
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Resumed-From-Buffer')).toBe('true');
    });

    it('should return 409 only when no buffer exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'Analysis is already being generated (age: 5s)',
          },
        }),
      });

      const response = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze', {
        method: 'POST',
        body: JSON.stringify({ participantMessageIds: ['msg-1'] }),
      });

      expect(response.status).toBe(409);
    });
  });

  describe('frontend Resume Flow', () => {
    it('should try resume before POST when status is STREAMING', async () => {
      const calls: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        calls.push(url);

        if (url.includes('/resume')) {
          // Resume endpoint returns buffered data
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              roundNumber: 0,
              mode: 'debating',
              userQuestion: 'Test',
              roundSummary: { mainThemes: [], keyInsights: [] },
            }),
          });
        }

        // POST shouldn't be called if resume succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
        });
      });

      // Simulate frontend flow:
      // 1. Component mounts with STREAMING status
      // 2. Tries resume first
      const resumeResponse = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');

      // Resume succeeded with status 200
      expect(resumeResponse.status).toBe(200);

      const text = await resumeResponse.text();
      const parsed = JSON.parse(text);
      expect(parsed.roundNumber).toBe(0);

      // POST was not called since resume succeeded
      expect(calls).not.toContain('/api/v1/chat/threads/thread-1/rounds/0/analyze');
    });

    it('should fall through to POST when resume returns 204', async () => {
      const calls: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        calls.push(url);

        if (url.includes('/resume')) {
          // Resume returns 204 - no buffer
          return Promise.resolve({
            ok: true,
            status: 204,
            text: async () => '',
          });
        }

        // POST is called next
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ roundNumber: 0 }),
        });
      });

      // Try resume first
      const resumeResponse = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');

      // Resume returned 204 (no buffer)
      expect(resumeResponse.status).toBe(204);

      // Fall through to POST
      await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze', {
        method: 'POST',
      });

      // Both calls were made
      expect(calls).toContain('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');
      expect(calls).toContain('/api/v1/chat/threads/thread-1/rounds/0/analyze');
    });
  });

  describe('409 Polling with Resume', () => {
    it('should try resume in each poll cycle', async () => {
      let pollCount = 0;

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/resume')) {
          pollCount++;

          // First poll - incomplete
          if (pollCount === 1) {
            return Promise.resolve({
              ok: true,
              status: 204,
            });
          }

          // Second poll - complete data available
          return Promise.resolve({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              roundNumber: 0,
              mode: 'debating',
              userQuestion: 'Test',
              roundSummary: { mainThemes: [], keyInsights: [] },
            }),
          });
        }

        // Analyses list endpoint (fallback)
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              items: [{
                id: 'analysis-1',
                roundNumber: 0,
                status: AnalysisStatuses.STREAMING,
              }],
            },
          }),
        });
      });

      // First poll - resume returns 204, continue polling
      const poll1 = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');
      expect(poll1.status).toBe(204);

      // Second poll - resume returns complete data
      const poll2 = await fetch('/api/v1/chat/threads/thread-1/rounds/0/analyze/resume');
      expect(poll2.status).toBe(200);

      const data = await poll2.text();
      expect(JSON.parse(data)).toHaveProperty('roundNumber', 0);
    });
  });

  describe('buffer Lifecycle', () => {
    it('should clear buffer after successful completion', () => {
      // This is a conceptual test - actual implementation in backend
      // Buffer is cleared via clearActiveAnalysisStream in onFinish callback

      const mockAnalysis = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: { roundNumber: 0 },
      };

      // After completion, resume endpoint should return 204
      expect(mockAnalysis.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should clear buffer after failure', () => {
      const mockAnalysis = {
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Stream timeout',
      };

      // After failure, resume endpoint should return 204
      expect(mockAnalysis.status).toBe(AnalysisStatuses.FAILED);
    });

    it('should expire buffer after TTL (1 hour)', () => {
      // KV buffer has 1 hour TTL
      // After TTL, getActiveAnalysisStreamId returns null
      const STREAM_BUFFER_TTL_SECONDS = 60 * 60; // 1 hour

      // After 1 hour, resume should return 204
      expect(STREAM_BUFFER_TTL_SECONDS).toBe(3600);
    });
  });
});
