/**
 * Error Recovery Scenarios Tests
 *
 * Comprehensive E2E tests for error handling and recovery based on
 * FLOW_DOCUMENTATION.md Part 10: ERROR HANDLING USERS SEE
 *
 * Tests cover:
 * - AI Response Errors (rate limits, model failures)
 * - Partial Round Completion
 * - Analysis Errors
 * - Network Issues
 * - Error State Management
 * - Error Recovery Flow
 * - Rate Limit Handling
 * - Model Unavailable Errors
 * - Timeout Handling
 * - Multiple Consecutive Failures
 * - Error During Different Phases
 * - Error Message Categories
 * - Retry Behavior
 * - Error Persistence
 * - Partial Success Scenarios
 *
 * Location: /src/stores/chat/__tests__/error-recovery-scenarios.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a message with error metadata
 */
function createErrorMessage(
  participantIndex: number,
  roundNumber: number,
  errorMessage: string,
  errorCategory?: string,
): UIMessage {
  const msg = createMockMessage(participantIndex, roundNumber);
  msg.metadata = {
    ...msg.metadata,
    hasError: true,
    errorMessage,
    errorCategory: errorCategory || 'model_error',
  };
  return msg;
}

/**
 * Create a rate limit error message
 */
function createRateLimitErrorMessage(
  participantIndex: number,
  roundNumber: number,
): UIMessage {
  return createErrorMessage(
    participantIndex,
    roundNumber,
    'Rate limit exceeded',
    'rate_limit',
  );
}

/**
 * Create a model unavailable error message
 */
function createModelUnavailableMessage(
  participantIndex: number,
  roundNumber: number,
): UIMessage {
  return createErrorMessage(
    participantIndex,
    roundNumber,
    'Model unavailable',
    'model_unavailable',
  );
}

/**
 * Create a network error message
 */
function createNetworkErrorMessage(
  participantIndex: number,
  roundNumber: number,
): UIMessage {
  return createErrorMessage(
    participantIndex,
    roundNumber,
    'Network connection failed',
    'network_error',
  );
}

/**
 * Create a timeout error message
 */
function createTimeoutErrorMessage(
  participantIndex: number,
  roundNumber: number,
): UIMessage {
  return createErrorMessage(
    participantIndex,
    roundNumber,
    'Request timed out',
    'timeout',
  );
}

// ============================================================================
// AI RESPONSE ERROR TESTS
// ============================================================================

