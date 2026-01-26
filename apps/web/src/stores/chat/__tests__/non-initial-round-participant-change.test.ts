/**
 * Non-Initial Round Participant Change Tests
 *
 * Tests for bugs when participants change between rounds, especially when
 * applying recommendations that suggest different models.
 *
 * Bug Scenarios from Debug Logs:
 * 1. Round 1 starts with participants grok-4-fast + gemini-3-flash
 * 2. User clicks recommendation suggesting claude-3.5-sonnet + gpt-4.1
 * 3. optimisticParticipantIds have modelId as id: {id: "anthropic/claude-3.5-sonnet", model: "..."}
 * 4. 500 error on pre-search POST
 * 5. Messages reference old participant IDs but store has new IDs
 *
 * Root Causes:
 * - prepareParticipantUpdate creates optimistic participants with id === modelId for new participants
 * - Pre-search triggered before participant PATCH completes
 * - Timeline can't match messages to participants due to ID mismatch
 */

import { ChatModes, MessagePartTypes, MessageRoles, MessageStatuses, ModelIds } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import {
  detectParticipantChanges,
  participantConfigToOptimistic,
  prepareParticipantUpdate,
} from '@/lib/utils';
import type { ChatParticipant, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a mock ChatParticipant (database record with ULID)
 */
function createMockParticipant(
  index: number,
  modelId: string,
  threadId = 'thread-123',
): ChatParticipant {
  const ulidId = `01KCC7P3${String.fromCharCode(77 + index)}N5NZ5XVC9YEH08W${index}${index}`;
  return {
    createdAt: new Date(),
    customRoleId: null,
    id: ulidId,
    isEnabled: true,
    modelId,
    priority: index,
    role: null,
    settings: null,
    threadId,
    updatedAt: new Date(),
  };
}

/**
 * Creates a ParticipantConfig for a NEW participant (not yet in database)
 * These are created when user applies recommendations or changes models
 */
function createNewParticipantConfig(
  index: number,
  modelId: string,
  role?: string,
): ParticipantConfig {
  return {
    customRoleId: undefined,
    id: modelId,
    modelId,
    priority: index,
    role: role ?? null,
  };
}

/**
 * Creates a ParticipantConfig for an EXISTING participant (already in database)
 */
function createExistingParticipantConfig(
  participant: ChatParticipant,
): ParticipantConfig {
  return {
    customRoleId: participant.customRoleId ?? undefined,
    id: participant.id,
    modelId: participant.modelId,
    priority: participant.priority,
    role: participant.role,
  };
}

/**
 * Creates placeholder pre-search
 */
function createPlaceholderPreSearch(
  threadId: string,
  roundNumber: number,
  userQuery: string,
): StoredPreSearch {
  return {
    completedAt: null,
    createdAt: new Date(),
    errorMessage: null,
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    roundNumber,
    searchData: null,
    status: MessageStatuses.PENDING,
    threadId,
    userQuery,
  } as StoredPreSearch;
}

// ============================================================================
// PARTICIPANT ID HANDLING TESTS
// ============================================================================

describe('participant ID handling between rounds', () => {
  describe('detectParticipantChanges', () => {
    it('should detect new participants when id === modelId', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const selectedParticipants = [
        createNewParticipantConfig(0, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, 'The Practical Evaluator'),
        createNewParticipantConfig(1, ModelIds.OPENAI_GPT_4_1, 'Implementation Strategist'),
      ];

      const result = detectParticipantChanges(currentParticipants, selectedParticipants);

      expect(result.hasChanges).toBeTruthy();
      expect(result.hasTemporaryIds).toBeTruthy();
      expect(result.participantsChanged).toBeTruthy();
    });

    it('should NOT detect temporary IDs when using database IDs', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const selectedParticipants = currentParticipants.map(createExistingParticipantConfig);

      const result = detectParticipantChanges(currentParticipants, selectedParticipants);

      expect(result.hasChanges).toBeFalsy();
      expect(result.hasTemporaryIds).toBeFalsy();
    });

    it('should detect mixed new and existing participants', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const firstParticipant = currentParticipants[0];
      if (!firstParticipant) {
        throw new Error('expected first participant');
      }

      const selectedParticipants = [
        createExistingParticipantConfig(firstParticipant),
        createNewParticipantConfig(1, ModelIds.OPENAI_GPT_4_1),
      ];

      const result = detectParticipantChanges(currentParticipants, selectedParticipants);

      expect(result.hasChanges).toBeTruthy();
      expect(result.hasTemporaryIds).toBeTruthy();
    });
  });

  describe('participantConfigToOptimistic', () => {
    it('should create optimistic participant with modelId as id for new participants', () => {
      const config = createNewParticipantConfig(0, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      const optimistic = participantConfigToOptimistic(config, 'thread-123', 0);

      expect(optimistic.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      expect(optimistic.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
    });

    it('should preserve database ID for existing participants', () => {
      const dbParticipant = createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST);
      const config = createExistingParticipantConfig(dbParticipant);
      const optimistic = participantConfigToOptimistic(config, 'thread-123', 0);

      expect(optimistic.id).toBe(dbParticipant.id);
      expect(optimistic.id).not.toBe(optimistic.modelId);
    });
  });

  describe('prepareParticipantUpdate', () => {
    it('should prepare correct data for completely new participants', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const selectedParticipants = [
        createNewParticipantConfig(0, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, 'The Practical Evaluator'),
        createNewParticipantConfig(1, ModelIds.OPENAI_GPT_4_1, 'Implementation Strategist'),
      ];

      const result = prepareParticipantUpdate(
        currentParticipants,
        selectedParticipants,
        'thread-123',
      );

      expect(result.updateResult.hasTemporaryIds).toBeTruthy();
      expect(result.updatePayloads[0]?.id).toBe('');
      expect(result.updatePayloads[1]?.id).toBe('');
      expect(result.optimisticParticipants[0]?.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      expect(result.optimisticParticipants[1]?.id).toBe(ModelIds.OPENAI_GPT_4_1);
    });
  });
});

