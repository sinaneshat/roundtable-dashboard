/**
 * Pending Message Validation - Edge Case Tests
 *
 * Tests critical edge cases in pending message validation logic that could cause race conditions:
 * - Participant model ID mismatches
 * - Changelog waiting states
 * - Screen mode transitions
 * - Web search toggle during pending
 * - Participant enabled/disabled state changes
 * - Round number calculation edge cases
 *
 * **TESTING APPROACH**: Use REAL shouldSendPendingMessage() function from production code
 */

import { describe, expect, it } from 'vitest';

import { AnalysisStatuses, PendingMessageValidationReasons, ScreenModes } from '@/api/core/enums';
import type { PendingMessageState } from '@/stores/chat/actions/pending-message-sender';
import {
  shouldSendPendingMessage,
  shouldWaitForPreSearch,
} from '@/stores/chat/actions/pending-message-sender';

import {
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

describe('pending Message Validation - Edge Cases', () => {
  /**
   * EDGE CASE: Participant model IDs change while message is pending
   * User changes participant selection after message is queued
   */
  it('blocks sending when participant model IDs mismatch expected', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-1', 'model-2'], // Expected
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(2, { modelId: 'model-3' }), // Different models
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.PARTICIPANT_MISMATCH);
  });

  /**
   * EDGE CASE: Participant count changes (user adds/removes participant)
   * Expected 2 participants, but now there are 3
   */
  it('blocks sending when participant count changes', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-1', 'model-2'], // 2 participants
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(3), // 3 participants now
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.PARTICIPANT_MISMATCH);
  });

  /**
   * EDGE CASE: Participant disabled state changes
   * Participant is in list but isEnabled = false
   */
  it('blocks sending when expected participant is disabled', () => {
    const participants = createMockParticipants(2);
    participants[1]!.isEnabled = false; // Disable second participant

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-0', 'model-1'], // Expecting both
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    // Only 1 participant enabled, but expecting 2
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.PARTICIPANT_MISMATCH);
  });

  /**
   * EDGE CASE: Changelog waiting blocks message sending
   * Message is pending while changelog generation is in progress
   */
  it('blocks sending when waiting for changelog', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: true, // Changelog in progress
      screenMode: 'thread',
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_CHANGELOG);
  });

  /**
   * EDGE CASE: Screen mode changes to public
   * User shares thread publicly while message is pending
   */
  it('blocks sending when screen mode is public', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-0', 'model-1'],
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.PUBLIC, // Public mode
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.PUBLIC_SCREEN_MODE);
  });

  /**
   * EDGE CASE: Pending message cleared (null) while validation runs
   */
  it('blocks sending when pendingMessage is null', () => {
    const state: PendingMessageState = {
      pendingMessage: null, // Cleared
      expectedParticipantIds: ['model-0', 'model-1'],
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.NO_PENDING_MESSAGE);
  });

  /**
   * EDGE CASE: Expected participants cleared while message pending
   */
  it('blocks sending when expectedParticipantIds is null', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: null, // Cleared
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.NO_PENDING_MESSAGE);
  });

  /**
   * EDGE CASE: Message already sent (duplicate send attempt)
   * hasSentPendingMessage flag already true
   */
  it('blocks sending when message already sent', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-0', 'model-1'],
      hasSentPendingMessage: true, // Already sent
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.ALREADY_SENT);
  });

  /**
   * EDGE CASE: Currently streaming (concurrent round attempt)
   * User tries to send another message while streaming active
   */
  it('blocks sending when streaming is active', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-0', 'model-1'],
      hasSentPendingMessage: false,
      isStreaming: true, // Currently streaming
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.CURRENTLY_STREAMING);
  });

  /**
   * EDGE CASE: Web search enabled but pre-search doesn't exist yet
   * Backend creating pre-search, orchestrator hasn't synced (0-2s window)
   */
  it('blocks sending when web search enabled but pre-search not synced', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [], // No pre-search yet
      thread: createMockThread({ enableWebSearch: true }),
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
    expect(result.roundNumber).toBe(1); // Next round is 1
  });

  /**
   * EDGE CASE: Pre-search in PENDING status
   * Orchestrator synced it, but PreSearchStream hasn't triggered execution yet
   */
  it('blocks sending when pre-search is PENDING', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [
        createMockPreSearch({
          roundNumber: 1, // Next round
          status: AnalysisStatuses.PENDING,
        }),
      ],
      thread: createMockThread({ enableWebSearch: true }),
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);
  });

  /**
   * EDGE CASE: Pre-search in STREAMING status
   * Web search execution in progress
   */
  it('blocks sending when pre-search is STREAMING', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [
        createMockPreSearch({
          roundNumber: 1,
          status: AnalysisStatuses.STREAMING,
        }),
      ],
      thread: createMockThread({ enableWebSearch: true }),
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);
  });

  /**
   * EDGE CASE: Pre-search COMPLETE - should allow sending
   * Web search finished successfully
   */
  it('allows sending when pre-search is COMPLETE', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [
        createMockPreSearch({
          roundNumber: 1,
          status: AnalysisStatuses.COMPLETE,
        }),
      ],
      thread: createMockThread({ enableWebSearch: true }),
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(true);
    expect(result.roundNumber).toBe(1);
  });

  /**
   * EDGE CASE: Pre-search FAILED - should allow sending (don't block on failures)
   * Web search failed, but conversation should continue
   */
  it('allows sending when pre-search is FAILED', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [
        createMockPreSearch({
          roundNumber: 1,
          status: AnalysisStatuses.FAILED,
        }),
      ],
      thread: createMockThread({ enableWebSearch: true }),
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(true);
    expect(result.roundNumber).toBe(1);
  });

  /**
   * EDGE CASE: Web search toggled ON mid-conversation
   * Thread enableWebSearch changes from false to true
   */
  it('blocks when web search toggled ON and pre-search not ready', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.THREAD,
      participants,
      messages: [createMockUserMessage(0)],
      preSearches: [], // No pre-search yet
      thread: createMockThread({ enableWebSearch: true }), // Just toggled ON
      enableWebSearch: true,
    };

    const result = shouldSendPendingMessage(state);

    // Should block until pre-search is created and completed
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
  });

  /**
   * EDGE CASE: Empty messages array (Round 0, first message)
   * No messages exist yet, calculating round 0
   */
  it('allows sending for Round 0 with no existing messages', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'First message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.OVERVIEW, // Overview screen (Round 0)
      participants,
      messages: [], // No messages yet
      preSearches: [],
      thread: null, // No thread yet
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    expect(result.shouldSend).toBe(true);
    expect(result.roundNumber).toBe(0); // First round
  });

  /**
   * EDGE CASE: Round 0 with web search enabled
   * First message with web search ON
   */
  it('blocks Round 0 when web search enabled and pre-search not ready', () => {
    const participants = createMockParticipants(2);
    const expectedParticipantIds = participants.map(p => p.modelId);

    const state: PendingMessageState = {
      pendingMessage: 'First message',
      expectedParticipantIds,
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: ScreenModes.OVERVIEW,
      participants,
      messages: [],
      preSearches: [], // No pre-search yet
      thread: null,
      enableWebSearch: true, // Web search enabled for Round 0
    };

    const result = shouldSendPendingMessage(state);

    // Should wait for Round 0 pre-search
    expect(result.shouldSend).toBe(false);
    expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
    expect(result.roundNumber).toBe(0);
  });

  /**
   * EDGE CASE: Participant model IDs same but in different order
   * Sorting should make them match
   */
  it('allows sending when model IDs match after sorting', () => {
    const state: PendingMessageState = {
      pendingMessage: 'Test message',
      expectedParticipantIds: ['model-1', 'model-0'], // Unsorted
      hasSentPendingMessage: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      screenMode: 'thread',
      participants: [
        { participantIndex: 0, modelId: 'model-0', isEnabled: true, role: null },
        { participantIndex: 1, modelId: 'model-1', isEnabled: true, role: null },
      ], // Different order
      messages: [createMockUserMessage(0)],
      preSearches: [],
      thread: createMockThread(),
      enableWebSearch: false,
    };

    const result = shouldSendPendingMessage(state);

    // Should match after sorting
    expect(result.shouldSend).toBe(true);
    expect(result.roundNumber).toBe(1);
  });
});

