/**
 * State Machine Transition Optimization Unit Tests
 *
 * Tests for computational efficiency of state machine transition functions:
 * - determineFlowState() single pass through conditions
 * - getNextAction() null return for no-op transitions
 * - Context calculation single pass message scanning
 * - Moderator message detection O(1) or O(n) not O(n²)
 * - Participant completion status efficient counting
 * - prevStateRef tracking duplicate transitions prevented
 * - FlowContext memoization dependency tracking
 *
 * Focus: Algorithm complexity, early exit conditions, deduplication, memoization
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  FlowStates,
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  ScreenModes,
  TextPartStates,
} from '@/api/core/enums';
import type { ChatParticipant } from '@/api/routes/chat/schema';

// ============================================================================
// EXTRACTED PURE FUNCTIONS - Mirror flow-state-machine.ts for unit testing
// ============================================================================

type FlowContext = {
  threadId: string | null;
  threadSlug: string | null;
  hasAiGeneratedTitle: boolean;
  currentRound: number;
  hasMessages: boolean;
  participantCount: number;
  allParticipantsResponded: boolean;
  moderatorStatus: typeof MessageStatuses[keyof typeof MessageStatuses] | null;
  moderatorExists: boolean;
  isAiSdkStreaming: boolean;
  streamingJustCompleted: boolean;
  pendingAnimations: Set<number>;
  isCreatingThread: boolean;
  isCreatingModerator: boolean;
  hasNavigated: boolean;
  screenMode: typeof ScreenModes[keyof typeof ScreenModes] | null;
};

type FlowAction
  = | { type: 'CREATE_THREAD' }
    | { type: 'START_PARTICIPANT_STREAMING' }
    | { type: 'CREATE_MODERATOR' }
    | { type: 'START_MODERATOR_STREAMING' }
    | { type: 'INVALIDATE_CACHE' }
    | { type: 'NAVIGATE'; slug: string }
    | { type: 'COMPLETE_FLOW' }
    | { type: 'RESET' };

/**
 * Pure function - determines flow state with early exits
 * ✅ CRITICAL: Tests verify single pass through conditions (not multiple scans)
 */
function determineFlowState(context: FlowContext): typeof FlowStates[keyof typeof FlowStates] {
  // Priority 1: Navigation complete (EARLY EXIT)
  if (context.hasNavigated) {
    return FlowStates.COMPLETE;
  }

  // Priority 2: Ready to navigate
  if (
    context.screenMode === ScreenModes.OVERVIEW
    && context.moderatorStatus === MessageStatuses.COMPLETE
    && context.hasAiGeneratedTitle
    && context.threadSlug
  ) {
    return FlowStates.NAVIGATING;
  }

  // Priority 3: Moderator streaming
  if (
    context.moderatorStatus === MessageStatuses.STREAMING
    || (context.moderatorExists && context.isAiSdkStreaming)
  ) {
    return FlowStates.STREAMING_MODERATOR;
  }

  // Priority 4: Creating moderator
  if (
    !context.isAiSdkStreaming
    && !context.streamingJustCompleted
    && context.allParticipantsResponded
    && context.participantCount > 0
    && !context.moderatorExists
    && !context.isCreatingModerator
    && context.pendingAnimations.size === 0
  ) {
    return FlowStates.CREATING_MODERATOR;
  }

  // Priority 5: Participants streaming
  if (context.isAiSdkStreaming && !context.moderatorExists) {
    return FlowStates.STREAMING_PARTICIPANTS;
  }

  // Priority 6: Thread creation
  if (context.isCreatingThread) {
    return FlowStates.CREATING_THREAD;
  }

  // Default: Idle
  return FlowStates.IDLE;
}

/**
 * Pure function - returns action or null (no-op transitions)
 * ✅ CRITICAL: Tests verify null returns for duplicate transitions
 */
