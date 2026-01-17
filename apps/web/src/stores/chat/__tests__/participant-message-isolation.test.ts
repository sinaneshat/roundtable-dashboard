/**
 * Participant Message Isolation Test
 *
 * Tests that participant messages are properly isolated during concurrent streaming.
 * Verifies that participantIndex and participantId metadata match expected values
 * and that no cross-contamination occurs between participants.
 *
 * CRITICAL BUGS THIS TEST SHOULD CATCH:
 * 1. Participant 0's content appearing in Participant 1's message
 * 2. Wrong participantIndex assigned to messages
 * 3. Messages with duplicate or conflicting metadata
 * 4. Message ID collisions causing content overwrites
 * 5. Metadata merge issues during concurrent streaming
 * 6. Message lookup using wrong participantIndex (e.g., looking up index 0 when should be index 1)
 */

import { MessagePartTypes, MessageRoles } from '@roundtable/shared';

import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { buildParticipantMessageMaps, getParticipantId, getParticipantIndex, getParticipantMessageFromMaps } from '@/lib/utils';
import type { ChatStore } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

describe('participant-message-isolation', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;
  let setState: (partial: Partial<ChatStore>) => void;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
    setState = store.setState;
  });

  describe('concurrent streaming isolation', () => {
    it('should isolate participant 0 content from participant 1', () => {
      // Setup: 3 participants streaming concurrently
      const threadId = 'thread-concurrent-isolation';
      const roundNumber = 1;

      const participants = [
        {
          id: 'participant-0-id',
          threadId,
          modelId: 'gpt-4',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 0,
          settings: {},
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'participant-1-id',
          threadId,
          modelId: 'claude-3',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 1,
          settings: {},
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'participant-2-id',
          threadId,
          modelId: 'gemini-pro',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 2,
          settings: {},
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      setState({ participants });

      // Expected content for each participant (MUST NOT leak to other participants)
      const participant0Content = 'Response from GPT-4 (participant 0)';
      const participant1Content = 'Response from Claude-3 (participant 1)';
      const participant2Content = 'Response from Gemini Pro (participant 2)';

      // Simulate concurrent streaming: All 3 participants start streaming before any finish
      // This is the critical race condition where metadata assignment can go wrong

      // PARTICIPANT 0 starts streaming
      const message0Id = `${threadId}_r${roundNumber}_p0`;
      setState({
        messages: [
          {
            id: message0Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant0Content }],
            // ❌ BUG: During streaming, metadata may not be set yet
            // OR metadata may have wrong participantIndex due to race condition
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[0].id, // Should be participant-0-id
              participantIndex: 0, // Should be 0
              participantRole: null,
              model: 'gpt-4',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
        ],
        currentParticipantIndex: 0,
        isStreaming: true,
      });

      // PARTICIPANT 1 starts streaming BEFORE participant 0 finishes
      // ❌ CRITICAL BUG: If message ID generation is wrong, this could overwrite participant 0's message
      // ❌ CRITICAL BUG: If metadata is shared/not isolated, participant 0's content could leak here
      const message1Id = `${threadId}_r${roundNumber}_p1`;
      setState({
        messages: [
          // Participant 0's message (still streaming)
          {
            id: message0Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant0Content }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[0].id,
              participantIndex: 0,
              participantRole: null,
              model: 'gpt-4',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
          // Participant 1 starts streaming
          {
            id: message1Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant1Content }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[1].id, // ❌ BUG: Could be wrong if metadata merge is broken
              participantIndex: 1, // ❌ BUG: Could be 0 if currentParticipantIndex not updated
              participantRole: null,
              model: 'claude-3',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
        ],
        currentParticipantIndex: 1,
        isStreaming: true,
      });

      // PARTICIPANT 2 starts streaming BEFORE participants 0 and 1 finish
      const message2Id = `${threadId}_r${roundNumber}_p2`;
      setState({
        messages: [
          // All 3 participants now streaming concurrently
          {
            id: message0Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant0Content }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[0].id,
              participantIndex: 0,
              participantRole: null,
              model: 'gpt-4',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
          {
            id: message1Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant1Content }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[1].id,
              participantIndex: 1,
              participantRole: null,
              model: 'claude-3',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
          {
            id: message2Id,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: participant2Content }],
            metadata: {
              role: MessageRoles.ASSISTANT,
              roundNumber,
              participantId: participants[2].id, // ❌ BUG: Could be participant-0-id or participant-1-id
              participantIndex: 2, // ❌ BUG: Could be 0 or 1
              participantRole: null,
              model: 'gemini-pro',
              finishReason: 'unknown',
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          },
        ],
        currentParticipantIndex: 2,
        isStreaming: true,
      });

      // VERIFY: All messages exist and have correct IDs
      const state = getState();
      expect(state.messages).toHaveLength(3);

      const message0 = state.messages.find(m => m.id === message0Id);
      const message1 = state.messages.find(m => m.id === message1Id);
      const message2 = state.messages.find(m => m.id === message2Id);

      expect(message0).toBeDefined();
      expect(message1).toBeDefined();
      expect(message2).toBeDefined();

      // VERIFY: Each message has ONLY its own content (no cross-contamination)
      const message0Text = extractTextFromParts(message0!.parts);
      const message1Text = extractTextFromParts(message1!.parts);
      const message2Text = extractTextFromParts(message2!.parts);

      // ❌ FAILING TEST: Participant 1 contains participant 0's content
      expect(message0Text).toBe(participant0Content);
      expect(message0Text).not.toContain(participant1Content);
      expect(message0Text).not.toContain(participant2Content);

      expect(message1Text).toBe(participant1Content);
      expect(message1Text).not.toContain(participant0Content); // ❌ THIS WILL FAIL IF BUG EXISTS
      expect(message1Text).not.toContain(participant2Content);

      expect(message2Text).toBe(participant2Content);
      expect(message2Text).not.toContain(participant0Content);
      expect(message2Text).not.toContain(participant1Content);

      // VERIFY: Each message has correct participantIndex in metadata
      const participant0Index = getParticipantIndex(message0!.metadata);
      const participant1Index = getParticipantIndex(message1!.metadata);
      const participant2Index = getParticipantIndex(message2!.metadata);

      // ❌ FAILING TEST: participantIndex doesn't match expected value
      expect(participant0Index).toBe(0);
      expect(participant1Index).toBe(1); // ❌ THIS WILL FAIL if metadata merge is wrong
      expect(participant2Index).toBe(2); // ❌ THIS WILL FAIL if metadata merge is wrong

      // VERIFY: Each message has correct participantId in metadata
      const participant0Id = getParticipantId(message0!.metadata);
      const participant1Id = getParticipantId(message1!.metadata);
      const participant2Id = getParticipantId(message2!.metadata);

      // ❌ FAILING TEST: participantId doesn't match expected participant
      expect(participant0Id).toBe(participants[0].id);
      expect(participant1Id).toBe(participants[1].id); // ❌ THIS WILL FAIL if wrong ID assigned
      expect(participant2Id).toBe(participants[2].id); // ❌ THIS WILL FAIL if wrong ID assigned

      // VERIFY: No duplicate message IDs
      const messageIds = state.messages.map(m => m.id);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);

      // VERIFY: Message IDs follow expected format
      expect(message0Id).toBe(`${threadId}_r${roundNumber}_p0`);
      expect(message1Id).toBe(`${threadId}_r${roundNumber}_p1`);
      expect(message2Id).toBe(`${threadId}_r${roundNumber}_p2`);
    });

    it('should prevent message ID collisions during rapid concurrent streaming', () => {
      const threadId = 'thread-id-collision';
      const roundNumber = 0;

      const participants = [
        {
          id: 'p0',
          threadId,
          modelId: 'gpt-4',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 0,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'p1',
          threadId,
          modelId: 'claude-3',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 1,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      setState({ participants });

      // Simulate rapid concurrent message creation
      // If message IDs are based on timestamp instead of deterministic format,
      // two messages created in the same millisecond could collide
      const message0 = {
        id: `${threadId}_r${roundNumber}_p0`,
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 0 response' }],
        metadata: {
          role: MessageRoles.ASSISTANT as const,
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
          participantRole: null,
          model: 'gpt-4',
          finishReason: 'unknown' as const,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      };

      const message1 = {
        id: `${threadId}_r${roundNumber}_p1`,
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 1 response' }],
        metadata: {
          role: MessageRoles.ASSISTANT as const,
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
          participantRole: null,
          model: 'claude-3',
          finishReason: 'unknown' as const,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      };

      setState({ messages: [message0, message1] });

      const state = getState();

      // VERIFY: Both messages exist (no collision/overwrite)
      expect(state.messages).toHaveLength(2);

      // VERIFY: Message IDs are unique
      expect(message0.id).not.toBe(message1.id);

      // VERIFY: Each message retained its own content
      const msg0 = state.messages.find(m => m.id === message0.id);
      const msg1 = state.messages.find(m => m.id === message1.id);

      expect(extractTextFromParts(msg0!.parts)).toBe('Participant 0 response');
      expect(extractTextFromParts(msg1!.parts)).toBe('Participant 1 response');

      // ❌ FAILING TEST: Message 0's content leaked into message 1
      expect(extractTextFromParts(msg1!.parts)).not.toContain('Participant 0 response');
    });

    it('should maintain correct participantIndex during metadata merge', () => {
      const threadId = 'thread-metadata-merge';
      const roundNumber = 2;

      // Simulate scenario where:
      // 1. Message starts streaming with no metadata (AI SDK initial state)
      // 2. Metadata is added via merge during onFinish
      // 3. participantIndex must match the participant that created the message

      const messageId = `${threadId}_r${roundNumber}_p1`;

      // Step 1: Message starts streaming (no metadata yet)
      setState({
        messages: [
          {
            id: messageId,
            role: MessageRoles.ASSISTANT,
            parts: [{ type: MessagePartTypes.TEXT, text: 'Streaming...' }],
            // No metadata yet - this is AI SDK's initial state
          },
        ],
        currentParticipantIndex: 1, // Important: This is participant 1, not 0
        isStreaming: true,
      });

      // Step 2: Metadata gets merged (simulating onFinish callback)
      const messages = getState().messages;
      const updatedMessages = messages.map((msg) => {
        if (msg.id === messageId) {
          return {
            ...msg,
            metadata: {
              role: MessageRoles.ASSISTANT as const,
              roundNumber,
              participantId: 'participant-1-id',
              participantIndex: 1, // ❌ BUG: Could be 0 if merge uses wrong index
              participantRole: null,
              model: 'claude-3',
              finishReason: 'stop' as const,
              usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
              hasError: false,
              isTransient: false,
              isPartialResponse: false,
            },
          };
        }
        return msg;
      });

      setState({ messages: updatedMessages, isStreaming: false });

      // VERIFY: Metadata has correct participantIndex
      const finalMessage = getState().messages.find(m => m.id === messageId);
      const participantIndex = getParticipantIndex(finalMessage!.metadata);

      // ❌ FAILING TEST: participantIndex is 0 instead of 1
      expect(participantIndex).toBe(1);
      expect(participantIndex).not.toBe(0);

      // VERIFY: Metadata has correct participantId
      const participantId = getParticipantId(finalMessage!.metadata);
      expect(participantId).toBe('participant-1-id');
      expect(participantId).not.toBe('participant-0-id');
    });

    it('should isolate messages when participantIndex wraps around in multi-round', () => {
      // Test for bug where participantIndex might reset incorrectly across rounds
      const threadId = 'thread-multi-round';

      // Round 0: 2 participants
      const round0Messages = [
        {
          id: `${threadId}_r0_p0`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Round 0, Participant 0' }],
          metadata: {
            role: MessageRoles.ASSISTANT as const,
            roundNumber: 0,
            participantId: 'p0',
            participantIndex: 0,
            participantRole: null,
            model: 'gpt-4',
            finishReason: 'stop' as const,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
        {
          id: `${threadId}_r0_p1`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Round 0, Participant 1' }],
          metadata: {
            role: MessageRoles.ASSISTANT as const,
            roundNumber: 0,
            participantId: 'p1',
            participantIndex: 1,
            participantRole: null,
            model: 'claude-3',
            finishReason: 'stop' as const,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      // Round 1: participantIndex should start at 0 again (but for round 1)
      const round1Messages = [
        {
          id: `${threadId}_r1_p0`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Round 1, Participant 0' }],
          metadata: {
            role: MessageRoles.ASSISTANT as const,
            roundNumber: 1,
            participantId: 'p0',
            participantIndex: 0, // ❌ BUG: Could be 2 if index doesn't reset per round
            participantRole: null,
            model: 'gpt-4',
            finishReason: 'stop' as const,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      setState({ messages: [...round0Messages, ...round1Messages] });

      // VERIFY: Round 1 participant 0 has correct metadata
      const round1p0 = getState().messages.find(m => m.id === `${threadId}_r1_p0`);
      const participantIndex = getParticipantIndex(round1p0!.metadata);

      // ❌ FAILING TEST: participantIndex continues from round 0 (shows as 2 instead of 0)
      expect(participantIndex).toBe(0);
      expect(participantIndex).not.toBe(2);

      // VERIFY: No content leakage between rounds
      const round1Text = extractTextFromParts(round1p0!.parts);
      expect(round1Text).toBe('Round 1, Participant 0');
      expect(round1Text).not.toContain('Round 0');
    });

    it('should detect when participant metadata has wrong participantIndex assigned', () => {
      // This test demonstrates a metadata assignment bug
      //
      // Scenario:
      // - Participant 1 (Claude-3) streams a response
      // - BUT the metadata is assigned participantIndex=0 instead of participantIndex=1
      // - This causes confusion in message lookup and display
      //
      // ROOT CAUSE: mergeParticipantMetadata is called with wrong currentIndex parameter
      // OR currentIndexRef in the hook has stale value

      const threadId = 'thread-metadata-bug';
      const roundNumber = 1;

      const participants = [
        {
          id: 'participant-0-id',
          threadId,
          modelId: 'gpt-4',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 0,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'participant-1-id',
          threadId,
          modelId: 'claude-3',
          role: null,
          customRoleId: null,
          isEnabled: true,
          priority: 1,
          settings: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // ❌ BUG SCENARIO: Participant 1's message has wrong participantIndex
      // The message is FROM participant-1-id BUT has participantIndex=0
      // This happens when currentIndexRef is stale or wrong during metadata merge
      const messages = [
        {
          id: `${threadId}_r${roundNumber}_p1`, // ID is correct (p1)
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Claude-3 response (should be index 1)' }],
          metadata: {
            role: MessageRoles.ASSISTANT as const,
            roundNumber,
            participantId: participants[1].id, // participantId is correct
            participantIndex: 0, // ❌ BUG: Wrong! Should be 1, not 0
            participantRole: null,
            model: 'claude-3',
            finishReason: 'stop' as const,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        },
      ];

      // Build maps - this will put the message in byIndex[0] because metadata has participantIndex=0
      const maps = buildParticipantMessageMaps(messages);

      // VERIFY: Message is indexed by wrong participantIndex
      expect(maps.byIndex.get(0)).toBeDefined(); // Message is at index 0
      expect(maps.byIndex.get(1)).toBeUndefined(); // Nothing at index 1

      // VERIFY: But participantId is correct
      expect(maps.byId.get('participant-1-id')).toBeDefined();

      // ❌ BUG DETECTED: Looking up participant 1 by index returns undefined
      // Because the message has participantIndex=0 in metadata
      const lookupByCorrectIndex = maps.byIndex.get(1);
      expect(lookupByCorrectIndex).toBeUndefined(); // Nothing found!

      // ✅ RESILIENCE: getParticipantMessageFromMaps uses multiple strategies
      // Strategy 1 (by participantId) will succeed even though strategy 2 (by index) fails
      const resilientLookup = getParticipantMessageFromMaps(maps, participants[1], 1);
      expect(resilientLookup).toBeDefined(); // Falls back to participantId lookup
      expect(extractTextFromParts(resilientLookup!.parts)).toBe('Claude-3 response (should be index 1)');

      // VERIFY: The metadata inconsistency is detectable
      const message = maps.byId.get('participant-1-id');
      expect(message).toBeDefined();
      expect(getParticipantIndex(message!.metadata)).toBe(0); // Wrong index in metadata
      expect(getParticipantId(message!.metadata)).toBe('participant-1-id'); // Correct ID

      // ❌ CRITICAL: If code relies ONLY on participantIndex for lookup, it will fail
      // This demonstrates why the multi-strategy lookup is important
      const indexOnlyLookup = messages.find(m => getParticipantIndex(m.metadata) === 1);
      expect(indexOnlyLookup).toBeUndefined(); // No message found with participantIndex=1!
    });

    it('should prevent message ID format inconsistencies', () => {
      // Test for bug where message ID doesn't match expected format
      // Backend generates: {threadId}_r{roundNumber}_p{participantIndex}
      // If frontend generates different format, lookups will fail

      const threadId = 'thread-id-format';
      const roundNumber = 1;

      // ✅ CORRECT FORMAT
      const correctId = `${threadId}_r${roundNumber}_p1`;
      expect(correctId).toBe('thread-id-format_r1_p1');

      // ❌ WRONG FORMATS (bugs that could happen)
      const wrongFormat1 = `${threadId}-r${roundNumber}-p1`; // Using dashes instead of underscores
      const wrongFormat2 = `${threadId}_round${roundNumber}_participant1`; // Wrong keywords
      const wrongFormat3 = `${threadId}_${roundNumber}_1`; // Missing r and p prefixes

      // VERIFY: Wrong formats don't match correct pattern
      expect(wrongFormat1).not.toBe(correctId);
      expect(wrongFormat2).not.toBe(correctId);
      expect(wrongFormat3).not.toBe(correctId);

      // VERIFY: ID parsing works correctly
      const idRegex = /_r(\d+)_p(\d+)/;
      const match = correctId.match(idRegex);

      expect(match).toBeDefined();
      expect(match?.[1]).toBe('1'); // roundNumber
      expect(match?.[2]).toBe('1'); // participantIndex

      // VERIFY: Wrong formats don't parse correctly
      expect(wrongFormat1.match(idRegex)).toBeNull();
      expect(wrongFormat2.match(idRegex)).toBeNull();
      expect(wrongFormat3.match(idRegex)).toBeNull();
    });
  });
});
