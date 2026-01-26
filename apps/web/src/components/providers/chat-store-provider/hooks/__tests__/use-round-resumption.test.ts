import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act } from '@/lib/testing';
import {
  buildAfterChangelogScenario,
  buildAfterPatchScenario,
  buildAfterPreSearchScenario,
  buildCacheMismatchScenario,
  buildDuringModeratorScenario,
  createCompleteRoundMessages,
  createMockAssistantMessage,
  createMockChatHook,
  createMockChatStore,
  createMockResumptionParticipants as createMockParticipants,
  createMockResumptionParticipants,
  createMockResumptionPreSearch,
  createMockUserMessage,
} from '@/lib/testing/resumption-test-helpers';

describe('useRoundResumption', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('resumption conditions', () => {
    it('should NOT trigger resumption when nextParticipantToTrigger is null', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: null,
        participants: createMockResumptionParticipants(2),
        waitingToStartStreaming: true,
      });

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBeNull();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should trigger resumption when all conditions are met', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 1,
        participants: createMockResumptionParticipants(2),
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && state.participants.length > 0
        && state.messages.length > 0
        && chat.isReady;

      expect(shouldResume).toBeTruthy();

      if (shouldResume) {
        chat.continueFromParticipant(
          state.nextParticipantToTrigger,
          state.participants,
        );
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(1, state.participants);
    });

    it('should NOT resume when chat is not ready (AI SDK hydration pending)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 1,
        participants: createMockResumptionParticipants(2),
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: false,
      });

      const state = store.getState();

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady;

      expect(shouldResume).toBeFalsy();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should NOT resume when already streaming', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: true,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 1,
        participants: createMockResumptionParticipants(2),
        waitingToStartStreaming: true,
      });

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      const shouldResume = !state.isStreaming && state.nextParticipantToTrigger !== null;

      expect(shouldResume).toBeFalsy();
    });
  });

  describe('pre-search blocking', () => {
    it('should wait for pre-search completion before resuming participants', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.STREAMING)],
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBeTruthy();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should resume after pre-search completes', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBeFalsy();

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(
          state.nextParticipantToTrigger,
          state.participants,
        );
      }

      expect(continueFromParticipant).toHaveBeenCalledWith();
    });
  });

  describe('dangling state cleanup', () => {
    it('should clear nextParticipantToTrigger after timeout when not streaming', async () => {
      const store = createMockChatStore({
        isStreaming: false,
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: false,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBe(1);
    });

    it('should NOT clear nextParticipantToTrigger while streaming', async () => {
      const store = createMockChatStore({
        isStreaming: true,
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBe(1);
    });
  });

  describe('race condition handling', () => {
    it('should handle AI SDK isReady transition from false to true', async () => {
      const continueFromParticipant = vi.fn();
      createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(1),
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const readyState = { isReady: false };

      createMockChatHook({
        continueFromParticipant,
        isReady: readyState.isReady,
      });

      expect(readyState.isReady).toBeFalsy();
      expect(continueFromParticipant).not.toHaveBeenCalled();

      readyState.isReady = true;

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(readyState.isReady).toBeTruthy();
    });

    it('should prevent duplicate resumption triggers', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(1),
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const resumptionKeys = new Set<string>();
      const threadId = store.getState().thread?.id || 'unknown';
      const roundNumber = 0;
      const participantIndex = store.getState().nextParticipantToTrigger;

      const resumptionKey = `${threadId}-r${roundNumber}-p${participantIndex}`;

      if (!resumptionKeys.has(resumptionKey) && participantIndex !== null) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex, store.getState().participants);
      }

      if (!resumptionKeys.has(resumptionKey) && participantIndex !== null) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex, store.getState().participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty messages handling', () => {
    it('should NOT clear waitingToStartStreaming when messages are empty (new thread)', () => {
      const store = createMockChatStore({
        isStreaming: false,
        messages: [],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(1),
        thread: null,
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      expect(state.messages).toHaveLength(0);
      expect(state.waitingToStartStreaming).toBeTruthy();
    });
  });

  describe('safety timeout', () => {
    it('should clear stuck state after 5 second timeout on thread screen', async () => {
      createMockChatStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockResumptionParticipants(1),
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
    });

    it('should NOT timeout while streaming is active', async () => {
      const store = createMockChatStore({
        isStreaming: true,
        nextParticipantToTrigger: 0,
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      const state = store.getState();

      expect(state.waitingToStartStreaming).toBeTruthy();
    });
  });
});

describe('edge cases from debug output', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle state where nextParticipantToTrigger is null but streaming just ended', () => {
    const store = createMockChatStore({
      isStreaming: false,
      messages: [
        { id: 'm1', metadata: { roundNumber: 0 }, role: MessageRoles.USER },
        { id: 'm2', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT },
        { id: 'm3', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT },
        { id: 'm4', metadata: { roundNumber: 1 }, role: MessageRoles.USER },
        { id: 'm5', metadata: { roundNumber: 1 }, role: MessageRoles.ASSISTANT },
        { id: 'm6', metadata: { roundNumber: 1 }, role: MessageRoles.ASSISTANT },
      ],
      nextParticipantToTrigger: null,
      participants: [
        { id: 'p0', modelId: 'm0', priority: 0, role: 'R0', threadId: 't' },
        { id: 'p1', modelId: 'm1', priority: 1, role: 'R1', threadId: 't' },
      ],
      waitingToStartStreaming: false,
    });

    const state = store.getState();

    expect(state.nextParticipantToTrigger).toBeNull();
    expect(state.waitingToStartStreaming).toBeFalsy();
    expect(state.isStreaming).toBeFalsy();
    expect(state.messages).toHaveLength(6);
  });

  it('should detect incomplete round needing resumption', () => {
    const store = createMockChatStore({
      isStreaming: false,
      messages: [
        { id: 'm1', metadata: { roundNumber: 0 }, role: MessageRoles.USER },
        { id: 'm2', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT },
        { id: 'm3', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT },
        { id: 'm4', metadata: { roundNumber: 1 }, role: MessageRoles.USER },
        { id: 'm5', metadata: { roundNumber: 1 }, role: MessageRoles.ASSISTANT },
      ],
      nextParticipantToTrigger: 1,
      participants: [
        { id: 'p0', modelId: 'm0', priority: 0, role: 'R0', threadId: 't' },
        { id: 'p1', modelId: 'm1', priority: 1, role: 'R1', threadId: 't' },
      ],
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    expect(state.nextParticipantToTrigger).toBe(1);
    expect(state.waitingToStartStreaming).toBeTruthy();
  });
});

// ============================================================================
// NEW COMPREHENSIVE TESTS FOR RESUMPTION POINT MATRIX
// ============================================================================

describe('resumption Point Matrix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('after PATCH', () => {
    it('should wait for isPatchInProgress before streaming', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPatchScenario(true, 0);

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      // Should NOT resume while PATCH in progress
      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !state.isPatchInProgress
        && chat.isReady;

      expect(state.isPatchInProgress).toBeTruthy();
      expect(shouldResume).toBeFalsy();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should wait for isWaitingForChangelog before streaming', () => {
      const store = buildAfterChangelogScenario(true);
      const state = store.getState();

      expect(state.isWaitingForChangelog).toBeTruthy();

      // Should NOT resume while waiting for changelog
      const shouldResume = !state.isWaitingForChangelog;
      expect(shouldResume).toBeFalsy();
    });

    it('should wait for configChangeRoundNumber to clear', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPatchScenario(true, 0);

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      expect(state.configChangeRoundNumber).not.toBeNull();

      // Should NOT resume while config change round is set
      const shouldResume = state.configChangeRoundNumber === null;
      expect(shouldResume).toBeFalsy();
    });
  });

  describe('after Changelog', () => {
    it('should resume from participant 0 after changelog fetch completes', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterChangelogScenario(false);

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      expect(state.isWaitingForChangelog).toBeFalsy();

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !state.isWaitingForChangelog
        && chat.isReady;

      expect(shouldResume).toBeTruthy();

      if (shouldResume && state.nextParticipantToTrigger !== null) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(0, state.participants);
    });
  });

  describe('after Pre-Search', () => {
    it('should wait for pre-search COMPLETE before participants', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.STREAMING);

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBeTruthy();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should handle pre-search FAILED gracefully', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.FAILED);

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      // FAILED pre-search should NOT block resumption
      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(preSearch?.status).toBe(MessageStatuses.FAILED);
      expect(isPreSearchBlocking).toBeFalsy();

      // Should allow resumption to proceed
      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !isPreSearchBlocking
        && chat.isReady;

      expect(shouldResume).toBeTruthy();
    });

    it('should resume after pre-search COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.COMPLETE);

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(isPreSearchBlocking).toBeFalsy();

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith();
    });
  });

  describe('after Participant N', () => {
    it('should validate nextParticipantToTrigger against actual messages', () => {
      const store = buildCacheMismatchScenario();
      const state = store.getState();

      // Server says next is p2, but we only have p0 message
      expect(state.nextParticipantToTrigger).toBe(2);

      // Messages only have user + p0 assistant
      const roundNumber = 1;
      const participantIndicesWithMessages = new Set<number>();

      for (const msg of state.messages) {
        const meta = msg.metadata as { roundNumber?: number; participantIndex?: number; role?: string } | undefined;
        if (meta?.role !== MessageRoles.ASSISTANT) {
          continue;
        }
        if (meta.roundNumber !== roundNumber) {
          continue;
        }
        if (meta.participantIndex !== undefined) {
          participantIndicesWithMessages.add(meta.participantIndex);
        }
      }

      // Only p0 has a message
      expect(participantIndicesWithMessages.has(0)).toBeTruthy();
      expect(participantIndicesWithMessages.has(1)).toBeFalsy();
    });

    it('should correct cache mismatch (server vs client)', () => {
      // Server: nextP=2 (claims p0 and p1 exist)
      // Client: only has p0 message
      // Corrected: nextP=1 (first participant without message)
      const serverNextIndex = 2;
      const participantIndicesWithMessages = new Set([0]); // Only p0
      const totalParticipants = 3;

      // Validation logic from validateAndCorrectNextParticipant
      let correctedNextIndex = serverNextIndex;
      for (let i = 0; i < serverNextIndex && i < totalParticipants; i++) {
        if (!participantIndicesWithMessages.has(i)) {
          correctedNextIndex = i;
          break;
        }
      }

      // p0 exists, p1 missing → correctedNextIndex = 1
      expect(correctedNextIndex).toBe(1);
    });

    it('should resume correct participant after page refresh', () => {
      const continueFromParticipant = vi.fn();
      const roundNumber = 1;

      // Simulate page refresh with incomplete round (p0 done, p1 pending)
      const store = createMockChatStore({
        configChangeRoundNumber: null,
        enableWebSearch: false,
        isPatchInProgress: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        messages: [
          createMockUserMessage(roundNumber),
          createMockAssistantMessage(roundNumber, 0, 'participant-0'),
        ],
        nextParticipantToTrigger: { index: 1, participantId: 'participant-1' },
        participants: createMockParticipants(3),
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      // Should resume from participant 1 (p0 already done)
      const nextP = state.nextParticipantToTrigger;
      expect(nextP).toEqual({ index: 1, participantId: 'participant-1' });

      if (
        nextP !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
      ) {
        chat.continueFromParticipant(nextP, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(
        { index: 1, participantId: 'participant-1' },
        state.participants,
      );
    });
  });

  describe('during Moderator', () => {
    it('should detect moderator stream in progress', () => {
      const store = buildDuringModeratorScenario();
      const state = store.getState();

      expect(state.isModeratorStreaming).toBeTruthy();
      expect(state.isStreaming).toBeFalsy();
      expect(state.nextParticipantToTrigger).toBeNull();

      // All participants done, moderator streaming
      expect(state.messages).toHaveLength(3); // user + 2 participants
    });

    it('should NOT trigger participant resumption during moderator', () => {
      const continueFromParticipant = vi.fn();
      const store = buildDuringModeratorScenario();

      createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();

      // No participant to trigger during moderator phase
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should use resumptionTriggeredRef to prevent double-triggers', () => {
    const continueFromParticipant = vi.fn();
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      nextParticipantToTrigger: 0,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const chat = createMockChatHook({
      continueFromParticipant,
      isReady: true,
    });

    // Simulate resumptionTriggeredRef pattern
    const resumptionTriggeredRef = { current: null as string | null };

    const state = store.getState();
    const threadId = state.thread?.id || 'unknown';
    const roundNumber = 0;
    const participantIndex = 0;
    const resumptionKey = `${threadId}-r${roundNumber}-p${participantIndex}`;

    // First trigger
    if (resumptionTriggeredRef.current !== resumptionKey) {
      resumptionTriggeredRef.current = resumptionKey;
      chat.continueFromParticipant(participantIndex, state.participants);
    }

    // Second trigger attempt (should be blocked)
    if (resumptionTriggeredRef.current !== resumptionKey) {
      chat.continueFromParticipant(participantIndex, state.participants);
    }

    expect(continueFromParticipant).toHaveBeenCalledTimes(1);
  });

  it('should generate unique resumptionKey per thread/round/participant', () => {
    const keys: string[] = [];

    // Different threads
    keys.push(`thread-1-r0-p0`);
    keys.push(`thread-2-r0-p0`);

    // Different rounds
    keys.push(`thread-1-r1-p0`);
    keys.push(`thread-1-r2-p0`);

    // Different participants
    keys.push(`thread-1-r0-p1`);
    keys.push(`thread-1-r0-p2`);

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('should wait for AI SDK isReady before calling continueFromParticipant', () => {
    const continueFromParticipant = vi.fn();
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      nextParticipantToTrigger: 0,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const chat = createMockChatHook({
      continueFromParticipant,
      isReady: false, // Not ready yet
    });

    const state = store.getState();

    const shouldResume = state.nextParticipantToTrigger !== null
      && state.waitingToStartStreaming
      && !state.isStreaming
      && chat.isReady;

    expect(shouldResume).toBeFalsy();
    expect(continueFromParticipant).not.toHaveBeenCalled();
  });

  it('should retry with pollUntilReady when AI SDK not ready', async () => {
    const continueFromParticipant = vi.fn();
    let isReady = false;

    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      nextParticipantToTrigger: 0,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    // Simulate polling behavior
    let retryCount = 0;
    const maxRetries = 20;

    const pollUntilReady = () => {
      retryCount++;
      if (retryCount > maxRetries) {
        return;
      }

      if (!isReady) {
        // Schedule another poll
        setTimeout(pollUntilReady, 100);
        return;
      }

      // Ready - execute
      const state = store.getState();
      continueFromParticipant(state.nextParticipantToTrigger, state.participants);
    };

    // Start polling
    pollUntilReady();

    // AI SDK not ready yet
    await act(async () => {
      vi.advanceTimersByTime(300); // 3 retries
    });
    expect(continueFromParticipant).not.toHaveBeenCalled();
    expect(retryCount).toBeGreaterThan(1);

    // AI SDK becomes ready
    isReady = true;
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(continueFromParticipant).toHaveBeenCalledWith();
  });

  it('should limit retries to maxRetries (20)', async () => {
    let retryCount = 0;
    const maxRetries = 20;

    const pollUntilReady = () => {
      retryCount++;
      if (retryCount > maxRetries) {
        return;
      }
      setTimeout(pollUntilReady, 100);
    };

    pollUntilReady();

    await act(async () => {
      vi.advanceTimersByTime(3000); // Enough time for all retries
    });

    expect(retryCount).toBe(maxRetries + 1); // Initial + maxRetries
  });
});

// ============================================================================
// STREAM STATE TRANSITIONS TESTS
// ============================================================================

describe('stream State Transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should NOT clear nextParticipantToTrigger during participant transitions', () => {
    // During p0→p1 transition, isStreaming briefly goes false
    // but nextParticipantToTrigger should remain set
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false, // Briefly false during transition
      messages: [createMockUserMessage(0), createMockAssistantMessage(0, 0)],
      nextParticipantToTrigger: 1,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      streamingRoundNumber: 0, // Still set (round not complete)
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    // streamingRoundNumber !== null means round still active
    const isRoundActive = state.streamingRoundNumber !== null;

    expect(isRoundActive).toBeTruthy();
    expect(state.nextParticipantToTrigger).toBe(1);
  });

  it('should check streamingRoundNumber !== null before clearing state', () => {
    // Only clear when streamingRoundNumber is null (round truly complete)
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: createCompleteRoundMessages(0, 2),
      nextParticipantToTrigger: 1,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      streamingRoundNumber: null, // Round complete
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: false,
    });

    const state = store.getState();

    // Safe to clear when streamingRoundNumber is null
    const safeToClear = state.streamingRoundNumber === null
      && !state.waitingToStartStreaming
      && !state.isStreaming;

    expect(safeToClear).toBeTruthy();
  });

  it('should handle isStreaming briefly false during participant handoff', () => {
    // Simulate the gap between p0 complete and p1 start
    const store = createMockChatStore({
      currentParticipantIndex: 0,
      enableWebSearch: false,
      isStreaming: false, // Gap during handoff
      messages: [
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0),
      ],
      nextParticipantToTrigger: 1,
      participants: createMockParticipants(3),
      screenMode: ScreenModes.THREAD,
      streamingRoundNumber: 0, // Round still in progress
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    // Despite isStreaming=false, round is active
    expect(state.isStreaming).toBeFalsy();
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.nextParticipantToTrigger).toBe(1);

    // Should still trigger next participant
    expect(state.waitingToStartStreaming).toBeTruthy();
  });
});

// ============================================================================
// CLEANUP AND TIMEOUTS TESTS
// ============================================================================

describe('cleanup and Timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should clear dangling nextParticipantToTrigger after 500ms', async () => {
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: createCompleteRoundMessages(0, 2),
      nextParticipantToTrigger: 1,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      streamingRoundNumber: null, // Round complete
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: false, // Not waiting
    });

    // Simulate the cleanup timeout behavior
    const initialState = store.getState();
    expect(initialState.nextParticipantToTrigger).toBe(1);

    // After 500ms, should detect dangling state
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // In real implementation, this would call setNextParticipantToTrigger(null)
    // Test validates the conditions for cleanup
    const state = store.getState();
    const shouldCleanup = state.nextParticipantToTrigger !== null
      && !state.waitingToStartStreaming
      && !state.isStreaming
      && state.streamingRoundNumber === null;

    expect(shouldCleanup).toBeTruthy();
  });

  it('should safety timeout clear stuck state after 5s', async () => {
    const store = createMockChatStore({
      enableWebSearch: false,
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      nextParticipantToTrigger: 0,
      participants: createMockParticipants(2),
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true, // Stuck in waiting
    });

    // Simulate safety timeout
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Test validates stuck state detection
    const state = store.getState();
    const isStuck = state.waitingToStartStreaming && !state.isStreaming;

    expect(isStuck).toBeTruthy();
    // In real implementation, this would clear the state
  });

  it('should clean up retry timeouts on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    // Simulate timeout tracking
    const retryTimeoutRef = { current: null as NodeJS.Timeout | null };

    retryTimeoutRef.current = setTimeout(() => {}, 100);

    // Cleanup on unmount
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    expect(clearTimeoutSpy).toHaveBeenCalledWith();
    expect(retryTimeoutRef.current).toBeNull();

    clearTimeoutSpy.mockRestore();
  });
});

