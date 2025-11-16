/* eslint-disable test/no-conditional-expect */
/**
 * Query Optimizer Fallback Tests
 *
 * BUG REPORT: When AI query generation fails, the fallback uses exact user input
 * instead of optimizing it. For example:
 * - User input: "say hi, 1 word only"
 * - Expected optimized: "greeting" or "say hi" or similar
 * - Actual result: "say hi, 1 word only" (unchanged!)
 *
 * This happens because simpleOptimizeQuery() only handles specific patterns:
 * - Questions starting with "what", "how", etc.
 * - Queries with "latest", "trending", etc. (adds "2025")
 * - But doesn't handle imperatives like "say hi", "do X", "show me Y"
 *
 * Tests verify that ALL queries are optimized, not just question-based ones.
 */

import { describe, expect, it } from 'vitest';

import { simpleOptimizeQuery } from '@/api/services/query-optimizer.service';

describe('query Optimizer Fallback - User Input Should NEVER Be Returned Unchanged', () => {
  describe('bUG: Imperative Commands Not Optimized', () => {
    it('should optimize "say hi, 1 word only" (actual user bug report)', () => {
      const userInput = 'say hi, 1 word only';
      const optimized = simpleOptimizeQuery(userInput);

      // ❌ CURRENT BUG: Returns exact input
      // ✅ EXPECTED: Should be optimized

      // VERIFY: Query should be changed (not exact match)
      expect(optimized).not.toBe(userInput);

      // VERIFY: Should extract core intent or add context
      // Any of these would be valid:
      // - "hi greeting" (removed instructions)
      // - "greet sayhi" (simplified)
      // - Add search-friendly terms
      const isOptimized
        = optimized.length < userInput.length // Simplified
          || optimized.includes('greeting') // Added context
          || optimized.includes('hello')
          || !optimized.includes('word only'); // Removed instruction text

      expect(isOptimized).toBe(true);
    });

    it('should optimize imperative commands', () => {
      const testCases = [
        {
          input: 'tell me about React',
          expectedChanges: {
            shouldRemove: ['tell me about'],
            shouldKeep: ['react'],
          },
        },
        {
          input: 'explain TypeScript',
          expectedChanges: {
            shouldRemove: [],
            shouldKeep: ['typescript'],
          },
        },
        {
          input: 'show me examples',
          expectedChanges: {
            shouldRemove: ['show me'],
            shouldKeep: ['examples'],
          },
        },
        {
          input: 'give me a summary',
          expectedChanges: {
            shouldRemove: ['give me'],
            shouldKeep: ['summary'],
          },
        },
      ];

      testCases.forEach(({ input, expectedChanges }) => {
        const result = simpleOptimizeQuery(input);

        // Should not return exact input
        expect(result).not.toBe(input);

        // Should remove specified terms
        expectedChanges.shouldRemove.forEach((term) => {
          expect(result.toLowerCase()).not.toContain(term.toLowerCase());
        });

        // Should keep important terms
        expectedChanges.shouldKeep.forEach((term) => {
          expect(result.toLowerCase()).toContain(term.toLowerCase());
        });
      });
    });
  });

  describe('bUG: Short Phrases Not Expanded', () => {
    it('should expand short generic phrases with context', () => {
      const testCases = [
        {
          input: 'photosynthesis',
          minLength: 15, // Should add context
        },
        {
          input: 'AI trends',
          shouldContain: ['2025'], // Should add year for trends
        },
        {
          input: 'best practices',
          shouldContain: ['2025'], // Should add year for "best"
        },
      ];

      testCases.forEach((testCase) => {
        const result = simpleOptimizeQuery(testCase.input);

        if ('minLength' in testCase) {
          expect(result.length).toBeGreaterThanOrEqual(testCase.minLength);
        }

        if ('shouldContain' in testCase) {
          testCase.shouldContain.forEach((term) => {
            expect(result).toContain(term);
          });
        }
      });
    });
  });

  describe('bUG: Conversational Phrases Not Cleaned', () => {
    it('should remove conversational fluff', () => {
      const testCases = [
        {
          input: 'Can you help me with React?',
          shouldNotContain: ['can you', 'help me'],
          shouldContain: ['react'],
        },
        {
          input: 'I want to learn about TypeScript',
          shouldNotContain: ['i want to', 'learn about'],
          shouldContain: ['typescript'],
        },
        {
          input: 'Please show me Docker tutorials',
          shouldNotContain: ['please'],
          shouldContain: ['docker', 'tutorial'],
        },
      ];

      testCases.forEach(({ input, shouldNotContain, shouldContain }) => {
        const result = simpleOptimizeQuery(input);

        shouldNotContain.forEach((term) => {
          expect(result.toLowerCase()).not.toContain(term.toLowerCase());
        });

        shouldContain.forEach((term) => {
          expect(result.toLowerCase()).toContain(term.toLowerCase());
        });
      });
    });
  });

  describe('edge Cases', () => {
    it('should handle very short inputs', () => {
      const testCases = ['hi', 'test', 'help'];

      testCases.forEach((input) => {
        const result = simpleOptimizeQuery(input);

        // Should either keep it or expand it, but not return empty
        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should handle inputs with special characters', () => {
      const input = 'what\'s the best way to use React.js?';
      const result = simpleOptimizeQuery(input);

      // Should clean up and optimize
      expect(result).not.toBe(input);
      expect(result).toContain('React');
    });

    it('should handle all-uppercase input', () => {
      const input = 'SHOW ME REACT TUTORIALS';
      const result = simpleOptimizeQuery(input);

      expect(result).not.toBe(input);
      expect(result.toLowerCase()).not.toContain('show me');
    });
  });

  describe('verification: No Query Should Be Returned Unchanged', () => {
    it('should modify ALL types of user input (comprehensive test)', () => {
      const testInputs = [
        'say hi, 1 word only', // Original bug
        'tell me about X',
        'explain Y',
        'show me Z',
        'what is A?',
        'how do I B?',
        'why should I C?',
        'latest trends',
        'best practices',
        'current state',
        'simple phrase',
        'single word',
      ];

      testInputs.forEach((input) => {
        const result = simpleOptimizeQuery(input);

        // CRITICAL: NEVER return exact input unchanged
        // Even if we can't optimize much, we should at least:
        // - Remove articles (a, the)
        // - Add context (year for trending topics)
        // - Clean whitespace
        // - Remove conversational words
        const isModified
          = result !== input // Content changed
            || result.trim() !== input.trim(); // Whitespace cleaned

        if (!isModified) {
          throw new Error(`Query optimization FAILED for: "${input}" - returned unchanged!`);
        }

        expect(result).not.toBe(input);
      });
    });
  });
});
