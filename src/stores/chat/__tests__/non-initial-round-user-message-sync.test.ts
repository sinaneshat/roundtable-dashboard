/**
 * Non-Initial Round User Message Sync Tests
 *
 * Regression tests for the message sync fix that preserves original user messages
 * during AI SDK streaming.
 *
 * ROOT CAUSE BUG (Fixed):
 * When AI SDK starts streaming, it creates a "participant trigger" user message
 * with isParticipantTrigger=true. The useMinimalMessageSync hook was syncing
 * AI SDK messages to the store without preserving the original user message.
 *
 * Flow before fix:
 * 1. User submits round 1 → optimistic message added to store
 * 2. PATCH completes → DB message replaces optimistic in store
 * 3. AI SDK starts streaming → creates participant trigger message
 * 4. useMinimalMessageSync syncs → REPLACES store with AI SDK messages
 * 5. Store only has participant trigger message (isParticipantTrigger=true)
 * 6. Deduplication filters it out → user message disappears!
 *
 * FIX: In useMinimalMessageSync, preserve non-participant-trigger user messages
 * from the store when merging with AI SDK messages.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { MessageRoles } from '@/api/core/enums';
import { createInvalidMetadata } from '@/lib/testing';
import { getUserMetadata } from '@/lib/utils';

/**
 * Simulates the storeOnlyMessages filter logic from useMinimalMessageSync
 */
function filterStoreOnlyMessages(
  storeMessages: UIMessage[],
  chatMessages: UIMessage[],
): UIMessage[] {
  const chatMessageIds = new Set(chatMessages.map(m => m.id));

  return storeMessages.filter((m) => {
    // Keep messages that are in store but not in AI SDK
    if (chatMessageIds.has(m.id)) {
      return false;
    }

    // ✅ CRITICAL FIX: Preserve non-participant-trigger user messages
    if (m.role === MessageRoles.USER) {
      const userMeta = getUserMetadata(m.metadata);
      if (!userMeta?.isParticipantTrigger) {
        return true; // Always preserve the original user message
      }
    }

    return false;
  });
}

/**
 * Simulates the full merge logic from useMinimalMessageSync
 */
function mergeMessages(
  chatMessages: UIMessage[],
  storeMessages: UIMessage[],
): UIMessage[] {
  const storeOnlyMessages = filterStoreOnlyMessages(storeMessages, chatMessages);
  return [...chatMessages, ...storeOnlyMessages];
}