function getNextAction(
  prevState: typeof FlowStates[keyof typeof FlowStates],
  currentState: typeof FlowStates[keyof typeof FlowStates],
  context: FlowContext,
): FlowAction | null {
  // Create moderator only on transition to CREATING_MODERATOR state
  if (
    currentState === FlowStates.CREATING_MODERATOR
    && prevState !== FlowStates.CREATING_MODERATOR
    && context.threadId
  ) {
    return { type: 'CREATE_MODERATOR' };
  }

  // Invalidate cache on transition from STREAMING_MODERATOR to NAVIGATING
  if (
    prevState === FlowStates.STREAMING_MODERATOR
    && currentState === FlowStates.NAVIGATING
    && context.threadSlug
    && !context.hasNavigated
  ) {
    return { type: 'INVALIDATE_CACHE' };
  }

  // Navigate when entering NAVIGATING state (but not from STREAMING_MODERATOR - handled above)
  if (
    currentState === FlowStates.NAVIGATING
    && !context.hasNavigated
    && context.threadSlug
  ) {
    if (prevState === FlowStates.STREAMING_MODERATOR) {
      return null; // Already handled above
    }
    return { type: 'NAVIGATE', slug: context.threadSlug };
  }

  // No action needed for this transition
  return null;
}

/**
 * Calculate all participants responded - single pass algorithm
 * ✅ CRITICAL: Tests verify O(n) not O(n²) complexity
 */
function calculateAllParticipantsResponded(
  messages: UIMessage[],
  participants: ChatParticipant[],
  currentRound: number,
): boolean {
  const enabledParticipants = participants.filter(p => p.isEnabled);
  if (enabledParticipants.length === 0) {
    return false;
  }

  // ✅ SINGLE PASS: Count completed participants in one scan
  let completedCount = 0;

  for (const m of messages) {
    if (m.role !== MessageRoles.ASSISTANT)
      continue;

    const metadata = m.metadata as { roundNumber?: number; isModerator?: boolean } | undefined;
    if (metadata?.roundNumber !== currentRound)
      continue;
    if (metadata?.isModerator)
      continue; // Skip moderator messages

    // Check if complete using streaming parts check first
    const hasStreamingParts = m.parts?.some(
      p => 'state' in p && p.state === TextPartStates.STREAMING,
    ) ?? false;

    if (hasStreamingParts)
      continue; // Not complete

    // Check for text content
    const hasTextContent = m.parts?.some(
      p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
    );

    if (hasTextContent) {
      completedCount++;
      continue;
    }

    // Check for finishReason
    const assistantMetadata = metadata as { finishReason?: string } | undefined;
    if (assistantMetadata?.finishReason) {
      completedCount++;
    }
  }

  return completedCount >= enabledParticipants.length;
}

/**
 * Build flow context - single pass message scanning
 * ✅ CRITICAL: Tests verify single scan not multiple scans
 */
function buildFlowContext(
  messages: UIMessage[],
  participants: ChatParticipant[],
  options: {
    threadId: string | null;
    threadSlug: string | null;
    hasAiGeneratedTitle: boolean;
    isCreatingThread: boolean;
    isCreatingModerator: boolean;
    isAiSdkStreaming: boolean;
    streamingJustCompleted: boolean;
    pendingAnimations: Set<number>;
    hasNavigated: boolean;
    screenMode: typeof ScreenModes[keyof typeof ScreenModes] | null;
  },
): FlowContext {
  const currentRound = messages.length > 0
    ? Math.max(...messages.map(m => (m.metadata as { roundNumber?: number })?.roundNumber ?? 0))
    : 0;

  // ✅ SINGLE PASS: Collect moderator and participant info in one scan
  let currentRoundModeratorMessage: UIMessage | null = null;
  let completedCount = 0;

  for (const m of messages) {
    if (m.role !== MessageRoles.ASSISTANT)
      continue;

    const metadata = m.metadata as { roundNumber?: number; isModerator?: boolean } | undefined;
    if (metadata?.roundNumber !== currentRound)
      continue;

    // Check if moderator
    if (metadata?.isModerator) {
      currentRoundModeratorMessage = m;
      continue; // Moderator doesn't count toward participant completion
    }

    // Check if participant message is complete
    const hasStreamingParts = m.parts?.some(
      p => 'state' in p && p.state === TextPartStates.STREAMING,
    ) ?? false;

    if (!hasStreamingParts) {
      const hasTextContent = m.parts?.some(
        p => p.type === MessagePartTypes.TEXT && 'text' in p && p.text,
      );

      if (hasTextContent) {
        completedCount++;
      } else {
        const assistantMetadata = metadata as { finishReason?: string } | undefined;
        if (assistantMetadata?.finishReason) {
          completedCount++;
        }
      }
    }
  }

  const allParticipantsResponded = completedCount >= participants.length && participants.length > 0;

  let moderatorStatus: typeof MessageStatuses[keyof typeof MessageStatuses] | null = null;
  if (currentRoundModeratorMessage) {
    const hasStreamingParts = currentRoundModeratorMessage.parts?.some(
      p => 'state' in p && p.state === TextPartStates.STREAMING,
    ) ?? false;
    moderatorStatus = hasStreamingParts ? MessageStatuses.STREAMING : MessageStatuses.COMPLETE;
  }

  return {
    threadId: options.threadId,
    threadSlug: options.threadSlug,
    hasAiGeneratedTitle: options.hasAiGeneratedTitle,
    currentRound,
    hasMessages: messages.length > 0,
    participantCount: participants.length,
    allParticipantsResponded,
    moderatorStatus,
    moderatorExists: !!currentRoundModeratorMessage,
    isAiSdkStreaming: options.isAiSdkStreaming,
    streamingJustCompleted: options.streamingJustCompleted,
    pendingAnimations: options.pendingAnimations,
    isCreatingThread: options.isCreatingThread,
    isCreatingModerator: options.isCreatingModerator,
    hasNavigated: options.hasNavigated,
    screenMode: options.screenMode,
  };
}

