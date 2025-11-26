/**
 * Empty Response and Validation Error Tests
 *
 * Comprehensive tests for handling empty responses from AI models
 * and validation errors during streaming.
 *
 * Tests cover:
 * - Empty response detection (no content generated)
 * - Validation errors in message metadata
 * - Multi-participant scenarios with partial failures
 * - Finish reason handling (stop, unknown, failed)
 * - Error type classification (empty_response, validation)
 * - Metadata completeness validation
 * - Recovery from validation errors
 *
 * Based on real SSE stream data patterns showing:
 * - errorType: "empty_response"
 * - finishReason: "unknown"
 * - hasError: true
 *
 * Location: /src/stores/chat/__tests__/empty-response-validation-errors.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ErrorTypes,
  FinishReasons,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a message with empty response error metadata
 * Simulates when a model fails to generate any content
 */
function createEmptyResponseMessage(
  participantIndex: number,
  roundNumber: number,
  modelId = 'openai/o1',
): UIMessage {
  const msg = createMockMessage(participantIndex, roundNumber);
  msg.content = ''; // Empty content
  msg.parts = []; // No parts
  msg.metadata = {
    ...msg.metadata,
    hasError: true,
    errorType: ErrorTypes.EMPTY_RESPONSE,
    errorMessage: `The model (${modelId}) did not generate a response.`,
    finishReason: FinishReasons.UNKNOWN,
    isEmptyResponse: true,
    model: modelId,
  };
  return msg;
}

/**
 * Create a message with validation error
 * Simulates when metadata validation fails
 */
function createValidationErrorMessage(
  participantIndex: number,
  roundNumber: number,
  validationError: string,
): UIMessage {
  const msg = createMockMessage(participantIndex, roundNumber);
  msg.metadata = {
    ...msg.metadata,
    hasError: true,
    errorType: ErrorTypes.UNKNOWN,
    errorMessage: validationError,
    errorCategory: 'validation_error',
    finishReason: FinishReasons.FAILED,
  };
  return msg;
}

/**
 * Create a message with partial/incomplete metadata
 * Simulates streaming interruption before completion
 */
function createPartialMetadataMessage(
  participantIndex: number,
  roundNumber: number,
): UIMessage {
  const msg = createMockMessage(participantIndex, roundNumber);
  msg.metadata = {
    ...msg.metadata,
    hasError: true,
    errorMessage: 'Incomplete response metadata',
    isPartialResponse: true,
    finishReason: FinishReasons.UNKNOWN,
    // Missing usage data
    usage: undefined,
  };
  return msg;
}

/**
 * Create a successful message with complete metadata
 */
function createSuccessfulMessage(
  participantIndex: number,
  roundNumber: number,
  modelId = 'anthropic/claude-opus-4',
): UIMessage {
  const msg = createMockMessage(participantIndex, roundNumber);
  msg.metadata = {
    ...msg.metadata,
    hasError: false,
    finishReason: FinishReasons.STOP,
    model: modelId,
    usage: {
      promptTokens: 100,
      completionTokens: 416,
      totalTokens: 516,
    },
  };
  return msg;
}

// ============================================================================
// EMPTY RESPONSE ERROR TESTS
// ============================================================================

