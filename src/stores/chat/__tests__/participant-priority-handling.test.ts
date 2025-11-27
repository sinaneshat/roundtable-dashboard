/**
 * Participant Priority Handling Tests
 *
 * Tests the critical fix for participant priority calculation bug.
 *
 * ROOT CAUSE: When toggling/adding participants in handleToggleModel,
 * the priority was incorrectly set using modelOrder.indexOf(modelId)
 * which gives the model's position in the FULL model list (21, 25, 29)
 * instead of the SELECTION order (0, 1, 2).
 *
 * This caused:
 * 1. Participants created with wrong priorities in database
 * 2. When priorities were reindexed later, new participants were created
 * 3. Resulted in duplicate participants with same modelId but different IDs
 *
 * FIX:
 * 1. After toggling/adding participants, sort by visual order
 * 2. Reindex priorities to 0, 1, 2, ... based on sorted order
 * 3. Added unique constraint on (threadId, modelId) in database
 * 4. Fixed participantsRef sync in useMultiParticipantChat hook
 *
 * @see ChatThreadScreen.tsx handleToggleModel
 * @see ChatOverviewScreen.tsx handleToggleModel
 * @see chat.ts uniqueIndex on (threadId, modelId)
 */

import { describe, expect, it } from 'vitest';

import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

