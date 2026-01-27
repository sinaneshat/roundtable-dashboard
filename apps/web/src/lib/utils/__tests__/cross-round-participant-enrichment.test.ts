/**
 * Cross-Round Participant Enrichment Tests
 *
 * Tests that verify participant info is correctly preserved when participants
 * change between rounds. This addresses the bug where round 0 participant IDs
 * are not found in the participant map during round 1 conversion.
 *
 * Bug scenario:
 * - Round 0: Participants A (gpt-5-nano), B (deepseek)
 * - Round 1: Participants C (gpt-5-mini), D (claude), E (gemini)
 * - When converting messages to UI, round 0 messages can't find A/B in map
 *
 * @see https://github.com/roundtable/billing-dashboard/issues/XXX
 */

import { FinishReasons, MessagePartTypes, MessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ParticipantContext } from '@/lib/schemas/participant-schemas';
import type { ApiMessage } from '@/services/api';
import { isAssistantMessageMetadata } from '@/services/api';

import { chatMessagesToUIMessages } from '../message-transforms';
import { getMessageMetadata } from '../metadata';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockApiMessage(overrides: Partial<ApiMessage>): ApiMessage {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    id: 'msg-default',
    metadata: {
      role: MessageRoles.USER,
      roundNumber: 0,
    },
    participantId: null,
    parts: [{ text: 'Test message', type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
    roundNumber: 0,
    threadId: 'thread-123',
    toolCalls: null,
    ...overrides,
  };
}

function createMockAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  participantId: string,
  modelId: string,
): ApiMessage {
  return createMockApiMessage({
    id: `${participantId}_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: FinishReasons.STOP,
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: modelId,
      participantId,
      participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: {
        completionTokens: 50,
        promptTokens: 100,
        totalTokens: 150,
      },
    },
    participantId,
    parts: [{ text: `Response from ${modelId}`, type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
    roundNumber,
  });
}

function createMockUserMessage(roundNumber: number): ApiMessage {
  return createMockApiMessage({
    id: `user_r${roundNumber}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text: `User question for round ${roundNumber}`, type: MessagePartTypes.TEXT }],
    role: MessageRoles.USER,
    roundNumber,
  });
}

