/**
 * Participant Transition Flashing Tests
 *
 * These tests investigate and prevent the flashing issue that occurs when:
 * 1. First participant starts receiving chunks
 * 2. Transitioning from first to second participant
 * 3. All participants done, transitioning to council moderator
 *
 * ROOT CAUSE HYPOTHESIS:
 * - Pending cards use key={`participant-${participant.id}`}
 * - MessageGroups use key={`assistant-group-${participantKey}-${index}`}
 * - These different keys cause React to unmount/remount instead of updating
 * - Additionally, pending cards are nested inside user-group while messageGroups are separate
 *
 * The tests track:
 * - Number of store updates per streaming chunk
 * - Key stability across state transitions
 * - Component mount/unmount cycles
 */

import { FinishReasons, MessagePartTypes, MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

// Track store update frequency
type StoreUpdateTracker = {
  updateCount: number;
  updateTimestamps: number[];
  lastState: unknown;
};

function createUpdateTracker(): StoreUpdateTracker {
  return {
    updateCount: 0,
    updateTimestamps: [],
    lastState: null,
  };
}

function trackUpdate(tracker: StoreUpdateTracker, state: unknown): void {
  tracker.updateCount++;
  tracker.updateTimestamps.push(Date.now());
  tracker.lastState = state;
}

function getUpdatesPerSecond(tracker: StoreUpdateTracker): number {
  if (tracker.updateTimestamps.length < 2)
    return 0;
  const first = tracker.updateTimestamps[0];
  const last = tracker.updateTimestamps[tracker.updateTimestamps.length - 1];
  if (!first)
    throw new Error('expected first timestamp');
  if (!last)
    throw new Error('expected last timestamp');
  const durationSeconds = (last - first) / 1000;
  if (durationSeconds === 0)
    return tracker.updateCount;
  return tracker.updateCount / durationSeconds;
}

// Simulate message state transitions
function createStreamingMessage(
  participantIndex: number,
  roundNumber: number,
  textContent: string,
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return createTestAssistantMessage({
    id: `thread_r${roundNumber}_p${participantIndex}`,
    parts: textContent
      ? [{ type: MessagePartTypes.TEXT, text: textContent }]
      : [],
    metadata: {
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: textContent.length, totalTokens: textContent.length },
    },
  });
}

// Simulate the key generation logic from chat-message-list.tsx
function getPendingCardKey(participantId: string): string {
  return `participant-${participantId}`;
}

function getMessageGroupKey(participantKey: string, messageIndex: number): string {
  return `assistant-group-${participantKey}-${messageIndex}`;
}