// ============================================================================
// STORE STATE DURING PARTICIPANT CHANGE
// ============================================================================

describe('store state during participant change', () => {
  describe('updateParticipants with optimistic IDs', () => {
    it('should update participants with temporary IDs', () => {
      const store = createChatStore();

      const initialParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];
      store.getState().updateParticipants(initialParticipants);

      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().participants[0]?.id).not.toBe(store.getState().participants[0]?.modelId);

      const optimisticParticipants: ChatParticipant[] = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          isEnabled: true,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          priority: 0,
          role: 'The Practical Evaluator',
          settings: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
        {
          createdAt: new Date(),
          customRoleId: null,
          id: ModelIds.OPENAI_GPT_4_1,
          isEnabled: true,
          modelId: ModelIds.OPENAI_GPT_4_1,
          priority: 1,
          role: 'Implementation Strategist',
          settings: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(optimisticParticipants);

      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().participants[0]?.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
      expect(store.getState().participants[1]?.id).toBe(ModelIds.OPENAI_GPT_4_1);
    });

    it('should update participants with real IDs after PATCH response', () => {
      const store = createChatStore();

      const optimisticParticipants: ChatParticipant[] = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          isEnabled: true,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          priority: 0,
          role: 'The Practical Evaluator',
          settings: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(optimisticParticipants);

      expect(store.getState().participants[0]?.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);

      const realParticipants: ChatParticipant[] = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          isEnabled: true,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          priority: 0,
          role: 'The Practical Evaluator',
          settings: null,
          threadId: 'thread-123',
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(realParticipants);

      expect(store.getState().participants[0]?.id).toBe('01KCC7R18HCEYWNPA56VBZVG6F');
      expect(store.getState().participants[0]?.id).not.toBe(store.getState().participants[0]?.modelId);
    });
  });

  describe('messages reference participant IDs', () => {
    it('should have messages with correct participantId metadata', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      const initialParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST, threadId),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH, threadId),
      ];
      store.getState().updateParticipants(initialParticipants);

      const messages = [
        {
          id: `${threadId}_r0_user`,
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER as const,
        },
        {
          id: `${threadId}_r0_p0`,
          metadata: {
            model: ModelIds.X_AI_GROK_4_FAST,
            participantId: initialParticipants[0].id,
            participantIndex: 0,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
          },
          parts: [{ text: 'Response from grok', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT as const,
        },
        {
          id: `${threadId}_r0_p1`,
          metadata: {
            model: ModelIds.GOOGLE_GEMINI_2_5_FLASH,
            participantId: initialParticipants[1].id,
            participantIndex: 1,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
          },
          parts: [{ text: 'Response from gemini', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      const participant0 = initialParticipants[0];
      if (!participant0) {
        throw new Error('expected participant 0');
      }

      const participant1 = initialParticipants[1];
      if (!participant1) {
        throw new Error('expected participant 1');
      }

      store.getState().setMessages(messages);

      const storedMessages = store.getState().messages;
      expect(storedMessages).toHaveLength(3);

      const assistantMessages = storedMessages.filter(m => m.role === MessageRoles.ASSISTANT);
      const participantIds = assistantMessages.map((m) => {
        const metadata = m.metadata as { participantId?: string };
        return metadata.participantId;
      });

      expect(participantIds).toContain(participant0.id);
      expect(participantIds).toContain(participant1.id);
    });

    it('should detect when messages reference OLD participants after update', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      const round0Participants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST, threadId),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH, threadId),
      ];

      const messages = [
        {
          id: `${threadId}_r0_user`,
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          parts: [{ text: 'Hello', type: MessagePartTypes.TEXT }],
          role: MessageRoles.USER as const,
        },
        {
          id: `${threadId}_r0_p0`,
          metadata: {
            model: ModelIds.X_AI_GROK_4_FAST,
            participantId: round0Participants[0].id,
            participantIndex: 0,
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
          },
          parts: [{ text: 'Response from grok', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      const firstRound0Participant = round0Participants[0];
      if (!firstRound0Participant) {
        throw new Error('expected first round 0 participant');
      }

      store.getState().setMessages(messages);

      const newParticipants: ChatParticipant[] = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          isEnabled: true,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          priority: 0,
          role: 'The Practical Evaluator',
          settings: null,
          threadId,
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(newParticipants);

      const storedMessages = store.getState().messages;
      const assistantMessage = storedMessages.find(m => m.role === MessageRoles.ASSISTANT);
      const metadata = assistantMessage?.metadata as { participantId?: string };

      const currentParticipantIds = store.getState().participants.map(p => p.id);
      expect(currentParticipantIds).not.toContain(metadata?.participantId);
    });
  });
});

// ============================================================================
// PRE-SEARCH TIMING WITH PARTICIPANT CHANGES
// ============================================================================

describe('pre-search timing with participant changes', () => {
  describe('pre-search should wait for participant update', () => {
    it('should add pre-search before participant update completes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      const initialParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST, threadId),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH, threadId),
      ];
      store.getState().initializeThread(
        {
          createdAt: new Date(),
          enableWebSearch: true,
          id: threadId,
          isAiGeneratedTitle: false,
          isFavorite: false,
          isPublic: false,
          lastMessageAt: new Date(),
          metadata: null,
          mode: ChatModes.ANALYZING,
          previousSlug: null,
          projectId: null,
          slug: 'test-thread',
          status: 'active' as const,
          title: 'Test Thread',
          updatedAt: new Date(),
          userId: 'user-123',
          version: 1,
        },
        initialParticipants,
        [],
      );

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 1, 'Round 1 query'));

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);
    });

    it('should track pre-search execution state independently of participant changes', () => {
      const store = createChatStore();
      const threadId = 'thread-123';

      store.getState().addPreSearch(createPlaceholderPreSearch(threadId, 1, 'Round 1 query'));

      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeTruthy();

      const newParticipants: ChatParticipant[] = [
        {
          createdAt: new Date(),
          customRoleId: null,
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          isEnabled: true,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          priority: 0,
          role: 'The Practical Evaluator',
          settings: null,
          threadId,
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(newParticipants);

      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeTruthy();
    });
  });
});

