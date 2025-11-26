/**
 * Moderator Analysis Service Tests
 *
 * Tests for buildModeratorSystemPrompt and buildModeratorUserPrompt functions.
 * Ensures prompts contain proper structure for AI moderator analysis with
 * clear instructions for dynamic value computation.
 *
 * The implementation uses concrete JSON examples with explicit instructions
 * that all values must be dynamically computed from the actual conversation.
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

      it('should include JSON example structure for roundNumber', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        // Should contain example JSON structure showing expected output format
        expect(prompt).toContain('"roundNumber"');
        expect(prompt).toContain('"mode"');
      });

      it('should include example structure for roundConfidence', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        // Should contain roundConfidence in the example structure
        expect(prompt).toContain('"roundConfidence"');
        expect(prompt).toContain('"confidenceWeighting"');
      });

      it('should include consensusEvolution phases in example', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        // Should demonstrate the 5 phases of consensus evolution
        expect(prompt).toContain('"consensusEvolution"');
        expect(prompt).toContain('"opening"');
        expect(prompt).toContain('"rebuttal"');
        expect(prompt).toContain('"cross_exam"');
        expect(prompt).toContain('"synthesis"');
        expect(prompt).toContain('"final_vote"');
      });

      it('should include scorecard structure in example', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        // Should show scorecard structure with 5 dimensions
        expect(prompt).toContain('"scorecard"');
        expect(prompt).toContain('"logic"');
        expect(prompt).toContain('"riskAwareness"');
        expect(prompt).toContain('"creativity"');
        expect(prompt).toContain('"evidence"');
        expect(prompt).toContain('"consensus"');
      });

      it('should include contributor perspectives structure', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        // Should show contributorPerspectives array structure
        expect(prompt).toContain('"contributorPerspectives"');
        expect(prompt).toContain('"participantIndex"');
        expect(prompt).toContain('"role"');
        expect(prompt).toContain('"modelId"');
        expect(prompt).toContain('"modelName"');
        expect(prompt).toContain('"vote"');
      });

      it('should include consensus analysis structure', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('"consensusAnalysis"');
        expect(prompt).toContain('"alignmentSummary"');
        expect(prompt).toContain('"totalClaims"');
        expect(prompt).toContain('"majorAlignment"');
        expect(prompt).toContain('"contestedClaims"');
      });

      it('should include evidence and reasoning structure', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('"evidenceAndReasoning"');
        expect(prompt).toContain('"reasoningThreads"');
        expect(prompt).toContain('"evidenceCoverage"');
        expect(prompt).toContain('"strength"');
      });

      it('should include participation stats structure', () => {
        const prompt = buildModeratorSystemPrompt(createValidConfig());

        expect(prompt).toContain('"roundSummary"');
        expect(prompt).toContain('"participation"');
        expect(prompt).toContain('"approved"');
        expect(prompt).toContain('"cautioned"');
        expect(prompt).toContain('"rejected"');
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