describe('non-Initial Round User Message Sync', () => {
  describe('filterStoreOnlyMessages', () => {
    it('should preserve original user message when AI SDK has participant trigger', () => {
      // Store has the original user message (from form submission)
      const storeMessages: UIMessage[] = [
        {
          id: '01KE5WMBVDFY',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        },
      ];

      // AI SDK has participant trigger message (different ID, isParticipantTrigger=true)
      const chatMessages: UIMessage[] = [
        {
          id: 'ofXQC806xRbA',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
        },
      ];

      const preserved = filterStoreOnlyMessages(storeMessages, chatMessages);

      // Original user message MUST be preserved
      expect(preserved).toHaveLength(1);
      expect(preserved[0].id).toBe('01KE5WMBVDFY');
    });

    it('should NOT preserve participant trigger messages from store', () => {
      // Store has a participant trigger message (should be filtered by deduplication anyway)
      const storeMessages: UIMessage[] = [
        {
          id: 'trigger-msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
        },
      ];

      const chatMessages: UIMessage[] = [];

      const preserved = filterStoreOnlyMessages(storeMessages, chatMessages);

      // Participant trigger should NOT be preserved
      expect(preserved).toHaveLength(0);
    });

    it('should preserve original user messages from multiple rounds', () => {
      // Store has user messages from rounds 0 and 1
      const storeMessages: UIMessage[] = [
        {
          id: 'user-r0',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Initial question' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
        {
          id: 'user-r1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        },
      ];

      // AI SDK only has round 1 participant trigger
      const chatMessages: UIMessage[] = [
        {
          id: 'trigger-r1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
        },
      ];

      const preserved = filterStoreOnlyMessages(storeMessages, chatMessages);

      // Both original user messages should be preserved
      expect(preserved).toHaveLength(2);
      expect(preserved.map(m => m.id).sort()).toEqual(['user-r0', 'user-r1']);
    });

    it('should not duplicate messages already in AI SDK', () => {
      // Same message ID in both store and AI SDK
      const commonMessage: UIMessage = {
        id: 'shared-id',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Test' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      const storeMessages: UIMessage[] = [commonMessage];
      const chatMessages: UIMessage[] = [commonMessage];

      const preserved = filterStoreOnlyMessages(storeMessages, chatMessages);

      // Should not preserve since it's already in AI SDK
      expect(preserved).toHaveLength(0);
    });
  });

  describe('mergeMessages', () => {
    it('cRITICAL: merged result should contain original user message after AI SDK sync', () => {
      // This is the exact scenario that was broken:
      // 1. Store has original user message from round 1
      // 2. AI SDK has participant trigger for round 1
      // 3. After merge, original user message MUST be present

      const originalUserMessage: UIMessage = {
        id: '01KE5WMBVDFY',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'retry. 1 word' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      const participantTrigger: UIMessage = {
        id: 'ofXQC806xRbA',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'retry. 1 word' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
      };

      const chatMessages: UIMessage[] = [participantTrigger];
      const storeMessages: UIMessage[] = [originalUserMessage];

      const merged = mergeMessages(chatMessages, storeMessages);

      // Merged should have BOTH messages
      expect(merged).toHaveLength(2);

      // Original user message MUST be in the result
      const originalInMerged = merged.find(m => m.id === '01KE5WMBVDFY');
      expect(originalInMerged).toBeDefined();
      expect(getUserMetadata(originalInMerged!.metadata)?.isParticipantTrigger).toBeFalsy();

      // After deduplication (which happens in chat-message-list.tsx):
      // - Participant trigger gets filtered out
      // - Original user message remains and renders correctly
    });

    it('should preserve complete conversation history after AI SDK sync', () => {
      // Complete round 0 + ongoing round 1
      const storeMessages: UIMessage[] = [
        {
          id: 'user-r0',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Hello' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
        {
          id: 'assistant-r0-p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Hi!' }],
          metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0, participantIndex: 0 },
        },
        {
          id: 'user-r1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1 },
        },
      ];

      // AI SDK has round 1 participant trigger + streaming assistant
      const chatMessages: UIMessage[] = [
        {
          id: 'trigger-r1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Follow-up' }],
          metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
        },
        {
          id: 'assistant-r1-p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'Streaming...' }],
          metadata: { role: MessageRoles.ASSISTANT, roundNumber: 1, participantIndex: 0 },
        },
      ];

      const merged = mergeMessages(chatMessages, storeMessages);

      // Should have all original user messages
      const userMessages = merged.filter(m => m.role === MessageRoles.USER);
      const nonTriggerUserMessages = userMessages.filter((m) => {
        const meta = getUserMetadata(m.metadata);
        return !meta?.isParticipantTrigger;
      });

      // Both original user messages should be preserved
      expect(nonTriggerUserMessages).toHaveLength(2);
      expect(nonTriggerUserMessages.map(m => m.id).sort()).toEqual(['user-r0', 'user-r1']);
    });
  });

  describe('edge Cases', () => {
    it('should handle empty store messages', () => {
      const storeMessages: UIMessage[] = [];
      const chatMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
      ];

      const merged = mergeMessages(chatMessages, storeMessages);
      expect(merged).toHaveLength(1);
    });

    it('should handle empty AI SDK messages', () => {
      const storeMessages: UIMessage[] = [
        {
          id: 'msg-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'Test' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
      ];
      const chatMessages: UIMessage[] = [];

      const merged = mergeMessages(chatMessages, storeMessages);
      expect(merged).toHaveLength(1);
    });

    it('should handle null metadata gracefully', () => {
      const storeMessages: UIMessage[] = [
        {
          id: 'msg-null-meta',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'No metadata' }],
          metadata: createInvalidMetadata('null'),
        },
      ];
      const chatMessages: UIMessage[] = [];

      const preserved = filterStoreOnlyMessages(storeMessages, chatMessages);

      // Should preserve since getUserMetadata returns null (not a participant trigger)
      expect(preserved).toHaveLength(1);
    });
  });

  describe('rEGRESSION: Round 0 vs Round 1+ Behavior', () => {
    it('cRITICAL: round 0 user messages should be preserved during sync', () => {
      const round0UserMsg: UIMessage = {
        id: '01KE5WMBVDFY_R0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 0 question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      const storeMessages: UIMessage[] = [round0UserMsg];
      const chatMessages: UIMessage[] = [];

      const merged = mergeMessages(chatMessages, storeMessages);

      expect(merged).toHaveLength(1);
      expect(merged[0]?.id).toBe('01KE5WMBVDFY_R0');
    });

    it('cRITICAL: round 1+ user messages should be preserved during sync', () => {
      const round1UserMsg: UIMessage = {
        id: '01KE5WMBVDFY_R1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 1 question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      const storeMessages: UIMessage[] = [round1UserMsg];
      const chatMessages: UIMessage[] = [];

      const merged = mergeMessages(chatMessages, storeMessages);

      expect(merged).toHaveLength(1);
      expect(merged[0]?.id).toBe('01KE5WMBVDFY_R1');
    });

    it('cRITICAL: both round 0 and round 1 user messages preserved in multi-round conversation', () => {
      const round0UserMsg: UIMessage = {
        id: '01KE5WMBVDFY_R0',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 0 question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      };

      const round1UserMsg: UIMessage = {
        id: '01KE5WMBVDFY_R1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 1 question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      };

      const round1Trigger: UIMessage = {
        id: 'trigger-r1',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 1 question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
      };

      const storeMessages: UIMessage[] = [round0UserMsg, round1UserMsg];
      const chatMessages: UIMessage[] = [round1Trigger];

      const merged = mergeMessages(chatMessages, storeMessages);

      // Should have: round 0 user msg + round 1 trigger + round 1 original user msg
      const userMessages = merged.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(3);

      // Both original user messages should be present
      expect(merged.some(m => m.id === '01KE5WMBVDFY_R0')).toBe(true);
      expect(merged.some(m => m.id === '01KE5WMBVDFY_R1')).toBe(true);
    });

    it('cRITICAL: participant trigger should NOT replace original user message in ANY round', () => {
      const testRounds = [0, 1, 2, 3];

      for (const roundNum of testRounds) {
        const originalUserMsg: UIMessage = {
          id: `user-r${roundNum}`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Round ${roundNum}` }],
          metadata: { role: MessageRoles.USER, roundNumber: roundNum },
        };

        const triggerMsg: UIMessage = {
          id: `trigger-r${roundNum}`,
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: `Round ${roundNum}` }],
          metadata: { role: MessageRoles.USER, roundNumber: roundNum, isParticipantTrigger: true },
        };

        const storeMessages: UIMessage[] = [originalUserMsg];
        const chatMessages: UIMessage[] = [triggerMsg];

        const merged = mergeMessages(chatMessages, storeMessages);

        // Should have BOTH messages
        expect(merged).toHaveLength(2);
        expect(merged.some(m => m.id === `user-r${roundNum}`)).toBe(true);
      }
    });
  });
});
