/**
 * Unit Tests for hasAnalysisData Function
 *
 * Tests the fix for the issue where moderator analysis sections weren't
 * displaying during streaming because hasAnalysisData() only checked for
 * later-streamed fields (contributorPerspectives, consensusAnalysis, etc.)
 * but not the first-streamed fields (roundConfidence, summary, recommendations).
 *
 * **BUG FIXED**: Analysis sections showed nothing during initial streaming
 * because hasAnalysisData returned false when only header fields were present.
 *
 * **ROOT CAUSE**: Backend streams fields in this order:
 * 1. First: roundConfidence, summary, recommendations
 * 2. Later: contributorPerspectives, consensusAnalysis, etc.
 *
 * But hasAnalysisData only checked the later fields.
 *
 * @see src/lib/utils/analysis-utils.ts
 */

import { describe, expect, it } from 'vitest';

import { hasAnalysisData, hasRoundSummaryContent } from '@/lib/utils/analysis-utils';

describe('hasAnalysisData', () => {
  describe('returns false for empty/null data', () => {
    it('returns false for null', () => {
      expect(hasAnalysisData(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(hasAnalysisData(undefined)).toBe(false);
    });

    it('returns false for empty object', () => {
      expect(hasAnalysisData({})).toBe(false);
    });
  });

  describe('cRITICAL FIX: first-streamed fields', () => {
    /**
     * These tests verify the fix for the streaming display bug.
     * The backend streams these fields FIRST, so hasAnalysisData
     * must return true when only these are present.
     */

    it('returns true when roundConfidence > 0', () => {
      const data = { roundConfidence: 78 };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when roundConfidence is 0', () => {
      // roundConfidence of 0 is not considered valid data
      const data = { roundConfidence: 0 };
      expect(hasAnalysisData(data)).toBe(false);
    });

    it('returns false when roundConfidence is undefined', () => {
      const data = { roundConfidence: undefined };
      expect(hasAnalysisData(data)).toBe(false);
    });

    it('returns true when summary is non-empty string', () => {
      const data = { summary: 'Test summary' };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when summary is empty string', () => {
      const data = { summary: '' };
      expect(hasAnalysisData(data)).toBe(false);
    });

    it('returns true when recommendations array has items', () => {
      const data = {
        recommendations: [{ title: 'Test', description: 'Test desc' }],
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when recommendations array is empty', () => {
      const data = { recommendations: [] };
      expect(hasAnalysisData(data)).toBe(false);
    });
  });

  describe('later-streamed fields (original checks)', () => {
    it('returns true when contributorPerspectives has items', () => {
      const data = {
        contributorPerspectives: [{
          participantIndex: 0,
          role: 'Analyst',
          modelId: 'openai/gpt-4',
          modelName: 'GPT-4',
          scorecard: { logic: 85, riskAwareness: 75, creativity: 70, evidence: 80, consensus: 75 },
          stance: 'Support',
          evidence: ['Evidence 1'],
          vote: 'approve',
        }],
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when contributorPerspectives is empty array', () => {
      const data = { contributorPerspectives: [] };
      expect(hasAnalysisData(data)).toBe(false);
    });

    it('returns true when consensusAnalysis is present', () => {
      const data = {
        consensusAnalysis: {
          alignmentSummary: { totalClaims: 5, majorAlignment: 4, contestedClaims: 1 },
        },
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns true when evidenceAndReasoning is present', () => {
      const data = {
        evidenceAndReasoning: {
          reasoningThreads: [],
          evidenceCoverage: [],
        },
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns true when alternatives array has items', () => {
      const data = {
        alternatives: [{ scenario: 'Test', confidence: 50 }],
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when alternatives array is empty', () => {
      const data = { alternatives: [] };
      expect(hasAnalysisData(data)).toBe(false);
    });
  });

  describe('roundSummary fields', () => {
    it('returns true when roundSummary has keyInsights', () => {
      const data = {
        roundSummary: { keyInsights: ['Insight 1'] },
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns true when roundSummary has overallSummary', () => {
      const data = {
        roundSummary: { overallSummary: 'Overall summary text' },
      };
      expect(hasAnalysisData(data)).toBe(true);
    });

    it('returns false when roundSummary is empty object', () => {
      const data = { roundSummary: {} };
      expect(hasAnalysisData(data)).toBe(false);
    });
  });

  describe('streaming simulation - progressive field arrival', () => {
    /**
     * These tests simulate the actual streaming order from backend
     * to ensure UI shows content as soon as data arrives
     */

    it('streaming phase 1: returns true with only roundConfidence', () => {
      // First data to arrive from backend
      const phase1 = { roundConfidence: 78 };
      expect(hasAnalysisData(phase1)).toBe(true);
    });

    it('streaming phase 2: returns true with roundConfidence + summary', () => {
      const phase2 = {
        roundConfidence: 78,
        summary: 'Initial summary',
      };
      expect(hasAnalysisData(phase2)).toBe(true);
    });

    it('streaming phase 3: returns true with header + recommendations', () => {
      const phase3 = {
        roundConfidence: 78,
        summary: 'Summary text',
        recommendations: [{ title: 'Rec 1', description: 'Desc 1' }],
      };
      expect(hasAnalysisData(phase3)).toBe(true);
    });

    it('streaming phase 4: returns true with all fields populated', () => {
      const phase4 = {
        roundConfidence: 78,
        summary: 'Summary text',
        recommendations: [{ title: 'Rec 1', description: 'Desc 1' }],
        contributorPerspectives: [{
          participantIndex: 0,
          role: 'Analyst',
          modelId: 'openai/gpt-4',
          modelName: 'GPT-4',
          scorecard: { logic: 85, riskAwareness: 75, creativity: 70, evidence: 80, consensus: 75 },
          stance: 'Support',
          evidence: ['Evidence 1'],
          vote: 'approve',
        }],
        consensusAnalysis: {
          alignmentSummary: { totalClaims: 1, majorAlignment: 1, contestedClaims: 0 },
        },
      };
      expect(hasAnalysisData(phase4)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles partial/malformed data gracefully', () => {
      // Partial data from streaming that might have undefined values
      const partial = {
        roundConfidence: undefined,
        summary: undefined,
        contributorPerspectives: undefined,
      };
      expect(hasAnalysisData(partial)).toBe(false);
    });

    it('returns true when any single valid field is present', () => {
      // Only consensusAnalysis present
      expect(hasAnalysisData({ consensusAnalysis: {} })).toBe(true);

      // Only evidenceAndReasoning present
      expect(hasAnalysisData({ evidenceAndReasoning: {} })).toBe(true);
    });
  });
});

describe('hasRoundSummaryContent', () => {
  it('returns false for null/undefined', () => {
    expect(hasRoundSummaryContent(null)).toBe(false);
    expect(hasRoundSummaryContent(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(hasRoundSummaryContent('string')).toBe(false);
    expect(hasRoundSummaryContent(123)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(hasRoundSummaryContent({})).toBe(false);
  });

  it('returns true when keyInsights has items', () => {
    expect(hasRoundSummaryContent({ keyInsights: ['insight'] })).toBe(true);
  });

  it('returns false when keyInsights is empty', () => {
    expect(hasRoundSummaryContent({ keyInsights: [] })).toBe(false);
  });

  it('returns true when consensusPoints has items', () => {
    expect(hasRoundSummaryContent({ consensusPoints: ['point'] })).toBe(true);
  });

  it('returns true when overallSummary is present', () => {
    expect(hasRoundSummaryContent({ overallSummary: 'summary' })).toBe(true);
  });

  it('returns true when conclusion is present', () => {
    expect(hasRoundSummaryContent({ conclusion: 'conclusion' })).toBe(true);
  });

  it('returns true when recommendedActions has items', () => {
    expect(hasRoundSummaryContent({ recommendedActions: ['action'] })).toBe(true);
  });
});
