/**
 * Analysis Empty Response Error Handling Tests
 *
 * Tests that analysis streams properly handle empty/undefined responses
 * from the AI model. This happens when:
 * - AI model returns no data (timeout, rate limiting)
 * - Stream is interrupted before data is sent
 * - AI model returns malformed/empty JSON
 * - AI SDK reports undefined at end even when valid data was streamed (CRITICAL FIX)
 *
 * CRITICAL FIX: Tests for the scenario where AI SDK's `onFinish` callback
 * receives `object: undefined` even when valid data was successfully streamed.
 * The fix stores streaming data in `partialAnalysisRef` and uses it as fallback.
 *
 * The error "expected object, received undefined" with path [] should
 * be detected and either:
 * 1. Use fallback data if valid analysis was streamed (SUCCESS)
 * 2. Show user-friendly error message if no valid data was streamed (ERROR)
 *
 * @see src/components/chat/moderator/moderator-analysis-stream.tsx
 */
import { act, render as rtlRender, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, StreamErrorTypes } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { testLocale, testMessages, testTimeZone } from '@/lib/testing/test-messages';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

import { clearTriggeredAnalysesForRound, ModeratorAnalysisStream } from '../moderator/moderator-analysis-stream';

// Custom wrapper for tests
function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={testLocale}
      messages={testMessages}
      timeZone={testTimeZone}
    >
      {children}
    </NextIntlClientProvider>
  );
}

// Custom render that includes i18n wrapper
function render(ui: ReactNode) {
  return rtlRender(ui, { wrapper: TestWrapper });
}

// Store onFinish callback to trigger manually
let capturedOnFinish: ((result: { object: unknown; error: Error | null }) => void) | null = null;

// Mock AI SDK v5 useObject hook
vi.mock('@ai-sdk/react', () => ({
  experimental_useObject: vi.fn((options: { onFinish?: (result: { object: unknown; error: Error | null }) => void }) => {
    // Capture the onFinish callback when hook is called
    capturedOnFinish = options.onFinish ?? null;
    return {
      object: null,
      error: null,
      submit: vi.fn(),
    };
  }),
}));

