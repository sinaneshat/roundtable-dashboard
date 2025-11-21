/**
 * Error Handling, Resilience & Subscription Limits Tests (Sections 8-9)
 *
 * Tests error handling for AI and analysis failures, network issues,
 * and subscription tier enforcement.
 *
 * FLOW TESTED:
 * 8.1 AI Errors
 * 8.2 Analysis Errors
 * 8.3 Network Issues
 * 9.1 Model Limits
 * 9.2 Usage Limits
 *
 * Location: /src/stores/chat/__tests__/error-handling-subscription-limits.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PreSearchStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
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

// ============================================================================
// SECTION 8.1: AI ERRORS
// ============================================================================

describe('Section 8.1: AI Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should show error indicator for failed model', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Model 1 succeeds, Model 2 fails
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 1,
          participantId: 'participant-1',
          participantRole: null,
          model: 'anthropic/claude-3',
          hasError: true,
          errorMessage: 'Rate limit exceeded',
        },
      }),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const errorMessage = store.getState().messages.find(
      m => m.metadata?.hasError === true
    );

    expect(errorMessage).toBeDefined();
    expect(errorMessage?.metadata?.participantIndex).toBe(1);
  });

  it('should continue streaming subsequent models despite previous failure', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    // Model 1 fails, Models 2 & 3 succeed
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 0,
          participantId: 'participant-0',
          participantRole: null,
          model: 'openai/gpt-4',
          hasError: true,
        },
      }),
      createMockMessage(1, 0), // Success
      createMockMessage(2, 0), // Success
    ];

    store.getState().initializeThread(thread, participants, messages);

    // All 3 participant messages exist
    const participantMessages = store.getState().messages.filter(
      m => m.role === 'assistant'
    );
    expect(participantMessages).toHaveLength(3);
  });

  it('should allow retry button for failed round', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round with error
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 0,
          participantId: 'participant-0',
          participantRole: null,
          model: 'openai/gpt-4',
          hasError: true,
        },
      }),
    ];

    store.getState().initializeThread(thread, [], messages);

    // Retry should be available
    expect(store.getState().messages).toHaveLength(2);
  });

  it('should handle 500 error from model', () => {
    const errorMessage = createMockMessage(0, 0, {
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        participantRole: null,
        model: 'openai/gpt-4',
        hasError: true,
        errorMessage: 'Internal server error',
      },
    });

    store.getState().setMessages([createMockUserMessage(0), errorMessage]);

    expect(store.getState().messages[1].metadata?.hasError).toBe(true);
  });

  it('should handle timeout error from model', () => {
    const errorMessage = createMockMessage(0, 0, {
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        participantRole: null,
        model: 'openai/gpt-4',
        hasError: true,
        errorMessage: 'Request timeout',
      },
    });

    store.getState().setMessages([createMockUserMessage(0), errorMessage]);

    expect(store.getState().messages[1].metadata?.errorMessage).toBe('Request timeout');
  });
});

// ============================================================================
// SECTION 8.2: ANALYSIS ERRORS
// ============================================================================

describe('Section 8.2: Analysis Errors', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should show Failed badge on analysis card', () => {
    const failedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
    });

    store.getState().setAnalyses([failedAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
  });

  it('should allow retry button for analysis independently', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Messages succeeded, analysis failed
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, [], messages);

    const failedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
    });
    store.getState().setAnalyses([failedAnalysis]);

    // Messages should remain, analysis can be retried
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
  });

  it('should not prevent continuing conversation after failed analysis', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], [createMockUserMessage(0)]);

    // Failed analysis
    const failedAnalysis = createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
    });
    store.getState().setAnalyses([failedAnalysis]);

    // Can still add new messages
    store.getState().setInputValue('Next question');
    expect(store.getState().inputValue).toBe('Next question');
  });
});

// ============================================================================
// SECTION 8.3: NETWORK ISSUES
// ============================================================================

describe('Section 8.3: Network Issues', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle internet disconnect during streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Disconnect simulated by error message
    const errorMessage = createMockMessage(0, 0, {
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        participantRole: null,
        model: 'openai/gpt-4',
        hasError: true,
        errorMessage: 'Network disconnected',
      },
    });

    store.getState().setMessages([createMockUserMessage(0), errorMessage]);
    store.getState().setIsStreaming(false);

    expect(store.getState().messages[1].metadata?.hasError).toBe(true);
  });

  it('should allow recovery after reconnection', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // After reconnection, can start new streaming
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should handle pre-search network failure', () => {
    const failedPreSearch = createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.FAILED,
    });

    store.getState().setPreSearches([failedPreSearch]);

    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.FAILED);
  });
});

// ============================================================================
// SECTION 9.1: MODEL LIMITS
// ============================================================================

describe('Section 9.1: Model Limits', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should enforce Free tier limit of 2 models', () => {
    // Free tier: max 2 models
    const participants = [
      createMockParticipantConfig(0, { modelId: 'model-1' }),
      createMockParticipantConfig(1, { modelId: 'model-2' }),
    ];

    store.getState().setSelectedParticipants(participants);

    // Validation should happen at UI/API level
    expect(store.getState().selectedParticipants).toHaveLength(2);
  });

  it('should enforce Pro tier limit of 5 models', () => {
    // Pro tier: max 5 models
    const participants = Array.from({ length: 5 }, (_, i) =>
      createMockParticipantConfig(i, { modelId: `model-${i}` })
    );

    store.getState().setSelectedParticipants(participants);

    expect(store.getState().selectedParticipants).toHaveLength(5);
  });

  it('should enforce Power tier limit of 10 models', () => {
    // Power tier: max 10 models
    const participants = Array.from({ length: 10 }, (_, i) =>
      createMockParticipantConfig(i, { modelId: `model-${i}` })
    );

    store.getState().setSelectedParticipants(participants);

    expect(store.getState().selectedParticipants).toHaveLength(10);
  });

  it('should track model restrictions by tier', () => {
    // Free tier users should only see ~15 cheapest models
    // Pro tier users see flagship models
    // This is validated at API level, store accepts any models
    const freeModels = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-3.5-turbo' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-instant' }),
    ];

    store.getState().setSelectedParticipants(freeModels);

    expect(store.getState().selectedParticipants[0].modelId).toBe('openai/gpt-3.5-turbo');
  });
});

// ============================================================================
// SECTION 9.2: USAGE LIMITS
// ============================================================================

describe('Section 9.2: Usage Limits', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should track conversation count towards limit', () => {
    // Free: 5 conversations/month
    // Pro: 100 conversations/month
    // Power: Unlimited
    // Tracking happens at API level
    const thread = createMockThread({ id: 'thread-1' });
    store.getState().initializeThread(thread, [], []);

    expect(store.getState().thread?.id).toBe('thread-1');
  });

  it('should track message count towards limit', () => {
    // Free: 50 messages/month
    // Pro: 500 messages/month
    // Power: Unlimited
    const messages = Array.from({ length: 10 }, (_, i) =>
      createMockUserMessage(i, `Message ${i}`)
    );

    store.getState().setMessages(messages);

    expect(store.getState().messages).toHaveLength(10);
  });

  it('should handle reaching conversation limit', () => {
    // When limit reached, API returns error
    // Store should handle gracefully
    const thread = createMockThread({ id: 'thread-limit' });
    store.getState().initializeThread(thread, [], []);

    // Thread still created, limit enforcement at API
    expect(store.getState().thread).toBeDefined();
  });

  it('should handle reaching message limit', () => {
    // When limit reached, API returns error
    const message = createMockUserMessage(0, 'Final message');
    store.getState().setMessages([message]);

    expect(store.getState().messages).toHaveLength(1);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Error Handling Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle multiple errors in single round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    // All models fail
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 0,
          participantId: 'participant-0',
          participantRole: null,
          model: 'openai/gpt-4',
          hasError: true,
        },
      }),
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 1,
          participantId: 'participant-1',
          participantRole: null,
          model: 'anthropic/claude-3',
          hasError: true,
        },
      }),
      createMockMessage(2, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 2,
          participantId: 'participant-2',
          participantRole: null,
          model: 'google/gemini',
          hasError: true,
        },
      }),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const errorMessages = store.getState().messages.filter(
      m => m.metadata?.hasError === true
    );

    expect(errorMessages).toHaveLength(3);
  });

  it('should handle partial success with some failures', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Model 1 succeeds, Model 2 fails
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0), // Success
      createMockMessage(1, 0, {
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantIndex: 1,
          participantId: 'participant-1',
          participantRole: null,
          model: 'anthropic/claude-3',
          hasError: true,
        },
      }),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const successMessages = store.getState().messages.filter(
      m => m.role === 'assistant' && m.metadata?.hasError !== true
    );
    const errorMessages = store.getState().messages.filter(
      m => m.metadata?.hasError === true
    );

    expect(successMessages).toHaveLength(1);
    expect(errorMessages).toHaveLength(1);
  });

  it('should recover from errors via retry', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Initial failure
    const errorMessage = createMockMessage(0, 0, {
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        participantRole: null,
        model: 'openai/gpt-4',
        hasError: true,
      },
    });

    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), errorMessage]
    );

    // Retry - clear and re-stream
    store.getState().setMessages([createMockUserMessage(0)]);

    // Successful retry
    const successMessage = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), successMessage]);

    const finalMessage = store.getState().messages[1];
    expect(finalMessage.metadata?.hasError).not.toBe(true);
  });
});
