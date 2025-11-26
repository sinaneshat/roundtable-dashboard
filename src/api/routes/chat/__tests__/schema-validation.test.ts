/**
 * Schema Validation Tests
 *
 * Tests that schemas used for AI output_format don't have unsupported constraints.
 * AI SDK providers (OpenRouter, Anthropic) reject schemas with:
 * - .int() on z.number() (causes "integer type properties maximum, minimum not supported")
 * - .min()/.max() on numbers or arrays
 * - .length() on arrays or strings
 *
 * CRITICAL: Schemas passed to streamObject()/generateObject() MUST NOT use these constraints.
 * Use descriptions to communicate requirements to the AI instead.
 *
 * Related error: "For 'integer' type, properties maximum, minimum are not supported"
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AIScorecardSchema,
  ContributorPerspectiveSchema,
  GeneratedSearchQuerySchema,
  ModeratorAnalysisPayloadSchema,
  MultiQueryGenerationSchema,
  RoundSummarySchema,
} from '../schema';

/**
 * Helper to check if a Zod schema has forbidden constraints for AI providers
 * Returns array of field paths that have invalid constraints
 *
 * Checks for:
 * - .int() on z.number() fields
 * - .min()/.max() on numbers
 * - .min()/.max()/.length() on arrays
 */
function findNumberConstraints(schema: z.ZodType, path: string = ''): string[] {
  const violations: string[] = [];

  // Handle different schema types
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    Object.entries(shape).forEach(([key, value]) => {
      const fieldPath = path ? `${path}.${key}` : key;
      violations.push(...findNumberConstraints(value as z.ZodType, fieldPath));
    });
  } else if (schema instanceof z.ZodArray) {
    // Check array for min/max length constraints
    // @ts-expect-error - accessing internal checks
    const arrayChecks = schema._def.minLength || schema._def.maxLength || schema._def.exactLength;
    if (arrayChecks) {
      violations.push(path);
    }
    violations.push(...findNumberConstraints(schema.element, `${path}[]`));
  } else if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    // @ts-expect-error - accessing internal options
    const options = schema._def.options || [];
    options.forEach((option: z.ZodType, idx: number) => {
      violations.push(...findNumberConstraints(option, `${path}[union${idx}]`));
    });
  } else if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    violations.push(...findNumberConstraints(schema.unwrap(), path));
  } else if (schema instanceof z.ZodNumber) {
    // Check for .int() constraint - CRITICAL for AI providers
    // @ts-expect-error - accessing internal checks
    const checks = schema._def.checks || [];

    // Check for .int() - AI providers reject integer type with constraints
    const hasInt = checks.some((check: { kind: string }) => check.kind === 'int');
    if (hasInt) {
      violations.push(`${path} [.int()]`);
    }

    // Check for min/max constraints
    const hasMinMax = checks.some((check: { kind: string }) =>
      check.kind === 'min' || check.kind === 'max',
    );
    if (hasMinMax) {
      violations.push(`${path} [.min()/.max()]`);
    }
  }

  return violations;
}