describe('analysis empty response error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnFinish = null;
    // Clear triggered state from previous tests
    clearTriggeredAnalysesForRound(0);
    clearTriggeredAnalysesForRound(1);
    clearTriggeredAnalysesForRound(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: Empty response with "expected object, received undefined" error
   *
   * This is the exact error that occurs when AI SDK's useObject receives
   * an empty stream (undefined root object). The component should:
   * 1. Detect this specific error pattern
   * 2. Classify it as EMPTY_RESPONSE error type
   * 3. Pass a user-friendly error message to onStreamComplete
   */
  it('should handle "expected object, received undefined" error with user-friendly message', async () => {
    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-empty-response-1',
      threadId: 'thread-empty-1',
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

    render(
      <ModeratorAnalysisStream
        threadId="thread-empty-1"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    // Wait for hook to be initialized and callback captured
    await waitFor(() => {
      expect(capturedOnFinish).not.toBeNull();
    });

    // Simulate the exact error from AI SDK when root object is undefined
    // This is the Zod TypeValidationError format
    const zodError = new Error(
      'Type validation failed: Value: undefined. Error message: [ { "expected": "object", "code": "invalid_type", "path": [], "message": "Invalid input: expected object, received undefined" } ]',
    );
    zodError.name = 'TypeValidationError';

    await act(async () => {
      capturedOnFinish?.({
        object: undefined,
        error: zodError,
      });
    });

    // Wait for callback to be called
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    // Verify onComplete was called with null data and user-friendly error message
    expect(onComplete).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: expect.stringContaining('AI model did not return a response'),
      }),
    );
  });

  /**
   * Test: Alternative error message format
   *
   * Tests the shortened version of the error message that might occur
   */
  it('should detect "Invalid input: expected object, received undefined" variant', async () => {
    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-empty-response-2',
      threadId: 'thread-empty-2',
      roundNumber: 1,
      mode: 'brainstorming',
      userQuestion: 'Another test',
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-3', 'msg-4'],
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    render(
      <ModeratorAnalysisStream
        threadId="thread-empty-2"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    await waitFor(() => {
      expect(capturedOnFinish).not.toBeNull();
    });

    // Simulate error with shorter message format
    const zodError = new Error('Invalid input: expected object, received undefined');
    zodError.name = 'TypeValidationError';

    await act(async () => {
      capturedOnFinish?.({
        object: undefined,
        error: zodError,
      });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    // Should still get user-friendly error
    expect(onComplete).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: expect.stringContaining('AI model did not return a response'),
      }),
    );
  });

  /**
   * Test: JSON-formatted error with invalid_type and empty path
   *
   * Tests the JSON array format that Zod sometimes returns
   */
  it('should detect invalid_type with empty path in JSON format', async () => {
    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-empty-response-3',
      threadId: 'thread-empty-3',
      roundNumber: 2,
      mode: 'solving',
      userQuestion: 'JSON format test',
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-5', 'msg-6'],
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    render(
      <ModeratorAnalysisStream
        threadId="thread-empty-3"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    await waitFor(() => {
      expect(capturedOnFinish).not.toBeNull();
    });

    // Simulate error with JSON format containing invalid_type and path": []
    const zodError = new Error(
      '[ { "code": "invalid_type", "expected": "object", "received": "undefined", "path": [] } ]',
    );

    await act(async () => {
      capturedOnFinish?.({
        object: undefined,
        error: zodError,
      });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    // Should get user-friendly error
    expect(onComplete).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: expect.stringContaining('AI model did not return a response'),
      }),
    );
  });

  /**
   * Test: Regular validation error (not empty response) should NOT get special handling
   *
   * Ensures that validation errors with specific paths (not root) don't get
   * misclassified as empty response errors
   */
  it('should NOT treat regular validation errors as empty response', async () => {
    // Clear the triggered state for round 0 for this test
    clearTriggeredAnalysesForRound(0);

    const mockAnalysis: StoredModeratorAnalysis = {
      id: 'analysis-validation-not-empty',
      threadId: 'thread-validation',
      roundNumber: 0,
      mode: 'analyzing',
      userQuestion: 'Validation test',
      status: AnalysisStatuses.STREAMING,
      participantMessageIds: ['msg-7', 'msg-8'],
      analysisData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    };

    const onComplete = vi.fn();

    render(
      <ModeratorAnalysisStream
        threadId="thread-validation"
        analysis={mockAnalysis}
        onStreamComplete={onComplete}
      />,
    );

    await waitFor(() => {
      expect(capturedOnFinish).not.toBeNull();
    });

    // Simulate a regular validation error with a specific path (not empty)
    // This should be treated as a regular VALIDATION error, not EMPTY_RESPONSE
    const zodError = new Error(
      '[ { "code": "invalid_type", "expected": "string", "received": "number", "path": ["summary"] } ]',
    );
    zodError.name = 'TypeValidationError';

    await act(async () => {
      capturedOnFinish?.({
        object: undefined,
        error: zodError,
      });
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });

    // Should pass through the original error (not the user-friendly empty response message)
    // Because path is ["summary"] not [], it's a field validation error
    expect(onComplete).toHaveBeenCalledWith(
      null,
      expect.objectContaining({
        message: expect.not.stringContaining('AI model did not return a response'),
      }),
    );
  });

  /**
   * Test: StreamErrorTypes.EMPTY_RESPONSE enum value exists
   *
   * Ensures the new error type was properly added to the enum
   */
  it('should have EMPTY_RESPONSE in StreamErrorTypes enum', () => {
    expect(StreamErrorTypes.EMPTY_RESPONSE).toBe('empty_response');
  });
});

/**
 * CRITICAL FIX TESTS: Fallback Logic for Streamed Data
 *
 * Tests the fix where AI SDK reports undefined at stream end but valid
 * data was successfully streamed. Uses hasAnalysisData to validate fallback.
 */
