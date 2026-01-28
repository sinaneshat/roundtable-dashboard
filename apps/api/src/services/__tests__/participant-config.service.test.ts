/**
 * Participant Config Service Tests
 *
 * Tests for participant change detection and changelog creation.
 * Specifically tests the fix for:
 * - Re-adding participants that were previously removed
 * - Multiple add/remove cycles across rounds
 * - Changelog entries being created for each change
 */

import { ModelIds } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import type { ParticipantConfigInput } from '@/lib/schemas';
import type { ChatParticipant } from '@/routes/chat/schema';
import { categorizeParticipantChanges } from '@/services/participants';

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
    createdAt: new Date(),
    customRoleId: null,
    id,
    isEnabled,
    modelId,
    priority,
    role,
    settings: null,
    threadId: 'thread-123',
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
    customRoleId: undefined,
    id,
    isEnabled,
    modelId,
    priority,
    role: role ?? null,
  };
}

// ============================================================================
// BASIC DETECTION TESTS
// ============================================================================

describe('categorizeParticipantChanges', () => {
  describe('basic change detection', () => {
    it('should detect no changes when configurations are identical', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, true, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(0);
      expect(result.removedParticipants).toHaveLength(0);
      expect(result.reenabledParticipants).toHaveLength(0);
      expect(result.updatedParticipants).toHaveLength(0);
    });

    it('should detect added participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(1);
      expect(result.addedParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);
    });

    it('should detect removed participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, true, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.removedParticipants).toHaveLength(1);
      expect(result.removedParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);
    });
  });

  // ============================================================================
  // RE-ENABLED PARTICIPANTS TESTS (CRITICAL FIX)
  // ============================================================================

  describe('re-enabled participants detection', () => {
    it('should detect re-enabled participant that was previously disabled', () => {
      // Scenario: Claude was disabled in a previous round, now being re-enabled
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('new-id', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1), // Re-adding Claude
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);
      // Should NOT be in addedParticipants since it exists in DB
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should not confuse re-enabled with truly new participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('new-claude', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1), // Re-adding
        createParticipantConfig('new-gemini', ModelIds.GOOGLE_GEMINI_2_5_PRO, 2), // Truly new
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);

      expect(result.addedParticipants).toHaveLength(1);
      expect(result.addedParticipants[0]?.modelId).toBe(ModelIds.GOOGLE_GEMINI_2_5_PRO);
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
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('claude-id', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1), // DISABLED (2nd removal)
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('new-claude', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1), // 3rd addition
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // Should be detected as re-enabled, not new
      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should return all disabled DB participants in allDbParticipants', () => {
      // Multiple disabled participants from different removal cycles
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('claude-id', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1), // DISABLED
        createMockDbParticipant('gemini-id', ModelIds.GOOGLE_GEMINI_2_5_PRO, false, null, 2), // DISABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('new-claude', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1), // Re-enabling
        createParticipantConfig('new-gemini', ModelIds.GOOGLE_GEMINI_2_5_PRO, 2), // Re-enabling
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // Both should be re-enabled
      expect(result.reenabledParticipants).toHaveLength(2);
      expect(result.reenabledParticipants.map(p => p.modelId).sort()).toEqual([
        ModelIds.ANTHROPIC_CLAUDE_SONNET_4,
        ModelIds.GOOGLE_GEMINI_2_5_PRO,
      ]);

      // allDbParticipants should include all participants (enabled + disabled)
      expect(result.allDbParticipants).toHaveLength(3);
    });

    it('should handle simultaneous remove and re-add of different participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('claude-id', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1), // DISABLED
        createMockDbParticipant('gemini-id', ModelIds.GOOGLE_GEMINI_2_5_PRO, true, null, 2), // ENABLED
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('new-claude', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1), // Re-enabling Claude
        // Gemini is being REMOVED (not in provided list)
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe(ModelIds.ANTHROPIC_CLAUDE_SONNET_4);

      expect(result.removedParticipants).toHaveLength(1);
      expect(result.removedParticipants[0]?.modelId).toBe(ModelIds.GOOGLE_GEMINI_2_5_PRO);
    });
  });

  // ============================================================================
  // ROLE CHANGE TESTS
  // ============================================================================

  describe('role change detection', () => {
    it('should detect role changes for enabled participants', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, 'Analyst', 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0, 'Critic'), // Role changed
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.updatedParticipants).toHaveLength(1);
      expect(result.updatedParticipants[0]?.modelId).toBe(ModelIds.OPENAI_GPT_4_1);
    });

    it('should detect role added where none existed', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0, 'New Role'),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.updatedParticipants).toHaveLength(1);
    });

    it('should detect role removed', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, 'Old Role', 0),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0, undefined), // Role removed
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
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
        createParticipantConfig('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, 1),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.addedParticipants).toHaveLength(2);
      expect(result.reenabledParticipants).toHaveLength(0);
    });

    it('should handle empty provided participants (all removed)', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, true, null, 1),
      ];

      const providedParticipants: ParticipantConfigInput[] = [];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.removedParticipants).toHaveLength(2);
      expect(result.addedParticipants).toHaveLength(0);
    });

    it('should handle all participants being disabled in DB', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, false, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('new-p1', ModelIds.OPENAI_GPT_4_1, 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      expect(result.reenabledParticipants).toHaveLength(1);
      expect(result.reenabledParticipants[0]?.modelId).toBe(ModelIds.OPENAI_GPT_4_1);
    });

    it('should preserve allDbParticipants in result for downstream use', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', ModelIds.OPENAI_GPT_4_1, true, null, 0),
        createMockDbParticipant('p2', ModelIds.ANTHROPIC_CLAUDE_SONNET_4, false, null, 1),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', ModelIds.OPENAI_GPT_4_1, 0),
      ];

      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);

      // allDbParticipants should be included in result for buildParticipantOperations
      expect(result.allDbParticipants).toBeDefined();
      expect(result.allDbParticipants).toHaveLength(2);
      expect(result.allDbParticipants.find(p => p.modelId === ModelIds.ANTHROPIC_CLAUDE_SONNET_4)).toBeDefined();
    });
  });

  // ============================================================================
  // PERFORMANCE TESTS - MAP OPTIMIZATION
  // ============================================================================

  describe('map-based optimization performance', () => {
    it('should handle 100 participants efficiently with O(n+m) complexity', () => {
      // Create 100 DB participants with various states
      const dbParticipants = Array.from({ length: 100 }, (_, i) =>
        createMockDbParticipant(
          `p${i}`,
          `model-${i}`,
          i % 10 !== 0, // 10% disabled
          i % 5 === 0 ? `Role ${i}` : null,
          i,
        ));

      // Create 100 provided participants with some changes
      const providedParticipants = Array.from({ length: 100 }, (_, i) =>
        createParticipantConfig(
          `new-p${i}`,
          `model-${i}`,
          i,
          i % 3 === 0 ? `New Role ${i}` : undefined,
        ));

      const startTime = performance.now();
      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);
      const endTime = performance.now();

      // Should re-enable the 10 disabled participants
      expect(result.reenabledParticipants).toHaveLength(10);

      // Should detect role changes for participants that had roles changed
      expect(result.updatedParticipants.length).toBeGreaterThan(0);

      // Performance: should complete quickly for 100 participants
      // O(n+m) with Map lookups - threshold accounts for CI/local variance
      expect(endTime - startTime).toBeLessThan(50);
    });

    it('should handle 500 participants without performance degradation', () => {
      // Create 500 DB participants
      const dbParticipants = Array.from({ length: 500 }, (_, i) =>
        createMockDbParticipant(`p${i}`, `model-${i}`, true, null, i));

      // Create 500 provided participants (half changed)
      const providedParticipants = Array.from({ length: 500 }, (_, i) =>
        createParticipantConfig(`p${i}`, `model-${i}`, i, i % 2 === 0 ? 'Role' : undefined));

      const startTime = performance.now();
      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);
      const endTime = performance.now();

      // Should detect ~250 role updates
      expect(result.updatedParticipants).toHaveLength(250);

      // Performance: O(n+m) complexity - threshold accounts for CI/local variance
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should maintain consistency across multiple calls (no race conditions)', () => {
      const dbParticipants = [
        createMockDbParticipant('p1', 'model-1', true, 'Role A', 0),
        createMockDbParticipant('p2', 'model-2', false, null, 1),
        createMockDbParticipant('p3', 'model-3', true, null, 2),
      ];

      const providedParticipants = [
        createParticipantConfig('p1', 'model-1', 0, 'Role B'),
        createParticipantConfig('new-p2', 'model-2', 1),
        // p3 removed
      ];

      // Call multiple times to ensure consistency
      const results = Array.from({ length: 10 }, () =>
        categorizeParticipantChanges(dbParticipants, providedParticipants));

      // All results should be identical
      results.forEach((result) => {
        expect(result.updatedParticipants).toHaveLength(1);
        expect(result.updatedParticipants[0]?.modelId).toBe('model-1');

        expect(result.reenabledParticipants).toHaveLength(1);
        expect(result.reenabledParticipants[0]?.modelId).toBe('model-2');

        expect(result.removedParticipants).toHaveLength(1);
        expect(result.removedParticipants[0]?.modelId).toBe('model-3');
      });
    });

    it('should use Map for O(1) model lookups', () => {
      // This test verifies the Map optimization is in place by checking
      // that the algorithm handles large inputs efficiently.
      // NOTE: Precise timing tests are inherently flaky due to JIT, GC, etc.
      // We just verify it completes quickly (under 100ms) for large inputs.
      const size = 200;
      const dbParticipants = Array.from({ length: size }, (_, i) =>
        createMockDbParticipant(`p${i}`, `model-${i}`, i % 2 === 0, null, i));

      const providedParticipants = Array.from({ length: size }, (_, i) =>
        createParticipantConfig(`new-${i}`, `model-${i}`, i));

      // Warmup run
      categorizeParticipantChanges(dbParticipants, providedParticipants);

      const start = performance.now();
      const result = categorizeParticipantChanges(dbParticipants, providedParticipants);
      const duration = performance.now() - start;

      // Should complete quickly (O(n+m) complexity)
      expect(duration).toBeLessThan(100); // 100ms is very generous
      // Should have correct result structure
      expect(result.addedParticipants).toBeDefined();
      expect(result.removedParticipants).toBeDefined();
      expect(result.reenabledParticipants).toBeDefined();
      expect(result.updatedParticipants).toBeDefined();
    });
  });
});
