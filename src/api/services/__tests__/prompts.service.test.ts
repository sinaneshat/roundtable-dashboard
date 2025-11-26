/**
 * Prompts Service Tests
 *
 * Tests for MODERATOR_ANALYSIS_JSON_STRUCTURE and buildModeratorAnalysisEnhancedPrompt.
 * Ensures the JSON structure uses placeholder syntax and the enhanced prompt
 * contains critical instructions for dynamic value computation.
 *
 * Critical: The AI moderator must compute ALL analysis values from actual conversation,
 * not copy template/example values from the structure.
 *
 * @module api/services/__tests__/prompts.service.test
 */

import { describe, expect, it } from 'vitest';

import {
  buildModeratorAnalysisEnhancedPrompt,
  MODERATOR_ANALYSIS_JSON_STRUCTURE,
} from '../prompts.service';

describe('prompts.service', () => {
  // ============================================================================
  // MODERATOR_ANALYSIS_JSON_STRUCTURE Tests
  // ============================================================================
  describe('moderatorAnalysisJsonStructure', () => {
    describe('uses placeholder syntax instead of hardcoded values', () => {
      it('should use placeholder for roundNumber', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundNumber).toContain('<FROM_CONTEXT:');
        expect(typeof MODERATOR_ANALYSIS_JSON_STRUCTURE.roundNumber).toBe('string');
      });

      it('should use placeholder for mode', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.mode).toContain('<FROM_CONTEXT:');
        expect(typeof MODERATOR_ANALYSIS_JSON_STRUCTURE.mode).toBe('string');
      });

      it('should use placeholder for userQuestion', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.userQuestion).toContain('<FROM_CONTEXT:');
      });

      it('should use placeholder for roundConfidence', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundConfidence).toContain('<COMPUTE:');
        expect(typeof MODERATOR_ANALYSIS_JSON_STRUCTURE.roundConfidence).toBe('string');
      });

      it('should use placeholder for confidenceWeighting', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.confidenceWeighting).toContain('<COMPUTE:');
      });
    });

    describe('consensusEvolution uses placeholder percentages', () => {
      it('should have 5 phases with placeholder percentages', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;

        expect(consensusEvolution).toHaveLength(5);
        expect(consensusEvolution[0].phase).toBe('opening');
        expect(consensusEvolution[1].phase).toBe('rebuttal');
        expect(consensusEvolution[2].phase).toBe('cross_exam');
        expect(consensusEvolution[3].phase).toBe('synthesis');
        expect(consensusEvolution[4].phase).toBe('final_vote');
      });

      it('should use COMPUTE placeholder for opening percentage', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;
        expect(consensusEvolution[0].percentage).toContain('<COMPUTE:');
      });

      it('should use COMPUTE placeholder for rebuttal percentage', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;
        expect(consensusEvolution[1].percentage).toContain('<COMPUTE:');
      });

      it('should use COMPUTE placeholder for cross_exam percentage', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;
        expect(consensusEvolution[2].percentage).toContain('<COMPUTE:');
      });

      it('should use COMPUTE placeholder for synthesis percentage', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;
        expect(consensusEvolution[3].percentage).toContain('<COMPUTE:');
      });

      it('should use MUST_MATCH placeholder for final_vote percentage', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;
        expect(consensusEvolution[4].percentage).toContain('<MUST_MATCH:');
      });

      it('should NOT contain hardcoded percentage numbers', () => {
        const { consensusEvolution } = MODERATOR_ANALYSIS_JSON_STRUCTURE;

        for (const phase of consensusEvolution) {
          expect(typeof phase.percentage).toBe('string');
          // Should not be a number
          expect(Number.isNaN(Number(phase.percentage))).toBe(true);
        }
      });
    });

    describe('contributorPerspectives uses placeholders', () => {
      it('should use placeholder for participantIndex', () => {
        const perspective = MODERATOR_ANALYSIS_JSON_STRUCTURE.contributorPerspectives[0];
        expect(perspective.participantIndex).toContain('<FROM_CONTEXT:');
      });

      it('should use placeholder for role', () => {
        const perspective = MODERATOR_ANALYSIS_JSON_STRUCTURE.contributorPerspectives[0];
        expect(perspective.role).toContain('<FROM_CONTEXT:');
      });

      it('should use placeholder for modelId', () => {
        const perspective = MODERATOR_ANALYSIS_JSON_STRUCTURE.contributorPerspectives[0];
        expect(perspective.modelId).toContain('<FROM_CONTEXT:');
      });

      it('should use placeholder for scorecard values', () => {
        const { scorecard } = MODERATOR_ANALYSIS_JSON_STRUCTURE.contributorPerspectives[0];

        expect(scorecard.logic).toContain('<COMPUTE:');
        expect(scorecard.riskAwareness).toContain('<COMPUTE:');
        expect(scorecard.creativity).toContain('<COMPUTE:');
        expect(scorecard.evidence).toContain('<COMPUTE:');
        expect(scorecard.consensus).toContain('<COMPUTE:');
      });

      it('should use placeholder for vote', () => {
        const perspective = MODERATOR_ANALYSIS_JSON_STRUCTURE.contributorPerspectives[0];
        expect(perspective.vote).toContain('<COMPUTE:');
      });
    });

    describe('consensusAnalysis uses placeholders', () => {
      it('should use placeholder for totalClaims', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.consensusAnalysis.alignmentSummary.totalClaims).toContain('<COUNT:');
      });

      it('should use placeholder for majorAlignment', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.consensusAnalysis.alignmentSummary.majorAlignment).toContain('<COUNT:');
      });

      it('should use placeholder for contestedClaims', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.consensusAnalysis.alignmentSummary.contestedClaims).toContain('<COUNT:');
      });
    });

    describe('evidenceAndReasoning uses placeholders', () => {
      it('should use placeholder for evidence coverage percentage', () => {
        const coverage = MODERATOR_ANALYSIS_JSON_STRUCTURE.evidenceAndReasoning.evidenceCoverage[0];
        expect(coverage.percentage).toContain('<COMPUTE:');
      });

      it('should use placeholder for evidence strength', () => {
        const coverage = MODERATOR_ANALYSIS_JSON_STRUCTURE.evidenceAndReasoning.evidenceCoverage[0];
        expect(coverage.strength).toContain('<COMPUTE:');
      });
    });

    describe('roundSummary uses placeholders', () => {
      it('should use placeholder for approved count', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundSummary.participation.approved).toContain('<COUNT:');
      });

      it('should use placeholder for cautioned count', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundSummary.participation.cautioned).toContain('<COUNT:');
      });

      it('should use placeholder for rejected count', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundSummary.participation.rejected).toContain('<COUNT:');
      });

      it('should use placeholder for keyThemes', () => {
        expect(MODERATOR_ANALYSIS_JSON_STRUCTURE.roundSummary.keyThemes).toContain('<COMPUTE:');
      });
    });

    describe('no hardcoded numeric values', () => {
      it('should not contain any hardcoded confidence numbers (78, 32, 58, 65, 72)', () => {
        const structureString = JSON.stringify(MODERATOR_ANALYSIS_JSON_STRUCTURE);

        // These were the old hardcoded values
        expect(structureString).not.toContain(': 78');
        expect(structureString).not.toContain(': 32');
        expect(structureString).not.toContain(': 58');
        expect(structureString).not.toContain(': 65');
        expect(structureString).not.toContain(': 72');
      });

      it('should not contain any hardcoded score numbers (85, 75, 70, 80)', () => {
        const structureString = JSON.stringify(MODERATOR_ANALYSIS_JSON_STRUCTURE);

        expect(structureString).not.toContain(': 85');
        expect(structureString).not.toContain(': 75');
        expect(structureString).not.toContain(': 70');
        expect(structureString).not.toContain(': 80');
      });

      it('should not contain any hardcoded count numbers (10, 7, 3, 2, 1, 0)', () => {
        const structureString = JSON.stringify(MODERATOR_ANALYSIS_JSON_STRUCTURE);

        expect(structureString).not.toContain(': 10');
        expect(structureString).not.toContain(': 7,');
        expect(structureString).not.toContain(': 3,');
        // Note: 0 might appear in placeholders, so we check specific patterns
        expect(structureString).not.toMatch(/"approved":\s*2/);
        expect(structureString).not.toMatch(/"cautioned":\s*1/);
        expect(structureString).not.toMatch(/"rejected":\s*0/);
      });
    });
  });

  // ============================================================================
  // buildModeratorAnalysisEnhancedPrompt Tests
  // ============================================================================
  describe('buildModeratorAnalysisEnhancedPrompt', () => {
    const sampleUserPrompt = 'Analyze the following participant responses...';

    describe('critical requirements', () => {
      it('should include CRITICAL REQUIREMENTS header', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('CRITICAL REQUIREMENTS FOR YOUR RESPONSE');
      });

      it('should require COMPUTE values from actual conversation', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('ALL values marked with <COMPUTE:...> MUST be calculated from the ACTUAL conversation');
      });

      it('should require FROM_CONTEXT values from participant data', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('ALL values marked with <FROM_CONTEXT:...> MUST come from the participant data');
      });

      it('should require EXTRACT values from actual responses', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('ALL values marked with <EXTRACT:...> MUST be extracted from actual responses');
      });

      it('should require COUNT values from actual data', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('ALL values marked with <COUNT:...> MUST be counted from actual data');
      });

      it('should explicitly forbid template values', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('NEVER use template/example values');
        expect(prompt).toContain('every number must reflect real analysis');
      });

      it('should require consensusEvolution to show actual progression', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('consensusEvolution percentages must show ACTUAL progression');
      });

      it('should require final_vote to match roundConfidence', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('final_vote percentage MUST equal roundConfidence');
      });

      it('should specify null for missing values', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('Use null for missing values');
      });
    });

    describe('prompt structure', () => {
      it('should include the original user prompt', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain(sampleUserPrompt);
      });

      it('should include JSON structure label', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('JSON STRUCTURE (replace all <...> placeholders with computed values)');
      });

      it('should include the stringified JSON structure', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        // Check that key structure elements are present
        expect(prompt).toContain('"roundNumber"');
        expect(prompt).toContain('"consensusEvolution"');
        expect(prompt).toContain('"contributorPerspectives"');
        expect(prompt).toContain('"roundSummary"');
      });

      it('should have 9 numbered requirements', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('1. Respond with a valid JSON object');
        expect(prompt).toContain('2. ALL values marked with <COMPUTE:');
        expect(prompt).toContain('3. ALL values marked with <FROM_CONTEXT:');
        expect(prompt).toContain('4. ALL values marked with <EXTRACT:');
        expect(prompt).toContain('5. ALL values marked with <COUNT:');
        expect(prompt).toContain('6. NEVER use template');
        expect(prompt).toContain('7. consensusEvolution percentages');
        expect(prompt).toContain('8. final_vote percentage');
        expect(prompt).toContain('9. Use null for missing');
      });
    });

    describe('placeholder types in output', () => {
      it('should contain COMPUTE placeholders', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<COMPUTE:');
      });

      it('should contain FROM_CONTEXT placeholders', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<FROM_CONTEXT:');
      });

      it('should contain EXTRACT placeholders', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<EXTRACT:');
      });

      it('should contain COUNT placeholders', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<COUNT:');
      });

      it('should contain MUST_MATCH placeholder for final_vote', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<MUST_MATCH:');
      });

      it('should contain FROM_AVAILABLE_MODELS placeholder', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<FROM_AVAILABLE_MODELS:');
      });

      it('should contain FROM_AVAILABLE_ROLES placeholder', () => {
        const prompt = buildModeratorAnalysisEnhancedPrompt(sampleUserPrompt);

        expect(prompt).toContain('<FROM_AVAILABLE_ROLES:');
      });
    });
  });
});