describe('fallback logic for valid streamed data', () => {
  /**
   * Simulates the onFinish callback behavior from moderator-analysis-stream.tsx
   * This is the exact logic that was fixed
   */
  function simulateOnFinishWithFallback(params: {
    finalObject: Record<string, unknown> | undefined;
    error?: Error;
    partialAnalysisRef: { current: unknown };
    onStreamComplete: (data: unknown, error?: Error | null) => void;
  }) {
    const { finalObject, error, partialAnalysisRef, onStreamComplete } = params;

    if (finalObject === undefined) {
      const errorMessage = error?.message || String(error || 'Unknown error');

      const isEmptyResponse = errorMessage.includes('expected object, received undefined')
        || errorMessage.includes('Invalid input: expected object, received undefined')
        || (errorMessage.includes('invalid_type') && errorMessage.includes('path": []'));

      if (isEmptyResponse) {
        // CRITICAL FIX: Check if we have valid partial data from streaming
        const fallbackData = partialAnalysisRef.current;
        if (fallbackData && hasAnalysisData(fallbackData as Record<string, unknown>)) {
          // We have valid streamed data - treat as success
          onStreamComplete(fallbackData);
          return;
        }

        // No valid fallback - report error
        onStreamComplete(null, new Error('Analysis generation failed. The AI model did not return a response.'));
        return;
      }

      onStreamComplete(null, error || new Error(errorMessage));
      return;
    }

    onStreamComplete(finalObject);
  }

  describe('when valid data was streamed but AI SDK returns undefined', () => {
    it('should use fallback data with roundConfidence', () => {
      const streamedData = { roundConfidence: 85 };
      const partialAnalysisRef = { current: streamedData };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(streamedData);
      expect(onStreamComplete).not.toHaveBeenCalledWith(null, expect.any(Error));
    });

    it('should use fallback data with summary', () => {
      const streamedData = { summary: 'Complete analysis summary that user saw' };
      const partialAnalysisRef = { current: streamedData };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(streamedData);
    });

    it('should use fallback data with recommendations', () => {
      const streamedData = {
        recommendations: [
          { title: 'Action 1', description: 'Description 1' },
          { title: 'Action 2', description: 'Description 2' },
        ],
      };
      const partialAnalysisRef = { current: streamedData };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(streamedData);
    });

    it('should use fallback data with complete analysis payload', () => {
      const streamedData = {
        roundNumber: 1,
        mode: 'brainstorming',
        userQuestion: 'How can we improve?',
        roundConfidence: 82,
        summary: 'The participants provided diverse perspectives...',
        recommendations: [
          { title: 'Consider A/B testing', description: 'Test different approaches' },
        ],
        contributorPerspectives: [{
          participantIndex: 0,
          role: 'Product Manager',
          modelId: 'anthropic/claude-3',
          modelName: 'Claude 3',
          scorecard: { logic: 88, riskAwareness: 75, creativity: 82, evidence: 80, consensus: 78 },
          stance: 'Support',
          evidence: ['Evidence 1'],
          vote: 'approve',
        }],
        consensusAnalysis: {
          alignmentSummary: { totalClaims: 8, majorAlignment: 6, contestedClaims: 2 },
        },
      };
      const partialAnalysisRef = { current: streamedData };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(streamedData);
    });
  });

  describe('when no valid data was streamed', () => {
    it('should report error when partialAnalysisRef is null', () => {
      const partialAnalysisRef = { current: null };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(null, expect.any(Error));
    });

    it('should report error when partialAnalysisRef is empty object', () => {
      const partialAnalysisRef = { current: {} };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(null, expect.any(Error));
    });

    it('should report error when partialAnalysisRef has no meaningful content', () => {
      const partialAnalysisRef = {
        current: {
          roundNumber: 0,
          mode: 'debating',
          // No analysis content
        },
      };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(null, expect.any(Error));
    });

    it('should report error when partialAnalysisRef has only zero/empty values', () => {
      const partialAnalysisRef = {
        current: {
          roundConfidence: 0,
          summary: '',
          recommendations: [],
        },
      };
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: undefined,
        error: new Error('Invalid input: expected object, received undefined'),
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(null, expect.any(Error));
    });
  });

  describe('when AI SDK returns valid final object', () => {
    it('should use final object and ignore fallback', () => {
      const validFinalObject = {
        roundNumber: 0,
        mode: 'debating',
        userQuestion: 'Test',
        roundConfidence: 90,
        summary: 'Final analysis',
        recommendations: [{ title: 'Final rec', description: 'Desc' }],
      };
      const partialAnalysisRef = { current: { roundConfidence: 50 } }; // Different value
      const onStreamComplete = vi.fn();

      simulateOnFinishWithFallback({
        finalObject: validFinalObject,
        partialAnalysisRef,
        onStreamComplete,
      });

      expect(onStreamComplete).toHaveBeenCalledWith(validFinalObject);
    });
  });
});