describe('participant Priority Handling', () => {
  // Mock model order (simulates the full list of available models)
  // Need 30+ entries to test indices 21, 25, 29
  const mockModelOrder = [
    'openai/gpt-4', // index 0
    'openai/gpt-4o', // index 1
    'anthropic/claude-3-opus', // index 2
    'anthropic/claude-3-sonnet', // index 3
    'google/gemini-pro', // index 4
    'meta/llama-3', // index 5
    'meta/llama-3.1', // index 6
    'mistral/mistral-large', // index 7
    'mistral/mixtral-8x7b', // index 8
    'cohere/command-r', // index 9
    'cohere/command-r-plus', // index 10
    'openai/gpt-3.5-turbo', // index 11
    'anthropic/claude-2', // index 12
    'google/palm-2', // index 13
    'ai21/jurassic-2', // index 14
    'perplexity/pplx-70b', // index 15
    'together/stripedhyena', // index 16
    'anyscale/mistral', // index 17
    'fireworks/llama', // index 18
    'replicate/llama', // index 19
    'deepinfra/llama', // index 20
    'google/gemini-2.5-flash-lite', // index 21
    'openai/gpt-4-vision', // index 22
    'anthropic/claude-3-haiku', // index 23
    'google/gemini-nano', // index 24
    'anthropic/claude-sonnet-4', // index 25
    'meta/llama-2-70b', // index 26
    'mistral/mistral-small', // index 27
    'cohere/command', // index 28
    'deepseek/deepseek-r1', // index 29
  ];

  // Helper to simulate the FIXED handleToggleModel logic
  const addParticipantWithCorrectPriority = (
    selectedParticipants: ParticipantConfig[],
    modelId: string,
    modelOrder: string[],
  ): ParticipantConfig[] => {
    const newParticipant: ParticipantConfig = {
      id: `participant-${Date.now()}`,
      modelId,
      role: '',
      priority: selectedParticipants.length, // Temp priority
    };

    // ✅ CORRECT: Sort by visual order, then reindex priorities to 0, 1, 2, ...
    const updated = [...selectedParticipants, newParticipant].sort((a, b) => {
      const aIdx = modelOrder.indexOf(a.modelId);
      const bIdx = modelOrder.indexOf(b.modelId);
      return aIdx - bIdx;
    });

    return updated.map((p, index) => ({ ...p, priority: index }));
  };

  // Helper to simulate the BUGGY handleToggleModel logic (for comparison)
  const addParticipantWithBuggyPriority = (
    selectedParticipants: ParticipantConfig[],
    modelId: string,
    modelOrder: string[],
  ): ParticipantConfig[] => {
    const visualIndex = modelOrder.indexOf(modelId);
    const newParticipant: ParticipantConfig = {
      id: `participant-${Date.now()}`,
      modelId,
      role: '',
      priority: visualIndex, // BUG: Uses model list index!
    };

    const updated = [...selectedParticipants, newParticipant]
      .map(p => ({
        ...p,
        priority: modelOrder.indexOf(p.modelId), // BUG: Uses model list index!
      }))
      .sort((a, b) => a.priority - b.priority);

    return updated;
  };

  describe('priority Calculation (Fixed)', () => {
    it('should set priorities to 0, 1, 2 when adding participants', () => {
      let participants: ParticipantConfig[] = [];

      // Add first participant (from index 21 in model list)
      participants = addParticipantWithCorrectPriority(
        participants,
        'google/gemini-2.5-flash-lite',
        mockModelOrder,
      );

      expect(participants).toHaveLength(1);
      expect(participants[0].priority).toBe(0);
      expect(participants[0].modelId).toBe('google/gemini-2.5-flash-lite');

      // Add second participant (from index 25 in model list)
      participants = addParticipantWithCorrectPriority(
        participants,
        'anthropic/claude-sonnet-4',
        mockModelOrder,
      );

      expect(participants).toHaveLength(2);
      // Should be sorted by model order, with priorities 0, 1
      expect(participants[0].priority).toBe(0);
      expect(participants[1].priority).toBe(1);

      // Add third participant (from index 29 in model list)
      participants = addParticipantWithCorrectPriority(
        participants,
        'deepseek/deepseek-r1',
        mockModelOrder,
      );

      expect(participants).toHaveLength(3);
      // Priorities should be 0, 1, 2 (NOT 21, 25, 29!)
      expect(participants.map(p => p.priority)).toEqual([0, 1, 2]);
    });

    it('should reindex priorities after removing a participant', () => {
      // Start with 3 participants
      const participants: ParticipantConfig[] = [
        { id: 'p1', modelId: 'openai/gpt-4', role: '', priority: 0 },
        { id: 'p2', modelId: 'google/gemini-pro', role: '', priority: 1 },
        { id: 'p3', modelId: 'deepseek/deepseek-r1', role: '', priority: 2 },
      ];

      // Remove the middle participant
      const filtered = participants.filter(p => p.id !== 'p2');

      // Reindex using the fixed logic
      const sortedByVisualOrder = filtered.sort((a, b) => {
        const aIdx = mockModelOrder.indexOf(a.modelId);
        const bIdx = mockModelOrder.indexOf(b.modelId);
        return aIdx - bIdx;
      });
      const reindexed = sortedByVisualOrder.map((p, index) => ({ ...p, priority: index }));

      expect(reindexed).toHaveLength(2);
      expect(reindexed.map(p => p.priority)).toEqual([0, 1]);
    });

    it('should maintain correct priorities when models are added in different order', () => {
      let participants: ParticipantConfig[] = [];

      // Add in reverse order of model list
      participants = addParticipantWithCorrectPriority(
        participants,
        'deepseek/deepseek-r1', // index 29
        mockModelOrder,
      );
      participants = addParticipantWithCorrectPriority(
        participants,
        'openai/gpt-4', // index 0
        mockModelOrder,
      );
      participants = addParticipantWithCorrectPriority(
        participants,
        'google/gemini-pro', // index 4
        mockModelOrder,
      );

      // Should be sorted by model order with priorities 0, 1, 2
      expect(participants[0].modelId).toBe('openai/gpt-4');
      expect(participants[0].priority).toBe(0);
      expect(participants[1].modelId).toBe('google/gemini-pro');
      expect(participants[1].priority).toBe(1);
      expect(participants[2].modelId).toBe('deepseek/deepseek-r1');
      expect(participants[2].priority).toBe(2);
    });
  });

  describe('priority Bug Detection (Regression)', () => {
    it('should detect buggy priorities that use model list indices', () => {
      let participants: ParticipantConfig[] = [];

      // Simulate the BUG: priorities match model list indices
      participants = addParticipantWithBuggyPriority(
        participants,
        'google/gemini-2.5-flash-lite', // index 21
        mockModelOrder,
      );

      // Bug: priority is 21 instead of 0
      expect(participants[0].priority).toBe(21);

      participants = addParticipantWithBuggyPriority(
        participants,
        'anthropic/claude-sonnet-4', // index 25
        mockModelOrder,
      );

      // Bug: priorities are 21, 25 instead of 0, 1
      expect(participants.map(p => p.priority)).toEqual([21, 25]);

      participants = addParticipantWithBuggyPriority(
        participants,
        'deepseek/deepseek-r1', // index 29
        mockModelOrder,
      );

      // Bug: priorities are 21, 25, 29 instead of 0, 1, 2
      expect(participants.map(p => p.priority)).toEqual([21, 25, 29]);

      // This is the exact bug pattern the user reported!
    });
  });

  describe('duplicate Detection', () => {
    it('should detect if same modelId appears twice with different IDs', () => {
      const participants: ParticipantConfig[] = [
        { id: 'real-id-1', modelId: 'google/gemini-2.5-flash-lite', role: '', priority: 0 },
        { id: 'real-id-2', modelId: 'google/gemini-2.5-flash-lite', role: '', priority: 21 }, // DUPLICATE!
        { id: 'real-id-3', modelId: 'anthropic/claude-sonnet-4', role: '', priority: 1 },
        { id: 'real-id-4', modelId: 'anthropic/claude-sonnet-4', role: '', priority: 25 }, // DUPLICATE!
      ];

      // Detect duplicates by modelId
      const modelIdCounts = new Map<string, number>();
      for (const p of participants) {
        modelIdCounts.set(p.modelId, (modelIdCounts.get(p.modelId) || 0) + 1);
      }

      const duplicates = Array.from(modelIdCounts.entries()).filter(([, count]) => count > 1);

      expect(duplicates).toHaveLength(2);
      expect(duplicates.map(([modelId]) => modelId)).toContain('google/gemini-2.5-flash-lite');
      expect(duplicates.map(([modelId]) => modelId)).toContain('anthropic/claude-sonnet-4');
    });

    it('should validate that priorities are sequential starting from 0', () => {
      const correctParticipants: ParticipantConfig[] = [
        { id: 'p1', modelId: 'model-1', role: '', priority: 0 },
        { id: 'p2', modelId: 'model-2', role: '', priority: 1 },
        { id: 'p3', modelId: 'model-3', role: '', priority: 2 },
      ];

      const buggyParticipants: ParticipantConfig[] = [
        { id: 'p1', modelId: 'model-1', role: '', priority: 21 },
        { id: 'p2', modelId: 'model-2', role: '', priority: 25 },
        { id: 'p3', modelId: 'model-3', role: '', priority: 29 },
      ];

      // Validation: priorities should be 0, 1, 2, ... (sequential from 0)
      const validatePriorities = (participants: ParticipantConfig[]): boolean => {
        const sorted = [...participants].sort((a, b) => a.priority - b.priority);
        return sorted.every((p, idx) => p.priority === idx);
      };

      expect(validatePriorities(correctParticipants)).toBe(true);
      expect(validatePriorities(buggyParticipants)).toBe(false);
    });
  });

  describe('participant Deduplication', () => {
    it('should deduplicate participants by modelId', () => {
      const participants: ParticipantConfig[] = [
        { id: 'real-1', modelId: 'google/gemini-2.5-flash-lite', role: '', priority: 0 },
        { id: 'real-2', modelId: 'google/gemini-2.5-flash-lite', role: '', priority: 21 }, // Duplicate
        { id: 'real-3', modelId: 'anthropic/claude-sonnet-4', role: '', priority: 1 },
      ];

      // Deduplicate by keeping first occurrence of each modelId
      const seen = new Set<string>();
      const deduplicated = participants.filter((p) => {
        if (seen.has(p.modelId)) {
          return false;
        }
        seen.add(p.modelId);
        return true;
      });

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.map(p => p.modelId)).toEqual([
        'google/gemini-2.5-flash-lite',
        'anthropic/claude-sonnet-4',
      ]);

      // Reindex priorities after deduplication
      const reindexed = deduplicated.map((p, index) => ({ ...p, priority: index }));
      expect(reindexed.map(p => p.priority)).toEqual([0, 1]);
    });
  });
});