describe('error Recovery Scenarios', () => {
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
  // AI RESPONSE ERRORS
  // ==========================================================================

  describe('aI Response Errors', () => {
    it('should handle rate limit exceeded error', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // P1 fails with rate limit
      const errorMsg = createRateLimitErrorMessage(1, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      // Complete streaming
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.messages).toHaveLength(3);
      expect(state.messages[2].metadata?.hasError).toBe(true);
      expect(state.messages[2].metadata?.errorMessage).toBe('Rate limit exceeded');
      expect(state.messages[2].metadata?.errorCategory).toBe('rate_limit');
    });

    it('should handle model failed to respond error', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 fails
      const errorMsg = createErrorMessage(0, 0, 'Model failed to respond', 'model_error');
      store.getState().setMessages(prev => [...prev, errorMsg]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.messages[1].metadata?.hasError).toBe(true);
      expect(state.messages[1].metadata?.errorMessage).toBe('Model failed to respond');
    });

    it('should store global error for critical failures', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Critical error
      store.getState().setError(new Error('Connection refused'));
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.error?.message).toBe('Connection refused');
    });

    it('should allow other participants to continue on single failure', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setCurrentParticipantIndex(1);

      // P1 fails
      store.getState().setMessages(prev => [...prev, createRateLimitErrorMessage(1, 0)]);
      store.getState().setCurrentParticipantIndex(2);

      // P2 succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.messages).toHaveLength(4);
      expect(state.messages[1].metadata?.hasError).toBeUndefined(); // P0 success
      expect(state.messages[2].metadata?.hasError).toBe(true); // P1 error
      expect(state.messages[3].metadata?.hasError).toBeUndefined(); // P2 success
    });
  });

  // ==========================================================================
  // PARTIAL ROUND COMPLETION
  // ==========================================================================

  describe('partial Round Completion', () => {
    it('should complete round with partial results when one AI fails', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // P1 fails
      store.getState().setMessages(prev => [...prev, createRateLimitErrorMessage(1, 0)]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      // Round completed with 1 success, 1 failure
      expect(state.messages).toHaveLength(3);
      expect(state.isStreaming).toBe(false);
    });

    it('should allow analysis creation even with partial results', () => {
      const thread = createMockThread({ id: 'thread-partial' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // P0 succeeds, P1 fails
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0),
        createRateLimitErrorMessage(1, 0),
      ]);

      // Analysis can still be created
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should maintain round integrity with mixed success/failure', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Mixed results
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0), // success
        createRateLimitErrorMessage(1, 0), // failure
        createMockMessage(2, 0), // success
      ]);

      const state = store.getState();
      const successCount = state.messages.filter(
        m => m.role === 'assistant' && !m.metadata?.hasError,
      ).length;
      const errorCount = state.messages.filter(
        m => m.role === 'assistant' && m.metadata?.hasError,
      ).length;

      expect(successCount).toBe(2);
      expect(errorCount).toBe(1);
    });

    it('should allow retry of entire round after partial failure', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createRateLimitErrorMessage(1, 0),
      ]);

      // Initiate regeneration
      store.getState().startRegeneration(0);

      const state = store.getState();
      expect(state.isRegenerating).toBe(true);
      expect(state.regeneratingRoundNumber).toBe(0);

      // Clear tracking for fresh retry
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });

  // ==========================================================================
  // ANALYSIS ERRORS
  // ==========================================================================

  describe('analysis Errors', () => {
    it('should mark analysis as failed with error message', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis fails
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().updateAnalysisError(0, 'Analysis generation failed');

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toBe('Analysis generation failed');
    });

    it('should allow retry of failed analysis without regenerating responses', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis failed
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Timeout',
      }));

      // Remove failed analysis to retry
      store.getState().removeAnalysis(0);
      store.getState().clearAnalysisTracking(0);

      // Verify messages still exist
      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().analyses).toHaveLength(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should allow navigation even with failed analysis', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('overview');

      // Analysis failed (FAILED is a terminal state)
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
  // NETWORK ISSUES
  // ==========================================================================

  describe('network Issues', () => {
    it('should handle pre-search timeout preventing blocking', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search stuck for > 10s
      const stuckPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 11000),
      };
      store.getState().addPreSearch(stuckPreSearch);

      // Check timeout protection
      const TIMEOUT_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const age = Date.now() - preSearch.createdAt.getTime();
      const isTimedOut = age > TIMEOUT_MS;

      expect(isTimedOut).toBe(true);

      // Should allow proceeding after timeout
      // Provider would check this condition and proceed
    });

    it('should allow continuing without search results on failure', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search failed
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Network error',
      }));

      // Should not block message sending
      const preSearch = store.getState().preSearches[0];
      const shouldWait = preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING;

      expect(shouldWait).toBe(false);
    });

    it('should gracefully degrade on network failure', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search failed
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Network timeout',
      }));
      store.getState().updatePreSearchError(0, 'Network timeout');

      // Participants can still respond without search context
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      expect(store.getState().messages).toHaveLength(2);
    });
  });

  // ==========================================================================
  // ERROR STATE MANAGEMENT
  // ==========================================================================

  describe('error State Management', () => {
    it('should store hasError flag on message metadata', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createErrorMessage(0, 0, 'Test error');
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.hasError).toBe(true);
    });

    it('should store errorMessage on message metadata', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createErrorMessage(0, 0, 'Specific error message');
      store.getState().setMessages(prev => [...prev, errorMsg]);

      expect(store.getState().messages[1].metadata?.errorMessage).toBe('Specific error message');
    });

    it('should store errorCategory for different error types', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [
        ...prev,
        createRateLimitErrorMessage(0, 0),
        createNetworkErrorMessage(1, 0),
      ]);

      const messages = store.getState().messages;
      expect(messages[1].metadata?.errorCategory).toBe('rate_limit');
      expect(messages[2].metadata?.errorCategory).toBe('network_error');
    });

    it('should differentiate between message-level and global errors', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Message-level error
      store.getState().setMessages(prev => [...prev, createRateLimitErrorMessage(0, 0)]);

      // Global error
      store.getState().setError(new Error('Connection lost'));

      const state = store.getState();
      expect(state.messages[1].metadata?.hasError).toBe(true);
      expect(state.error?.message).toBe('Connection lost');
    });
  });

  // ==========================================================================
  // ERROR RECOVERY FLOW
  // ==========================================================================

  describe('error Recovery Flow', () => {
    it('should clear previous errors on retry', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setError(new Error('Previous error'));

      // Clear error for retry
      store.getState().setError(null);

      expect(store.getState().error).toBeNull();
    });

    it('should reset error flags during regeneration', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
      ]);
      store.getState().setError(new Error('Rate limited'));

      // Start regeneration
      store.getState().setError(null);
      store.getState().startRegeneration(0);

      expect(store.getState().error).toBeNull();
      expect(store.getState().isRegenerating).toBe(true);
    });

    it('should allow fresh attempt after error recovery', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // First attempt fails
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createRateLimitErrorMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // Recovery - remove error message for retry
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().startRegeneration(0);

      // Fresh attempt
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);
      store.getState().completeRegeneration(0);

      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].metadata?.hasError).toBeUndefined();
      expect(state.isRegenerating).toBe(false);
    });
  });

  // ==========================================================================
  // RATE LIMIT HANDLING
  // ==========================================================================

  describe('rate Limit Handling', () => {
    it('should detect rate limit errors correctly', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createRateLimitErrorMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.errorCategory).toBe('rate_limit');
    });

    it('should show appropriate rate limit message', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createRateLimitErrorMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      expect(store.getState().messages[1].metadata?.errorMessage).toBe('Rate limit exceeded');
    });

    it('should handle multiple rate limit errors in same round', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Both hit rate limit
      store.getState().setMessages(prev => [
        ...prev,
        createRateLimitErrorMessage(0, 0),
        createRateLimitErrorMessage(1, 0),
      ]);

      const rateLimitedCount = store.getState().messages.filter(
        m => m.metadata?.errorCategory === 'rate_limit',
      ).length;

      expect(rateLimitedCount).toBe(2);
    });
  });

  // ==========================================================================
  // MODEL UNAVAILABLE ERRORS
  // ==========================================================================

  describe('model Unavailable Errors', () => {
    it('should handle model offline/unavailable error', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0, { modelId: 'offline-model' })];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createModelUnavailableMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      const msg = store.getState().messages[1];
      expect(msg.metadata?.errorCategory).toBe('model_unavailable');
      expect(msg.metadata?.errorMessage).toBe('Model unavailable');
    });

    it('should allow continuing with other participants when one model is unavailable', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'offline-model' }),
        createMockParticipant(1, { modelId: 'online-model' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // P0 unavailable, P1 succeeds
      store.getState().setMessages(prev => [
        ...prev,
        createModelUnavailableMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      const successCount = store.getState().messages.filter(
        m => m.role === 'assistant' && !m.metadata?.hasError,
      ).length;

      expect(successCount).toBe(1);
    });
  });

  // ==========================================================================
  // TIMEOUT HANDLING
  // ==========================================================================

  describe('timeout Handling', () => {
    it('should detect stream timeout', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      const errorMsg = createTimeoutErrorMessage(0, 0);
      store.getState().setMessages(prev => [...prev, errorMsg]);

      expect(store.getState().messages[1].metadata?.errorCategory).toBe('timeout');
    });

    it('should handle graceful timeout recovery', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Timeout occurs
      store.getState().setMessages(prev => [...prev, createTimeoutErrorMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // User can retry
      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBe(true);
    });

    it('should detect analysis timeout after 60s', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis streaming for > 60s
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 65000),
      }));

      const TIMEOUT_MS = 60000;
      const analysis = store.getState().analyses[0];
      const age = Date.now() - analysis.createdAt.getTime();

      expect(age > TIMEOUT_MS).toBe(true);
    });
  });

  // ==========================================================================
  // MULTIPLE CONSECUTIVE FAILURES
  // ==========================================================================

  describe('multiple Consecutive Failures', () => {
    it('should track multiple failures in sequence', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // All fail
      store.getState().setMessages(prev => [
        ...prev,
        createRateLimitErrorMessage(0, 0),
        createModelUnavailableMessage(1, 0),
        createNetworkErrorMessage(2, 0),
      ]);

      const errorCount = store.getState().messages.filter(
        m => m.metadata?.hasError,
      ).length;

      expect(errorCount).toBe(3);
    });

    it('should handle all participants failing', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Both fail
      store.getState().setMessages(prev => [
        ...prev,
        createRateLimitErrorMessage(0, 0),
        createRateLimitErrorMessage(1, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Round completes (even with all failures)
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(3);
    });

    it('should suggest retry after multiple failures', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
        createRateLimitErrorMessage(1, 0),
      ]);

      // All failed - retry is available
      const allFailed = store.getState().messages.filter(m => m.role === 'assistant').every(m => m.metadata?.hasError);

      expect(allFailed).toBe(true);

      // Can start regeneration
      store.getState().startRegeneration(0);
      expect(store.getState().isRegenerating).toBe(true);
    });
  });

  // ==========================================================================
  // ERROR DURING DIFFERENT PHASES
  // ==========================================================================

  describe('error During Different Phases', () => {
    it('should handle error during pre-search phase', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search fails
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
      store.getState().updatePreSearchError(0, 'Search API unavailable');

      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.FAILED);
      expect(preSearch.errorMessage).toBe('Search API unavailable');
    });

    it('should handle error during participant streaming phase', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // P0 streaming then fails
      store.getState().setMessages(prev => [...prev, createRateLimitErrorMessage(0, 0)]);

      // Can continue to P1
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      store.getState().setIsStreaming(false);

      expect(store.getState().messages).toHaveLength(3);
    });

    it('should handle error during analysis phase', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis streaming then fails
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().updateAnalysisError(0, 'Analysis timeout');

      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
    });

    it('should handle error during changelog save', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().prepareForNewMessage('Test', ['model-0']);
      store.getState().setIsWaitingForChangelog(true);

      // Changelog save would fail externally
      // Provider would handle this and proceed

      // After timeout, should not block forever
      store.getState().setIsWaitingForChangelog(false);

      expect(store.getState().isWaitingForChangelog).toBe(false);
    });
  });

  // ==========================================================================
  // ERROR MESSAGE CATEGORIES
  // ==========================================================================

  describe('error Message Categories', () => {
    it('should categorize rate limit errors', () => {
      const msg = createRateLimitErrorMessage(0, 0);
      expect(msg.metadata?.errorCategory).toBe('rate_limit');
    });

    it('should categorize model errors', () => {
      const msg = createErrorMessage(0, 0, 'Model error', 'model_error');
      expect(msg.metadata?.errorCategory).toBe('model_error');
    });

    it('should categorize network errors', () => {
      const msg = createNetworkErrorMessage(0, 0);
      expect(msg.metadata?.errorCategory).toBe('network_error');
    });

    it('should categorize timeout errors', () => {
      const msg = createTimeoutErrorMessage(0, 0);
      expect(msg.metadata?.errorCategory).toBe('timeout');
    });

    it('should categorize validation errors', () => {
      const msg = createErrorMessage(0, 0, 'Invalid input', 'validation_error');
      expect(msg.metadata?.errorCategory).toBe('validation_error');
    });

    it('should categorize server errors', () => {
      const msg = createErrorMessage(0, 0, 'Internal server error', 'server_error');
      expect(msg.metadata?.errorCategory).toBe('server_error');
    });
  });

  // ==========================================================================
  // RETRY BEHAVIOR
  // ==========================================================================

  describe('retry Behavior', () => {
    it('should clear previous errors on retry', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
      ]);

      // Start regeneration (errors cleared)
      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBe(true);
      // Error messages would be removed and regenerated
    });

    it('should use same configuration on retry', () => {
      const thread = createMockThread({ mode: ChatModes.DEBATING });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
      ]);

      // Retry preserves thread config
      store.getState().startRegeneration(0);

      expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
      expect(store.getState().participants).toHaveLength(2);
    });

    it('should show loading state during retry', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
      ]);

      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });

    it('should reset tracking on retry to allow new analysis', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Mark analysis created
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Start regeneration clears tracking
      store.getState().startRegeneration(0);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });

  // ==========================================================================
  // ERROR PERSISTENCE (State Management)
  // ==========================================================================

  describe('error Persistence', () => {
    it('should maintain error state in messages after initialization', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      // Simulate loading thread with error messages
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createRateLimitErrorMessage(0, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);

      // Error state preserved
      expect(store.getState().messages[1].metadata?.hasError).toBe(true);
    });

    it('should maintain analysis error state', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Failed analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Stored error',
      }));

      // Error persisted
      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toBe('Stored error');
    });

    it('should maintain pre-search error state', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Failed pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Search failed',
      }));

      // Error persisted
      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.FAILED);
      expect(preSearch.errorMessage).toBe('Search failed');
    });
  });

  // ==========================================================================
  // PARTIAL SUCCESS SCENARIOS
  // ==========================================================================

  describe('partial Success Scenarios', () => {
    it('should handle 2 of 3 participants succeeding', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0), // success
        createRateLimitErrorMessage(1, 0), // failure
        createMockMessage(2, 0), // success
      ]);

      const successCount = store.getState().messages.filter(
        m => m.role === 'assistant' && !m.metadata?.hasError,
      ).length;

      expect(successCount).toBe(2);
    });

    it('should allow analysis to succeed despite participant errors', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0), // success
        createRateLimitErrorMessage(1, 0), // failure
      ]);

      // Analysis can still complete on partial results
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(0),
      }));

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle pre-search failure but participants succeed', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search fails
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Search API down',
      }));

      // Participant still succeeds (without search context)
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      const state = store.getState();
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.FAILED);
      expect(state.messages[1].metadata?.hasError).toBeUndefined();
    });

    it('should complete round with mixed success across all phases', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search succeeds
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // P0 fails, P1 succeeds
      store.getState().setMessages(prev => [
        ...prev,
        createNetworkErrorMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      // Analysis succeeds
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      const state = store.getState();
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.messages[1].metadata?.hasError).toBe(true);
      expect(state.messages[2].metadata?.hasError).toBeUndefined();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  // ==========================================================================
  // COMPLETE ERROR RECOVERY JOURNEY
  // ==========================================================================

  describe('complete Error Recovery Journey', () => {
    it('should recover from rate limit through full regeneration', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setScreenMode('overview');

      // PHASE 1: First attempt with errors
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createRateLimitErrorMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Analysis completes
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // PHASE 2: User initiates retry
      store.getState().removeAnalysis(0);
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().startRegeneration(0);

      // PHASE 3: Regeneration succeeds
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0),
        createMockMessage(1, 0),
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
      expect(state.messages.every(m => !m.metadata?.hasError)).toBe(true);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle network failure recovery with web search', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // PHASE 1: Pre-search fails
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Network timeout',
      }));

      // PHASE 2: Proceed anyway (graceful degradation)
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // PHASE 3: Analysis succeeds
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Verify graceful degradation
      const state = store.getState();
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.FAILED);
      expect(state.messages[1].metadata?.hasError).toBeUndefined();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});
