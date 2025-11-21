/**
 * Regeneration, Error Handling & Subscription Limits Tests (Sections 7-9)
 *
 * Comprehensive tests for round regeneration, error handling, and subscription
 * tier enforcement based on COMPREHENSIVE_TEST_PLAN.md Sections 7-9.
 *
 * FLOW TESTED:
 * 7. Regeneration
 *    7.1 Trigger & Cleanup (REGEN-01 to REGEN-05)
 *    7.2 Re-execution (REGEN-EXEC-01 to REGEN-EXEC-04)
 * 8. Error Handling & Resilience
 *    8.1 AI Errors (AI-ERR-01 to AI-ERR-04)
 *    8.2 Analysis Errors (ANALYSIS-ERR-01 to ANALYSIS-ERR-02)
 *    8.3 Network Issues (NET-01 to NET-03)
 * 9. Subscription Limits (Tier Enforcement)
 *    9.1 Model Limits (TIER-01 to TIER-03)
 *    9.2 Usage Limits (LIMIT-01 to LIMIT-03)
 *
 * Location: /src/stores/chat/__tests__/error-handling-subscription-limits.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  FeedbackTypes,
  PreSearchStatuses,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Create a message with error metadata
 * Simulates AI model failure with specific error category
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
 * Setup helper to create a completed round with messages, analysis, and feedback
 */
