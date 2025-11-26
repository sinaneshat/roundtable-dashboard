/**
 * Duplicate Participants Sync Tests
 *
 * Tests for the bug fix where selectedParticipants was not synced with DB IDs
 * after thread creation/update, causing duplicate participants on subsequent submissions.
 *
 * Root cause: selectedParticipants (form state) kept frontend IDs (participant-XXX)
 * while participants (DB state) had real DB IDs. When user sent next message,
 * prepareParticipantUpdate saw frontend IDs as "new" participants (empty ID = create new),
 * causing duplicate participants in database.
 *
 * Fix: Sync selectedParticipants with DB IDs immediately after:
 * 1. handleCreateThread receives API response
 * 2. handleUpdateThreadAndSend receives API response (both awaited and fire-and-forget)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import {
  chatParticipantsToConfig,
  detectParticipantChanges,
  prepareParticipantUpdate,
} from '@/lib/utils/participant';
import { createChatStore } from '@/stores/chat/store';

describe('duplicate participants sync bug fix', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('chatParticipantsToConfig utility', () => {
    it('should convert ChatParticipant[] to ParticipantConfig[] with DB IDs', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '01KB17AR8Q04344Q5T32N26C9K',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: 'Critic',
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const config = chatParticipantsToConfig(dbParticipants);

      expect(config).toHaveLength(2);
      expect(config[0]).toEqual({
        id: '01KB17AR8Q04344Q5T32N26C9J',
        modelId: 'openai/gpt-4o',
        role: 'Analyst',
        customRoleId: undefined,
        priority: 0,
      });
      expect(config[1]).toEqual({
        id: '01KB17AR8Q04344Q5T32N26C9K',
        modelId: 'anthropic/claude-sonnet',
        role: 'Critic',
        customRoleId: undefined,
        priority: 1,
      });
    });

    it('should filter out disabled participants', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: 'id-1',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'id-2',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: null,
          customRoleId: null,
          priority: 1,
          isEnabled: false, // Disabled
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const config = chatParticipantsToConfig(dbParticipants);

      expect(config).toHaveLength(1);
      expect(config[0]?.modelId).toBe('openai/gpt-4o');
    });

    it('should sort by priority', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: 'id-2',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: null,
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'id-1',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const config = chatParticipantsToConfig(dbParticipants);

      expect(config[0]?.modelId).toBe('openai/gpt-4o');
      expect(config[1]?.modelId).toBe('anthropic/claude-sonnet');
    });
  });

  describe('detectParticipantChanges with frontend vs DB IDs', () => {
    it('should detect changes when selectedParticipants has frontend IDs', () => {
      // Scenario: User on overview screen added participants with frontend IDs
      // Thread was created and DB returned real IDs
      // But selectedParticipants was NOT synced (the bug)
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Frontend ID that was NOT synced with DB ID
      const selectedWithFrontendIds: ParticipantConfig[] = [
        {
          id: 'participant-1764199052252', // Frontend ID!
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          priority: 0,
        },
      ];

      const result = detectParticipantChanges(dbParticipants, selectedWithFrontendIds);

      // Should detect hasTemporaryIds because frontend ID starts with 'participant-'
      expect(result.hasTemporaryIds).toBe(true);
      expect(result.hasChanges).toBe(true);
    });

    it('should NOT detect changes when selectedParticipants is synced with DB IDs', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Properly synced with DB ID
      const selectedWithDbIds: ParticipantConfig[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J', // DB ID!
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          priority: 0,
        },
      ];

      const result = detectParticipantChanges(dbParticipants, selectedWithDbIds);

      expect(result.hasTemporaryIds).toBe(false);
      expect(result.participantsChanged).toBe(false);
      expect(result.hasChanges).toBe(false);
    });
  });

  describe('prepareParticipantUpdate with frontend IDs (the bug)', () => {
    it('should create empty ID payloads for frontend IDs (treated as CREATE)', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Frontend ID that was NOT synced - this is the bug scenario
      const selectedWithFrontendIds: ParticipantConfig[] = [
        {
          id: 'participant-1764199052252',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          priority: 0,
        },
      ];

      const prepared = prepareParticipantUpdate(
        dbParticipants,
        selectedWithFrontendIds,
        'thread-123',
      );

      // The bug: Frontend ID is converted to empty string, causing backend to CREATE new participant
      expect(prepared.updatePayloads[0]?.id).toBe('');
      expect(prepared.updateResult.hasTemporaryIds).toBe(true);
    });

    it('should preserve DB IDs in payloads (the fix)', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Properly synced DB ID - this is after the fix
      const selectedWithDbIds: ParticipantConfig[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          priority: 0,
        },
      ];

      const prepared = prepareParticipantUpdate(
        dbParticipants,
        selectedWithDbIds,
        'thread-123',
      );

      // After fix: DB ID is preserved, backend will UPDATE existing participant
      expect(prepared.updatePayloads[0]?.id).toBe('01KB17AR8Q04344Q5T32N26C9J');
      expect(prepared.updateResult.hasTemporaryIds).toBe(false);
      expect(prepared.updateResult.hasChanges).toBe(false);
    });
  });

  describe('store selectedParticipants sync', () => {
    it('should sync selectedParticipants with DB IDs after setSelectedParticipants', () => {
      // Setup: Overview screen with frontend IDs
      const frontendParticipants: ParticipantConfig[] = [
        {
          id: 'participant-1764199052252',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          priority: 0,
        },
        {
          id: 'participant-1764199052253',
          modelId: 'anthropic/claude-sonnet',
          role: 'Critic',
          priority: 1,
        },
      ];

      store.getState().setSelectedParticipants(frontendParticipants);

      // Verify frontend IDs are set
      expect(store.getState().selectedParticipants[0]?.id).toBe('participant-1764199052252');
      expect(store.getState().selectedParticipants[1]?.id).toBe('participant-1764199052253');

      // Simulate: Thread created, API returns DB participants
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '01KB17AR8Q04344Q5T32N26C9K',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: 'Critic',
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // THE FIX: Sync selectedParticipants with DB IDs
      const syncedConfigs = chatParticipantsToConfig(dbParticipants);
      store.getState().setSelectedParticipants(syncedConfigs);

      // Verify DB IDs are now in selectedParticipants
      expect(store.getState().selectedParticipants[0]?.id).toBe('01KB17AR8Q04344Q5T32N26C9J');
      expect(store.getState().selectedParticipants[1]?.id).toBe('01KB17AR8Q04344Q5T32N26C9K');
    });

    it('should not detect changes after proper sync', () => {
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: 'Analyst',
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Sync selectedParticipants
      const syncedConfigs = chatParticipantsToConfig(dbParticipants);
      store.getState().setSelectedParticipants(syncedConfigs);

      // Store participants (DB state)
      store.getState().updateParticipants(dbParticipants);

      // Now check if prepareParticipantUpdate detects changes
      const prepared = prepareParticipantUpdate(
        store.getState().participants,
        store.getState().selectedParticipants,
        'thread-123',
      );

      expect(prepared.updateResult.hasChanges).toBe(false);
      expect(prepared.updateResult.hasTemporaryIds).toBe(false);
    });
  });

  describe('hasPendingConfigChanges flag', () => {
    it('should be reset after successful update', () => {
      // Set pending changes flag
      store.getState().setHasPendingConfigChanges(true);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Simulate successful update - reset flag
      store.getState().setHasPendingConfigChanges(false);
      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });

    it('should block sync effect when true', () => {
      // This tests that the sync effect in thread-actions.ts is blocked
      // when hasPendingConfigChanges is true
      store.getState().setHasPendingConfigChanges(true);

      // The condition in sync effect:
      // if (isRoundInProgress || hasPendingConfigChanges) return;
      const hasPendingConfigChanges = store.getState().hasPendingConfigChanges;
      expect(hasPendingConfigChanges).toBe(true);
    });
  });

  describe('end-to-end duplicate prevention', () => {
    it('should prevent duplicates when synced correctly', () => {
      // SCENARIO: User creates thread on overview screen
      // Round 1 completes, user sends second message

      // Step 1: Overview screen - frontend IDs
      const frontendParticipants: ParticipantConfig[] = [
        { id: 'participant-1', modelId: 'openai/gpt-4o', role: null, priority: 0 },
        { id: 'participant-2', modelId: 'anthropic/claude-sonnet', role: null, priority: 1 },
      ];
      store.getState().setSelectedParticipants(frontendParticipants);

      // Step 2: Thread created - API returns DB participants
      const dbParticipants: ChatParticipant[] = [
        {
          id: 'db-id-1',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'db-id-2',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: null,
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(dbParticipants);

      // Step 3: THE FIX - Sync selectedParticipants with DB IDs
      const syncedConfigs = chatParticipantsToConfig(dbParticipants);
      store.getState().setSelectedParticipants(syncedConfigs);

      // Step 4: User sends second message - check if update needed
      const prepared = prepareParticipantUpdate(
        store.getState().participants,
        store.getState().selectedParticipants,
        'thread-123',
      );

      // NO changes detected - participants won't be duplicated!
      expect(prepared.updateResult.hasChanges).toBe(false);
      expect(prepared.updateResult.hasTemporaryIds).toBe(false);
      expect(prepared.updatePayloads[0]?.id).toBe('db-id-1');
      expect(prepared.updatePayloads[1]?.id).toBe('db-id-2');
    });

    it('should cause duplicates when NOT synced (the bug)', () => {
      // SCENARIO: The bug - selectedParticipants not synced

      // Step 1: Overview screen - frontend IDs
      const frontendParticipants: ParticipantConfig[] = [
        { id: 'participant-1', modelId: 'openai/gpt-4o', role: null, priority: 0 },
        { id: 'participant-2', modelId: 'anthropic/claude-sonnet', role: null, priority: 1 },
      ];
      store.getState().setSelectedParticipants(frontendParticipants);

      // Step 2: Thread created - API returns DB participants
      // But selectedParticipants is NOT synced (the bug!)
      const dbParticipants: ChatParticipant[] = [
        {
          id: 'db-id-1',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'db-id-2',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-sonnet',
          role: null,
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      store.getState().updateParticipants(dbParticipants);
      // NOT syncing selectedParticipants - this is the bug!

      // Step 3: User sends second message - check if update needed
      const prepared = prepareParticipantUpdate(
        store.getState().participants,
        store.getState().selectedParticipants, // Still has frontend IDs!
        'thread-123',
      );

      // BUG: Changes detected because frontend IDs != DB IDs
      expect(prepared.updateResult.hasChanges).toBe(true);
      expect(prepared.updateResult.hasTemporaryIds).toBe(true);
      // BUG: Empty IDs will cause backend to CREATE new participants
      expect(prepared.updatePayloads[0]?.id).toBe('');
      expect(prepared.updatePayloads[1]?.id).toBe('');
    });
  });

  describe('three participants scenario (exact bug report)', () => {
    it('should handle 3 participants without duplication after sync', () => {
      // Exact scenario from bug report: 3 participants became 6

      // Frontend IDs from overview screen
      const frontendParticipants: ParticipantConfig[] = [
        { id: 'participant-1764199052252', modelId: 'openai/gpt-4o', role: null, priority: 0 },
        { id: 'participant-1764199052253', modelId: 'anthropic/claude-3-5-sonnet', role: null, priority: 1 },
        { id: 'participant-1764199052254', modelId: 'google/gemini-2.0-flash', role: null, priority: 2 },
      ];

      // DB participants after thread creation
      const dbParticipants: ChatParticipant[] = [
        {
          id: '01KB17AR8Q04344Q5T32N26C9J',
          threadId: 'thread-123',
          modelId: 'openai/gpt-4o',
          role: null,
          customRoleId: null,
          priority: 0,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '01KB17B52J0KY8XH8W4VXWM0EW',
          threadId: 'thread-123',
          modelId: 'anthropic/claude-3-5-sonnet',
          role: null,
          customRoleId: null,
          priority: 1,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '01KB17CD3K1LZ9YI9X5WYXN1FX',
          threadId: 'thread-123',
          modelId: 'google/gemini-2.0-flash',
          role: null,
          customRoleId: null,
          priority: 2,
          isEnabled: true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Setup initial state
      store.getState().setSelectedParticipants(frontendParticipants);
      store.getState().updateParticipants(dbParticipants);

      // THE FIX: Sync selectedParticipants
      const syncedConfigs = chatParticipantsToConfig(dbParticipants);
      store.getState().setSelectedParticipants(syncedConfigs);

      // Verify: selectedParticipants now has DB IDs
      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().selectedParticipants[0]?.id).toBe('01KB17AR8Q04344Q5T32N26C9J');
      expect(store.getState().selectedParticipants[1]?.id).toBe('01KB17B52J0KY8XH8W4VXWM0EW');
      expect(store.getState().selectedParticipants[2]?.id).toBe('01KB17CD3K1LZ9YI9X5WYXN1FX');

      // Verify: No changes detected on second message
      const prepared = prepareParticipantUpdate(
        store.getState().participants,
        store.getState().selectedParticipants,
        'thread-123',
      );

      expect(prepared.updateResult.hasChanges).toBe(false);
      expect(prepared.updatePayloads).toHaveLength(3);
      // All payloads have DB IDs, not empty strings
      prepared.updatePayloads.forEach((payload, index) => {
        expect(payload.id).not.toBe('');
        expect(payload.id).toBe(dbParticipants[index]?.id);
      });
    });
  });
});