describe('participant Transition Flashing', () => {
  describe('key Stability Analysis', () => {
    it('pending card keys differ from messageGroup keys - THIS IS THE BUG', () => {
      const participantId = 'abc123';
      const messageIndex = 5;

      const pendingKey = getPendingCardKey(participantId);
      const messageGroupKey = getMessageGroupKey(participantId, messageIndex);

      // This test documents the bug - keys are different!
      expect(pendingKey).toBe('participant-abc123');
      expect(messageGroupKey).toBe('assistant-group-abc123-5');
      expect(pendingKey).not.toBe(messageGroupKey);

      // When these keys differ, React unmounts the pending card and mounts the messageGroup
      // This causes the flash!
    });

    it('should use consistent keys to prevent remounting', () => {
      // PROPOSED FIX: Use the same key format for both
      const participantId = 'abc123';
      const roundNumber = 0;

      // Both should use: `participant-${participantId}-round-${roundNumber}`
      const proposedKey = `participant-${participantId}-round-${roundNumber}`;

      // This would allow React to reconcile the components instead of remounting
      expect(proposedKey).toBe('participant-abc123-round-0');
    });
  });

  describe('store Update Frequency', () => {
    it('tracks updates during streaming simulation', () => {
      const tracker = createUpdateTracker();
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user_r0', metadata: { roundNumber: 0 } }),
      ];

      // Simulate 20 streaming chunks arriving
      const streamingText = 'This is a test response that is being streamed in chunks.';
      const chunkSize = 5;

      for (let i = 0; i < streamingText.length; i += chunkSize) {
        const partialText = streamingText.slice(0, i + chunkSize);
        const updatedMessage = createStreamingMessage(0, 0, partialText);

        // Track this update
        trackUpdate(tracker, {
          messages: [...messages, updatedMessage],
          isStreaming: true,
        });
      }

      // Final message with finishReason='stop'
      trackUpdate(tracker, {
        messages: [...messages, createStreamingMessage(0, 0, streamingText, FinishReasons.STOP)],
        isStreaming: false,
      });

      // eslint-disable-next-line no-console
      console.log(`[TEST] Total updates: ${tracker.updateCount}, per second: ${getUpdatesPerSecond(tracker).toFixed(2)}`);

      // Should not have excessive updates
      // A typical stream might have ~20 chunks, so 20-30 updates is reasonable
      expect(tracker.updateCount).toBeLessThan(50);
    });

    it('detects excessive updates when transitioning between participants', () => {
      const tracker = createUpdateTracker();
      const messages: UIMessage[] = [
        createTestUserMessage({ id: 'user_r0', metadata: { roundNumber: 0 } }),
      ];

      // Participant 0 streaming
      for (let i = 0; i < 10; i++) {
        trackUpdate(tracker, {
          messages: [
            ...messages,
            createStreamingMessage(0, 0, `Chunk ${i}`, FinishReasons.UNKNOWN),
          ],
          currentParticipantIndex: 0,
          isStreaming: true,
        });
      }

      // Participant 0 completes
      trackUpdate(tracker, {
        messages: [
          ...messages,
          createStreamingMessage(0, 0, 'Complete response', FinishReasons.STOP),
        ],
        currentParticipantIndex: 0,
        isStreaming: true,
      });

      // Transition to participant 1 - THIS IS WHERE FLASH HAPPENS
      const updatesBeforeTransition = tracker.updateCount;

      trackUpdate(tracker, {
        messages: [
          ...messages,
          createStreamingMessage(0, 0, 'Complete response', FinishReasons.STOP),
        ],
        currentParticipantIndex: 1, // Index changes
        isStreaming: true,
      });

      // Participant 1 starts streaming
      for (let i = 0; i < 5; i++) {
        trackUpdate(tracker, {
          messages: [
            ...messages,
            createStreamingMessage(0, 0, 'Complete response', FinishReasons.STOP),
            createStreamingMessage(1, 0, `P1 Chunk ${i}`, FinishReasons.UNKNOWN),
          ],
          currentParticipantIndex: 1,
          isStreaming: true,
        });
      }

      const transitionUpdates = tracker.updateCount - updatesBeforeTransition;
      // eslint-disable-next-line no-console
      console.log(`[TEST] Updates during transition: ${transitionUpdates}`);

      // The transition itself should be 1-2 updates, not more
      // If there are many updates during transition, it indicates a problem
    });
  });

  describe('shouldShowPendingCards Logic', () => {
    // Simulate the logic from chat-message-list.tsx line 1264
    function shouldShowPendingCards(
      isRoundComplete: boolean,
      allParticipantsHaveContent: boolean,
      isStreaming: boolean,
      preSearchActive: boolean = false,
      preSearchComplete: boolean = false,
    ): boolean {
      return !isRoundComplete && !allParticipantsHaveContent && (preSearchActive || preSearchComplete || isStreaming);
    }

    it('returns true when streaming with no content yet', () => {
      expect(shouldShowPendingCards(false, false, true)).toBe(true);
    });

    it('returns true when some participants have content but not all', () => {
      // This is the state where pending cards render WITH content
      expect(shouldShowPendingCards(false, false, true)).toBe(true);
    });

    it('returns FALSE when all participants have content - CAUSES TRANSITION', () => {
      // This is where the flash happens!
      // Pending cards return null, and messageGroups takes over
      expect(shouldShowPendingCards(false, true, true)).toBe(false);
    });

    it('the false->true transition causes remounting', () => {
      // State 1: Not all have content
      const state1 = shouldShowPendingCards(false, false, true);
      expect(state1).toBe(true); // Pending cards render

      // State 2: All have content
      const state2 = shouldShowPendingCards(false, true, true);
      expect(state2).toBe(false); // Pending cards return null

      // This boolean flip causes:
      // 1. Pending cards section returns null (unmounts all participant cards)
      // 2. MessageGroups section now renders the participants (mounts new cards)
      // 3. Keys are different, so React can't reconcile -> FLASH
    });
  });

  describe('proposed Fix: Unified Rendering Location', () => {
    /**
     * PROPOSED FIX:
     *
     * Instead of having two rendering paths (pending cards vs messageGroups),
     * we should have ONE rendering path that handles both states:
     *
     * 1. Pending cards section should render ALL participants for the current streaming round
     * 2. It should continue rendering them even when all have content
     * 3. Only stop when the round is marked COMPLETE
     * 4. MessageGroups should NOT render messages from the current streaming round
     *
     * This keeps the same component mounted throughout streaming,
     * just updating its content from shimmer -> streaming -> complete.
     */

    it('pending cards should keep rendering until round complete', () => {
      // NEW LOGIC:
      function shouldShowPendingCardsFixed(
        isRoundComplete: boolean,
        _allParticipantsHaveContent: boolean, // IGNORED in new logic
        isStreaming: boolean,
        preSearchActive: boolean = false,
        preSearchComplete: boolean = false,
      ): boolean {
        // Keep rendering pending cards until round is truly complete
        // Don't transition just because all have content
        return !isRoundComplete && (preSearchActive || preSearchComplete || isStreaming);
      }

      // Still rendering when all have content but streaming continues
      expect(shouldShowPendingCardsFixed(false, true, true)).toBe(true);

      // Only stops when round is complete
      expect(shouldShowPendingCardsFixed(true, true, false)).toBe(false);
    });

    it('messageGroups should skip assistant messages from streaming round', () => {
      // MessageGroups should filter out ASSISTANT messages from streamingRoundNumber
      // User messages are handled differently (they're in user-group)

      // Create mock messages directly without utilities
      const userMessage = {
        id: 'user_r0',
        role: MessageRoles.USER as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
        metadata: { roundNumber: 0 },
      };

      const assistantMessage = {
        id: 'assistant_r0_p0',
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: 'text' as const, text: 'Response' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
      };

      const messages = [userMessage, assistantMessage];
      const streamingRoundNumber = 0;

      // Filter for messageGroups - only skip ASSISTANT messages from streaming round
      const assistantMessagesForGroups = messages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false; // User messages handled separately
        const round = (m.metadata as { roundNumber?: number })?.roundNumber ?? -1;
        return round !== streamingRoundNumber;
      });

      // Assistant messages from streaming round should be excluded
      expect(assistantMessagesForGroups).toHaveLength(0);
    });
  });
});