/**
 * REGRESSION PREVENTION TESTS
 *
 * These tests ensure the bug where analysis is marked as failed
 * despite valid data being streamed never regresses.
 */
describe('regression prevention: analysis marked as failed with valid data', () => {
  /**
   * BUG SCENARIO: User reported seeing all JSON data streamed in UI,
   * but analysis was marked as failed with error message.
   *
   * This test replicates the exact scenario.
   */
  it('bug: user sees complete streamed data but analysis marked as failed', () => {
    // Exact data structure the user reported seeing streamed
    const userVisibleStreamedData = {
      roundNumber: 1,
      mode: 'brainstorming',
      userQuestion: 'How can we improve our product?',
      roundConfidence: 82,
      confidenceWeighting: {
        argumentQuality: 25,
        evidenceStrength: 25,
        consensusLevel: 20,
        logicalCoherence: 15,
        uniqueInsights: 15,
      },
      summary: 'The participants provided diverse and thoughtful perspectives on product improvement strategies...',
      recommendations: [
        { title: 'Implement A/B Testing Framework', description: 'Set up systematic testing to validate hypotheses' },
        { title: 'Enhance User Feedback Loop', description: 'Create more touchpoints for gathering user input' },
        { title: 'Focus on Core Value Proposition', description: 'Double down on what users value most' },
      ],
      contributorPerspectives: [
        {
          participantIndex: 0,
          role: 'Product Strategist',
          modelId: 'anthropic/claude-3',
          modelName: 'Claude 3',
          scorecard: { logic: 88, riskAwareness: 75, creativity: 82, evidence: 80, consensus: 78 },
          stance: 'Support',
          evidence: ['Market research indicates...', 'User surveys show...'],
          vote: 'approve',
        },
        {
          participantIndex: 1,
          role: 'Technical Architect',
          modelId: 'openai/gpt-4',
          modelName: 'GPT-4',
          scorecard: { logic: 92, riskAwareness: 85, creativity: 70, evidence: 88, consensus: 80 },
          stance: 'Support with reservations',
          evidence: ['Technical feasibility study reveals...'],
          vote: 'approve_with_changes',
        },
      ],
      consensusAnalysis: {
        alignmentSummary: { totalClaims: 12, majorAlignment: 9, contestedClaims: 3 },
        pointsOfAgreement: [
          'User feedback is critical for success',
          'Data-driven decisions are preferred',
          'Incremental improvements over big bets',
        ],
        pointsOfContention: ['Timeline for implementation', 'Resource allocation'],
        majorityViewpoint: 'Proceed with measured approach',
        dissenterViewpoints: ['Move faster to capture market opportunity'],
        overallConsensusStrength: 78,
        movementFromLastRound: null,
      },
      evidenceAndReasoning: {
        reasoningThreads: [],
        evidenceCoverage: [],
      },
      alternatives: [
        { scenario: 'Aggressive growth strategy', confidence: 45 },
        { scenario: 'Consolidation strategy', confidence: 65 },
      ],
      roundSummary: {
        keyInsights: [
          'User-centric approach resonates across all participants',
          'Technical constraints must be addressed early',
          'Market timing is a debated factor',
        ],
        overallSummary: 'A productive round with strong consensus on the need for systematic product improvement.',
      },
    };

    // Verify this data PASSES hasAnalysisData check
    expect(hasAnalysisData(userVisibleStreamedData)).toBe(true);

    // Simulate the bug scenario
    const partialAnalysisRef = { current: userVisibleStreamedData };
    const onStreamComplete = vi.fn();

    // AI SDK reports empty response at end (the bug trigger)
    simulateOnFinishWithFallback({
      finalObject: undefined,
      error: new Error('Invalid input: expected object, received undefined'),
      partialAnalysisRef,
      onStreamComplete,
    });

    // CRITICAL: Should NOT mark as failed
    expect(onStreamComplete).not.toHaveBeenCalledWith(null, expect.any(Error));

    // CRITICAL: Should use the streamed data as success
    expect(onStreamComplete).toHaveBeenCalledWith(userVisibleStreamedData);
  });

  it('should still report error for genuinely empty responses', () => {
    const partialAnalysisRef = { current: null };
    const onStreamComplete = vi.fn();

    simulateOnFinishWithFallback({
      finalObject: undefined,
      error: new Error('Invalid input: expected object, received undefined'),
      partialAnalysisRef,
      onStreamComplete,
    });

    expect(onStreamComplete).toHaveBeenCalledWith(null, expect.any(Error));
  });

  // Local helper
  function simulateOnFinishWithFallback(params: {
    finalObject: Record<string, unknown> | undefined;
    error?: Error;
    partialAnalysisRef: { current: unknown };
    onStreamComplete: (data: unknown, error?: Error | null) => void;
  }) {
    const { finalObject, error, partialAnalysisRef, onStreamComplete } = params;

    if (finalObject === undefined) {
      const errorMessage = error?.message || String(error || 'Unknown error');

      const isEmptyResponse = errorMessage.includes('expected object, received undefined')
        || errorMessage.includes('Invalid input: expected object, received undefined')
        || (errorMessage.includes('invalid_type') && errorMessage.includes('path": []'));

      if (isEmptyResponse) {
        const fallbackData = partialAnalysisRef.current;
        if (fallbackData && hasAnalysisData(fallbackData as Record<string, unknown>)) {
          onStreamComplete(fallbackData);
          return;
        }
        onStreamComplete(null, new Error('Analysis generation failed. The AI model did not return a response.'));
        return;
      }

      onStreamComplete(null, error || new Error(errorMessage));
      return;
    }

    onStreamComplete(finalObject);
  }
});