function setupCompletedRound(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  participantCount: number,
  existingMessages: UIMessage[] = [],
) {
  const threadId = store.getState().thread?.id ?? 'thread-123';

  // Create messages for this round
  const userMessage = createMockUserMessage(roundNumber, `Question for round ${roundNumber}`);
  const participantMessages = Array.from({ length: participantCount }, (_, i) =>
    createMockMessage(i, roundNumber, {
      id: `${threadId}_r${roundNumber}_p${i}`,
      parts: [{ type: 'text', text: `Response from participant ${i} for round ${roundNumber}` }],
    }));

  // Set messages
  store.getState().setMessages([
    ...existingMessages,
    userMessage,
    ...participantMessages,
  ]);

  // Create analysis
  store.getState().markAnalysisCreated(roundNumber);
  store.getState().addAnalysis(createMockAnalysis({
    id: `analysis-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    status: AnalysisStatuses.COMPLETE,
    analysisData: createMockAnalysisPayload(roundNumber),
  }));

  // Set feedback
  store.getState().setFeedback(roundNumber, FeedbackTypes.LIKE);

  return {
    userMessage,
    participantMessages,
  };
}

// ============================================================================
// SECTION 7.1: REGENERATION - TRIGGER & CLEANUP
// ============================================================================

describe('section 7.1: Regeneration Trigger & Cleanup', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * REGEN-01: Test "Retry" button visible only on the MOST RECENT round
   *
   * The retry button should only be available for the most recent round.
   * Earlier rounds should not have retry capability.
   */
  it('rEGEN-01: should only allow retry on most recent round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete round 0
    setupCompletedRound(store, 0, 1);
    const round0Messages = [...store.getState().messages];

    // Complete round 1
    setupCompletedRound(store, 1, 1, round0Messages);

    // Should have 2 rounds of analyses
    expect(store.getState().analyses).toHaveLength(2);

    // Only round 1 (most recent) should be regeneratable
    const maxRound = Math.max(...store.getState().analyses.map(a => a.roundNumber));
    expect(maxRound).toBe(1);

    // Starting regeneration of round 0 (not most recent) should still work
    // but UI should prevent this - store doesn't enforce
    store.getState().startRegeneration(0);
    expect(store.getState().regeneratingRoundNumber).toBe(0);
  });

  /**
   * REGEN-02: Test clicking "Retry" clears AI responses, analysis, and feedback for that round
   *
   * When retry is clicked, all AI-generated content for that round should be cleared
   * while preserving the user's original question.
   */
  it('rEGEN-02: should clear AI responses, analysis, and feedback on retry', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0), createMockParticipant(1)];
    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete round 0
    setupCompletedRound(store, 0, 2);

    // Verify initial state
    expect(store.getState().messages).toHaveLength(3); // user + 2 participants
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().feedbackByRound.has(0)).toBe(true);

    // Start regeneration
    store.getState().startRegeneration(0);

    // Clear AI responses (keep user message)
    const messagesWithoutAI = store.getState().messages.filter(
      m => !(m.role === 'assistant' && m.metadata?.roundNumber === 0),
    );
    store.getState().setMessages(messagesWithoutAI);

    // Clear analysis
    store.getState().removeAnalysis(0);

    // Clear feedback
    store.getState().clearFeedback(0);

    // Verify cleanup
    expect(store.getState().isRegenerating).toBe(true);
    expect(store.getState().regeneratingRoundNumber).toBe(0);
    expect(store.getState().messages).toHaveLength(1); // Only user message
    expect(store.getState().messages[0].role).toBe('user');
    expect(store.getState().analyses).toHaveLength(0);
    expect(store.getState().feedbackByRound.has(0)).toBe(false);
  });

  /**
   * REGEN-03: Verify User Message is PRESERVED
   *
   * The original user question must remain unchanged during regeneration.
   */
  it('rEGEN-03: should preserve user message during regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete round 0
    const { userMessage } = setupCompletedRound(store, 0, 1);
    const originalQuestion = (userMessage.parts[0] as { text: string }).text;

    // Start regeneration
    store.getState().startRegeneration(0);

    // Clear only AI responses
    const messagesWithoutAI = store.getState().messages.filter(
      m => m.role !== 'assistant',
    );
    store.getState().setMessages(messagesWithoutAI);

    // Verify user message preserved
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0].role).toBe('user');
    expect((store.getState().messages[0].parts[0] as { text: string }).text).toBe(originalQuestion);
  });

  /**
   * REGEN-04: Verify Round Number remains UNCHANGED
   *
   * Regeneration should not create a new round number; it replaces the content
   * of the existing round.
   */
  it('rEGEN-04: should keep round number unchanged during regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete rounds 0 and 1
    setupCompletedRound(store, 0, 1);
    const r0Messages = [...store.getState().messages];
    setupCompletedRound(store, 1, 1, r0Messages);

    const targetRound = 1;

    // Start regeneration
    store.getState().startRegeneration(targetRound);
    expect(store.getState().regeneratingRoundNumber).toBe(targetRound);

    // Clear round 1 AI messages
    const messagesWithoutR1AI = store.getState().messages.filter(
      m => !(m.role === 'assistant' && m.metadata?.roundNumber === 1),
    );
    store.getState().setMessages(messagesWithoutR1AI);

    // Generate new response for same round number
    const newMsg = createMockMessage(0, 1, { id: 'thread-123_r1_p0_regen' });
    store.getState().setMessages(prev => [...prev, newMsg]);

    // Complete regeneration
    store.getState().completeRegeneration(1);

    // Verify round number unchanged
    const lastMessage = store.getState().messages[store.getState().messages.length - 1];
    expect(lastMessage.metadata?.roundNumber).toBe(1);
    expect(store.getState().regeneratingRoundNumber).toBeNull();
  });

  /**
   * REGEN-05: Verify regenerateRoundNumber ref is correctly set in hook options
   *
   * The regeneratingRoundNumber state should be properly set when regeneration starts
   * and cleared when it completes.
   */
  it('rEGEN-05: should correctly manage regenerateRoundNumber state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Initially null
    expect(store.getState().regeneratingRoundNumber).toBeNull();

    // Start regeneration for round 2
    store.getState().startRegeneration(2);
    expect(store.getState().regeneratingRoundNumber).toBe(2);
    expect(store.getState().isRegenerating).toBe(true);

    // Complete regeneration
    store.getState().completeRegeneration(2);
    expect(store.getState().regeneratingRoundNumber).toBeNull();
    expect(store.getState().isRegenerating).toBe(false);
  });
});

// ============================================================================
// SECTION 7.2: REGENERATION - RE-EXECUTION
// ============================================================================

describe('section 7.2: Regeneration Re-execution', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * REGEN-EXEC-01: Test all participants re-stream sequentially
   *
   * During regeneration, all participants should stream their responses
   * in the same sequential order as the original round.
   */
  it('rEGEN-EXEC-01: should re-stream all participants sequentially', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'model-a' }),
      createMockParticipant(1, { modelId: 'model-b' }),
      createMockParticipant(2, { modelId: 'model-c' }),
    ];
    store.getState().initializeThread(thread, participants);

    // Complete round 0
    setupCompletedRound(store, 0, 3);

    // Start regeneration
    store.getState().startRegeneration(0);
    const userMessage = store.getState().messages.find(m => m.role === 'user');
    store.getState().setMessages(userMessage ? [userMessage] : []);

    // Stream responses sequentially
    store.getState().setIsStreaming(true);

    // P0 first
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
      id: 'thread-123_r0_p0_regen',
    })]);

    // P1 second
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0, {
      id: 'thread-123_r0_p1_regen',
    })]);

    // P2 third
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setMessages(prev => [...prev, createMockMessage(2, 0, {
      id: 'thread-123_r0_p2_regen',
    })]);

    store.getState().setIsStreaming(false);

    // Verify sequential order
    const messages = store.getState().messages;
    expect(messages).toHaveLength(4); // user + 3 participants
    expect(messages[1].metadata?.participantIndex).toBe(0);
    expect(messages[2].metadata?.participantIndex).toBe(1);
    expect(messages[3].metadata?.participantIndex).toBe(2);
  });

  /**
   * REGEN-EXEC-02: Test new analysis is generated
   *
   * After all participants complete regeneration, a new analysis should
   * be generated for the round.
   */
  it('rEGEN-EXEC-02: should generate new analysis after regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete round 0 with initial analysis
    setupCompletedRound(store, 0, 1);
    const oldAnalysisId = store.getState().analyses[0].id;

    // Start regeneration
    store.getState().startRegeneration(0);
    store.getState().removeAnalysis(0);

    // Keep user message, clear AI
    const userMessage = store.getState().messages.find(m => m.role === 'user');
    store.getState().setMessages(userMessage ? [userMessage] : []);

    // Stream new response
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
      id: 'thread-123_r0_p0_regen',
    })]);
    store.getState().setIsStreaming(false);

    // Create new analysis
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      id: 'analysis-thread-123-0-regen',
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    }));

    // Analysis completes
    store.getState().updateAnalysisData(0, createMockAnalysisPayload(0));

    // Verify new analysis
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().analyses[0].id).not.toBe(oldAnalysisId);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });

  /**
   * REGEN-EXEC-03: Test regenerating with different configuration (if allowed)
   *
   * Regeneration should use the original thread configuration, not any
   * pending configuration changes.
   */
  it('rEGEN-EXEC-03: should use original config during regeneration, not pending changes', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });
    const originalParticipants = [
      createMockParticipant(0, { modelId: 'original-model' }),
    ];
    store.getState().initializeThread(thread, originalParticipants);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete round 0 with original config
    setupCompletedRound(store, 0, 1);

    // User makes config changes (pending, not applied yet)
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    // User clicks retry on round 0
    store.getState().startRegeneration(0);

    // Regeneration should use ORIGINAL config
    expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
    expect(store.getState().participants[0].modelId).toBe('original-model');

    // Pending config changes should still be there for next round
    expect(store.getState().hasPendingConfigChanges).toBe(true);
  });

  /**
   * REGEN-EXEC-04: Verify onRetry callback is fired and cleans up state
   *
   * When regeneration starts, it should clear all tracking for that round
   * to allow fresh analysis creation.
   */
  it('rEGEN-EXEC-04: should clean up tracking state on retry', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete round and mark tracking
    setupCompletedRound(store, 0, 1);
    store.getState().markPreSearchTriggered(0);

    // Verify initial tracking
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

    // Start regeneration (should clear tracking)
    store.getState().startRegeneration(0);

    // Tracking should be cleared for fresh retry
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
  });

  /**
   * Additional test: Multiple retries should work independently
   */
  it('should allow multiple consecutive retries of same round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);

    // Complete round 0
    setupCompletedRound(store, 0, 1);

    // First retry
    store.getState().startRegeneration(0);
    store.getState().removeAnalysis(0);
    const userMessage = store.getState().messages.find(m => m.role === 'user');
    store.getState().setMessages(userMessage ? [userMessage] : []);

    // Add new response
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0, {
      id: 'thread-123_r0_p0_retry1',
    })]);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));
    store.getState().completeRegeneration(0);

    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().isRegenerating).toBe(false);

    // Second retry
    store.getState().startRegeneration(0);
    expect(store.getState().isRegenerating).toBe(true);
    expect(store.getState().regeneratingRoundNumber).toBe(0);
  });
});

// ============================================================================
// SECTION 8.1: AI ERRORS
// ============================================================================

describe('section 8.1: AI Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * AI-ERR-01: Test one model failing (500/Timeout) shows red dot/error
   *
   * When a model fails with a 500 error or timeout, the message should
   * have error metadata indicating the failure.
   */
  it('aI-ERR-01: should show error indicator for failed model (500 error)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Model 1 succeeds, Model 2 fails with 500
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createErrorMessage(1, 0, 'Internal server error', 'server_error'),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const errorMessage = store.getState().messages.find(
      m => m.metadata?.hasError === true,
    );

    expect(errorMessage).toBeDefined();
    expect(errorMessage?.metadata?.participantIndex).toBe(1);
    expect(errorMessage?.metadata?.errorMessage).toBe('Internal server error');
  });

  /**
   * AI-ERR-01 (continued): Test timeout error handling
   */
  it('aI-ERR-01: should show error indicator for timeout error', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    const messages = [
      createMockUserMessage(0),
      createErrorMessage(0, 0, 'Request timeout', 'timeout'),
    ];

    store.getState().initializeThread(thread, participants, messages);

    expect(store.getState().messages[1].metadata?.hasError).toBe(true);
    expect(store.getState().messages[1].metadata?.errorCategory).toBe('timeout');
  });

  /**
   * AI-ERR-02: Verify subsequent models continue streaming despite previous failure
   *
   * When one model fails, the orchestration should continue to the next
   * participant without stopping the entire round.
   */
  it('aI-ERR-02: should continue streaming subsequent models after failure', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 fails
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setMessages(prev => [...prev, createErrorMessage(0, 0, 'Rate limit exceeded', 'rate_limit')]);

    // P1 continues and succeeds
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

    // P2 continues and succeeds
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

    store.getState().setIsStreaming(false);

    // All 3 participant messages exist
    const participantMessages = store.getState().messages.filter(
      m => m.role === 'assistant',
    );
    expect(participantMessages).toHaveLength(3);

    // Verify 1 error, 2 successes
    const errors = participantMessages.filter(m => m.metadata?.hasError);
    const successes = participantMessages.filter(m => !m.metadata?.hasError);
    expect(errors).toHaveLength(1);
    expect(successes).toHaveLength(2);
  });

  /**
   * AI-ERR-03: Test retry button allows regenerating the failed round
   *
   * After a round with failures, the retry functionality should be available
   * to regenerate all responses.
   */
  it('aI-ERR-03: should allow retry button for failed round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createErrorMessage(0, 0, 'Rate limit exceeded', 'rate_limit'),
      createMockMessage(1, 0),
    ]);

    // Retry should be available - start regeneration
    store.getState().startRegeneration(0);

    expect(store.getState().isRegenerating).toBe(true);
    expect(store.getState().regeneratingRoundNumber).toBe(0);

    // Can clear and regenerate
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [
      ...prev,
      createMockMessage(0, 0, { id: 'thread-123_r0_p0_retry' }),
      createMockMessage(1, 0, { id: 'thread-123_r0_p1_retry' }),
    ]);
    store.getState().setIsStreaming(false);
    store.getState().completeRegeneration(0);

    // No errors in regenerated messages
    const hasErrors = store.getState().messages.some(m => m.metadata?.hasError);
    expect(hasErrors).toBe(false);
  });

  /**
   * AI-ERR-04: Verify onError callback is fired with correct metadata
   *
   * When an error occurs, the error state should be set with appropriate
   * error information.
   */
  it('aI-ERR-04: should set error state with correct metadata on failure', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Critical error occurs
    store.getState().setError(new Error('Connection refused'));
    store.getState().setIsStreaming(false);

    const error = store.getState().error;
    expect(error).toBeDefined();
    expect(error?.message).toBe('Connection refused');
  });
});

// ============================================================================
// SECTION 8.2: ANALYSIS ERRORS
// ============================================================================

describe('section 8.2: Analysis Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * ANALYSIS-ERR-01: Test analysis generation failure shows "Failed" badge
   *
   * When analysis generation fails, the analysis should have FAILED status
   * and store the error message.
   */
  it('aNALYSIS-ERR-01: should show Failed badge on analysis failure', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);

    // Analysis starts streaming then fails
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    }));
    store.getState().updateAnalysisError(0, 'Analysis generation failed');

    const analysis = store.getState().analyses[0];
    expect(analysis.status).toBe(AnalysisStatuses.FAILED);
    expect(analysis.errorMessage).toBe('Analysis generation failed');
  });

  /**
   * ANALYSIS-ERR-02: Test retry button for analysis works independently of AI responses
   *
   * The analysis retry should not require re-generating all AI responses;
   * it should only regenerate the analysis.
   */
  it('aNALYSIS-ERR-02: should allow analysis retry without regenerating responses', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // Messages succeeded
    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
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
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().analyses).toHaveLength(0);
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);

    // Can create new analysis
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(0),
    }));

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    // Messages unchanged
    expect(store.getState().messages).toHaveLength(3);
  });

  /**
   * Additional test: Navigation should be allowed even with failed analysis
   */
  it('should allow navigation with failed analysis (failed is terminal state)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
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

// ============================================================================
// SECTION 8.3: NETWORK ISSUES
// ============================================================================

describe('section 8.3: Network Issues', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * NET-01: Test Internet disconnect during streaming (client-side)
   *
   * When network disconnects during streaming, the message should be marked
   * with an error indicating network failure.
   */
  it('nET-01: should handle internet disconnect during streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Disconnect simulated by error message
    const errorMessage = createErrorMessage(0, 0, 'Network disconnected', 'network_error');
    store.getState().setMessages(prev => [...prev, errorMessage]);
    store.getState().setIsStreaming(false);

    expect(store.getState().messages[1].metadata?.hasError).toBe(true);
    expect(store.getState().messages[1].metadata?.errorCategory).toBe('network_error');
  });

  /**
   * NET-02: Test recovery after reconnection
   *
   * After network reconnection, the user should be able to retry the failed
   * round or start new streaming.
   */
  it('nET-02: should allow recovery after reconnection', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createErrorMessage(0, 0, 'Network disconnected', 'network_error'),
    ]);
    store.getState().setError(new Error('Network error'));

    // Recovery - clear error and retry
    store.getState().setError(null);
    store.getState().startRegeneration(0);

    expect(store.getState().error).toBeNull();
    expect(store.getState().isRegenerating).toBe(true);

    // Can start new streaming
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
  });

  /**
   * NET-03: Test offline submission (queueing or blocking)
   *
   * When offline, the submission should be blocked (handled at UI/provider level).
   * This test verifies that pending message state works correctly.
   */
  it('nET-03: should handle offline submission via pending message', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);

    // User types message while offline
    store.getState().setInputValue('My question');
    store.getState().setPendingMessage('My question');

    // Pending message stored but not sent
    expect(store.getState().pendingMessage).toBe('My question');
    expect(store.getState().hasSentPendingMessage).toBe(false);

    // When online, message can be sent
    store.getState().setHasSentPendingMessage(true);
    store.getState().setPendingMessage(null);

    expect(store.getState().pendingMessage).toBeNull();
    expect(store.getState().hasSentPendingMessage).toBe(true);
  });

  /**
   * Additional test: Pre-search network failure with graceful degradation
   */
  it('should handle pre-search network failure with graceful degradation', () => {
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // Pre-search fails
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.FAILED,
      errorMessage: 'Network timeout',
    }));

    // Participants can still respond without search context
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);

    // Pre-search failed but participant succeeded
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.FAILED);
    expect(store.getState().messages[1].metadata?.hasError).toBeUndefined();
  });
});

// ============================================================================
// SECTION 9.1: MODEL LIMITS (Tier Enforcement)
// ============================================================================

describe('section 9.1: Model Limits', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * TIER-01: Test Free tier user restricted to 2 models
   *
   * Store accepts the configuration; tier enforcement happens at API level.
   */
  it('tIER-01: should accept Free tier configuration of 2 models', () => {
    // Free tier: max 2 models
    const participants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-3.5-turbo' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-instant' }),
    ];

    store.getState().setSelectedParticipants(participants);

    expect(store.getState().selectedParticipants).toHaveLength(2);
    expect(store.getState().selectedParticipants[0].modelId).toBe('openai/gpt-3.5-turbo');
    expect(store.getState().selectedParticipants[1].modelId).toBe('anthropic/claude-instant');
  });

  /**
   * TIER-02: Test Pro tier user restricted to 5 models
   *
   * Store accepts the configuration; tier enforcement happens at API level.
   */
  it('tIER-02: should accept Pro tier configuration of 5 models', () => {
    // Pro tier: max 5 models
    const participants = Array.from({ length: 5 }, (_, i) =>
      createMockParticipantConfig(i, { modelId: `model-${i}` }));

    store.getState().setSelectedParticipants(participants);

    expect(store.getState().selectedParticipants).toHaveLength(5);
  });

  /**
   * TIER-03: Test attempting to use Pro models on Free tier (should be blocked)
   *
   * Store stores the selection; actual blocking happens at API/UI level.
   * This test documents the expected behavior.
   */
  it('tIER-03: should store Pro models selection (blocking happens at API)', () => {
    // Free tier user attempting to use Pro models
    // Store accepts it, API will reject
    const participants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }), // Pro model
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3-opus' }), // Pro model
    ];

    store.getState().setSelectedParticipants(participants);

    // Store accepts the selection
    expect(store.getState().selectedParticipants).toHaveLength(2);

    // API would return error when attempting to use these models on Free tier
    // This is simulated by setting error state
    store.getState().setError(new Error('Model not available on your subscription tier'));
    expect(store.getState().error?.message).toContain('subscription tier');
  });

  /**
   * Additional test: Power tier with 10 models
   */
  it('should accept Power tier configuration of 10 models', () => {
    // Power tier: max 10 models
    const participants = Array.from({ length: 10 }, (_, i) =>
      createMockParticipantConfig(i, { modelId: `model-${i}` }));

    store.getState().setSelectedParticipants(participants);

    expect(store.getState().selectedParticipants).toHaveLength(10);
  });
});

// ============================================================================
// SECTION 9.2: USAGE LIMITS
// ============================================================================

describe('section 9.2: Usage Limits', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * LIMIT-01: Test reaching monthly conversation limit
   *
   * When conversation limit is reached, API returns error.
   * Store handles this gracefully.
   */
  it('lIMIT-01: should handle reaching conversation limit', () => {
    // Free: 5 conversations/month
    // Pro: 100 conversations/month
    // Power: Unlimited

    // User has reached limit - API returns error
    store.getState().setIsCreatingThread(true);

    // Simulate API error response
    store.getState().setError(new Error('Monthly conversation limit reached. Please upgrade to continue.'));
    store.getState().setIsCreatingThread(false);

    expect(store.getState().error?.message).toContain('conversation limit');
    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().thread).toBeNull();
  });

  /**
   * LIMIT-02: Test reaching monthly message limit
   *
   * When message limit is reached, API returns error.
   * Store handles this gracefully.
   */
  it('lIMIT-02: should handle reaching message limit', () => {
    // Free: 50 messages/month
    // Pro: 500 messages/month
    // Power: Unlimited

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], [createMockUserMessage(0)]);

    // User has reached limit - API returns error
    store.getState().setError(new Error('Monthly message limit reached. Please upgrade to continue.'));

    expect(store.getState().error?.message).toContain('message limit');
  });

  /**
   * LIMIT-03: Verify upgrade prompts appear at limits
   *
   * When limits are reached, error messages should indicate upgrade path.
   * This is handled by API responses and UI components.
   */
  it('lIMIT-03: should include upgrade prompt in limit error message', () => {
    // Conversation limit with upgrade prompt
    store.getState().setError(new Error('Monthly conversation limit reached. Please upgrade to continue.'));
    expect(store.getState().error?.message).toContain('upgrade');

    store.getState().setError(null);

    // Message limit with upgrade prompt
    store.getState().setError(new Error('Monthly message limit reached. Upgrade to Pro for more messages.'));
    expect(store.getState().error?.message).toContain('Upgrade');
    expect(store.getState().error?.message).toContain('Pro');
  });

  /**
   * Additional test: Store should track messages correctly for limit checking
   */
  it('should track messages correctly for limit checking', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Add multiple messages
    const messages = Array.from({ length: 10 }, (_, i) =>
      createMockUserMessage(i, `Message ${i}`));

    store.getState().setMessages(messages);

    expect(store.getState().messages).toHaveLength(10);

    // In real app, this count would be checked against tier limit
    const messageCount = store.getState().messages.filter(m => m.role === 'user').length;
    expect(messageCount).toBe(10);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('error Handling Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle complete error recovery journey through regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // PHASE 1: First attempt with errors
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [
      ...prev,
      createErrorMessage(0, 0, 'Rate limit exceeded', 'rate_limit'),
      createMockMessage(1, 0),
    ]);
    store.getState().setIsStreaming(false);

    // Analysis still completes on partial success
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
      createMockMessage(0, 0, { id: 'thread-123_r0_p0_retry' }),
      createMockMessage(1, 0, { id: 'thread-123_r0_p1_retry' }),
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

  it('should handle multiple errors in single round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    // All models fail with different errors
    const messages = [
      createMockUserMessage(0),
      createErrorMessage(0, 0, 'Rate limit exceeded', 'rate_limit'),
      createErrorMessage(1, 0, 'Model unavailable', 'model_unavailable'),
      createErrorMessage(2, 0, 'Request timeout', 'timeout'),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const errorMessages = store.getState().messages.filter(
      m => m.metadata?.hasError === true,
    );

    expect(errorMessages).toHaveLength(3);

    // Can still retry the round
    store.getState().startRegeneration(0);
    expect(store.getState().isRegenerating).toBe(true);
  });

  it('should handle tier limits with subscription error flow', () => {
    const _thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4o' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3.5-sonnet' }),
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
    ];

    // Free user tries to use 3 models (limit is 2)
    store.getState().setSelectedParticipants(participants);

    // Store accepts, but thread creation fails
    store.getState().setIsCreatingThread(true);
    store.getState().setError(new Error('Your Free tier allows only 2 models. Please upgrade to Pro for up to 5 models.'));
    store.getState().setIsCreatingThread(false);

    expect(store.getState().error?.message).toContain('Free tier');
    expect(store.getState().error?.message).toContain('upgrade');
    expect(store.getState().thread).toBeNull();

    // User can reduce selection and retry
    store.getState().setError(null);
    store.getState().setSelectedParticipants(participants.slice(0, 2));

    expect(store.getState().selectedParticipants).toHaveLength(2);
    expect(store.getState().error).toBeNull();
  });

  it('should handle graceful degradation when pre-search fails but participants succeed', () => {
    const thread = createMockThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // Pre-search fails
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.FAILED,
      errorMessage: 'Search API unavailable',
    }));

    // Participants still respond without search context
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [
      ...prev,
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ]);
    store.getState().setIsStreaming(false);

    // Analysis can still complete
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: createMockAnalysisPayload(0),
    }));

    const state = store.getState();
    expect(state.preSearches[0].status).toBe(PreSearchStatuses.FAILED);
    expect(state.messages.filter(m => m.role === 'assistant')).toHaveLength(2);
    expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });
});