function createParticipantContext(
  id: string,
  modelId: string,
  role: string | null = null,
): ParticipantContext {
  return {
    id,
    modelId,
    role,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('cross-Round Participant Enrichment', () => {
  describe('scenario: Participants change between rounds', () => {
    /**
     * This test reproduces the bug from the logs:
     * [MOD] toUI-setup: participants=3 mapSize=3 indexMapSize=3
     * [MOD] toUI-p: [0] id=07Q8YVQQ model=openai/gpt-5-mini  (round 1 participants)
     * [MOD] toUI-msg: id=0P_r0_p0 role=assistant pIdInMeta=43RE6RFJ foundInMap=false
     * [MOD] toUI-msg: id=0P_r0_p1 role=assistant pIdInMeta=HQBZDFVP foundInMap=false
     */
    it('should preserve participant metadata for round 0 messages when round 1 has different participants', () => {
      // Round 0 participants
      const r0_participant_A = 'participant_A_43RE6RFJ';
      const r0_participant_B = 'participant_B_HQBZDFVP';

      // Round 1 participants (different set)
      const r1_participant_C = 'participant_C_07Q8YVQQ';
      const r1_participant_D = 'participant_D_NEW1';
      const r1_participant_E = 'participant_E_NEW2';

      // Messages from both rounds
      const messages: ApiMessage[] = [
        // Round 0
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, r0_participant_A, 'openai/gpt-5-nano'),
        createMockAssistantMessage(0, 1, r0_participant_B, 'deepseek/deepseek-chat'),
        // Round 1
        createMockUserMessage(1),
        createMockAssistantMessage(1, 0, r1_participant_C, 'openai/gpt-5-mini'),
        createMockAssistantMessage(1, 1, r1_participant_D, 'anthropic/claude-3'),
        createMockAssistantMessage(1, 2, r1_participant_E, 'google/gemini-pro'),
      ];

      // Current participants (round 1 only)
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext(r1_participant_C, 'openai/gpt-5-mini'),
        createParticipantContext(r1_participant_D, 'anthropic/claude-3'),
        createParticipantContext(r1_participant_E, 'google/gemini-pro'),
      ];

      // Convert messages
      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      // Verify round 0 messages still have their participant metadata preserved
      const r0Messages = uiMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown> | undefined;
        return meta?.roundNumber === 0 && m.role === MessageRoles.ASSISTANT;
      });

      expect(r0Messages).toHaveLength(2);

      // Check first round 0 message (participant A)
      const r0Msg0 = r0Messages[0];
      expect(r0Msg0).toBeDefined();
      const r0Msg0Meta = r0Msg0?.metadata as Record<string, unknown>;

      // The key assertions: round 0 messages should have participant info
      // Even though participant A is not in the current participants map
      expect(r0Msg0Meta.participantId).toBe(r0_participant_A);
      expect(r0Msg0Meta.model).toBe('openai/gpt-5-nano');
      expect(r0Msg0Meta.roundNumber).toBe(0);
      expect(r0Msg0Meta.participantIndex).toBe(0);

      // Check second round 0 message (participant B)
      const r0Msg1 = r0Messages[1];
      expect(r0Msg1).toBeDefined();
      const r0Msg1Meta = r0Msg1?.metadata as Record<string, unknown>;

      expect(r0Msg1Meta.participantId).toBe(r0_participant_B);
      expect(r0Msg1Meta.model).toBe('deepseek/deepseek-chat');
      expect(r0Msg1Meta.roundNumber).toBe(0);
      expect(r0Msg1Meta.participantIndex).toBe(1);
    });

    it('should enrich round 1 messages with current participant info when not already enriched', () => {
      const r1_participant_C = 'participant_C_07Q8YVQQ';

      // Create a message that needs enrichment (only partial metadata)
      const messageNeedingEnrichment = createMockApiMessage({
        id: `${r1_participant_C}_r1_p0`,
        metadata: {
          // Minimal metadata - missing participantId, model, participantIndex
          role: MessageRoles.ASSISTANT,
          roundNumber: 1,
        },
        participantId: r1_participant_C,
        parts: [{ text: 'Response from model', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT,
        roundNumber: 1,
      });

      const messages: ApiMessage[] = [
        createMockUserMessage(1),
        messageNeedingEnrichment,
      ];

      const currentParticipants: ParticipantContext[] = [
        createParticipantContext(r1_participant_C, 'openai/gpt-5-mini', 'Expert analyst'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      const r1Messages = uiMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown> | undefined;
        return meta?.roundNumber === 1 && m.role === MessageRoles.ASSISTANT;
      });

      expect(r1Messages).toHaveLength(1);

      const r1Msg = r1Messages[0];
      const r1MsgMeta = r1Msg?.metadata as Record<string, unknown>;

      // Round 1 message should be enriched with participant info
      expect(r1MsgMeta.participantId).toBe(r1_participant_C);
      expect(r1MsgMeta.model).toBe('openai/gpt-5-mini');
      expect(r1MsgMeta.participantRole).toBe('Expert analyst');
      expect(r1MsgMeta.participantIndex).toBe(0);
    });

    it('should preserve existing metadata when message already has enrichment', () => {
      const r1_participant_C = 'participant_C_07Q8YVQQ';

      // This message already has full enrichment with participantRole: null
      const messages: ApiMessage[] = [
        createMockUserMessage(1),
        createMockAssistantMessage(1, 0, r1_participant_C, 'openai/gpt-5-mini'),
      ];

      // Current participant has a different role, but message already has metadata
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext(r1_participant_C, 'openai/gpt-5-mini', 'Expert analyst'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      const r1Messages = uiMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown> | undefined;
        return meta?.roundNumber === 1 && m.role === MessageRoles.ASSISTANT;
      });

      expect(r1Messages).toHaveLength(1);

      const r1Msg = r1Messages[0];
      const r1MsgMeta = r1Msg?.metadata as Record<string, unknown>;

      // Should preserve existing metadata (original had participantRole: null)
      expect(r1MsgMeta.participantId).toBe(r1_participant_C);
      expect(r1MsgMeta.model).toBe('openai/gpt-5-mini');
      expect(r1MsgMeta.participantRole).toBeNull(); // Preserved from original
      expect(r1MsgMeta.participantIndex).toBe(0);
    });

    it('should handle 3 rounds with different participants each round', () => {
      // Round 0: 2 participants
      const r0_pA = 'p_r0_A';
      const r0_pB = 'p_r0_B';

      // Round 1: 3 participants (all different)
      const r1_pC = 'p_r1_C';
      const r1_pD = 'p_r1_D';
      const r1_pE = 'p_r1_E';

      // Round 2: 1 participant (again different)
      const r2_pF = 'p_r2_F';

      const messages: ApiMessage[] = [
        // Round 0
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, r0_pA, 'model-A'),
        createMockAssistantMessage(0, 1, r0_pB, 'model-B'),
        // Round 1
        createMockUserMessage(1),
        createMockAssistantMessage(1, 0, r1_pC, 'model-C'),
        createMockAssistantMessage(1, 1, r1_pD, 'model-D'),
        createMockAssistantMessage(1, 2, r1_pE, 'model-E'),
        // Round 2
        createMockUserMessage(2),
        createMockAssistantMessage(2, 0, r2_pF, 'model-F'),
      ];

      // Only round 2 participant is current
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext(r2_pF, 'model-F'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      // Check all assistant messages have their metadata preserved
      const assistantMessages = uiMessages.filter(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMessages).toHaveLength(6);

      // Round 0 messages should still have their original metadata
      const r0Msgs = assistantMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.roundNumber === 0;
      });
      expect(r0Msgs).toHaveLength(2);

      r0Msgs.forEach((msg) => {
        const meta = msg.metadata as Record<string, unknown>;
        expect(meta.participantId).toBeDefined();
        expect(meta.model).toBeDefined();
        expect(meta.participantIndex).toBeDefined();
      });

      // Round 1 messages should still have their original metadata
      const r1Msgs = assistantMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta?.roundNumber === 1;
      });
      expect(r1Msgs).toHaveLength(3);

      r1Msgs.forEach((msg) => {
        const meta = msg.metadata as Record<string, unknown>;
        expect(meta.participantId).toBeDefined();
        expect(meta.model).toBeDefined();
        expect(meta.participantIndex).toBeDefined();
      });
    });

    it('should not lose model info when participant is not in current map', () => {
      const oldParticipantId = 'old_participant_123';
      const modelId = 'openai/gpt-4-turbo';

      const messages: ApiMessage[] = [
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, oldParticipantId, modelId),
      ];

      // No participants provided (or empty array)
      const uiMessages = chatMessagesToUIMessages(messages, []);

      const assistantMsg = uiMessages.find(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMsg).toBeDefined();

      const meta = assistantMsg?.metadata as Record<string, unknown>;

      // Model info should be preserved from the original message
      expect(meta.model).toBe(modelId);
      expect(meta.participantId).toBe(oldParticipantId);
    });
  });

  describe('edge cases', () => {
    it('should handle messages with no participants provided', () => {
      const messages: ApiMessage[] = [
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'some-participant', 'some-model'),
      ];

      // Convert without any participants
      const uiMessages = chatMessagesToUIMessages(messages);

      expect(uiMessages).toHaveLength(2);

      const assistantMsg = uiMessages.find(m => m.role === MessageRoles.ASSISTANT);
      const meta = assistantMsg?.metadata as Record<string, unknown>;

      // Should still have the metadata from the original message
      expect(meta.participantId).toBe('some-participant');
      expect(meta.model).toBe('some-model');
    });

    it('should handle empty messages array', () => {
      const uiMessages = chatMessagesToUIMessages([], []);
      expect(uiMessages).toHaveLength(0);
    });

    it('should preserve participant info even when participant map lookup fails', () => {
      // This simulates the exact bug: participant ID exists in message metadata
      // but the participant map only contains different (newer) participants
      const historicalParticipantId = 'HISTORICAL_ID_123';
      const historicalModel = 'historical/model';

      const messages: ApiMessage[] = [
        createMockUserMessage(0),
        {
          ...createMockAssistantMessage(0, 0, historicalParticipantId, historicalModel),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: historicalModel,
            participantId: historicalParticipantId,
            participantIndex: 0,
            participantRole: 'Historical Role',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 50, promptTokens: 100, totalTokens: 150 },
          },
        },
      ];

      // Current participants don't include the historical one
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext('NEW_PARTICIPANT_456', 'new/model'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      const assistantMsg = uiMessages.find(m => m.role === MessageRoles.ASSISTANT);
      const meta = assistantMsg?.metadata as Record<string, unknown>;

      // The original metadata should be preserved, not overwritten or lost
      expect(meta.participantId).toBe(historicalParticipantId);
      expect(meta.model).toBe(historicalModel);
      expect(meta.participantRole).toBe('Historical Role');
      expect(meta.participantIndex).toBe(0);
    });

    it('should work with the exact scenario from the bug report logs', () => {
      // Simulating the exact log output:
      // [MOD] toUI-setup: participants=3 mapSize=3 indexMapSize=3
      // [MOD] toUI-p: [0] id=07Q8YVQQ model=openai/gpt-5-mini  (round 1 participants)
      // [MOD] toUI-msg: id=0P_r0_p0 role=assistant pIdInMeta=43RE6RFJ foundInMap=false

      // Round 0 participants (gpt-5-nano, deepseek)
      const round0_participant_43RE6RFJ = 'participant_43RE6RFJ';
      const round0_participant_HQBZDFVP = 'participant_HQBZDFVP';

      // Round 1 participants (gpt-5-mini, claude, gemini) - completely different
      const round1_participant_07Q8YVQQ = 'participant_07Q8YVQQ';
      const round1_participant_NEW1 = 'participant_NEW1';
      const round1_participant_NEW2 = 'participant_NEW2';

      const messages: ApiMessage[] = [
        // Round 0 messages - these have participant IDs that won't be in round 1's map
        createMockUserMessage(0),
        {
          ...createMockAssistantMessage(0, 0, round0_participant_43RE6RFJ, 'openai/gpt-5-nano'),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'openai/gpt-5-nano',
            participantId: round0_participant_43RE6RFJ,
            participantIndex: 0,
            participantRole: 'Analyst',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 100, promptTokens: 200, totalTokens: 300 },
          },
        },
        {
          ...createMockAssistantMessage(0, 1, round0_participant_HQBZDFVP, 'deepseek/deepseek-chat'),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'deepseek/deepseek-chat',
            participantId: round0_participant_HQBZDFVP,
            participantIndex: 1,
            participantRole: 'Creative',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 80, promptTokens: 180, totalTokens: 260 },
          },
        },
        // Round 1 messages
        createMockUserMessage(1),
        createMockAssistantMessage(1, 0, round1_participant_07Q8YVQQ, 'openai/gpt-5-mini'),
        createMockAssistantMessage(1, 1, round1_participant_NEW1, 'anthropic/claude-3'),
        createMockAssistantMessage(1, 2, round1_participant_NEW2, 'google/gemini-pro'),
      ];

      // Only round 1 participants are "current"
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext(round1_participant_07Q8YVQQ, 'openai/gpt-5-mini'),
        createParticipantContext(round1_participant_NEW1, 'anthropic/claude-3'),
        createParticipantContext(round1_participant_NEW2, 'google/gemini-pro'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      // Filter to round 0 assistant messages
      const round0AssistantMsgs = uiMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown> | undefined;
        return meta?.roundNumber === 0 && m.role === MessageRoles.ASSISTANT;
      });

      expect(round0AssistantMsgs).toHaveLength(2);

      // Message 43RE6RFJ (gpt-5-nano) - should retain all its metadata
      const msg43RE6RFJ = round0AssistantMsgs.find((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta.participantId === round0_participant_43RE6RFJ;
      });
      expect(msg43RE6RFJ).toBeDefined();

      const meta43RE6RFJ = msg43RE6RFJ?.metadata as Record<string, unknown>;
      expect(meta43RE6RFJ.model).toBe('openai/gpt-5-nano');
      expect(meta43RE6RFJ.participantIndex).toBe(0);
      expect(meta43RE6RFJ.participantRole).toBe('Analyst');
      expect(meta43RE6RFJ.hasError).toBe(false);

      // Message HQBZDFVP (deepseek) - should retain all its metadata
      const msgHQBZDFVP = round0AssistantMsgs.find((m) => {
        const meta = m.metadata as Record<string, unknown>;
        return meta.participantId === round0_participant_HQBZDFVP;
      });
      expect(msgHQBZDFVP).toBeDefined();

      const metaHQBZDFVP = msgHQBZDFVP?.metadata as Record<string, unknown>;
      expect(metaHQBZDFVP.model).toBe('deepseek/deepseek-chat');
      expect(metaHQBZDFVP.participantIndex).toBe(1);
      expect(metaHQBZDFVP.participantRole).toBe('Creative');
      expect(metaHQBZDFVP.hasError).toBe(false);

      // Verify round 1 messages are also correct
      const round1AssistantMsgs = uiMessages.filter((m) => {
        const meta = m.metadata as Record<string, unknown> | undefined;
        return meta?.roundNumber === 1 && m.role === MessageRoles.ASSISTANT;
      });

      expect(round1AssistantMsgs).toHaveLength(3);
    });
  });

  describe('uI rendering path validation', () => {
    /**
     * This test validates that the UI component can extract participant info
     * directly from message metadata, which is the pattern used for completed messages.
     * This is critical for cross-round participant display.
     */
    it('should extract complete participant info from message metadata for rendering', () => {
      // Historical message with complete metadata
      const historicalParticipantId = 'HISTORICAL_P_123';
      const historicalModel = 'openai/gpt-4-turbo';
      const historicalRole = 'Technical Analyst';
      const historicalIndex = 2;

      const messages: ApiMessage[] = [
        createMockUserMessage(0),
        {
          ...createMockAssistantMessage(0, historicalIndex, historicalParticipantId, historicalModel),
          metadata: {
            finishReason: FinishReasons.STOP, // Complete message
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: historicalModel,
            participantId: historicalParticipantId,
            participantIndex: historicalIndex,
            participantRole: historicalRole,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 200, promptTokens: 400, totalTokens: 600 },
          },
        },
      ];

      // Current participants are completely different
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext('NEW_PARTICIPANT', 'anthropic/claude-3'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      const assistantMsg = uiMessages.find(m => m.role === MessageRoles.ASSISTANT);
      expect(assistantMsg).toBeDefined();

      // Simulate what chat-message-list.tsx does for complete messages
      const metadata = getMessageMetadata(assistantMsg?.metadata);
      const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

      // Verify the metadata is complete and can be used for rendering
      expect(assistantMetadata).not.toBeNull();
      expect(assistantMetadata?.model).toBe(historicalModel);
      expect(assistantMetadata?.participantIndex).toBe(historicalIndex);
      expect(assistantMetadata?.participantRole).toBe(historicalRole);
      expect(assistantMetadata?.finishReason).toBe(FinishReasons.STOP);

      // This is exactly what chat-message-list.tsx uses for rendering:
      // {
      //   isStreaming: false,
      //   modelId: assistantMetadata.model,
      //   participantIndex: assistantMetadata.participantIndex,
      //   role: assistantMetadata.participantRole,
      // }
      const participantInfoForRendering = {
        isStreaming: false,
        modelId: assistantMetadata?.model,
        participantIndex: assistantMetadata?.participantIndex,
        role: assistantMetadata?.participantRole,
      };

      expect(participantInfoForRendering.modelId).toBe(historicalModel);
      expect(participantInfoForRendering.participantIndex).toBe(historicalIndex);
      expect(participantInfoForRendering.role).toBe(historicalRole);
    });

    it('should handle multiple rounds with complete participant info in metadata', () => {
      // Round 0: Participants A, B
      // Round 1: Participants C, D, E
      // All messages are complete

      const messages: ApiMessage[] = [
        // Round 0
        createMockUserMessage(0),
        {
          ...createMockAssistantMessage(0, 0, 'P_A', 'model-A'),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'model-A',
            participantId: 'P_A',
            participantIndex: 0,
            participantRole: 'Role A',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 100, promptTokens: 200, totalTokens: 300 },
          },
        },
        {
          ...createMockAssistantMessage(0, 1, 'P_B', 'model-B'),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'model-B',
            participantId: 'P_B',
            participantIndex: 1,
            participantRole: 'Role B',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 100, promptTokens: 200, totalTokens: 300 },
          },
        },
        // Round 1
        createMockUserMessage(1),
        {
          ...createMockAssistantMessage(1, 0, 'P_C', 'model-C'),
          metadata: {
            finishReason: FinishReasons.STOP,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'model-C',
            participantId: 'P_C',
            participantIndex: 0,
            participantRole: 'Role C',
            role: MessageRoles.ASSISTANT,
            roundNumber: 1,
            usage: { completionTokens: 100, promptTokens: 200, totalTokens: 300 },
          },
        },
      ];

      // Only round 1 participants are current
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext('P_C', 'model-C', 'Role C'),
      ];

      const uiMessages = chatMessagesToUIMessages(messages, currentParticipants);

      // Verify each message can be rendered with its own metadata
      const assistantMsgs = uiMessages.filter(m => m.role === MessageRoles.ASSISTANT);

      assistantMsgs.forEach((msg) => {
        const metadata = getMessageMetadata(msg.metadata);
        const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

        // Every complete message should have full participant info in metadata
        expect(assistantMetadata).not.toBeNull();
        expect(assistantMetadata?.model).toBeDefined();
        expect(assistantMetadata?.participantIndex).toBeDefined();
        expect(assistantMetadata?.participantRole).toBeDefined();
      });
    });

    it('should NOT lose metadata when participant lookup fails (foundInMap=false)', () => {
      // This test simulates the exact scenario from the bug report logs:
      // [MOD] toUI-msg: id=0P_r0_p0 role=assistant pIdInMeta=43RE6RFJ foundInMap=false needsEnrich=undefined
      //
      // The key assertion is: even though foundInMap=false, the message metadata is preserved

      const historicalParticipantId = 'participant_43RE6RFJ';
      const historicalModel = 'openai/gpt-5-nano';

      const messageWithFullMetadata: ApiMessage = {
        createdAt: new Date().toISOString(),
        id: '0P_r0_p0',
        metadata: {
          finishReason: FinishReasons.STOP,
          hasError: false,
          isPartialResponse: false,
          isTransient: false,
          model: historicalModel,
          participantId: historicalParticipantId,
          participantIndex: 0,
          participantRole: 'Analyst',
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 100, promptTokens: 200, totalTokens: 300 },
        },
        participantId: historicalParticipantId,
        parts: [{ text: 'Response from historical participant', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
        threadId: 'thread-123',
        toolCalls: null,
      };

      // Round 1 participants - completely different from round 0
      const currentParticipants: ParticipantContext[] = [
        createParticipantContext('participant_07Q8YVQQ', 'openai/gpt-5-mini'),
        createParticipantContext('participant_NEW1', 'anthropic/claude-3'),
        createParticipantContext('participant_NEW2', 'google/gemini-pro'),
      ];

      // Convert messages - this is where foundInMap=false would be logged
      const uiMessages = chatMessagesToUIMessages(
        [createMockUserMessage(0), messageWithFullMetadata],
        currentParticipants,
      );

      const assistantMsg = uiMessages.find(m => m.role === MessageRoles.ASSISTANT);
      const metadata = getMessageMetadata(assistantMsg?.metadata);
      const assistantMetadata = metadata && isAssistantMessageMetadata(metadata) ? metadata : null;

      // CRITICAL: Even though the historical participant isn't in the current participants map
      // (foundInMap=false), the metadata should still be complete and usable
      expect(assistantMetadata).not.toBeNull();
      expect(assistantMetadata?.participantId).toBe(historicalParticipantId);
      expect(assistantMetadata?.model).toBe(historicalModel);
      expect(assistantMetadata?.participantIndex).toBe(0);
      expect(assistantMetadata?.participantRole).toBe('Analyst');

      // The message is renderable - UI can use this metadata directly
      expect(assistantMetadata?.finishReason).toBe(FinishReasons.STOP);
      expect(assistantMetadata?.hasError).toBe(false);
    });
  });
});