describe('empty Response and Validation Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // EMPTY RESPONSE DETECTION
  // ==========================================================================

  describe('empty Response Detection', () => {
    it('should detect empty response error from model', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0, { modelId: 'openai/o1' })];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Model returns empty response
      const errorMsg = createEmptyResponseMessage(0, 0, 'openai/o1');
      store.getState().setMessages(prev => [...prev, errorMsg]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      const msg = state.messages[1];
      expect(msg.metadata?.hasError).toBe(true);
      expect(msg.metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);
      expect(msg.metadata?.errorMessage).toContain('did not generate a response');
      expect(msg.metadata?.isEmptyResponse).toBe(true);
    });

    it('should set finishReason to unknown for empty response', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createEmptyResponseMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('should have empty content for empty response', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createEmptyResponseMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.content).toBe('');
      expect(msg.parts).toHaveLength(0);
    });

    it('should include model information in error metadata', () => {
      const thread = createMockThread();
      const modelId = 'openai/o1';
      const participants = [createMockParticipant(0, { modelId })];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createEmptyResponseMessage(0, 0, modelId);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.model).toBe(modelId);
      expect(msg.metadata?.errorMessage).toContain(modelId);
    });
  });

  // ==========================================================================
  // MULTI-PARTICIPANT EMPTY RESPONSE HANDLING
  // ==========================================================================

  describe('multi-Participant Empty Response Handling', () => {
    it('should handle one participant empty response while others succeed', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'openai/o1' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-opus-4' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 (o1) fails with empty response
      store.getState().setMessages(prev => [...prev, createEmptyResponseMessage(0, 0, 'openai/o1')]);
      store.getState().setCurrentParticipantIndex(1);

      // P1 (claude) succeeds
      store.getState().setMessages(prev => [...prev, createSuccessfulMessage(1, 0, 'anthropic/claude-opus-4')]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.messages).toHaveLength(3);

      // P0 failed
      expect(state.messages[1].metadata?.hasError).toBe(true);
      expect(state.messages[1].metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);

      // P1 succeeded
      expect(state.messages[2].metadata?.hasError).toBe(false);
      expect(state.messages[2].metadata?.finishReason).toBe(FinishReasons.STOP);
    });

    it('should track empty response count in multi-participant round', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // 2 empty responses, 1 success
      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 0),
        createSuccessfulMessage(1, 0),
        createEmptyResponseMessage(2, 0),
      ]);

      const emptyResponseCount = store.getState().messages.filter(
        m => m.metadata?.isEmptyResponse === true,
      ).length;
      const successCount = store.getState().messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT && !m.metadata?.hasError,
      ).length;

      expect(emptyResponseCount).toBe(2);
      expect(successCount).toBe(1);
    });

    it('should handle all participants returning empty response', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'openai/o1' }),
        createMockParticipant(1, { modelId: 'openai/o1-preview' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // All fail with empty response
      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 0, 'openai/o1'),
        createEmptyResponseMessage(1, 0, 'openai/o1-preview'),
      ]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      const allEmpty = state.messages
        .filter(m => m.role === UIMessageRoles.ASSISTANT)
        .every(m => m.metadata?.isEmptyResponse);

      expect(allEmpty).toBe(true);
      expect(state.isStreaming).toBe(false);
    });

    it('should allow analysis creation even with empty responses', () => {
      const thread = createMockThread({ id: 'thread-empty-response' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // P0 empty, P1 success
      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 0),
        createSuccessfulMessage(1, 0),
      ]);

      // Analysis can still be created with partial results
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      expect(store.getState().analyses).toHaveLength(1);
    });
  });

  // ==========================================================================
  // VALIDATION ERROR HANDLING
  // ==========================================================================

  describe('validation Error Handling', () => {
    it('should detect validation error in message metadata', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createValidationErrorMessage(0, 0, 'Invalid metadata schema');
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.hasError).toBe(true);
      expect(msg.metadata?.errorCategory).toBe('validation_error');
      expect(msg.metadata?.finishReason).toBe(FinishReasons.FAILED);
    });

    it('should handle partial metadata (incomplete response)', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const partialMsg = createPartialMetadataMessage(0, 0);
      store.getState().setMessages(prev => [...prev, partialMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.isPartialResponse).toBe(true);
      expect(msg.metadata?.hasError).toBe(true);
      expect(msg.metadata?.usage).toBeUndefined();
    });

    it('should track multiple validation errors in same round', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [
        ...prev,
        createValidationErrorMessage(0, 0, 'Missing participantId'),
        createValidationErrorMessage(1, 0, 'Invalid roundNumber'),
      ]);

      const validationErrors = store.getState().messages.filter(
        m => m.metadata?.errorCategory === 'validation_error',
      ).length;

      expect(validationErrors).toBe(2);
    });
  });

  // ==========================================================================
  // FINISH REASON HANDLING
  // ==========================================================================

  describe('finish Reason Handling', () => {
    it('should correctly identify stop finish reason for success', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const successMsg = createSuccessfulMessage(0, 0);
      store.getState().setMessages(prev => [...prev, successMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.finishReason).toBe(FinishReasons.STOP);
      expect(msg.metadata?.hasError).toBe(false);
    });

    it('should correctly identify unknown finish reason for errors', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createEmptyResponseMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.finishReason).toBe(FinishReasons.UNKNOWN);
      expect(msg.metadata?.hasError).toBe(true);
    });

    it('should correctly identify failed finish reason for validation errors', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createValidationErrorMessage(0, 0, 'Validation failed');
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.finishReason).toBe(FinishReasons.FAILED);
    });

    it('should handle mixed finish reasons in multi-participant round', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [
        ...prev,
        createSuccessfulMessage(0, 0), // stop
        createEmptyResponseMessage(1, 0), // unknown
        createValidationErrorMessage(2, 0, 'Error'), // failed
      ]);

      const messages = store.getState().messages;
      expect(messages[1].metadata?.finishReason).toBe(FinishReasons.STOP);
      expect(messages[2].metadata?.finishReason).toBe(FinishReasons.UNKNOWN);
      expect(messages[3].metadata?.finishReason).toBe(FinishReasons.FAILED);
    });
  });

  // ==========================================================================
  // ERROR RECOVERY FROM EMPTY RESPONSE
  // ==========================================================================

  describe('error Recovery from Empty Response', () => {
    it('should allow retry after empty response error', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createEmptyResponseMessage(0, 0),
      ]);

      // Start regeneration
      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });

    it('should clear tracking on retry to allow new attempt', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // First attempt - empty response
      store.getState().setMessages(prev => [...prev, createEmptyResponseMessage(0, 0)]);
      store.getState().markAnalysisCreated(0);

      // Start regeneration
      store.getState().startRegeneration(0);

      // Tracking cleared
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should successfully recover with good response on retry', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // First attempt - empty response
      store.getState().setMessages(prev => [...prev, createEmptyResponseMessage(0, 0)]);

      // Start regeneration
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().startRegeneration(0);

      // Retry succeeds
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createSuccessfulMessage(0, 0)]);
      store.getState().setIsStreaming(false);
      store.getState().completeRegeneration(0);

      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].metadata?.hasError).toBe(false);
      expect(state.messages[1].metadata?.finishReason).toBe(FinishReasons.STOP);
      expect(state.isRegenerating).toBe(false);
    });
  });

  // ==========================================================================
  // ERROR STATE PERSISTENCE
  // ==========================================================================

  describe('error State Persistence', () => {
    it('should preserve empty response error state after initialization', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      // Simulate loading thread with empty response error
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createEmptyResponseMessage(0, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.hasError).toBe(true);
      expect(msg.metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);
      expect(msg.metadata?.isEmptyResponse).toBe(true);
    });

    it('should preserve validation error state after initialization', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createValidationErrorMessage(0, 0, 'Stored validation error'),
      ];

      store.getState().initializeThread(thread, participants, messages);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.hasError).toBe(true);
      expect(msg.metadata?.errorCategory).toBe('validation_error');
    });
  });

  // ==========================================================================
  // ANALYSIS BEHAVIOR WITH EMPTY RESPONSES
  // ==========================================================================

  describe('analysis Behavior with Empty Responses', () => {
    it('should create analysis even when all participants return empty', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createEmptyResponseMessage(0, 0),
        createEmptyResponseMessage(1, 0),
      ]);

      // Analysis can still be created
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should allow analysis to fail gracefully with empty inputs', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createEmptyResponseMessage(0, 0),
      ]);

      // Analysis fails due to no content
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'No content to analyze - all participants returned empty responses',
      }));

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toContain('empty responses');
    });

    it('should allow navigation with failed analysis from empty responses', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createEmptyResponseMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis failed
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
      }));

      // Can navigate (failed is terminal)
      const analysis = store.getState().analyses[0];
      const canNavigate = analysis.status === AnalysisStatuses.COMPLETE
        || analysis.status === AnalysisStatuses.FAILED;

      expect(canNavigate).toBe(true);
    });
  });

  // ==========================================================================
  // COMPLETE JOURNEY WITH EMPTY RESPONSE
  // ==========================================================================

  describe('complete Journey with Empty Response', () => {
    it('should handle empty response → retry → success journey', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'openai/o1' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-opus-4' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // PHASE 1: First attempt - o1 empty, claude succeeds
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 0, 'openai/o1'),
        createSuccessfulMessage(1, 0, 'anthropic/claude-opus-4'),
      ]);
      store.getState().setIsStreaming(false);

      // Analysis completes with partial results
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // PHASE 2: User initiates retry
      store.getState().removeAnalysis(0);
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().startRegeneration(0);

      // PHASE 3: Regeneration - both succeed this time
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createSuccessfulMessage(0, 0, 'openai/o1'),
        createSuccessfulMessage(1, 0, 'anthropic/claude-opus-4'),
      ]);
      store.getState().setIsStreaming(false);

      // PHASE 4: New analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().completeRegeneration(0);

      // Verify recovery
      const state = store.getState();
      expect(state.isRegenerating).toBe(false);
      expect(state.messages).toHaveLength(3);
      expect(state.messages.every(m => m.role === UIMessageRoles.USER || !m.metadata?.hasError)).toBe(true);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle mixed success/empty across multiple rounds', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'openai/o1' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-opus-4' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Round 0: Both succeed
      store.getState().setMessages(prev => [
        ...prev,
        createSuccessfulMessage(0, 0, 'openai/o1'),
        createSuccessfulMessage(1, 0, 'anthropic/claude-opus-4'),
      ]);

      // Add round 0 analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 1: User message
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);

      // Round 1: o1 empty, claude succeeds
      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 1, 'openai/o1'),
        createSuccessfulMessage(1, 1, 'anthropic/claude-opus-4'),
      ]);

      const state = store.getState();

      // Round 0 - both success
      expect(state.messages[1].metadata?.hasError).toBe(false);
      expect(state.messages[2].metadata?.hasError).toBe(false);

      // Round 1 - p0 empty, p1 success
      expect(state.messages[4].metadata?.hasError).toBe(true);
      expect(state.messages[4].metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);
      expect(state.messages[5].metadata?.hasError).toBe(false);
    });
  });

  // ==========================================================================
  // USAGE TRACKING WITH EMPTY RESPONSES
  // ==========================================================================

  describe('usage Tracking with Empty Responses', () => {
    it('should have zero usage for empty response', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createEmptyResponseMessage(0, 0);
      // Empty response typically has zero or undefined usage
      errorMsg.metadata = {
        ...errorMsg.metadata,
        usage: {
          promptTokens: 100,
          completionTokens: 0,
          totalTokens: 100,
        },
      };
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.usage?.completionTokens).toBe(0);
    });

    it('should track usage correctly for successful messages', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const successMsg = createSuccessfulMessage(0, 0);
      store.getState().setMessages(prev => [...prev, successMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.usage?.completionTokens).toBe(416);
      expect(msg.metadata?.usage?.totalTokens).toBe(516);
    });
  });

  // ==========================================================================
  // ERROR TYPE CLASSIFICATION
  // ==========================================================================

  describe('error Type Classification', () => {
    it('should classify empty_response error type correctly', () => {
      const msg = createEmptyResponseMessage(0, 0);
      expect(msg.metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);
    });

    it('should differentiate empty_response from other error types', () => {
      const emptyMsg = createEmptyResponseMessage(0, 0);
      const validationMsg = createValidationErrorMessage(0, 0, 'Error');

      expect(emptyMsg.metadata?.errorType).toBe(ErrorTypes.EMPTY_RESPONSE);
      expect(validationMsg.metadata?.errorType).toBe(ErrorTypes.UNKNOWN);
    });

    it('should identify messages by error type for filtering', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [
        ...prev,
        createEmptyResponseMessage(0, 0),
        createValidationErrorMessage(1, 0, 'Error'),
      ]);

      const emptyResponses = store.getState().messages.filter(
        m => m.metadata?.errorType === ErrorTypes.EMPTY_RESPONSE,
      );
      const otherErrors = store.getState().messages.filter(
        m => m.metadata?.hasError && m.metadata?.errorType !== ErrorTypes.EMPTY_RESPONSE,
      );

      expect(emptyResponses).toHaveLength(1);
      expect(otherErrors).toHaveLength(1);
    });
  });
});