// ============================================================================
// ROUND NUMBER CALCULATION TESTS
// ============================================================================

describe('round number calculation', () => {
  it('should calculate correct round number based on existing messages', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    const messages = [
      {
        id: `${threadId}_r0_user`,
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
        parts: [{ text: 'Round 0', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER as const,
      },
      {
        id: `${threadId}_r0_p0`,
        metadata: {
          participantId: 'p0',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Response', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT as const,
      },
    ];
    store.getState().setMessages(messages);

    const existingRounds = new Set(
      store.getState().messages.map((m) => {
        const metadata = m.metadata as { roundNumber?: number };
        return metadata.roundNumber ?? 0;
      }),
    );

    expect(existingRounds.has(0)).toBeTruthy();
    expect(existingRounds.has(1)).toBeFalsy();
  });

  it('should handle multiple rounds correctly', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    const messages = [
      {
        id: `${threadId}_r0_user`,
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
        parts: [{ text: 'Round 0', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER as const,
      },
      {
        id: `${threadId}_r0_p0`,
        metadata: { participantId: 'p0', participantIndex: 0, role: MessageRoles.ASSISTANT, roundNumber: 0 },
        parts: [{ text: 'Response 0', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT as const,
      },
      {
        id: `${threadId}_r1_user`,
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
        parts: [{ text: 'Round 1', type: MessagePartTypes.TEXT }],
        role: MessageRoles.USER as const,
      },
      {
        id: `${threadId}_r1_p0`,
        metadata: { participantId: 'p1', participantIndex: 0, role: MessageRoles.ASSISTANT, roundNumber: 1 },
        parts: [{ text: 'Response 1', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT as const,
      },
    ];
    store.getState().setMessages(messages);

    const roundNumbers = store.getState().messages.map((m) => {
      const metadata = m.metadata as { roundNumber?: number };
      return metadata.roundNumber ?? 0;
    });

    expect(roundNumbers).toContain(0);
    expect(roundNumbers).toContain(1);
  });
});

// ============================================================================
// SELECTEDPARTICIPANTS SYNC TESTS
// ============================================================================

describe('selectedParticipants Sync After Update', () => {
  it('should sync selectedParticipants with database IDs after successful update', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    store.getState().setSelectedParticipants([
      createNewParticipantConfig(0, ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5, 'The Practical Evaluator'),
      createNewParticipantConfig(1, ModelIds.OPENAI_GPT_4_1, 'Implementation Strategist'),
    ]);

    expect(store.getState().selectedParticipants[0]?.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);
    expect(store.getState().selectedParticipants[1]?.id).toBe(ModelIds.OPENAI_GPT_4_1);

    const dbParticipants: ChatParticipant[] = [
      {
        createdAt: new Date(),
        customRoleId: null,
        id: '01KCC7R18HCEYWNPA56VBZVG6F',
        isEnabled: true,
        modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
        priority: 0,
        role: 'The Practical Evaluator',
        settings: null,
        threadId,
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        customRoleId: null,
        id: '01KCC7R18H8E40CW730K19Q0TD',
        isEnabled: true,
        modelId: ModelIds.OPENAI_GPT_4_1,
        priority: 1,
        role: 'Implementation Strategist',
        settings: null,
        threadId,
        updatedAt: new Date(),
      },
    ];

    const syncedConfigs = dbParticipants.map((p, index) => ({
      customRoleId: p.customRoleId ?? undefined,
      id: p.id,
      modelId: p.modelId,
      priority: index,
      role: p.role,
    }));
    store.getState().setSelectedParticipants(syncedConfigs);

    expect(store.getState().selectedParticipants[0]?.id).toBe('01KCC7R18HCEYWNPA56VBZVG6F');
    expect(store.getState().selectedParticipants[1]?.id).toBe('01KCC7R18H8E40CW730K19Q0TD');
    expect(store.getState().selectedParticipants[0]?.id).not.toBe(store.getState().selectedParticipants[0]?.modelId);
  });

  it('should prevent duplicate participant creation when IDs are synced', () => {
    const threadId = 'thread-123';

    const dbParticipants: ChatParticipant[] = [
      {
        createdAt: new Date(),
        customRoleId: null,
        id: '01KCC7R18HCEYWNPA56VBZVG6F',
        isEnabled: true,
        modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
        priority: 0,
        role: 'The Practical Evaluator',
        settings: null,
        threadId,
        updatedAt: new Date(),
      },
    ];

    const syncedConfig: ParticipantConfig = {
      customRoleId: undefined,
      id: '01KCC7R18HCEYWNPA56VBZVG6F',
      modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
      priority: 0,
      role: 'The Practical Evaluator',
    };

    const result = detectParticipantChanges(dbParticipants, [syncedConfig]);

    expect(result.hasTemporaryIds).toBeFalsy();
    expect(result.participantsChanged).toBeFalsy();
    expect(result.hasChanges).toBeFalsy();
  });
});