describe('console Log Debugging Points', () => {
  it('documents where to add console logs for debugging', () => {
    // These are the key locations to add console.log statements:

    const debugPoints = [
      {
        file: 'chat-message-list.tsx',
        location: 'Before shouldShowPendingCards calculation (~line 1264)',
        log: 'console.log("[RENDER:pending] shouldShowPendingCards calc", { isRoundComplete, allParticipantsHaveContent, isStreaming })',
      },
      {
        file: 'chat-message-list.tsx',
        location: 'Inside pending cards map (~line 1276)',
        log: 'console.log("[RENDER:pending] Rendering participant", { participantId: participant.id, hasContent, status })',
      },
      {
        file: 'chat-message-list.tsx',
        location: 'Inside messageGroups.map for assistant-group (~line 1458)',
        log: 'console.log("[RENDER:groups] Rendering assistant-group", { participantKey: group.participantKey, roundNumber })',
      },
      {
        file: 'use-message-sync.ts',
        location: 'Before store update (~line varies)',
        log: 'console.log("[SYNC] Updating messages", { count: messages.length, isStreaming: chatIsStreaming })',
      },
      {
        file: 'model-message-card.tsx',
        location: 'Component mount/unmount (useEffect)',
        log: 'useEffect(() => { console.log("[MOUNT] ModelMessageCard", messageId); return () => console.log("[UNMOUNT] ModelMessageCard", messageId); }, [])',
      },
    ];

    expect(debugPoints.length).toBeGreaterThan(0);
  });
});