describe('schema-validation - AI output_format compatibility', () => {
  describe('critical: AI provider constraints (.int(), .min(), .max())', () => {
    it('generatedSearchQuerySchema should NOT have .int() or constraints on number fields', () => {
      const violations = findNumberConstraints(GeneratedSearchQuerySchema);

      if (violations.length > 0) {
        console.error('GeneratedSearchQuerySchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });

    it('multiQueryGenerationSchema should NOT have .int() or constraints on number fields', () => {
      const violations = findNumberConstraints(MultiQueryGenerationSchema);

      if (violations.length > 0) {
        console.error('MultiQueryGenerationSchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });

    it('aiScorecardSchema should NOT have .int() or constraints on scorecard values', () => {
      const violations = findNumberConstraints(AIScorecardSchema);

      if (violations.length > 0) {
        console.error('AIScorecardSchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });

    it('contributorPerspectiveSchema should NOT have .int() or constraints on number fields', () => {
      const violations = findNumberConstraints(ContributorPerspectiveSchema);

      if (violations.length > 0) {
        console.error('ContributorPerspectiveSchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });

    it('moderatorAnalysisPayloadSchema should have NO .int() or number/array constraints', () => {
      const violations = findNumberConstraints(ModeratorAnalysisPayloadSchema);

      if (violations.length > 0) {
        console.error('ModeratorAnalysisPayloadSchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });

    it('roundSummarySchema should have NO .int() or number/array constraints', () => {
      const violations = findNumberConstraints(RoundSummarySchema);

      if (violations.length > 0) {
        console.error('RoundSummarySchema violations:', violations);
      }

      expect(violations).toEqual([]);
    });
  });

  describe('schema validation with actual AI responses', () => {
    it('should accept valid GeneratedSearchQuery without constraints', () => {
      // Test with minimal required fields first
      const minimalQuery = {
        query: 'test query',
        rationale: 'test rationale',
        searchDepth: 'advanced' as const,
      };

      const minimalResult = GeneratedSearchQuerySchema.safeParse(minimalQuery);
      expect(minimalResult.success).toBe(true);

      // Test with all fields including optional ones
      const fullQuery = {
        query: 'test query',
        rationale: 'test rationale',
        searchDepth: 'advanced' as const,
        sourceCount: 5, // No min/max validation
        chunksPerSource: 2, // No min/max validation
        requiresFullContent: true,
        includeImages: false,
        includeImageDescriptions: false,
        analysis: 'test analysis',
      };

      const fullResult = GeneratedSearchQuerySchema.safeParse(fullQuery);

      if (!fullResult.success) {
        console.error('Validation failed');
        console.error('Errors:', JSON.stringify(fullResult.error.errors, null, 2));
        console.error('Input:', fullQuery);
      }

      expect(fullResult.success).toBe(true);
    });

    it('should accept valid AIScorecard without constraints', () => {
      const validScorecard = {
        logic: 85,
        riskAwareness: 70,
        creativity: 95,
        evidence: 88,
        consensus: 75,
      };

      const result = AIScorecardSchema.safeParse(validScorecard);
      expect(result.success).toBe(true);
    });

    it('should accept ContributorPerspective with out-of-range scores (no validation)', () => {
      const perspectiveWithHighScores = {
        participantIndex: 0,
        role: 'Innovator',
        modelId: 'test/model',
        modelName: 'Test Model',
        scorecard: {
          logic: 150, // Should NOT be validated if constraints removed
          riskAwareness: 200,
          creativity: 95,
          evidence: 88,
        },
        stance: 'Strong support for immediate action',
        evidence: ['Point 1', 'Point 2'],
        vote: 'approve' as const,
      };

      const result = ContributorPerspectiveSchema.safeParse(perspectiveWithHighScores);

      // If constraints are removed, this should pass (AI determines valid range)
      expect(result.success).toBe(true);
    });

    it('should accept ContributorPerspective with any number of evidence points', () => {
      const perspectiveWithVariableEvidence = {
        participantIndex: 0,
        role: 'Skeptic',
        modelId: 'test/model',
        modelName: 'Test Model',
        scorecard: {
          logic: 85,
          riskAwareness: 90,
          creativity: 70,
          evidence: 95,
        },
        stance: 'Caution advised due to gaps',
        evidence: ['Point 1'], // Only 1 evidence point - should pass
        vote: 'caution' as const,
      };

      const result = ContributorPerspectiveSchema.safeParse(perspectiveWithVariableEvidence);
      expect(result.success).toBe(true);
    });

    it('should accept MultiQueryGeneration without min/max on totalQueries', () => {
      const validMultiQuery = {
        totalQueries: 10, // Should accept any number if constraints removed
        analysisRationale: 'Need comprehensive research',
        queries: [
          {
            query: 'test query 1',
            rationale: 'rationale 1',
            searchDepth: 'basic' as const,
          },
        ],
      };

      const result = MultiQueryGenerationSchema.safeParse(validMultiQuery);
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases - no validation constraints', () => {
    it('should accept negative scorecard values if constraints removed (AI decides validity)', () => {
      const scorecardWithNegative = {
        logic: -5, // Would fail with .min(0), should pass without
        riskAwareness: 70,
        creativity: 80,
        evidence: 90,
      };

      const result = AIScorecardSchema.safeParse(scorecardWithNegative);
      expect(result.success).toBe(true);
    });

    it('should accept extremely high scorecard values if constraints removed', () => {
      const scorecardWithHigh = {
        logic: 1000, // Would fail with .max(100), should pass without
        riskAwareness: 70,
        creativity: 80,
        evidence: 90,
      };

      const result = AIScorecardSchema.safeParse(scorecardWithHigh);
      expect(result.success).toBe(true);
    });
  });
});
