/**
 * Moderator Analysis Service Tests
 *
 * Tests for buildModeratorSystemPrompt and buildModeratorUserPrompt functions.
 * Ensures all prompts use dynamic placeholder syntax instead of hardcoded values.
 *
 * Critical: The AI moderator must compute ALL analysis values from actual conversation,
 * not copy template/example values.
 *
 * @module api/services/__tests__/moderator-analysis.service.test
 */

import { describe, expect, it } from 'vitest';

import { ChatModes } from '@/api/core/enums';

import type { ModeratorPromptConfig } from '../moderator-analysis.service';
import {
  buildModeratorSystemPrompt,
  buildModeratorUserPrompt,
} from '../moderator-analysis.service';

// ============================================================================
// Test Fixtures
// ============================================================================

function createValidConfig(overrides?: Partial<ModeratorPromptConfig>): ModeratorPromptConfig {
  return {
    mode: ChatModes.ANALYZING,
    roundNumber: 0,
    userQuestion: 'What are the best practices for API design?',
    participantResponses: [
      {
        participantIndex: 0,
        participantRole: 'Technical Lead',
        modelId: 'anthropic/claude-sonnet-4',
        modelName: 'Claude Sonnet 4',
        responseContent: 'REST APIs should follow consistent naming conventions...',
      },
      {
        participantIndex: 1,
        participantRole: 'Security Expert',
        modelId: 'openai/gpt-4o',
        modelName: 'GPT-4o',
        responseContent: 'Security considerations include authentication...',
      },
    ],
    userTier: 'pro',
    ...overrides,
  };
}

