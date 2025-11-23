/**
 * Analysis 409 Conflict Polling Tests
 *
 * Tests that analysis streams properly handle 409 Conflict errors
 * (when stream is already in progress) by polling for completion
 * instead of retrying the POST request.
 *
 * This prevents "Controller is already closed" errors and ensures
 * analysis completes even after page refresh during streaming.
 */
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

import { ModeratorAnalysisStream } from '../moderator/moderator-analysis-stream';

// Mock AI SDK v5 useObject hook
vi.mock('@ai-sdk/react', () => ({
  experimental_useObject: vi.fn(() => ({
    object: null,
    error: null,
    submit: vi.fn(),
  })),
}));

describe('analysis 409 polling', () => {
  it('should poll for completion when POST returns 409', async () => {
    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-1',
      threadId: 'thread-1',
      roundNumber: 0,
      mode: 'debating',
      userQuestion: 'Test question',
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-1', 'msg-2'],
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    // Mock fetch to return analyses
    const completedAnalysis = {
      ...mockAnalysis,
      status: AnalysisStatuses.COMPLETE,
      analysisData: {
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test question',
        leaderboard: [],
        participantAnalyses: [],
        roundSummary: {
          mainThemes: [],
          keyInsights: [],
          consensus: null,
          divergence: null,
          recommendations: [],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [completedAnalysis] }),
    });

    // Mock useObject to simulate 409 error
    const { experimental_useObject } = await import('@ai-sdk/react');
    (experimental_useObject as ReturnType<typeof vi.fn>).mockReturnValue({
      object: null,
      error: new Error('409 Conflict: Analysis is already being generated'),
      submit: vi.fn((_body) => {
        // Simulate 409 by calling onFinish with error
        const mockOnFinish = (experimental_useObject as ReturnType<typeof vi.fn>).mock.calls[0][0].onFinish;
        if (mockOnFinish) {
          mockOnFinish({
            object: undefined,
            error: new Error('409 Conflict: Analysis is already being generated'),
          });
        }
      }),
    });

    render(
      <ModeratorAnalysisStream
        threadId="thread-1"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    // Wait for polling to complete
    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith(completedAnalysis.analysisData);
      },
      { timeout: 5000 },
    );

    // Verify fetch was called to poll for status
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/chat/threads/thread-1/analyses');
  });

  it('should handle failed analysis status during polling', async () => {
    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-2',
      threadId: 'thread-2',
      roundNumber: 1,
      mode: 'solving',
      userQuestion: 'Test question 2',
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-3', 'msg-4'],
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    // Mock fetch to return failed analysis
    const failedAnalysis = {
      ...mockAnalysis,
      status: AnalysisStatuses.FAILED,
      errorMessage: 'Model unavailable',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [failedAnalysis] }),
    });

    // Mock useObject to simulate 409 error
    const { experimental_useObject } = await import('@ai-sdk/react');
    (experimental_useObject as ReturnType<typeof vi.fn>).mockReturnValue({
      object: null,
      error: new Error('409 Conflict'),
      submit: vi.fn((_body) => {
        const mockOnFinish = (experimental_useObject as ReturnType<typeof vi.fn>).mock.calls[0][0].onFinish;
        if (mockOnFinish) {
          mockOnFinish({
            object: undefined,
            error: new Error('409 Conflict'),
          });
        }
      }),
    });

    render(
      <ModeratorAnalysisStream
        threadId="thread-2"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    // Wait for polling to detect failure
    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith(
          null,
          expect.objectContaining({ message: 'Model unavailable' }),
        );
      },
      { timeout: 5000 },
    );
  });
});