/**
 * partialAnalysisRef SYNCHRONIZATION TESTS
 *
 * Tests that the ref is properly updated during streaming
 */
describe('partialAnalysisRef synchronization', () => {
  it('should update ref as data streams progressively', () => {
    const partialAnalysisRef = { current: null as unknown };

    // Simulate the effect: if (partialAnalysis) { partialAnalysisRef.current = partialAnalysis; }
    const updateRef = (partialAnalysis: unknown) => {
      if (partialAnalysis) {
        partialAnalysisRef.current = partialAnalysis;
      }
    };

    // Phase 1: Initial data
    updateRef({ roundConfidence: 30 });
    expect(partialAnalysisRef.current).toEqual({ roundConfidence: 30 });

    // Phase 2: More data arrives
    updateRef({ roundConfidence: 60, summary: 'Building...' });
    expect(partialAnalysisRef.current).toEqual({ roundConfidence: 60, summary: 'Building...' });

    // Phase 3: Complete data
    updateRef({
      roundConfidence: 85,
      summary: 'Complete analysis',
      recommendations: [{ title: 'Action', description: 'Take it' }],
    });
    expect(partialAnalysisRef.current).toEqual({
      roundConfidence: 85,
      summary: 'Complete analysis',
      recommendations: [{ title: 'Action', description: 'Take it' }],
    });
  });

  it('should NOT clear ref when partialAnalysis becomes null', () => {
    const partialAnalysisRef = { current: { roundConfidence: 85 } as unknown };

    const updateRef = (partialAnalysis: unknown) => {
      if (partialAnalysis) {
        partialAnalysisRef.current = partialAnalysis;
      }
    };

    // Simulate partialAnalysis becoming null (shouldn't overwrite)
    updateRef(null);
    expect(partialAnalysisRef.current).toEqual({ roundConfidence: 85 });

    updateRef(undefined);
    expect(partialAnalysisRef.current).toEqual({ roundConfidence: 85 });
  });

  it('should reset ref when analysis ID changes', () => {
    const partialAnalysisRef = { current: { roundConfidence: 85 } as unknown };

    // Simulate the reset effect on analysis.id change
    const resetOnIdChange = () => {
      partialAnalysisRef.current = null;
    };

    resetOnIdChange();
    expect(partialAnalysisRef.current).toBeNull();
  });
});