describe('moderator-analysis.service', () => {
  // ============================================================================
  // buildModeratorSystemPrompt Tests
  // ============================================================================
  describe('buildModeratorSystemPrompt', () => {
    describe('dynamic value requirements', () => {
      it('should contain critical instruction about dynamic computation', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('CRITICAL: ALL VALUES MUST BE DYNAMICALLY COMPUTED');
        expect(prompt).toContain('Calculate based on actual vote distribution');
        expect(prompt).toContain('Derive from how agreement evolved');
      });

      it('should use placeholder syntax for roundNumber', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<ROUND_NUMBER_FROM_CONTEXT>');
        expect(prompt).not.toMatch(/"roundNumber":\s*0,/);
      });

      it('should use placeholder syntax for roundConfidence', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<CALCULATED_0_TO_100>');
        // Should NOT contain hardcoded confidence values like 78
        expect(prompt).not.toMatch(/"roundConfidence":\s*\d+,/);
      });

      it('should use placeholder syntax for consensusEvolution percentages', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<CALCULATED_INITIAL_CONSENSUS>');
        expect(prompt).toContain('<CALCULATED_AFTER_REBUTTALS>');
        expect(prompt).toContain('<CALCULATED_AFTER_EXAMINATION>');
        expect(prompt).toContain('<CALCULATED_AFTER_SYNTHESIS>');
        expect(prompt).toContain('<MUST_MATCH_ROUND_CONFIDENCE>');
        // Should NOT contain hardcoded percentages like 32, 58, 65, 72, 78
        expect(prompt).not.toMatch(/"percentage":\s*32/);
        expect(prompt).not.toMatch(/"percentage":\s*58/);
        expect(prompt).not.toMatch(/"percentage":\s*65/);
        expect(prompt).not.toMatch(/"percentage":\s*72/);
        expect(prompt).not.toMatch(/"percentage":\s*78/);
      });

      it('should use placeholder syntax for scorecard values', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<SCORE_0_100_BASED_ON_RESPONSE>');
        // Should NOT contain hardcoded scores like 82, 70, 95, 88, 75
        expect(prompt).not.toMatch(/"logic":\s*82/);
        expect(prompt).not.toMatch(/"riskAwareness":\s*70/);
        expect(prompt).not.toMatch(/"creativity":\s*95/);
      });

      it('should use placeholder syntax for participant data', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<INDEX_FROM_PARTICIPANT_DATA>');
        expect(prompt).toContain('<ROLE_FROM_PARTICIPANT_DATA>');
        expect(prompt).toContain('<MODEL_ID_FROM_PARTICIPANT_DATA>');
        expect(prompt).toContain('<MODEL_NAME_FROM_PARTICIPANT_DATA>');
      });

      it('should use placeholder syntax for consensus analysis', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<COUNT_CLAIMS_FROM_DISCUSSION>');
        expect(prompt).toContain('<COUNT_WHERE_MAJORITY_AGREES>');
        expect(prompt).toContain('<COUNT_DISPUTED_CLAIMS>');
        expect(prompt).toContain('<ACTUAL_CONTESTED_CLAIM_FROM_DISCUSSION>');
      });

      it('should use placeholder syntax for evidence coverage', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<CALCULATED_EVIDENCE_STRENGTH_0_100>');
        // Should NOT contain hardcoded evidence percentages like 95, 65
        expect(prompt).not.toMatch(/"percentage":\s*95/);
      });

      it('should use placeholder syntax for participation counts', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('<COUNT_APPROVE_VOTES>');
        expect(prompt).toContain('<COUNT_CAUTION_VOTES>');
        expect(prompt).toContain('<COUNT_REJECT_VOTES>');
        // Should NOT contain hardcoded vote counts like 3, 1, 0
        expect(prompt).not.toMatch(/"approved":\s*3/);
        expect(prompt).not.toMatch(/"cautioned":\s*1/);
      });
    });

    describe('mode-specific rating criteria', () => {
      it('should include analyzing criteria for analyzing mode', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig({ mode: ChatModes.ANALYZING }));

        expect(prompt).toContain('Analytical Depth');
        expect(prompt).toContain('Evidence & Reasoning');
        expect(prompt).toContain('Objectivity');
      });

      it('should include brainstorming criteria for brainstorming mode', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig({ mode: ChatModes.BRAINSTORMING }));

        expect(prompt).toContain('Creativity');
        expect(prompt).toContain('Diversity');
        expect(prompt).toContain('Practicality');
      });

      it('should include debating criteria for debating mode', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig({ mode: ChatModes.DEBATING }));

        expect(prompt).toContain('Argument Strength');
        expect(prompt).toContain('Counter-Arguments');
        expect(prompt).toContain('Persuasiveness');
      });

      it('should include solving criteria for solving mode', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig({ mode: ChatModes.SOLVING }));

        expect(prompt).toContain('Solution Quality');
        expect(prompt).toContain('Feasibility');
        expect(prompt).toContain('Risk Mitigation');
      });
    });

    describe('key requirements section', () => {
      it('should specify consensus evolution calculation requirements', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('opening: Initial positions (typically low consensus, 20-40%)');
        expect(prompt).toContain('final_vote: Final consensus (matches roundConfidence)');
      });

      it('should specify evidence strength classification', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('"strong" (75%+)');
        expect(prompt).toContain('"moderate" (50-74%)');
        expect(prompt).toContain('"weak" (<50%)');
      });
    });

    describe('validation', () => {
      it('should throw for invalid config', () => {
        const invalidConfig = {
          mode: 'invalid_mode',
          roundNumber: -1,
          userQuestion: '',
          participantResponses: [],
        };

        expect(() => buildModeratorSystemPrompt(invalidConfig as ModeratorPromptConfig)).toThrow();
      });

      it('should accept valid config for all modes', () => {
        const modes = [ChatModes.ANALYZING, ChatModes.BRAINSTORMING, ChatModes.DEBATING, ChatModes.SOLVING];

        for (const mode of modes) {
          const prompt = buildModeratorSystemPrompt(createValidConfig({ mode }));
          expect(prompt).toBeTruthy();
          expect(prompt.length).toBeGreaterThan(1000);
        }
      });
    });
  });

  // ============================================================================
  // buildModeratorUserPrompt Tests
  // ============================================================================
  describe('buildModeratorUserPrompt', () => {
    it('should include round number from config', () => {
      const prompt = buildModeratorUserPrompt(createValidConfig({ roundNumber: 2 }));

      expect(prompt).toContain('round 2');
    });

    it('should include user question', () => {
      const userQuestion = 'How do we implement OAuth2?';
      const prompt = buildModeratorUserPrompt(createValidConfig({ userQuestion }));

      expect(prompt).toContain(userQuestion);
    });

    it('should include all participant responses', () => {
      const config = createValidConfig();
      const prompt = buildModeratorUserPrompt(config);

      expect(prompt).toContain('Participant 1');
      expect(prompt).toContain('Technical Lead');
      expect(prompt).toContain('anthropic/claude-sonnet-4');
      expect(prompt).toContain('REST APIs should follow');

      expect(prompt).toContain('Participant 2');
      expect(prompt).toContain('Security Expert');
      expect(prompt).toContain('openai/gpt-4o');
      expect(prompt).toContain('Security considerations');
    });

    it('should include changelog entries when provided', () => {
      const config = createValidConfig({
        changelogEntries: [
          {
            changeType: 'participant_added',
            description: 'Added new participant',
            metadata: { type: 'participant', modelId: 'test/model', role: 'Tester' },
            createdAt: new Date('2025-01-15T10:00:00Z'),
          },
        ],
      });
      const prompt = buildModeratorUserPrompt(config);

      expect(prompt).toContain('Recent Changes');
      expect(prompt).toContain('participant_added');
      expect(prompt).toContain('Added new participant');
    });

    it('should include task instructions', () => {
      const config = createValidConfig();
      const prompt = buildModeratorUserPrompt(config);

      expect(prompt).toContain('Your Task');
      expect(prompt).toContain('Analyze all 2 participants');
    });
  });
});