describe('shouldWaitForPreSearch - Direct Unit Tests', () => {
  /**
   * Test shouldWaitForPreSearch() directly for edge cases
   */

  it('returns false when web search disabled', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: false,
      preSearches: [],
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);
  });

  it('returns true when web search enabled but no pre-search exists', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [], // No pre-search
      roundNumber: 0,
    });

    // Optimistic wait for backend to create pre-search
    expect(shouldWait).toBe(true);
  });

  it('returns true when pre-search is PENDING', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 0,
          status: AnalysisStatuses.PENDING,
        }),
      ],
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);
  });

  it('returns true when pre-search is STREAMING', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 0,
          status: AnalysisStatuses.STREAMING,
        }),
      ],
      roundNumber: 0,
    });

    expect(shouldWait).toBe(true);
  });

  it('returns false when pre-search is COMPLETE', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
        }),
      ],
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);
  });

  it('returns false when pre-search is FAILED', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 0,
          status: AnalysisStatuses.FAILED,
        }),
      ],
      roundNumber: 0,
    });

    expect(shouldWait).toBe(false);
  });

  it('ignores pre-searches for different rounds', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 1, // Different round
          status: AnalysisStatuses.COMPLETE,
        }),
      ],
      roundNumber: 0, // Looking for round 0
    });

    // No pre-search for round 0, should wait optimistically
    expect(shouldWait).toBe(true);
  });

  it('handles multiple pre-searches correctly', () => {
    const shouldWait = shouldWaitForPreSearch({
      webSearchEnabled: true,
      preSearches: [
        createMockPreSearch({
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE, // Round 0 complete
        }),
        createMockPreSearch({
          roundNumber: 1,
          status: AnalysisStatuses.STREAMING, // Round 1 streaming
        }),
      ],
      roundNumber: 1, // Checking round 1
    });

    // Round 1 is streaming, should wait
    expect(shouldWait).toBe(true);
  });
});
