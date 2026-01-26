/**
 * Unit Tests: Store Selector Optimization
 *
 * Tests focused on selector behavior, memoization, and referential equality.
 * Verifies that useShallow and selector patterns work correctly for performance.
 *
 * Testing Focus:
 * 1. Selector referential equality (object/array stability)
 * 2. useShallow batching behavior
 * 3. Derived state memoization
 * 4. Action function stability
 * 5. Selector re-computation prevention
 *
 * Performance Patterns:
 * - Use useShallow for batching multiple primitive selections
 * - Verify object references don't change unless data changes
 * - Test that actions have stable references across renders
 * - Ensure derived selectors only recompute when dependencies change
 */

import { MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';
import { shallow } from 'zustand/shallow';

import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import type { ChatParticipant, ChatThread } from '@/services/api';

import { createChatStore } from '../store';

describe('selector referential equality - object stability', () => {
  it('messages array reference changes only when messages actually change', () => {
    const store = createChatStore();
    const initialMessages = store.getState().messages;

    // Unrelated state change
    store.getState().setInputValue('test');

    const messagesAfterUnrelatedChange = store.getState().messages;

    // Reference should be stable when messages haven't changed
    expect(messagesAfterUnrelatedChange).toBe(initialMessages);

    // Now actually change messages
    store.getState().setMessages([
      {
        createdAt: new Date(),
        id: 'msg-1',
        metadata: { roundNumber: 0 },
        parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER,
      },
    ]);

    const messagesAfterActualChange = store.getState().messages;

    // Reference should change when messages actually change
    expect(messagesAfterActualChange).not.toBe(initialMessages);
  });

  it('participants array reference changes only when participants change', () => {
    const store = createChatStore();
    const initialParticipants = store.getState().participants;

    // Unrelated state changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    const participantsAfterUnrelatedChanges = store.getState().participants;

    // Reference should be stable
    expect(participantsAfterUnrelatedChanges).toBe(initialParticipants);

    // Actually change participants
    const newParticipants: ChatParticipant[] = [
      {
        createdAt: new Date(),
        customRoleId: null,
        disabled: false,
        id: 'p-1',
        modelId: 'gpt-4',
        priority: 0,
        role: null,
        threadId: 't-1',
        updatedAt: new Date(),
      },
    ];

    store.getState().setParticipants(newParticipants);

    const participantsAfterActualChange = store.getState().participants;

    // Reference should change
    expect(participantsAfterActualChange).not.toBe(initialParticipants);
  });

  it('selectedParticipants array reference changes only when selection changes', () => {
    const store = createChatStore();
    const initialSelected = store.getState().selectedParticipants;

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setEnableWebSearch(true);

    const selectedAfterUnrelatedChanges = store.getState().selectedParticipants;

    // Should be stable
    expect(selectedAfterUnrelatedChanges).toBe(initialSelected);

    // Actually change selection
    const newSelection: ParticipantConfig[] = [
      {
        id: 'gpt-4',
        modelId: 'gpt-4',
        priority: 0,
        role: null,
      },
    ];

    store.getState().setSelectedParticipants(newSelection);

    const selectedAfterActualChange = store.getState().selectedParticipants;

    // Should change
    expect(selectedAfterActualChange).not.toBe(initialSelected);
  });

  it('thread object reference changes only when thread changes', () => {
    const store = createChatStore();
    const initialThread = store.getState().thread;

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const threadAfterUnrelatedChanges = store.getState().thread;

    // Should be stable (both null)
    expect(threadAfterUnrelatedChanges).toBe(initialThread);

    // Set thread
    const newThread: ChatThread = {
      createdAt: new Date(),
      enableWebSearch: false,
      id: 't-1',
      mode: 'council',
      title: 'Test Thread',
      updatedAt: new Date(),
      userId: 'u-1',
    };

    store.getState().setThread(newThread);

    const threadAfterActualChange = store.getState().thread;

    // Should change
    expect(threadAfterActualChange).not.toBe(initialThread);
    expect(threadAfterActualChange).toBe(newThread);
  });

  it('preSearches array reference changes only when presearch data changes', () => {
    const store = createChatStore();
    const initialPreSearches = store.getState().preSearches;

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const preSearchesAfterUnrelatedChanges = store.getState().preSearches;

    // Should be stable
    expect(preSearchesAfterUnrelatedChanges).toBe(initialPreSearches);

    // Add presearch
    store.getState().addPreSearch({
      createdAt: new Date(),
      roundNumber: 0,
      status: MessageStatuses.PENDING,
      threadId: 't-1',
    });

    const preSearchesAfterActualChange = store.getState().preSearches;

    // Should change
    expect(preSearchesAfterActualChange).not.toBe(initialPreSearches);
  });
});

describe('selector referential equality - primitive batching with shallow', () => {
  it('shallow equality comparison detects no change when primitives are same', () => {
    const store = createChatStore();

    const selector = (s: ReturnType<typeof store.getState>) => ({
      isStreaming: s.isStreaming,
      participantIndex: s.currentParticipantIndex,
      roundNumber: s.streamingRoundNumber,
    });

    const result1 = selector(store.getState());

    // Unrelated state change
    store.getState().setInputValue('test');

    const result2 = selector(store.getState());

    // shallow comparison should return true (no change)
    expect(shallow(result1, result2)).toBeTruthy();

    // Objects are not the same reference (new object created by selector)
    expect(result1).not.toBe(result2);

    // But shallow equality detects they're equivalent
    expect(result1).toEqual(result2);
  });

  it('shallow equality detects change when any primitive in batch changes', () => {
    const store = createChatStore();

    const selector = (s: ReturnType<typeof store.getState>) => ({
      isStreaming: s.isStreaming,
      participantIndex: s.currentParticipantIndex,
      roundNumber: s.streamingRoundNumber,
    });

    const result1 = selector(store.getState());

    // Change one of the primitives
    store.getState().setIsStreaming(true);

    const result2 = selector(store.getState());

    // shallow comparison should detect change
    expect(shallow(result1, result2)).toBeFalsy();

    // Values are different
    expect(result1.isStreaming).toBeFalsy();
    expect(result2.isStreaming).toBeTruthy();
  });

  it('batching streaming state selectors with shallow prevents unnecessary re-renders', () => {
    const store = createChatStore();

    const streamingStateSelector = (s: ReturnType<typeof store.getState>) => ({
      isModeratorStreaming: s.isModeratorStreaming,
      isStreaming: s.isStreaming,
      participantIndex: s.currentParticipantIndex,
      roundNumber: s.streamingRoundNumber,
      waitingToStartStreaming: s.waitingToStartStreaming,
    });

    const state1 = streamingStateSelector(store.getState());

    // Multiple unrelated changes
    store.getState().setInputValue('test');
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode('council');

    const state2 = streamingStateSelector(store.getState());

    // Shallow equality should be true (no streaming state changed)
    expect(shallow(state1, state2)).toBeTruthy();

    // Now change streaming state
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    const state3 = streamingStateSelector(store.getState());

    // Should detect change
    expect(shallow(state2, state3)).toBeFalsy();
  });

  it('batching form state selectors prevents re-renders on unrelated changes', () => {
    const store = createChatStore();

    const formStateSelector = (s: ReturnType<typeof store.getState>) => ({
      enableWebSearch: s.enableWebSearch,
      inputValue: s.inputValue,
      modelOrder: s.modelOrder,
      selectedMode: s.selectedMode,
    });

    const form1 = formStateSelector(store.getState());

    // Unrelated streaming changes
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(1);

    const form2 = formStateSelector(store.getState());

    // Should be equal
    expect(shallow(form1, form2)).toBeTruthy();

    // Change form state
    store.getState().setInputValue('Hello');

    const form3 = formStateSelector(store.getState());

    // Should detect change
    expect(shallow(form2, form3)).toBeFalsy();
  });
});

describe('selector referential equality - array and object stability in batches', () => {
  it('batched selector with arrays maintains reference stability correctly', () => {
    const store = createChatStore();

    const selector = (s: ReturnType<typeof store.getState>) => ({
      messages: s.messages,
      participants: s.participants,
      preSearches: s.preSearches,
    });

    const result1 = selector(store.getState());

    // Unrelated change
    store.getState().setInputValue('test');

    const result2 = selector(store.getState());

    // Array references should be stable
    expect(result2.messages).toBe(result1.messages);
    expect(result2.participants).toBe(result1.participants);
    expect(result2.preSearches).toBe(result1.preSearches);

    // shallow should detect no change
    expect(shallow(result1, result2)).toBeTruthy();
  });

  it('batched selector detects array changes correctly', () => {
    const store = createChatStore();

    const selector = (s: ReturnType<typeof store.getState>) => ({
      messages: s.messages,
      participants: s.participants,
    });

    const result1 = selector(store.getState());

    // Change one array
    store.getState().setMessages([
      {
        createdAt: new Date(),
        id: 'msg-1',
        metadata: { roundNumber: 0 },
        parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER,
      },
    ]);

    const result2 = selector(store.getState());

    // messages reference should change
    expect(result2.messages).not.toBe(result1.messages);

    // participants reference should NOT change
    expect(result2.participants).toBe(result1.participants);

    // shallow should detect change (messages changed)
    expect(shallow(result1, result2)).toBeFalsy();
  });

  it('batched selector with mixed primitives and arrays works correctly', () => {
    const store = createChatStore();

    const selector = (s: ReturnType<typeof store.getState>) => ({
      // Primitives
      isStreaming: s.isStreaming,
      // Arrays
      messages: s.messages,
      participants: s.participants,
      roundNumber: s.streamingRoundNumber,
    });

    const result1 = selector(store.getState());

    // Change primitive
    store.getState().setIsStreaming(true);

    const result2 = selector(store.getState());

    // Primitive changed, arrays stable
    expect(result2.isStreaming).not.toBe(result1.isStreaming);
    expect(result2.messages).toBe(result1.messages);
    expect(result2.participants).toBe(result1.participants);

    // shallow detects change
    expect(shallow(result1, result2)).toBeFalsy();

    // Change array
    store.getState().setMessages([
      {
        createdAt: new Date(),
        id: 'msg-1',
        metadata: { roundNumber: 0 },
        parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER,
      },
    ]);

    const result3 = selector(store.getState());

    // Array changed
    expect(result3.messages).not.toBe(result2.messages);

    // shallow detects change
    expect(shallow(result2, result3)).toBeFalsy();
  });
});

describe('action function stability', () => {
  it('action functions have stable references across unrelated state changes', () => {
    const store = createChatStore();

    // Get action references
    const setInputValue1 = store.getState().setInputValue;
    const setIsStreaming1 = store.getState().setIsStreaming;
    const setThread1 = store.getState().setThread;
    const setMessages1 = store.getState().setMessages;

    // Make various state changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // Get action references again
    const setInputValue2 = store.getState().setInputValue;
    const setIsStreaming2 = store.getState().setIsStreaming;
    const setThread2 = store.getState().setThread;
    const setMessages2 = store.getState().setMessages;

    // All actions should have stable references
    expect(setInputValue2).toBe(setInputValue1);
    expect(setIsStreaming2).toBe(setIsStreaming1);
    expect(setThread2).toBe(setThread1);
    expect(setMessages2).toBe(setMessages1);
  });

  it('batched action selectors maintain stability with shallow', () => {
    const store = createChatStore();

    const actionSelector = (s: ReturnType<typeof store.getState>) => ({
      completeStreaming: s.completeStreaming,
      setInputValue: s.setInputValue,
      setIsStreaming: s.setIsStreaming,
      setMessages: s.setMessages,
      setThread: s.setThread,
    });

    const actions1 = actionSelector(store.getState());

    // Make state changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const actions2 = actionSelector(store.getState());

    // All action references should be stable
    expect(actions2.setInputValue).toBe(actions1.setInputValue);
    expect(actions2.setIsStreaming).toBe(actions1.setIsStreaming);
    expect(actions2.setThread).toBe(actions1.setThread);
    expect(actions2.setMessages).toBe(actions1.setMessages);
    expect(actions2.completeStreaming).toBe(actions1.completeStreaming);

    // shallow should detect no change (same function references)
    expect(shallow(actions1, actions2)).toBeTruthy();
  });

  it('complex operation actions maintain stability', () => {
    const store = createChatStore();

    const ops1 = {
      completeStreaming: store.getState().completeStreaming,
      initializeThread: store.getState().initializeThread,
      prepareForNewMessage: store.getState().prepareForNewMessage,
      resetToNewChat: store.getState().resetToNewChat,
      startRegeneration: store.getState().startRegeneration,
    };

    // Make various changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);
    store.getState().setMessages([]);

    const ops2 = {
      completeStreaming: store.getState().completeStreaming,
      initializeThread: store.getState().initializeThread,
      prepareForNewMessage: store.getState().prepareForNewMessage,
      resetToNewChat: store.getState().resetToNewChat,
      startRegeneration: store.getState().startRegeneration,
    };

    // All should be stable
    expect(ops2.initializeThread).toBe(ops1.initializeThread);
    expect(ops2.prepareForNewMessage).toBe(ops1.prepareForNewMessage);
    expect(ops2.completeStreaming).toBe(ops1.completeStreaming);
    expect(ops2.startRegeneration).toBe(ops1.startRegeneration);
    expect(ops2.resetToNewChat).toBe(ops1.resetToNewChat);
  });
});

describe('derived state computation efficiency', () => {
  it('thread-derived state only changes when thread changes', () => {
    const store = createChatStore();

    // Derived: thread ID
    const getThreadId = (s: ReturnType<typeof store.getState>) =>
      s.thread?.id || s.createdThreadId;

    const threadId1 = getThreadId(store.getState());

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const threadId2 = getThreadId(store.getState());

    // Should be same (both null/undefined)
    expect(threadId2).toBe(threadId1);

    // Set createdThreadId
    store.getState().setCreatedThreadId('t-1');

    const threadId3 = getThreadId(store.getState());

    // Should change
    expect(threadId3).not.toBe(threadId1);
    expect(threadId3).toBe('t-1');
  });

  it('participants-derived state only changes when participants change', () => {
    const store = createChatStore();

    // Derived: participant count
    const getParticipantCount = (s: ReturnType<typeof store.getState>) =>
      s.participants.length;

    const count1 = getParticipantCount(store.getState());

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const count2 = getParticipantCount(store.getState());

    // Should be same
    expect(count2).toBe(count1);

    // Add participant
    store.getState().setParticipants([
      {
        createdAt: new Date(),
        customRoleId: null,
        disabled: false,
        id: 'p-1',
        modelId: 'gpt-4',
        priority: 0,
        role: null,
        threadId: 't-1',
        updatedAt: new Date(),
      },
    ]);

    const count3 = getParticipantCount(store.getState());

    // Should change
    expect(count3).not.toBe(count1);
    expect(count3).toBe(1);
  });

  it('message-derived state only changes when messages change', () => {
    const store = createChatStore();

    // Derived: last message round number
    const getLastRoundNumber = (s: ReturnType<typeof store.getState>) => {
      const messages = s.messages;
      if (messages.length === 0) {
        return null;
      }
      const lastMsg = messages[messages.length - 1];
      return (lastMsg?.metadata as { roundNumber?: number })?.roundNumber ?? null;
    };

    const round1 = getLastRoundNumber(store.getState());

    // Unrelated changes
    store.getState().setInputValue('test');
    store.getState().setIsStreaming(true);

    const round2 = getLastRoundNumber(store.getState());

    // Should be same (both null)
    expect(round2).toBe(round1);

    // Add message
    store.getState().setMessages([
      {
        createdAt: new Date(),
        id: 'msg-1',
        metadata: { roundNumber: 0 },
        parts: [{ text: 'Test', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER,
      },
    ]);

    const round3 = getLastRoundNumber(store.getState());

    // Should change
    expect(round3).not.toBe(round1);
    expect(round3).toBe(0);
  });

  it('complex derived state with multiple dependencies', () => {
    const store = createChatStore();

    // Derived: is currently streaming for a specific round
    const getIsStreamingForRound = (roundNumber: number) => (s: ReturnType<typeof store.getState>) => {
      return s.isStreaming && s.streamingRoundNumber === roundNumber;
    };

    const isStreamingRound0 = getIsStreamingForRound(0);

    const streaming1 = isStreamingRound0(store.getState());
    expect(streaming1).toBeFalsy();

    // Change unrelated state
    store.getState().setInputValue('test');

    const streaming2 = isStreamingRound0(store.getState());
    expect(streaming2).toBe(streaming1);

    // Start streaming for round 0
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    const streaming3 = isStreamingRound0(store.getState());
    expect(streaming3).toBeTruthy();
    expect(streaming3).not.toBe(streaming1);

    // Change to different round
    store.getState().setStreamingRoundNumber(1);

    const streaming4 = isStreamingRound0(store.getState());
    expect(streaming4).toBeFalsy();
  });
});

describe('selector subscription efficiency patterns', () => {
  it('documents individual vs batched selector subscription counts', () => {
    const store = createChatStore();

    /**
     * ANTI-PATTERN: Individual selectors (3 subscriptions)
     *
     * const isStreaming = useChatStore(s => s.isStreaming)
     * const roundNumber = useChatStore(s => s.streamingRoundNumber)
     * const participantIndex = useChatStore(s => s.currentParticipantIndex)
     *
     * Each useChatStore call creates a new subscription.
     * Total: 3 subscriptions, 3 potential re-render triggers.
     */

    /**
     * BEST PRACTICE: Batched selector with useShallow (1 subscription)
     *
     * const { isStreaming, roundNumber, participantIndex } = useChatStore(
     *   useShallow(s => ({
     *     isStreaming: s.isStreaming,
     *     roundNumber: s.streamingRoundNumber,
     *     participantIndex: s.currentParticipantIndex
     *   }))
     * )
     *
     * Single subscription, re-renders only when shallow comparison detects change.
     * Total: 1 subscription, 1 potential re-render trigger.
     */

    // Verify batching works correctly
    const batchedSelector = (s: ReturnType<typeof store.getState>) => ({
      isStreaming: s.isStreaming,
      participantIndex: s.currentParticipantIndex,
      roundNumber: s.streamingRoundNumber,
    });

    let renderCount = 0;
    let lastResult = batchedSelector(store.getState());

    const unsubscribe = store.subscribe((state) => {
      const newResult = batchedSelector(state);

      // Only "re-render" if shallow comparison detects change
      if (!shallow(lastResult, newResult)) {
        renderCount++;

        lastResult = newResult;
      }
    });

    // 10 unrelated state changes
    store.getState().setInputValue('a');
    store.getState().setInputValue('b');
    store.getState().setInputValue('c');
    store.getState().setEnableWebSearch(true);
    store.getState().setEnableWebSearch(false);
    store.getState().setSelectedMode('council');
    store.getState().setSelectedMode('debating');
    store.getState().setShowInitialUI(false);
    store.getState().setIsCreatingThread(true);
    store.getState().setIsCreatingThread(false);

    // Should not trigger re-renders (unrelated changes)
    expect(renderCount).toBe(0);

    // Change batched state
    store.getState().setIsStreaming(true);

    // Should trigger re-render
    expect(renderCount).toBe(1);

    // Change batched state again
    store.getState().setStreamingRoundNumber(0);

    // Should trigger another re-render
    expect(renderCount).toBe(2);

    unsubscribe();

    // Performance: 2 re-renders vs 12 with individual selectors
  });

  it('documents array selector stability patterns', () => {
    const store = createChatStore();

    /**
     * PATTERN 1: Direct array selector (stable reference)
     *
     * const messages = useChatStore(s => s.messages)
     *
     * Reference stable until messages actually change.
     * Good for lists that don't need derived computation.
     */

    /**
     * PATTERN 2: Derived array selector (new reference each time)
     *
     * const enabledParticipants = useChatStore(s =>
     *   s.participants.filter(p => !p.disabled)
     * )
     *
     * Creates new array on every selector call!
     * Use useMemo in component to prevent re-renders:
     *
     * const participants = useChatStore(s => s.participants)
     * const enabledParticipants = useMemo(
     *   () => participants.filter(p => !p.disabled),
     *   [participants]
     * )
     */

    // Verify array stability
    const messages1 = store.getState().messages;
    const messages2 = store.getState().messages;

    // Same reference until actually changed
    expect(messages2).toBe(messages1);

    // Derived arrays create new references
    const filtered1 = store.getState().participants.filter(p => !p.disabled);
    const filtered2 = store.getState().participants.filter(p => !p.disabled);

    // Different references (even though empty)
    expect(filtered2).not.toBe(filtered1);
    expect(filtered2).toEqual(filtered1); // But equal values
  });

  it('documents optimal selector patterns for ChatView component', () => {
    const store = createChatStore();

    /**
     * ChatView Component Optimization Pattern:
     *
     * BEFORE (18 individual selectors):
     * - Creates 18 separate store subscriptions
     * - Each subscription can trigger independent re-renders
     * - Unrelated state changes cascade through all 18 subscriptions
     *
     * AFTER (1 batched useShallow selector):
     * - Single subscription for all 18 values
     * - Shallow comparison prevents unnecessary re-renders
     * - Only re-renders when actual values change
     *
     * Performance Impact:
     * - Reduces subscription overhead by 94% (18 → 1)
     * - Prevents cascading re-renders
     * - Batches state updates together
     */

    const chatViewSelector = (s: ReturnType<typeof store.getState>) => ({
      contextParticipants: s.participants,
      createdThreadId: s.createdThreadId,
      currentParticipantIndex: s.currentParticipantIndex,
      enableWebSearch: s.enableWebSearch,
      hasInitiallyLoaded: s.hasInitiallyLoaded,
      inputValue: s.inputValue,
      isCreatingThread: s.isCreatingThread,
      isModeratorStreaming: s.isModeratorStreaming,
      isStreaming: s.isStreaming,
      messages: s.messages,
      modelOrder: s.modelOrder,
      moderatorResumption: s.moderatorResumption,
      pendingMessage: s.pendingMessage,
      preSearches: s.preSearches,
      preSearchResumption: s.preSearchResumption,
      selectedMode: s.selectedMode,
      selectedParticipants: s.selectedParticipants,
      setInputValue: s.setInputValue,
      setModelOrder: s.setModelOrder,
      setSelectedParticipants: s.setSelectedParticipants,
      streamingRoundNumber: s.streamingRoundNumber,
      thread: s.thread,
      waitingToStartStreaming: s.waitingToStartStreaming,
    });

    let renderCount = 0;
    let lastResult = chatViewSelector(store.getState());

    const unsubscribe = store.subscribe((state) => {
      const newResult = chatViewSelector(state);
      if (!shallow(lastResult, newResult)) {
        renderCount++;
        lastResult = newResult;
      }
    });

    // 20 unrelated state changes
    for (let i = 0; i < 20; i++) {
      store.getState().setCurrentRoundNumber(i);
    }

    // Should not trigger re-renders (setCurrentRoundNumber not in selector)
    expect(renderCount).toBe(0);

    // Change one selected value
    store.getState().setInputValue('test');

    // Should trigger exactly 1 re-render
    expect(renderCount).toBe(1);

    unsubscribe();
  });
});

describe('selector memoization cache behavior', () => {
  it('demonstrates that Zustand does not cache selector results', () => {
    const store = createChatStore();

    // Expensive derived computation (not cached by Zustand)
    const expensiveSelector = (s: ReturnType<typeof store.getState>) => {
      // Simulate expensive computation
      let result = 0;
      for (let i = 0; i < 1000; i++) {
        result += i;
      }
      return {
        count: s.participants.length,
        expensiveResult: result,
        participants: s.participants,
      };
    };

    const result1 = expensiveSelector(store.getState());
    const result2 = expensiveSelector(store.getState());

    // New object each time (no caching)
    expect(result2).not.toBe(result1);

    // But values are equal
    expect(result2).toEqual(result1);

    /**
     * LESSON: Zustand doesn't cache selector results.
     * Use useMemo in components for expensive derived computations:
     *
     * const participants = useChatStore(s => s.participants)
     * const expensiveValue = useMemo(() => {
     *   // expensive computation here
     * }, [participants])
     */
  });

  it('demonstrates need for useMemo for derived array computations', () => {
    const store = createChatStore();

    // Add participants
    store.getState().setParticipants([
      {
        createdAt: new Date(),
        customRoleId: null,
        disabled: false,
        id: 'p-1',
        modelId: 'gpt-4',
        priority: 0,
        role: null,
        threadId: 't-1',
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        customRoleId: null,
        disabled: true, // Disabled
        id: 'p-2',
        modelId: 'claude-3',
        priority: 1,
        role: null,
        threadId: 't-1',
        updatedAt: new Date(),
      },
    ]);

    // Derived array selector
    const getEnabledParticipants = (s: ReturnType<typeof store.getState>) =>
      s.participants.filter(p => !p.disabled);

    const enabled1 = getEnabledParticipants(store.getState());
    const enabled2 = getEnabledParticipants(store.getState());

    // New array each time
    expect(enabled2).not.toBe(enabled1);

    // But same values
    expect(enabled2).toEqual(enabled1);
    expect(enabled1).toHaveLength(1);
    expect(enabled1[0]?.id).toBe('p-1');

    /**
     * RECOMMENDATION: In component, use:
     *
     * const participants = useChatStore(s => s.participants)
     * const enabledParticipants = useMemo(
     *   () => participants.filter(p => !p.disabled),
     *   [participants]
     * )
     *
     * This way filtering only happens when participants array reference changes.
     */
  });
});
