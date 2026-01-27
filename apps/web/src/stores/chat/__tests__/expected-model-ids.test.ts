/**
 * Expected Model IDs Field Type Verification Tests
 *
 * Tests to verify that expectedModelIds contains model IDs (e.g., 'openai/gpt-5-mini')
 * and NOT participant IDs (ULIDs like '01KFYBHWQDHPT1KM0G07Q8YVQQ').
 *
 * Background:
 * - Participant IDs are ULIDs (e.g., '01KFYBHWQDHPT1KM0G07Q8YVQQ')
 * - Model IDs are provider/model paths (e.g., 'openai/gpt-5-mini', 'anthropic/claude-haiku-4.5')
 * - The expectedModelIds field tracks which models are expected to respond in a round
 *
 * This was previously named expectedParticipantIds which was semantically incorrect.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipant,
  createParticipantConfig,
} from '@/lib/testing';
import { getEnabledParticipantModelIds } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

describe('expectedModelIds Field Type Verification', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('field semantics', () => {
    it('should store model IDs, not participant IDs', () => {
      // Setup: Create participants with distinct IDs and modelIds
      const participants = [
        createMockParticipant(0, {
          id: '01KFYBHWQDHPT1KM0G07Q8YVQQ', // ULID participant ID
          modelId: 'openai/gpt-5-mini', // Model ID (provider/model path)
        }),
        createMockParticipant(1, {
          id: '01KFYBHWQDHPT2ABCD1234567', // ULID participant ID
          modelId: 'anthropic/claude-haiku-4.5', // Model ID
        }),
      ];

      store.getState().updateParticipants(participants);

      // Extract model IDs using the utility function
      const modelIds = getEnabledParticipantModelIds(participants);

      // Set expected model IDs
      store.getState().setExpectedModelIds(modelIds);

      // Verify: Field contains model IDs (provider/model format)
      const result = store.getState().expectedModelIds;
      expect(result).toBeDefined();
      expect(result).toHaveLength(2);

      // Verify format: model IDs contain '/' (provider/model)
      result?.forEach((id) => {
        expect(id).toContain('/');
      });

      // Verify specific values
      expect(result).toContain('openai/gpt-5-mini');
      expect(result).toContain('anthropic/claude-haiku-4.5');

      // Verify: Should NOT contain participant IDs (ULIDs)
      expect(result).not.toContain('01KFYBHWQDHPT1KM0G07Q8YVQQ');
      expect(result).not.toContain('01KFYBHWQDHPT2ABCD1234567');
    });

    it('should only include enabled participants model IDs', () => {
      const participants = [
        createMockParticipant(0, {
          id: 'participant-1',
          isEnabled: true,
          modelId: 'openai/gpt-4o',
        }),
        createMockParticipant(1, {
          id: 'participant-2',
          isEnabled: false, // Disabled
          modelId: 'anthropic/claude-3',
        }),
        createMockParticipant(2, {
          id: 'participant-3',
          isEnabled: true,
          modelId: 'google/gemini-2.5-flash',
        }),
      ];

      const modelIds = getEnabledParticipantModelIds(participants);
      store.getState().setExpectedModelIds(modelIds);

      const result = store.getState().expectedModelIds;
      expect(result).toHaveLength(2);
      expect(result).toContain('openai/gpt-4o');
      expect(result).toContain('google/gemini-2.5-flash');
      expect(result).not.toContain('anthropic/claude-3'); // Disabled participant excluded
    });
  });

  describe('batchUpdatePendingState', () => {
    it('should update expectedModelIds with model IDs', () => {
      const modelIds = [
        'openai/gpt-5-mini',
        'google/gemini-2.5-flash',
        'anthropic/claude-haiku-4.5',
      ];

      store.getState().batchUpdatePendingState('Test message', modelIds);

      const result = store.getState().expectedModelIds;
      expect(result).toEqual(modelIds);
      expect(store.getState().pendingMessage).toBe('Test message');
    });
  });

  describe('setExpectedModelIds', () => {
    it('should accept null to clear expected model IDs', () => {
      // First set some model IDs
      store.getState().setExpectedModelIds(['openai/gpt-4o']);
      expect(store.getState().expectedModelIds).toHaveLength(1);

      // Then clear
      store.getState().setExpectedModelIds(null);
      expect(store.getState().expectedModelIds).toBeNull();
    });

    it('should accept empty array', () => {
      store.getState().setExpectedModelIds([]);
      expect(store.getState().expectedModelIds).toEqual([]);
    });
  });

  describe('integration with participant configs', () => {
    it('should extract model IDs from ParticipantConfig array', () => {
      const configs = [
        createParticipantConfig(0, {
          id: 'participant-abc',
          modelId: 'openai/o4-mini',
        }),
        createParticipantConfig(1, {
          id: 'participant-def',
          modelId: 'deepseek/deepseek-chat-v3',
        }),
      ];

      // ParticipantConfig also has modelId field
      const modelIds = configs.map(c => c.modelId);
      store.getState().setExpectedModelIds(modelIds);

      expect(store.getState().expectedModelIds).toEqual([
        'openai/o4-mini',
        'deepseek/deepseek-chat-v3',
      ]);
    });
  });
});
