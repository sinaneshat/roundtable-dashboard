/**
 * Participant Config Service Tests
 *
 * Tests for participant change detection and changelog creation.
 * Specifically tests the fix for:
 * - Re-adding participants that were previously removed
 * - Multiple add/remove cycles across rounds
 * - Changelog entries being created for each change
 */

import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { ParticipantConfigInput } from '@/lib/schemas/participant-schemas';

import { categorizeParticipantChanges } from '../participant-config.service';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

function createMockDbParticipant(
  id: string,
  modelId: string,
  isEnabled = true,
  role: string | null = null,
  priority = 0,
): ChatParticipant {
  return {
    id,
    threadId: 'thread-123',
    modelId,
    role,
    customRoleId: null,
    priority,
    isEnabled,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createParticipantConfig(
  id: string,
  modelId: string,
  priority: number,
  role?: string,
  isEnabled = true,
): ParticipantConfigInput {
  return {
    id,
    modelId,
    role: role ?? null,
    customRoleId: undefined,
    priority,
    isEnabled,
  };
}

// ============================================================================
// BASIC DETECTION TESTS
// ============================================================================

describe('categorizeParticipantChanges', () => {
  describe('basic change detection', () => {
    it('should detect no changes when configurations are identical', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', true, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('p2', 'anthropic/claude-3', 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(0);
      expect(result.removedParticipants).toHaveLength(0);
      expect(result.reenabledParticipants).toHaveLength(0);
      expect(result.updatedParticipants).toHaveLength(0);
    });

    it('should detect added participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('p2', 'anthropic/claude-3', 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(1);
      expect(result.addedParticipants[0]?.modelId).toBe('anthropic/claude-3');
    });

    it('should detect removed participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', true, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.removedParticipants).toHaveLength(1);
      expect(result.removedParticipants[0]?.modelId).toBe('anthropic/claude-3');
    });
  });

  // ============================================================================
  // RE-ENABLED PARTICIPANTS TESTS (CRITICAL FIX)
  // ============================================================================

  describe('re-enabled participants detection', () => {
    it('should detect re-enabled participant that was previously disabled', () => {
      // Scenario: Claude was disabled in a previous round, now being re-enabled
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', false, null, 1), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('new-id', 'anthropic/claude-3', 1), // Re-adding Claude
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe('anthropic/claude-3');
      // Should NOT be in addedParticipants since it exists in DB
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should not confuse re-enabled with truly new participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', false, null, 1), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('new-claude', 'anthropic/claude-3', 1), // Re-adding
        createParticipantConfig('new-gemini', 'google/gemini-pro', 2), // Truly new
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe('anthropic/claude-3');

      expect(result.addedParticipants).toHaveLength(1);
      expect(result.addedParticipants[0]?.modelId).toBe('google/gemini-pro');
    });
  });

  // ============================================================================
  // MULTIPLE ADD/REMOVE CYCLE TESTS (CRITICAL FIX)
  // ============================================================================

  describe('multiple add/remove cycles', () => {
    it('should detect re-enabled participant after multiple cycles', () => {
      // Scenario: Claude was added, removed, added, removed, now adding again
      // The DB participant is disabled from the last removal
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('claude-id', 'anthropic/claude-3', false, null, 1), // DISABLED (2nd removal)
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('new-claude', 'anthropic/claude-3', 1), // 3rd addition
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // Should be detected as re-enabled, not new
      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe('anthropic/claude-3');
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should return all disabled DB participants in allDbParticipants', () => {
      // Multiple disabled participants from different removal cycles
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('claude-id', 'anthropic/claude-3', false, null, 1), // DISABLED
        createMockDbParticipant('gemini-id', 'google/gemini-pro', false, null, 2), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('new-claude', 'anthropic/claude-3', 1), // Re-enabling
        createParticipantConfig('new-gemini', 'google/gemini-pro', 2), // Re-enabling
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // Both should be re-enabled
      expect(result.reenabledParticipants).toHaveLength(2);
      expect(result.reenabledParticipants.map(p => p.modelId).sort()).toEqual([
        'anthropic/claude-3',
        'google/gemini-pro',
      ]);

      // allDbParticipants should include all participants (enabled + disabled)
      expect(result.allDbParticipants).toHaveLength(3);
    });

    it('should handle simultaneous remove and re-add of different participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('claude-id', 'anthropic/claude-3', false, null, 1), // DISABLED
        createMockDbParticipant('gemini-id', 'google/gemini-pro', true, null, 2), // ENABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('new-claude', 'anthropic/claude-3', 1), // Re-enabling Claude
        // Gemini is being REMOVED (not in provided list)
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe('anthropic/claude-3');

      expect(result.removedParticipants).toHaveLength(1);
      expect(result.removedParticipants[0]?.modelId).toBe('google/gemini-pro');
    });
  });

  // ============================================================================
  // ROLE CHANGE TESTS
  // ============================================================================

  describe('role change detection', () => {
    it('should detect role changes for enabled participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, 'Analyst', 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0, 'Critic'), // Role changed
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.updatedParticipants).toHaveLength(1);
      expect(result.updatedParticipants[0]?.modelId).toBe('openai/gpt-4');
    });

    it('should detect role added where none existed', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0, 'New Role'),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.updatedParticipants).toHaveLength(1);
    });

    it('should detect role removed', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, 'Old Role', 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0, undefined), // Role removed
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.updatedParticipants).toHaveLength(1);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty DB participants (new thread)', () => {
      const dbParticipants: ChatParticipant[] = [];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
        createParticipantConfig('p2', 'anthropic/claude-3', 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(2);
      expect(result.reenabledParticipants).toHaveLength(0);
    });

    it('should handle empty provided participants (all removed)', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', true, null, 1),
      ];

      const providedParticipants: ParticipantConfigInput[] = [];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.removedParticipants).toHaveLength(2);
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should handle all participants being disabled in DB', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', false, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', false, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('new-p1', 'openai/gpt-4', 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe('openai/gpt-4');
    });

    it('should preserve allDbParticipants in result for downstream use', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'openai/gpt-4', true, null, 0),
        createMockDbParticipant('p2', 'anthropic/claude-3', false, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'openai/gpt-4', 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // allDbParticipants should be included in result for buildParticipantOperations
      expect(result.allDbParticipants).toBeDefined();
      expect(result.allDbParticipants).toHaveLength(2);
      expect(result.allDbParticipants.find(p => p.modelId === 'anthropic/claude-3')).toBeDefined();
    });
  });
});
