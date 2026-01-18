/**
 * Placeholder Ordering & Timing E2E Tests
 *
 * Comprehensive tests for the complete placeholder lifecycle:
 * 1. Placeholders appear IMMEDIATELY after submission (optimistic)
 * 2. Pre-search placeholder shows first (if web search enabled)
 * 3. Participant placeholders show after pre-search completes
 * 4. Moderator placeholder shows after all participants complete
 * 5. Placeholders are NOT removed during PATCH/changelog processing
 * 6. Placeholder → streaming → complete transitions
 *
 * CONTEXT:
 * - Recent fix ensures placeholders aren't removed when PATCH updates thread/participants
 * - configChangeRoundNumber and isWaitingForChangelog are key indicators of active submission
 * - initializeThread now preserves streaming state during active operations
 *
 * @see docs/FLOW_DOCUMENTATION.md - Placeholder timing documentation
 * @see src/stores/chat/actions/screen-initialization.ts - Recent fix for placeholder preservation
 * @see src/stores/chat/store.ts - initializeThread preservation logic
 */

import { ChatModes, FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestUserMessage } from '@/lib/testing';
import type { ChatParticipant, ChatThread } from '@/types/api';

import { createChatStore } from '../store';

// ============================================================================
// Test Utilities
// ============================================================================

function createThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    slug: 'test-thread',
    previousSlug: null,
    projectId: null,
    mode: ChatModes.ANALYZING,
    status: 'active',
    enableWebSearch: false,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    metadata: null,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessageAt: new Date().toISOString(),
    ...overrides,
  };
}

function createParticipant(index: number, threadId: string = 'thread-123'): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId,
    modelId: `model-${index}`,
    customRoleId: null,
    role: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createParticipantMessage(
  threadId: string,
  roundNumber: number,
  participantIndex: number,
  content: string = '',
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: content
      ? [{ type: MessagePartTypes.TEXT, text: content }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
    },
  };
}

function createModeratorMessage(
  threadId: string,
  roundNumber: number,
  content: string = '',
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return {
    id: `${threadId}_r${roundNumber}_moderator`,
    role: MessageRoles.ASSISTANT,
    parts: content
      ? [{ type: MessagePartTypes.TEXT, text: content }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      isModerator: true,
      participantIndex: -1,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: content.length, totalTokens: content.length },
    },
  };
}

