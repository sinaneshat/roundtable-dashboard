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
import type { ChatParticipant, StoredPreSearch } from '@/types/api';

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
    id: ulidId,
    threadId,
    modelId,
    role: null,
    customRoleId: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
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
    id: modelId,
    modelId,
    role: role ?? null,
    customRoleId: undefined,
    priority: index,
  };
}

/**
 * Creates a ParticipantConfig for an EXISTING participant (already in database)
 */
function createExistingParticipantConfig(
  participant: ChatParticipant,
): ParticipantConfig {
  return {
    id: participant.id,
    modelId: participant.modelId,
    role: participant.role,
    customRoleId: participant.customRoleId ?? undefined,
    priority: participant.priority,
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
    id: `placeholder-presearch-${threadId}-${roundNumber}`,
    threadId,
    roundNumber,
    userQuery,
    status: MessageStatuses.PENDING,
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
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

      expect(result.hasChanges).toBe(true);
      expect(result.hasTemporaryIds).toBe(true);
      expect(result.participantsChanged).toBe(true);
    });

    it('should NOT detect temporary IDs when using database IDs', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const selectedParticipants = currentParticipants.map(createExistingParticipantConfig);

      const result = detectParticipantChanges(currentParticipants, selectedParticipants);

      expect(result.hasChanges).toBe(false);
      expect(result.hasTemporaryIds).toBe(false);
    });

    it('should detect mixed new and existing participants', () => {
      const currentParticipants = [
        createMockParticipant(0, ModelIds.X_AI_GROK_4_FAST),
        createMockParticipant(1, ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      ];

      const selectedParticipants = [
        createExistingParticipantConfig(currentParticipants[0]!),
        createNewParticipantConfig(1, ModelIds.OPENAI_GPT_4_1),
      ];

      const result = detectParticipantChanges(currentParticipants, selectedParticipants);

      expect(result.hasChanges).toBe(true);
      expect(result.hasTemporaryIds).toBe(true);
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

      expect(result.updateResult.hasTemporaryIds).toBe(true);
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
          id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          threadId: 'thread-123',
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          role: 'The Practical Evaluator',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: ModelIds.OPENAI_GPT_4_1,
          threadId: 'thread-123',
          modelId: ModelIds.OPENAI_GPT_4_1,
          role: 'Implementation Strategist',
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
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
          id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          threadId: 'thread-123',
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          role: 'The Practical Evaluator',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(optimisticParticipants);

      expect(store.getState().participants[0]?.id).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5);

      const realParticipants: ChatParticipant[] = [
        {
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          threadId: 'thread-123',
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          role: 'The Practical Evaluator',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
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
          role: MessageRoles.USER as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
        {
          id: `${threadId}_r0_p0`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Response from grok' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: initialParticipants[0]!.id,
            participantIndex: 0,
            model: ModelIds.X_AI_GROK_4_FAST,
          },
        },
        {
          id: `${threadId}_r0_p1`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Response from gemini' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: initialParticipants[1]!.id,
            participantIndex: 1,
            model: ModelIds.GOOGLE_GEMINI_2_5_FLASH,
          },
        },
      ];
      store.getState().setMessages(messages);

      const storedMessages = store.getState().messages;
      expect(storedMessages).toHaveLength(3);

      const assistantMessages = storedMessages.filter(m => m.role === MessageRoles.ASSISTANT);
      const participantIds = assistantMessages.map((m) => {
        const metadata = m.metadata as { participantId?: string };
        return metadata.participantId;
      });

      expect(participantIds).toContain(initialParticipants[0]!.id);
      expect(participantIds).toContain(initialParticipants[1]!.id);
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
          role: MessageRoles.USER as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Hello' }],
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
        },
        {
          id: `${threadId}_r0_p0`,
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Response from grok' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: round0Participants[0]!.id,
            participantIndex: 0,
            model: ModelIds.X_AI_GROK_4_FAST,
          },
        },
      ];
      store.getState().setMessages(messages);

      const newParticipants: ChatParticipant[] = [
        {
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          threadId,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          role: 'The Practical Evaluator',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
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
          id: threadId,
          userId: 'user-123',
          title: 'Test Thread',
          slug: 'test-thread',
          previousSlug: null,
          projectId: null,
          mode: ChatModes.ANALYZING,
          status: 'active' as const,
          enableWebSearch: true,
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          metadata: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
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
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      const newParticipants: ChatParticipant[] = [
        {
          id: '01KCC7R18HCEYWNPA56VBZVG6F',
          threadId,
          modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
          role: 'The Practical Evaluator',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(newParticipants);

      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
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
        role: MessageRoles.USER as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Round 0' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      },
      {
        id: `${threadId}_r0_p0`,
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        },
      },
    ];
    store.getState().setMessages(messages);

    const existingRounds = new Set(
      store.getState().messages.map((m) => {
        const metadata = m.metadata as { roundNumber?: number };
        return metadata.roundNumber ?? 0;
      }),
    );

    expect(existingRounds.has(0)).toBe(true);
    expect(existingRounds.has(1)).toBe(false);
  });

  it('should handle multiple rounds correctly', () => {
    const store = createChatStore();
    const threadId = 'thread-123';

    const messages = [
      {
        id: `${threadId}_r0_user`,
        role: MessageRoles.USER as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Round 0' }],
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
      },
      {
        id: `${threadId}_r0_p0`,
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 0' }],
        metadata: { role: MessageRoles.ASSISTANT, roundNumber: 0, participantId: 'p0', participantIndex: 0 },
      },
      {
        id: `${threadId}_r1_user`,
        role: MessageRoles.USER as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Round 1' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1 },
      },
      {
        id: `${threadId}_r1_p0`,
        role: MessageRoles.ASSISTANT as const,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }],
        metadata: { role: MessageRoles.ASSISTANT, roundNumber: 1, participantId: 'p1', participantIndex: 0 },
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
        id: '01KCC7R18HCEYWNPA56VBZVG6F',
        threadId,
        modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
        role: 'The Practical Evaluator',
        customRoleId: null,
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '01KCC7R18H8E40CW730K19Q0TD',
        threadId,
        modelId: ModelIds.OPENAI_GPT_4_1,
        role: 'Implementation Strategist',
        customRoleId: null,
        priority: 1,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const syncedConfigs = dbParticipants.map((p, index) => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId ?? undefined,
      priority: index,
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
        id: '01KCC7R18HCEYWNPA56VBZVG6F',
        threadId,
        modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
        role: 'The Practical Evaluator',
        customRoleId: null,
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const syncedConfig: ParticipantConfig = {
      id: '01KCC7R18HCEYWNPA56VBZVG6F',
      modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4_5,
      role: 'The Practical Evaluator',
      customRoleId: undefined,
      priority: 0,
    };

    const result = detectParticipantChanges(dbParticipants, [syncedConfig]);

    expect(result.hasTemporaryIds).toBe(false);
    expect(result.participantsChanged).toBe(false);
    expect(result.hasChanges).toBe(false);
  });
});