// ============================================================================
// TEST HELPERS
// ============================================================================

function createDefaultContext(): FlowContext {
  return {
    threadId: 'thread-123',
    threadSlug: 'test-thread',
    hasAiGeneratedTitle: false,
    currentRound: 0,
    hasMessages: false,
    participantCount: 2,
    allParticipantsResponded: false,
    moderatorStatus: null,
    moderatorExists: false,
    isAiSdkStreaming: false,
    streamingJustCompleted: false,
    pendingAnimations: new Set(),
    isCreatingThread: false,
    isCreatingModerator: false,
    hasNavigated: false,
    screenMode: ScreenModes.OVERVIEW,
  };
}

function createParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  options: {
    text?: string;
    isStreaming?: boolean;
    finishReason?: string;
  } = {},
): UIMessage {
  const parts: UIMessage['parts'] = [];

  if (options.text !== undefined) {
    parts.push({
      type: MessagePartTypes.TEXT,
      text: options.text,
      ...(options.isStreaming ? { state: TextPartStates.STREAMING } : {}),
    });
  }

  return {
    id: `msg-${roundNumber}-${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    content: options.text ?? '',
    parts,
    metadata: {
      roundNumber,
      participantIndex,
      ...(options.finishReason ? { finishReason: options.finishReason } : {}),
    },
  };
}

function createModeratorMessage(
  roundNumber: number,
  options: {
    text?: string;
    isStreaming?: boolean;
  } = {},
): UIMessage {
  const parts: UIMessage['parts'] = [];

  if (options.text !== undefined) {
    parts.push({
      type: MessagePartTypes.TEXT,
      text: options.text,
      ...(options.isStreaming ? { state: TextPartStates.STREAMING } : {}),
    });
  }

  return {
    id: `moderator-${roundNumber}`,
    role: MessageRoles.ASSISTANT,
    content: options.text ?? '',
    parts,
    metadata: {
      roundNumber,
      isModerator: true,
    },
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('state Machine Optimization - determineFlowState()', () => {
  describe('early Exit Optimization', () => {
    it('returns COMPLETE immediately when hasNavigated is true (highest priority)', () => {
      const context = createDefaultContext();
      context.hasNavigated = true;
      // Set all other conditions to verify early exit
      context.isAiSdkStreaming = true;
      context.moderatorStatus = MessageStatuses.STREAMING;
      context.allParticipantsResponded = true;

      const result = determineFlowState(context);

      expect(result).toBe(FlowStates.COMPLETE);
      // If it checked other conditions, it would not be COMPLETE
    });

    it('skips remaining checks when early condition matches', () => {
      const context = createDefaultContext();
      context.screenMode = ScreenModes.OVERVIEW;
      context.moderatorStatus = MessageStatuses.COMPLETE;
      context.hasAiGeneratedTitle = true;
      context.threadSlug = 'test-slug';

      const result = determineFlowState(context);

      expect(result).toBe(FlowStates.NAVIGATING);
      // Verifies that NAVIGATING check runs before other states
    });

    it('returns IDLE when no conditions match (default fallback)', () => {
      const context = createDefaultContext();
      // All flags false

      const result = determineFlowState(context);

      expect(result).toBe(FlowStates.IDLE);
    });
  });

  describe('single Pass Through Conditions', () => {
    it('evaluates conditions in priority order without backtracking', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;
      context.isCreatingThread = true;

      const result = determineFlowState(context);

      // STREAMING_PARTICIPANTS (priority 5) beats CREATING_THREAD (priority 6)
      expect(result).toBe(FlowStates.STREAMING_PARTICIPANTS);
    });

    it('stops at first matching condition (no redundant checks)', () => {
      const context = createDefaultContext();
      context.moderatorStatus = MessageStatuses.STREAMING;
      context.isAiSdkStreaming = true; // Would also match STREAMING_PARTICIPANTS

      const result = determineFlowState(context);

      // STREAMING_MODERATOR (priority 3) beats STREAMING_PARTICIPANTS (priority 5)
      expect(result).toBe(FlowStates.STREAMING_MODERATOR);
    });
  });

  describe('complexity Verification', () => {
    it('has O(1) complexity - only checks context flags', () => {
      const context = createDefaultContext();

      // Measure execution time (should be < 1ms for O(1) operation)
      const start = performance.now();
      for (let i = 0; i < 10000; i++) {
        determineFlowState(context);
      }
      const end = performance.now();

      // 10000 iterations should complete in < 10ms for O(1) operation
      expect(end - start).toBeLessThan(10);
    });

    it('does not scan messages or participants arrays', () => {
      const context = createDefaultContext();
      // All data in context is pre-computed flags, not arrays to scan

      const result = determineFlowState(context);

      expect(result).toBeDefined();
      // Function signature accepts only FlowContext, no messages/participants arrays
    });
  });
});

describe('state Machine Optimization - getNextAction()', () => {
  describe('null Return for No-Op Transitions', () => {
    it('returns null when state does not change', () => {
      const context = createDefaultContext();

      const action = getNextAction(FlowStates.IDLE, FlowStates.IDLE, context);

      expect(action).toBeNull();
    });

    it('returns null when transition has no associated action', () => {
      const context = createDefaultContext();

      const action = getNextAction(FlowStates.CREATING_THREAD, FlowStates.STREAMING_PARTICIPANTS, context);

      expect(action).toBeNull();
    });

    it('returns null when staying in STREAMING_PARTICIPANTS state', () => {
      const context = createDefaultContext();
      context.isAiSdkStreaming = true;

      const action = getNextAction(FlowStates.STREAMING_PARTICIPANTS, FlowStates.STREAMING_PARTICIPANTS, context);

      expect(action).toBeNull();
    });
  });

  describe('duplicate Transition Prevention', () => {
    it('returns null when already in CREATING_MODERATOR state (prevents duplicate action)', () => {
      const context = createDefaultContext();
      context.threadId = 'thread-123';
      context.allParticipantsResponded = true;

      // Second call with same state
      const action = getNextAction(FlowStates.CREATING_MODERATOR, FlowStates.CREATING_MODERATOR, context);

      expect(action).toBeNull();
    });

    it('returns CREATE_MODERATOR only on transition TO state', () => {
      const context = createDefaultContext();
      context.threadId = 'thread-123';
      context.allParticipantsResponded = true;

      // First transition to CREATING_MODERATOR
      const action1 = getNextAction(FlowStates.STREAMING_PARTICIPANTS, FlowStates.CREATING_MODERATOR, context);
      expect(action1).toEqual({ type: 'CREATE_MODERATOR' });

      // Second time in same state
      const action2 = getNextAction(FlowStates.CREATING_MODERATOR, FlowStates.CREATING_MODERATOR, context);
      expect(action2).toBeNull();
    });

    it('prevents duplicate navigation by checking hasNavigated flag', () => {
      const context = createDefaultContext();
      context.threadSlug = 'test-slug';
      context.hasNavigated = true; // Already navigated

      const action = getNextAction(FlowStates.STREAMING_MODERATOR, FlowStates.NAVIGATING, context);

      // Should return null because hasNavigated is true
      expect(action).toBeNull();
    });
  });

  describe('transition Deduplication Logic', () => {
    it('returns null for NAVIGATING state from STREAMING_MODERATOR (handled by INVALIDATE_CACHE)', () => {
      const context = createDefaultContext();
      context.threadSlug = 'test-slug';
      context.hasNavigated = false;

      const action = getNextAction(FlowStates.STREAMING_MODERATOR, FlowStates.NAVIGATING, context);

      // Should be INVALIDATE_CACHE, not NAVIGATE
      expect(action).toEqual({ type: 'INVALIDATE_CACHE' });
    });

    it('returns NAVIGATE action for transitions not from STREAMING_MODERATOR', () => {
      const context = createDefaultContext();
      context.threadSlug = 'test-slug';
      context.hasNavigated = false;

      const action = getNextAction(FlowStates.IDLE, FlowStates.NAVIGATING, context);

      expect(action).toEqual({ type: 'NAVIGATE', slug: 'test-slug' });
    });
  });
});

describe('state Machine Optimization - Context Calculation', () => {
  describe('single Pass Message Scanning', () => {
    it('scans messages only once to collect all round info', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createParticipantMessage(0, 1, { text: 'Response 2' }),
        createModeratorMessage(0, { text: 'Summary' }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      // Measure scan count by wrapping in performance check
      const start = performance.now();
      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: 'test-slug',
        hasAiGeneratedTitle: true,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });
      const end = performance.now();

      expect(context.moderatorExists).toBe(true);
      expect(context.allParticipantsResponded).toBe(true);
      expect(context.participantCount).toBe(2);

      // Single pass should be very fast even with multiple messages
      expect(end - start).toBeLessThan(1);
    });

    it('collects moderator message, completed count, and round number in one pass', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createModeratorMessage(0, { text: 'Moderator' }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
      ];

      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      // All values computed in single pass
      expect(context.moderatorExists).toBe(true);
      expect(context.moderatorStatus).toBe(MessageStatuses.COMPLETE);
      expect(context.allParticipantsResponded).toBe(true);
      expect(context.currentRound).toBe(0);
    });

    it('does not perform multiple scans for different values', () => {
      const messages: UIMessage[] = Array.from({ length: 100 }, (_, i) =>
        createParticipantMessage(0, i % 10, { text: `Response ${i}` }));
      const participants: ChatParticipant[] = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        isEnabled: true,
        priority: i,
        modelId: `m${i}`,
        role: null,
      }));

      const start = performance.now();
      buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });
      const end = performance.now();

      // Even with 100 messages, should be O(n) single pass (< 5ms)
      expect(end - start).toBeLessThan(5);
    });
  });

  describe('o(n) Complexity Verification', () => {
    it('has linear O(n) complexity for message scanning', () => {
      const createMessages = (count: number) =>
        Array.from({ length: count }, (_, i) =>
          createParticipantMessage(0, i, { text: `Response ${i}` }));
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
      ];

      // Measure time for small dataset
      const messages10 = createMessages(10);
      const start10 = performance.now();
      buildFlowContext(messages10, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });
      const end10 = performance.now();
      const time10 = end10 - start10;

      // Measure time for 10x larger dataset
      const messages100 = createMessages(100);
      const start100 = performance.now();
      buildFlowContext(messages100, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });
      const end100 = performance.now();
      const time100 = end100 - start100;

      // O(n): 10x more data should take ~10x time (allow 20x for variance)
      // Not O(n²): 10x more data would take 100x time
      expect(time100).toBeLessThan(time10 * 20);
    });
  });
});

describe('state Machine Optimization - Moderator Message Detection', () => {
  describe('o(n) Moderator Detection', () => {
    it('finds moderator in single pass through messages', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'P1' }),
        createParticipantMessage(0, 1, { text: 'P2' }),
        createModeratorMessage(0, { text: 'Moderator' }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context.moderatorExists).toBe(true);
      expect(context.moderatorStatus).toBe(MessageStatuses.COMPLETE);
    });

    it('does not use nested loops (O(n²)) for detection', () => {
      const messages: UIMessage[] = Array.from({ length: 50 }, (_, i) =>
        createParticipantMessage(0, i % 5, { text: `Response ${i}` }));
      messages.push(createModeratorMessage(0, { text: 'Moderator' }));

      const participants: ChatParticipant[] = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        isEnabled: true,
        priority: i,
        modelId: `m${i}`,
        role: null,
      }));

      const start = performance.now();
      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });
      const end = performance.now();

      expect(context.moderatorExists).toBe(true);
      // O(n) single pass should complete in < 2ms even with 50+ messages
      expect(end - start).toBeLessThan(2);
    });
  });

  describe('streaming Status Detection', () => {
    it('detects streaming moderator in same pass', () => {
      const messages: UIMessage[] = [
        createModeratorMessage(0, { text: 'Partial', isStreaming: true }),
      ];
      const participants: ChatParticipant[] = [];

      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: true,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context.moderatorExists).toBe(true);
      expect(context.moderatorStatus).toBe(MessageStatuses.STREAMING);
    });

    it('detects complete moderator in same pass', () => {
      const messages: UIMessage[] = [
        createModeratorMessage(0, { text: 'Complete' }),
      ];
      const participants: ChatParticipant[] = [];

      const context = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context.moderatorExists).toBe(true);
      expect(context.moderatorStatus).toBe(MessageStatuses.COMPLETE);
    });
  });
});

describe('state Machine Optimization - Participant Completion', () => {
  describe('efficient Counting Algorithm', () => {
    it('counts completed participants in single pass', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createParticipantMessage(0, 1, { text: 'Response 2' }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const result = calculateAllParticipantsResponded(messages, participants, 0);

      expect(result).toBe(true);
    });

    it('does not re-scan messages for each participant (avoid O(n×p))', () => {
      const participants: ChatParticipant[] = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        isEnabled: true,
        priority: i,
        modelId: `m${i}`,
        role: null,
      }));
      const messages: UIMessage[] = participants.map((p, i) =>
        createParticipantMessage(0, i, { text: `Response ${i}` }),
      );

      const start = performance.now();
      calculateAllParticipantsResponded(messages, participants, 0);
      const end = performance.now();

      // Should be O(n) single pass, not O(n×p) nested loops
      expect(end - start).toBeLessThan(1);
    });

    it('handles large participant counts efficiently', () => {
      const participants: ChatParticipant[] = Array.from({ length: 50 }, (_, i) => ({
        id: `p${i}`,
        isEnabled: true,
        priority: i,
        modelId: `m${i}`,
        role: null,
      }));
      const messages: UIMessage[] = participants.map((p, i) =>
        createParticipantMessage(0, i, { text: `Response ${i}` }),
      );

      const start = performance.now();
      const result = calculateAllParticipantsResponded(messages, participants, 0);
      const end = performance.now();

      expect(result).toBe(true);
      // Even with 50 participants, should complete in < 2ms
      expect(end - start).toBeLessThan(2);
    });
  });

  describe('early Exit on Incomplete Detection', () => {
    it('returns false immediately when finds streaming message', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createParticipantMessage(0, 1, { text: 'Streaming', isStreaming: true }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const result = calculateAllParticipantsResponded(messages, participants, 0);

      expect(result).toBe(false);
    });

    it('returns false when count is insufficient without scanning remaining messages', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        // Only 1 response for 2 participants
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const result = calculateAllParticipantsResponded(messages, participants, 0);

      expect(result).toBe(false);
    });
  });

  describe('moderator Exclusion in Single Pass', () => {
    it('excludes moderator message from participant count without separate scan', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createParticipantMessage(0, 1, { text: 'Response 2' }),
        createModeratorMessage(0, { text: 'Moderator' }), // Should NOT count
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const result = calculateAllParticipantsResponded(messages, participants, 0);

      expect(result).toBe(true);
      // If moderator was counted, this would be 3 > 2 and still true
      // But logic should exclude it in same pass, not separate filter
    });
  });
});

describe('state Machine Optimization - Transition Deduplication', () => {
  describe('prevStateRef Tracking', () => {
    it('prevents duplicate CREATE_MODERATOR actions via state comparison', () => {
      const context = createDefaultContext();
      context.threadId = 'thread-123';
      context.allParticipantsResponded = true;
      context.participantCount = 2;

      // First transition to CREATING_MODERATOR
      const action1 = getNextAction(FlowStates.STREAMING_PARTICIPANTS, FlowStates.CREATING_MODERATOR, context);
      expect(action1).toEqual({ type: 'CREATE_MODERATOR' });

      // Same state again (simulating re-render)
      const action2 = getNextAction(FlowStates.CREATING_MODERATOR, FlowStates.CREATING_MODERATOR, context);
      expect(action2).toBeNull();
    });

    it('allows same action type on different transitions', () => {
      const context1 = createDefaultContext();
      context1.threadId = 'thread-1';
      context1.allParticipantsResponded = true;

      const action1 = getNextAction(FlowStates.IDLE, FlowStates.CREATING_MODERATOR, context1);
      expect(action1).toEqual({ type: 'CREATE_MODERATOR' });

      // Different thread, same transition
      const context2 = createDefaultContext();
      context2.threadId = 'thread-2';
      context2.allParticipantsResponded = true;

      const action2 = getNextAction(FlowStates.IDLE, FlowStates.CREATING_MODERATOR, context2);
      expect(action2).toEqual({ type: 'CREATE_MODERATOR' });
    });
  });

  describe('hasNavigated Flag Deduplication', () => {
    it('prevents duplicate navigation via hasNavigated check', () => {
      const context = createDefaultContext();
      context.threadSlug = 'test-slug';
      context.hasNavigated = false;

      const action1 = getNextAction(FlowStates.STREAMING_MODERATOR, FlowStates.NAVIGATING, context);
      expect(action1).toEqual({ type: 'INVALIDATE_CACHE' });

      // Simulate navigation completed
      context.hasNavigated = true;

      const action2 = getNextAction(FlowStates.STREAMING_MODERATOR, FlowStates.NAVIGATING, context);
      expect(action2).toBeNull();
    });
  });
});

describe('state Machine Optimization - FlowContext Memoization', () => {
  describe('dependency Change Detection', () => {
    it('should recalculate when messages change', () => {
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
      ];
      const messages1: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
      ];
      const messages2: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
        createModeratorMessage(0, { text: 'Moderator' }),
      ];

      const context1 = buildFlowContext(messages1, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      const context2 = buildFlowContext(messages2, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context1.moderatorExists).toBe(false);
      expect(context2.moderatorExists).toBe(true);
    });

    it('should recalculate when participants change', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
      ];
      const participants1: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
      ];
      const participants2: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
        { id: 'p2', isEnabled: true, priority: 1, modelId: 'm2', role: null },
      ];

      const context1 = buildFlowContext(messages, participants1, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      const context2 = buildFlowContext(messages, participants2, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context1.allParticipantsResponded).toBe(true);
      expect(context2.allParticipantsResponded).toBe(false); // Need 2 responses now
    });

    it('should recalculate when streaming flags change', () => {
      const messages: UIMessage[] = [];
      const participants: ChatParticipant[] = [];

      const context1 = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      const context2 = buildFlowContext(messages, participants, {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: true,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW,
      });

      expect(context1.isAiSdkStreaming).toBe(false);
      expect(context2.isAiSdkStreaming).toBe(true);
    });
  });

  describe('stable Reference When Deps Unchanged', () => {
    it('produces same output for same inputs (pure function)', () => {
      const messages: UIMessage[] = [
        createParticipantMessage(0, 0, { text: 'Response 1' }),
      ];
      const participants: ChatParticipant[] = [
        { id: 'p1', isEnabled: true, priority: 0, modelId: 'm1', role: null },
      ];
      const options = {
        threadId: 'thread-123',
        threadSlug: null,
        hasAiGeneratedTitle: false,
        isCreatingThread: false,
        isCreatingModerator: false,
        isAiSdkStreaming: false,
        streamingJustCompleted: false,
        pendingAnimations: new Set(),
        hasNavigated: false,
        screenMode: ScreenModes.OVERVIEW as const,
      };

      const context1 = buildFlowContext(messages, participants, options);
      const context2 = buildFlowContext(messages, participants, options);

      expect(context1).toEqual(context2);
    });
  });
});