function createPreSearch(threadId: string, roundNumber: number, status: string = MessageStatuses.PENDING) {
  return {
    id: `presearch-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery: 'Test query',
    status,
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
  };
}

function getParticipantMessages(messages: UIMessage[], roundNumber: number): UIMessage[] {
  return messages.filter((m) => {
    const meta = m.metadata as { roundNumber?: number; participantIndex?: number; isModerator?: boolean } | undefined;
    return meta?.roundNumber === roundNumber
      && meta.participantIndex !== undefined
      && meta.participantIndex >= 0
      && !meta.isModerator;
  });
}

function getModeratorMessage(messages: UIMessage[], roundNumber: number): UIMessage | undefined {
  return messages.find((m) => {
    const meta = m.metadata as { roundNumber?: number; isModerator?: boolean } | undefined;
    return meta?.roundNumber === roundNumber && meta?.isModerator === true;
  });
}

// ============================================================================
// Test Suite: Immediate Placeholder Appearance After Submission
// ============================================================================

describe('immediate Placeholder Appearance After Submission', () => {
  it('should show ALL participant placeholders immediately after setStreamingRoundNumber', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
      createParticipant(2, 'thread-123'),
    ];

    // Initialize thread
    store.getState().initializeThread(thread, participants, []);

    // User submits message
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // CRITICAL TRIGGER: This makes all placeholders visible
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // Verify: streamingRoundNumber is set
    expect(state.streamingRoundNumber).toBe(0);

    // The UI rendering condition (isStreamingRound = roundNumber === streamingRoundNumber)
    // should now be TRUE for round 0, enabling ALL placeholders to render
    // Even though no participant messages exist yet, the placeholders should show

    // This is the OPTIMISTIC UI - placeholders appear before actual streaming starts
    expect(state.messages).toHaveLength(1); // Only user message in store
    expect(state.streamingRoundNumber).toBe(0); // But streamingRoundNumber triggers placeholders
  });

  it('should show participant placeholders before any streaming occurs', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    // Prepare for new message (form-actions.ts prepareForNewMessage)
    const participantIds = participants.map(p => p.modelId);
    store.getState().prepareForNewMessage('Test question', participantIds);

    // Set round number (this triggers placeholders)
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // Verify state is ready for streaming
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.expectedParticipantIds).toEqual(participantIds);
    expect(state.pendingMessage).toBe('Test question');

    // No actual streaming has started yet, but placeholders should be visible
    expect(state.isStreaming).toBe(false);

    // UI can now render placeholders for all participants based on:
    // - streamingRoundNumber = 0
    // - expectedParticipantIds = ['model-0', 'model-1']
  });

  it('should show moderator placeholder immediately after setStreamingRoundNumber', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // CRITICAL: This triggers both participant AND moderator placeholders
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // The moderator placeholder condition in chat-message-list.tsx:
    // isActuallyLatestRound && !isRoundComplete && (isModeratorStreaming || moderatorHasContent || hasModeratorMessage || isStreamingRound)
    //
    // When streamingRoundNumber=0, isStreamingRound=true for round 0
    // So moderator placeholder should render immediately
    expect(state.streamingRoundNumber).toBe(0);
  });
});

// ============================================================================
// Test Suite: Pre-Search Placeholder Lifecycle
// ============================================================================

describe('pre-Search Placeholder Lifecycle', () => {
  it('should show pre-search placeholder FIRST when web search enabled', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    // User submits with web search enabled
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research topic',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Add PENDING pre-search (created by backend during thread creation)
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    const state = store.getState();

    // Verify: Pre-search exists and is PENDING
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // UI should now show:
    // 1. Pre-search placeholder (FIRST)
    // 2. Participant placeholders (waiting for pre-search to complete)
    // 3. Moderator placeholder (waiting for participants)

    // But participants shouldn't start streaming yet (blocked by pre-search)
    expect(state.isStreaming).toBe(false);
  });

  it('should transition pre-search from PENDING → STREAMING → COMPLETE', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    // Add PENDING pre-search
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    let state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // Pre-search execution starts
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

    // Pre-search completes with results
    store.getState().updatePreSearchData(0, {
      queries: [{ query: 'test', rationale: 'testing' }],
      results: [],
      summary: 'Test results',
      successCount: 1,
      failureCount: 0,
      totalResults: 1,
      totalTime: 1000,
    });

    state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    expect(state.preSearches[0]?.completedAt).toBeDefined();

    // Now participants can start streaming
  });

  it('should NOT start participant streaming while pre-search is PENDING', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    // Add PENDING pre-search
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // Verify: Pre-search is PENDING
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // Participant streaming should be blocked
    expect(state.isStreaming).toBe(false);

    // The streaming trigger checks shouldWaitForPreSearch() which returns true
    // when pre-search status is PENDING or STREAMING
  });

  it('should allow participant streaming after pre-search COMPLETE', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    // Add and complete pre-search
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.COMPLETE);
    store.getState().addPreSearch(preSearch);
    store.getState().setStreamingRoundNumber(0);

    // Now participants can start
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const state = store.getState();

    // Verify: Pre-search is COMPLETE
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // Participant streaming is now allowed
    expect(state.isStreaming).toBe(true);
  });
});

// ============================================================================
// Test Suite: Participant Placeholder Lifecycle
// ============================================================================

describe('participant Placeholder Lifecycle', () => {
  it('should show placeholders for ALL participants immediately', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
      createParticipant(2, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // This triggers ALL participant placeholders
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // UI can now render 3 participant placeholders based on participants array
    expect(state.participants).toHaveLength(3);
    expect(state.streamingRoundNumber).toBe(0);

    // Even though no participant messages exist yet
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(0);
  });

  it('should show placeholder → streaming → complete for each participant', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Phase 1: Placeholder (streamingRoundNumber set, no messages yet)
    let state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(0);
    expect(state.streamingRoundNumber).toBe(0);

    // Phase 2: P0 Streaming (empty message = pending, then content chunks)
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0Pending = createParticipantMessage('thread-123', 0, 0, '', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Pending]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(1);
    expect(state.currentParticipantIndex).toBe(0);
    expect(state.isStreaming).toBe(true);

    // P0 streams chunks
    const p0Streaming = createParticipantMessage('thread-123', 0, 0, 'Streaming...', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Streaming]);

    // Phase 3: P0 Complete
    const p0Complete = createParticipantMessage('thread-123', 0, 0, 'Complete response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Complete]);

    state = store.getState();
    const p0Message = getParticipantMessages(state.messages, 0)[0];
    expect(p0Message?.metadata).toMatchObject({
      participantIndex: 0,
      finishReason: FinishReasons.STOP,
    });

    // Phase 4: P1 Streaming
    store.getState().setCurrentParticipantIndex(1);

    const p1Streaming = createParticipantMessage('thread-123', 0, 1, 'P1 response', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Complete, p1Streaming]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(2);
    expect(state.currentParticipantIndex).toBe(1);

    // Phase 5: P1 Complete
    const p1Complete = createParticipantMessage('thread-123', 0, 1, 'P1 complete', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Complete, p1Complete]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(2);
  });

  it('should preserve participant order during streaming', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
      createParticipant(2, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    // Add messages in order
    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0', FinishReasons.STOP);
    const p1 = createParticipantMessage('thread-123', 0, 1, 'P1', FinishReasons.STOP);
    const p2 = createParticipantMessage('thread-123', 0, 2, 'P2', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0, p1, p2]);

    const messages = getParticipantMessages(store.getState().messages, 0);

    // Verify order is preserved
    expect(messages).toHaveLength(3);
    expect(messages[0]?.metadata).toMatchObject({ participantIndex: 0 });
    expect(messages[1]?.metadata).toMatchObject({ participantIndex: 1 });
    expect(messages[2]?.metadata).toMatchObject({ participantIndex: 2 });
  });
});

// ============================================================================
// Test Suite: Moderator Placeholder Lifecycle
// ============================================================================

describe('moderator Placeholder Lifecycle', () => {
  it('should show moderator placeholder after all participants complete', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });

    // All participants complete
    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 done', FinishReasons.STOP);
    const p1 = createParticipantMessage('thread-123', 0, 1, 'P1 done', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0, p1]);
    store.getState().setStreamingRoundNumber(0);

    // Participants done, moderator starts
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();

    // Verify: Moderator is streaming
    expect(state.isModeratorStreaming).toBe(true);
    expect(state.isStreaming).toBe(false);

    // No moderator message yet, but placeholder should show
    expect(getModeratorMessage(state.messages, 0)).toBeUndefined();
    expect(state.isModeratorStreaming).toBe(true);
  });

  it('should transition moderator from placeholder → streaming → complete', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 done', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0]);
    store.getState().setStreamingRoundNumber(0);

    // Phase 1: Moderator placeholder (isModeratorStreaming true, no message yet)
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    let state = store.getState();
    expect(state.isModeratorStreaming).toBe(true);
    expect(getModeratorMessage(state.messages, 0)).toBeUndefined();

    // Phase 2: Moderator streaming (chunks arriving)
    const modPending = createModeratorMessage('thread-123', 0, '', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0, modPending]);

    const modStreaming = createModeratorMessage('thread-123', 0, 'Summary...', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0, modStreaming]);

    state = store.getState();
    const modMessage = getModeratorMessage(state.messages, 0);
    expect(modMessage).toBeDefined();
    expect(modMessage?.metadata).toMatchObject({
      isModerator: true,
      finishReason: FinishReasons.UNKNOWN,
    });

    // Phase 3: Moderator complete
    const modComplete = createModeratorMessage('thread-123', 0, 'Summary complete', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, modComplete]);
    store.getState().setIsModeratorStreaming(false);

    state = store.getState();
    expect(state.isModeratorStreaming).toBe(false);
    expect(getModeratorMessage(state.messages, 0)?.metadata).toMatchObject({
      isModerator: true,
      finishReason: FinishReasons.STOP,
    });
  });

  it('should show moderator placeholder even when no moderator message exists yet', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test',
      roundNumber: 0,
    });
    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 done', FinishReasons.STOP);

    store.getState().setMessages([userMessage, p0]);
    store.getState().setStreamingRoundNumber(0);

    // Moderator streaming flag set, but no message yet
    store.getState().setIsModeratorStreaming(true);

    const state = store.getState();

    // Placeholder should show based on isModeratorStreaming flag
    expect(state.isModeratorStreaming).toBe(true);
    expect(getModeratorMessage(state.messages, 0)).toBeUndefined();

    // UI renders placeholder because:
    // - isStreamingRound = true (streamingRoundNumber = 0)
    // - isModeratorStreaming = true
  });
});

// ============================================================================
// Test Suite: Placeholder Preservation During PATCH/Changelog
// ============================================================================

describe('placeholder Preservation During PATCH/Changelog', () => {
  it('should NOT remove placeholders when config changes trigger PATCH', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    // User submits with pending config changes
    store.getState().setHasPendingConfigChanges(true);
    store.getState().prepareForNewMessage('Test', ['model-0', 'model-1']);
    store.getState().setStreamingRoundNumber(0);

    // CRITICAL: configChangeRoundNumber is set by handleUpdateThreadAndSend BEFORE PATCH
    store.getState().setConfigChangeRoundNumber(0);
    store.getState().setIsWaitingForChangelog(true);

    const stateBeforePatch = store.getState();
    expect(stateBeforePatch.configChangeRoundNumber).toBe(0);
    expect(stateBeforePatch.isWaitingForChangelog).toBe(true);
    expect(stateBeforePatch.streamingRoundNumber).toBe(0);

    // PATCH response updates thread/participants
    // This triggers initializeThread, but should NOT reset streaming state
    const updatedThread: ChatThread = { ...thread, updatedAt: new Date().toISOString() };
    const updatedParticipants = participants.map(p => ({ ...p, updatedAt: new Date().toISOString() }));

    store.getState().initializeThread(updatedThread, updatedParticipants, stateBeforePatch.messages);

    const stateAfterPatch = store.getState();

    // CRITICAL: These should be PRESERVED (not reset to null/false)
    expect(stateAfterPatch.configChangeRoundNumber).toBe(0);
    expect(stateAfterPatch.isWaitingForChangelog).toBe(true);
    expect(stateAfterPatch.streamingRoundNumber).toBe(0);
    expect(stateAfterPatch.pendingMessage).toBe('Test');
    expect(stateAfterPatch.expectedParticipantIds).toEqual(['model-0', 'model-1']);

    // Placeholders should still be visible because streamingRoundNumber is preserved
  });

  it('should preserve placeholders during changelog fetch after PATCH', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    // Setup active submission with config changes
    store.getState().setHasPendingConfigChanges(true);
    store.getState().prepareForNewMessage('Test', ['model-0']);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setConfigChangeRoundNumber(0);

    // PATCH completes, now waiting for changelog
    store.getState().setIsWaitingForChangelog(true);

    const stateWhileWaiting = store.getState();
    expect(stateWhileWaiting.isWaitingForChangelog).toBe(true);
    expect(stateWhileWaiting.configChangeRoundNumber).toBe(0);
    expect(stateWhileWaiting.streamingRoundNumber).toBe(0);

    // Simulate another state update (shouldn't reset)
    const updatedThread: ChatThread = { ...thread, version: 2 };
    store.getState().initializeThread(updatedThread, participants, stateWhileWaiting.messages);

    const stateAfterUpdate = store.getState();

    // Still preserved
    expect(stateAfterUpdate.isWaitingForChangelog).toBe(true);
    expect(stateAfterUpdate.configChangeRoundNumber).toBe(0);
    expect(stateAfterUpdate.streamingRoundNumber).toBe(0);
  });

  it('should verify pendingMessage triggers placeholder preservation', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    // Initialize on THREAD screen
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().initializeThread(thread, participants, []);

    // User submits new message (NO config changes)
    store.getState().prepareForNewMessage('Test question', ['model-0']);

    const state = store.getState();

    // Verify prepareForNewMessage set up streaming state
    expect(state.pendingMessage).toBe('Test question');
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.expectedParticipantIds).toEqual(['model-0']);

    // This state means placeholders are now visible in the UI
    // The test for actual preservation during PATCH is covered in the test above
    // Here we just verify that prepareForNewMessage sets up the correct state
  });

  it('should NOT preserve state when neither pendingMessage nor config changes exist', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    // Initial load (no active submission)
    store.getState().initializeThread(thread, participants, []);

    const initialState = store.getState();
    expect(initialState.pendingMessage).toBeNull();
    expect(initialState.configChangeRoundNumber).toBeNull();
    expect(initialState.streamingRoundNumber).toBeNull();

    // Simulate page refresh with new data
    const messages: UIMessage[] = [
      createTestUserMessage({ id: 'user_r0', content: 'Test', roundNumber: 0 }),
      createParticipantMessage('thread-123', 0, 0, 'Response', FinishReasons.STOP),
    ];

    store.getState().initializeThread(thread, participants, messages);

    const stateAfterRefresh = store.getState();

    // Should NOT preserve (no active submission)
    expect(stateAfterRefresh.pendingMessage).toBeNull();
    expect(stateAfterRefresh.streamingRoundNumber).toBeNull();
    expect(stateAfterRefresh.messages).toHaveLength(2);
  });
});

// ============================================================================
// Test Suite: Complete Flow with All Placeholders
// ============================================================================

describe('complete Flow with All Placeholders', () => {
  it('should show pre-search → participants → moderator placeholders in sequence', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research topic',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // === PHASE 1: ALL PLACEHOLDERS APPEAR ===
    store.getState().setStreamingRoundNumber(0);

    let state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    // UI now shows: pre-search placeholder, 2 participant placeholders, moderator placeholder

    // === PHASE 2: PRE-SEARCH EXECUTES ===
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
    // Pre-search placeholder shows "Searching..."

    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    // Pre-search placeholder shows results streaming in

    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    state = store.getState();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    // Pre-search placeholder shows final results

    // === PHASE 3: PARTICIPANTS STREAM ===
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(1);
    // P0 placeholder → complete, P1 still placeholder

    store.getState().setCurrentParticipantIndex(1);
    const p1 = createParticipantMessage('thread-123', 0, 1, 'P1 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, p1]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(2);
    // Both participants complete

    // === PHASE 4: MODERATOR STREAMS ===
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    state = store.getState();
    expect(state.isModeratorStreaming).toBe(true);
    // Moderator placeholder shows

    const moderator = createModeratorMessage('thread-123', 0, 'Summary', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, p1, moderator]);
    store.getState().setIsModeratorStreaming(false);

    state = store.getState();
    expect(getModeratorMessage(state.messages, 0)).toBeDefined();
    expect(state.isModeratorStreaming).toBe(false);
    // Moderator complete

    // === FINAL STATE ===
    store.getState().completeStreaming();

    const finalState = store.getState();
    expect(finalState.streamingRoundNumber).toBeNull();
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.isModeratorStreaming).toBe(false);
    expect(finalState.messages).toHaveLength(4); // user + p0 + p1 + moderator
  });

  it('should handle complete flow WITHOUT web search', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Simple question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // === PHASE 1: PLACEHOLDERS APPEAR (NO PRE-SEARCH) ===
    store.getState().setStreamingRoundNumber(0);

    let state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.preSearches).toHaveLength(0);
    // UI shows: 1 participant placeholder, moderator placeholder (no pre-search)

    // === PHASE 2: PARTICIPANT STREAMS ===
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0 = createParticipantMessage('thread-123', 0, 0, 'Response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0]);

    state = store.getState();
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(1);

    // === PHASE 3: MODERATOR STREAMS ===
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const moderator = createModeratorMessage('thread-123', 0, 'Summary', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, moderator]);
    store.getState().setIsModeratorStreaming(false);

    // === FINAL STATE ===
    store.getState().completeStreaming();

    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(3); // user + p0 + moderator
    expect(finalState.streamingRoundNumber).toBeNull();
  });
});

// ============================================================================
// Test Suite: Screen Mode Context
// ============================================================================

describe('screen Mode Context for Placeholders', () => {
  it('should handle placeholders on OVERVIEW screen (first round)', () => {
    const store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    const participants = [createParticipant(0, 'thread-123')];

    // User selects participants and submits
    const participantConfig = participants.map((p, i) => ({
      id: p.id,
      modelId: p.modelId,
      role: null,
      priority: i,
    }));

    store.getState().setSelectedParticipants(participantConfig);
    store.getState().prepareForNewMessage('First question', ['model-0']);

    // No streamingRoundNumber set yet on overview (set after thread creation)
    let state = store.getState();
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
    expect(state.streamingRoundNumber).toBeNull();

    // After thread creation, round number is set
    store.getState().setStreamingRoundNumber(0);

    state = store.getState();
    expect(state.streamingRoundNumber).toBe(0);
    // Placeholders now visible on overview screen
  });

  it('should handle placeholders on THREAD screen (subsequent rounds)', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [createParticipant(0, 'thread-123')];

    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().initializeThread(thread, participants, []);

    // User submits second round
    store.getState().prepareForNewMessage('Second question', ['model-0']);

    const state = store.getState();
    expect(state.screenMode).toBe(ScreenModes.THREAD);

    // prepareForNewMessage sets streamingRoundNumber on THREAD screen
    expect(state.streamingRoundNumber).toBe(0);
    // Placeholders visible immediately
  });
});

// ============================================================================
// Test Suite: Timeline Element Ordering During Submission
// ============================================================================

describe('timeline Element Ordering During Submission', () => {
  it('should show user message FIRST immediately after submission', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    // User submits message
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // VERIFY: User message appears FIRST
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toBe(userMessage);
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
  });

  it('should show pre-search BEFORE participant placeholders when web search enabled', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Add pre-search (created by backend)
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    const state = store.getState();

    // VERIFY: Timeline order should be:
    // 1. User message (messages[0])
    // 2. Pre-search (preSearches[0])
    // 3. Participant placeholders (triggered by streamingRoundNumber)
    // 4. Moderator placeholder (triggered by streamingRoundNumber)

    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.roundNumber).toBe(0);
    expect(state.streamingRoundNumber).toBe(0);

    // Pre-search exists and participants haven't started streaming yet
    expect(state.isStreaming).toBe(false);
  });

  it('should show participant placeholders in PRIORITY ORDER', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'), // priority 0 (highest)
      createParticipant(1, 'thread-123'), // priority 1
      createParticipant(2, 'thread-123'), // priority 2 (lowest)
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // VERIFY: Participants are in priority order
    expect(state.participants).toHaveLength(3);
    expect(state.participants[0]?.priority).toBe(0);
    expect(state.participants[1]?.priority).toBe(1);
    expect(state.participants[2]?.priority).toBe(2);

    // Participants should render in this order (0 → 1 → 2)
    // This is enforced by chat-message-list.tsx using participants array order
  });

  it('should show moderator placeholder AFTER all participants', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // VERIFY: Timeline order should be:
    // 1. User message
    // 2. Participant 0 placeholder
    // 3. Participant 1 placeholder
    // 4. Moderator placeholder (shown immediately when streamingRoundNumber is set)

    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.participants).toHaveLength(2);
    expect(state.streamingRoundNumber).toBe(0);

    // Moderator placeholder should be visible based on:
    // - isActuallyLatestRound && !isRoundComplete && isStreamingRound
    // (line 1423-1425 in chat-message-list.tsx)
  });

  it('should maintain COMPLETE ordering: User → PreSearch → P0 → P1 → Moderator', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    // Step 1: User submits
    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Step 2: Pre-search added
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    let state = store.getState();

    // VERIFY ORDERING at this point:
    // User message → Pre-search → Participant placeholders → Moderator placeholder
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.preSearches[0]?.roundNumber).toBe(0);
    expect(state.participants).toHaveLength(2);
    expect(state.streamingRoundNumber).toBe(0);

    // Step 3: Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Step 4: Participants start streaming (P0 first)
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0]);

    state = store.getState();

    // VERIFY: P0 appears AFTER pre-search
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });

    // Step 5: P1 streams
    store.getState().setCurrentParticipantIndex(1);
    const p1 = createParticipantMessage('thread-123', 0, 1, 'P1 response', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, p1]);

    state = store.getState();

    // VERIFY: P1 appears AFTER P0
    expect(state.messages).toHaveLength(3);
    expect(getParticipantMessages(state.messages, 0)).toHaveLength(2);
    expect(getParticipantMessages(state.messages, 0)[0]?.metadata).toMatchObject({ participantIndex: 0 });
    expect(getParticipantMessages(state.messages, 0)[1]?.metadata).toMatchObject({ participantIndex: 1 });

    // Step 6: Moderator streams
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const moderator = createModeratorMessage('thread-123', 0, 'Summary', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0, p1, moderator]);

    state = store.getState();

    // VERIFY: Moderator appears LAST
    expect(state.messages).toHaveLength(4);
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });
    expect(state.messages[2]?.metadata).toMatchObject({ participantIndex: 1 });
    expect(state.messages[3]?.metadata).toMatchObject({ isModerator: true });
  });

  it('should NOT reorder elements during streaming', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: false });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Test question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    // Capture initial state
    const initialState = store.getState();
    const initialUserMessage = initialState.messages[0];

    // P0 starts streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0Streaming = createParticipantMessage('thread-123', 0, 0, 'Streaming...', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Streaming]);

    let state = store.getState();

    // VERIFY: User message still FIRST
    expect(state.messages[0]).toBe(initialUserMessage);
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);

    // P0 completes
    const p0Complete = createParticipantMessage('thread-123', 0, 0, 'Complete', FinishReasons.STOP);
    store.getState().setMessages([userMessage, p0Complete]);

    state = store.getState();

    // VERIFY: User message STILL first
    expect(state.messages[0]).toBe(initialUserMessage);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });

    // P1 starts streaming
    store.getState().setCurrentParticipantIndex(1);
    const p1Streaming = createParticipantMessage('thread-123', 0, 1, 'P1 streaming', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0Complete, p1Streaming]);

    state = store.getState();

    // VERIFY: Order unchanged
    expect(state.messages[0]).toBe(initialUserMessage);
    expect(state.messages[1]).toBe(p0Complete);
    expect(state.messages[2]?.metadata).toMatchObject({ participantIndex: 1 });
  });

  it('should show all placeholders IMMEDIATELY on streamingRoundNumber set', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
      createParticipant(2, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // Add pre-search before setting streamingRoundNumber
    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    // CRITICAL TRIGGER: Set streamingRoundNumber
    store.getState().setStreamingRoundNumber(0);

    const state = store.getState();

    // VERIFY: All timeline elements are now visible
    // 1. User message exists
    expect(state.messages[0]?.role).toBe(MessageRoles.USER);

    // 2. Pre-search exists and is visible
    expect(state.preSearches[0]?.roundNumber).toBe(0);

    // 3. Participant placeholders are visible (via streamingRoundNumber)
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.participants).toHaveLength(3);

    // 4. Moderator placeholder is visible (via isStreamingRound condition in chat-message-list.tsx:1425)
    // The moderator renders when: isActuallyLatestRound && !isRoundComplete && isStreamingRound

    // All of this happens BEFORE any streaming actually starts
    expect(state.isStreaming).toBe(false);
    expect(state.isModeratorStreaming).toBe(false);
  });

  it('should NOT remove any elements during streaming', () => {
    const store = createChatStore();
    const thread = createThread({ id: 'thread-123', enableWebSearch: true });
    const participants = [
      createParticipant(0, 'thread-123'),
      createParticipant(1, 'thread-123'),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setEnableWebSearch(true);

    const userMessage = createTestUserMessage({
      id: 'user_r0',
      content: 'Research question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);
    store.getState().setStreamingRoundNumber(0);

    const preSearch = createPreSearch('thread-123', 0, MessageStatuses.PENDING);
    store.getState().addPreSearch(preSearch);

    // Capture baseline state
    let state = store.getState();
    const baselineUserMessage = state.messages[0];
    const baselinePreSearch = state.preSearches[0];

    // Pre-search starts streaming
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    state = store.getState();

    // VERIFY: User message and pre-search still exist
    expect(state.messages[0]).toBe(baselineUserMessage);
    expect(state.preSearches[0]?.id).toBe(baselinePreSearch?.id);

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    state = store.getState();

    // VERIFY: User message and pre-search still exist
    expect(state.messages[0]).toBe(baselineUserMessage);
    expect(state.preSearches[0]?.id).toBe(baselinePreSearch?.id);

    // P0 starts streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const p0 = createParticipantMessage('thread-123', 0, 0, 'P0 response', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0]);

    state = store.getState();

    // VERIFY: User message and pre-search still exist
    expect(state.messages[0]).toBe(baselineUserMessage);
    expect(state.preSearches[0]?.id).toBe(baselinePreSearch?.id);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });

    // P1 streams
    store.getState().setCurrentParticipantIndex(1);
    const p1 = createParticipantMessage('thread-123', 0, 1, 'P1 response', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0, p1]);

    state = store.getState();

    // VERIFY: All elements still exist
    expect(state.messages[0]).toBe(baselineUserMessage);
    expect(state.preSearches[0]?.id).toBe(baselinePreSearch?.id);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });
    expect(state.messages[2]?.metadata).toMatchObject({ participantIndex: 1 });

    // Moderator streams
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    const moderator = createModeratorMessage('thread-123', 0, 'Summary', FinishReasons.UNKNOWN);
    store.getState().setMessages([userMessage, p0, p1, moderator]);

    state = store.getState();

    // VERIFY: All elements still exist in correct order
    expect(state.messages[0]).toBe(baselineUserMessage);
    expect(state.preSearches[0]?.id).toBe(baselinePreSearch?.id);
    expect(state.messages[1]?.metadata).toMatchObject({ participantIndex: 0 });
    expect(state.messages[2]?.metadata).toMatchObject({ participantIndex: 1 });
    expect(state.messages[3]?.metadata).toMatchObject({ isModerator: true });
  });
});