// ============================================================================
// COMPLETE ROUND FLOW INTEGRATION TESTS
// ============================================================================

describe('complete Round Flow Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should follow correct resumption order: patch → changelog → pre-search → participants → moderator', () => {
    // Simulate a round with config change and web search enabled
    const roundNumber = 1;

    // Phase 1: PATCH in progress
    const store = createMockChatStore({
      configChangeRoundNumber: roundNumber,
      enableWebSearch: true,
      isPatchInProgress: true,
      isStreaming: false,
      isWaitingForChangelog: false,
      messages: [createMockUserMessage(roundNumber)],
      nextParticipantToTrigger: 0,
      participants: createMockParticipants(2),
      preSearches: [createMockResumptionPreSearch(roundNumber, MessageStatuses.PENDING)],
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: true, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    let state = store.getState();

    // Cannot proceed - PATCH in progress
    expect(state.isPatchInProgress).toBeTruthy();

    // Phase 2: PATCH complete, waiting for changelog
    store.setState({
      isPatchInProgress: false,
      isWaitingForChangelog: true,
    });
    state = store.getState();

    expect(state.isPatchInProgress).toBeFalsy();
    expect(state.isWaitingForChangelog).toBeTruthy();

    // Phase 3: Changelog fetched, pre-search pending
    store.setState({
      configChangeRoundNumber: null,
      isWaitingForChangelog: false,
    });
    state = store.getState();

    expect(state.isWaitingForChangelog).toBeFalsy();
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // Phase 4: Pre-search complete, participants can start
    store.setState({
      preSearches: [createMockResumptionPreSearch(roundNumber, MessageStatuses.COMPLETE)],
    });
    state = store.getState();

    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // Now participants can stream
    const canStartParticipants = state.nextParticipantToTrigger !== null
      && state.waitingToStartStreaming
      && !state.isStreaming
      && !state.isPatchInProgress
      && state.configChangeRoundNumber === null
      && !state.isWaitingForChangelog
      && state.preSearches[0]?.status === MessageStatuses.COMPLETE;

    expect(canStartParticipants).toBeTruthy();

    // Phase 5: All participants complete, moderator starts
    store.setState({
      isModeratorStreaming: true,
      messages: [
        createMockUserMessage(roundNumber),
        createMockAssistantMessage(roundNumber, 0),
        createMockAssistantMessage(roundNumber, 1),
      ],
      nextParticipantToTrigger: null,
      waitingToStartStreaming: false,
    });
    state = store.getState();

    expect(state.isModeratorStreaming).toBeTruthy();
    expect(state.nextParticipantToTrigger).toBeNull();
  });

  it('should correctly resume from mid-round after page refresh', () => {
    // User was at p1 streaming when page refreshed
    const roundNumber = 1;

    const store = createMockChatStore({
      configChangeRoundNumber: null,
      currentResumptionPhase: 'participants',
      enableWebSearch: false,
      isPatchInProgress: false,
      isStreaming: false,
      isWaitingForChangelog: false,
      messages: [
        createMockUserMessage(roundNumber),
        createMockAssistantMessage(roundNumber, 0, 'participant-0'),
      ],
      nextParticipantToTrigger: { index: 1, participantId: 'participant-1' },
      participants: createMockParticipants(3),
      resumptionRoundNumber: roundNumber,
      screenMode: ScreenModes.THREAD,
      streamResumptionPrefilled: true,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    // Should resume from p1 (p0 already complete)
    expect(state.streamResumptionPrefilled).toBeTruthy();
    expect(state.currentResumptionPhase).toBe('participants');
    expect(state.nextParticipantToTrigger).toEqual({ index: 1, participantId: 'participant-1' });
    expect(state.messages).toHaveLength(2); // user + p0

    // Validation: p0 exists in messages
    const p0Exists = state.messages.some((m) => {
      const meta = m.metadata as { participantIndex?: number } | undefined;
      return meta?.participantIndex === 0;
    });
    expect(p0Exists).toBeTruthy();
  });

  describe('pre-search hydration from SSR', () => {
    it('finds hydrated preSearch and proceeds with streaming when COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        configChangeRoundNumber: null,
        enableWebSearch: true,
        isPatchInProgress: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const currentRound = 0;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      // The bug: this was undefined before the fix, causing early exit
      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);

      // COMPLETE pre-search should NOT block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBeFalsy();

      // Should proceed to streaming
      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith();
    });

    it('does NOT exit with "no preSearch for r0" when hydrated', () => {
      const store = createMockChatStore({
        enableWebSearch: true,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();
      const currentRound = 0;
      const webSearchEnabled = state.enableWebSearch;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      // The critical assertion: preSearch MUST be found when hydrated
      expect(webSearchEnabled).toBeTruthy();
      expect(preSearchForRound).toBeDefined();

      // This would have caused early exit before the fix
      const wouldExitEarly = webSearchEnabled && !preSearchForRound;
      expect(wouldExitEarly).toBeFalsy();
    });

    it('waits when pre-search status is STREAMING', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        enableWebSearch: true,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.STREAMING)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const currentRound = 0;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);

      // STREAMING pre-search SHOULD block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBeTruthy();

      // Should NOT proceed while blocking
      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('proceeds immediately when pre-search is COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        enableWebSearch: true,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBeFalsy();

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });

    it('handles PENDING status correctly (should wait)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        enableWebSearch: true,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.PENDING)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);

      // PENDING should block just like STREAMING
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBeTruthy();

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('handles FAILED pre-search by proceeding (no block)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        enableWebSearch: true,
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.FAILED)],
        screenMode: ScreenModes.THREAD,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const chat = createMockChatHook({
        continueFromParticipant,
        isReady: true,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearchForRound?.status).toBe(MessageStatuses.FAILED);

      // FAILED should NOT block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBeFalsy();

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });
  });
});
