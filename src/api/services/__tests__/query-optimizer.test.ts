/**
 * Query Optimizer Service Tests
 *
 * Tests for simple query optimization used in fallback scenarios.
 * Verifies that user questions are transformed into search-optimized queries.
 *
 * ✅ CRITICAL: These tests ensure fallback queries are optimized
 * Pattern follows: Vitest testing patterns
 */

import { describe, expect, it } from 'vitest';

import { isOptimizedQuery, simpleOptimizeQuery } from '../query-optimizer.service';

describe('query Optimizer Service', () => {
  describe('simpleOptimizeQuery', () => {
    it('should remove question words from start', () => {
      const testCases = [
        {
          input: 'What are the best practices for React hooks?',
          expected: /best practices.*react hooks/i,
          shouldNotContain: 'what',
        },
        {
          input: 'How do I set up Docker on Ubuntu?',
          expected: /set up docker.*ubuntu/i,
          shouldNotContain: 'how do i',
        },
        {
          input: 'Why should I use TypeScript?',
          // Modal verb "should" is now removed for cleaner queries
          expected: /use typescript/i,
          shouldNotContain: 'why',
        },
        {
          input: 'When should I use React context?',
          // Modal verb "should" is now removed for cleaner queries
          expected: /use react context/i,
          shouldNotContain: 'when',
        },
        {
          input: 'Where can I find documentation?',
          // Modal verb "can" is now removed for cleaner queries
          expected: /find documentation/i,
          shouldNotContain: 'where',
        },
        {
          input: 'Who created React?',
          expected: /created react/i,
          shouldNotContain: 'who',
        },
        {
          input: 'Which framework is better?',
          expected: /framework.*better/i,
          shouldNotContain: 'which',
        },
      ];

      testCases.forEach(({ input, expected, shouldNotContain }) => {
        const result = simpleOptimizeQuery(input);
        expect(result).toMatch(expected);
        expect(result.toLowerCase()).not.toContain(shouldNotContain);
        expect(result).not.toBe(input); // Should transform the query
      });
    });

    it('should remove trailing question marks', () => {
      const testCases = [
        'What are the best practices?',
        'How do I do this?',
        'React hooks?',
      ];

      testCases.forEach((input) => {
        const result = simpleOptimizeQuery(input);
        expect(result).not.toMatch(/\?$/);
      });
    });

    it('should remove common articles and prepositions', () => {
      const input = 'What are the best practices for React in the modern web?';
      const result = simpleOptimizeQuery(input);

      // Should remove: what, are, the, for, in, the
      expect(result.toLowerCase()).not.toContain(' the ');
      expect(result.toLowerCase()).not.toContain(' are ');
      expect(result.toLowerCase()).not.toMatch(/^what\s/);

      // Should keep: best, practices, React, modern, web
      expect(result).toContain('best');
      expect(result).toContain('practices');
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toContain('modern');
      expect(result.toLowerCase()).toContain('web');
    });

    it('should add year for trending/current topics', () => {
      const testCases = [
        'What are the latest AI trends?',
        'What are the recent updates?',
        'What are the new features?',
        'What is the current status?',
        'What are the best frameworks today?',
        'What are the top tools?',
      ];

      testCases.forEach((input) => {
        const result = simpleOptimizeQuery(input);
        expect(result).toContain('2025');
      });
    });

    it('should not add year for non-trending queries', () => {
      const testCases = [
        'What is React?',
        'How does Docker work?',
        'Why use TypeScript?',
      ];

      testCases.forEach((input) => {
        const result = simpleOptimizeQuery(input);
        expect(result).not.toContain('2025');
      });
    });

    it('should add tutorial for how-to questions', () => {
      const input = 'How do I set up Docker?';
      const result = simpleOptimizeQuery(input);

      expect(result).toContain('tutorial');
    });

    it('should add comparison for vs queries', () => {
      const testCases = [
        { input: 'React vs Vue', shouldContain: 'comparison' },
        { input: 'TypeScript versus JavaScript', shouldContain: 'comparison' },
        // "difference between" is already a comparison indicator - no need to add "comparison"
        { input: 'What is the difference between REST and GraphQL?', shouldContain: 'difference' },
      ];

      testCases.forEach(({ input, shouldContain }) => {
        const result = simpleOptimizeQuery(input);
        expect(result.toLowerCase()).toContain(shouldContain.toLowerCase());
      });
    });

    it('should not add duplicate comparison keyword', () => {
      const input = 'React vs Vue comparison';
      const result = simpleOptimizeQuery(input);

      // Should only have one "comparison"
      const matches = result.match(/comparison/gi);
      expect(matches).toHaveLength(1);
    });

    it('should handle empty or whitespace-only input', () => {
      expect(simpleOptimizeQuery('')).toBe('');
      expect(simpleOptimizeQuery('   ')).toBe('');
      expect(simpleOptimizeQuery('\n\t')).toBe('');
    });

    it('should clean up multiple spaces', () => {
      const input = 'What  are   the    best     practices?';
      const result = simpleOptimizeQuery(input);

      expect(result).not.toMatch(/\s{2,}/); // No multiple spaces
    });

    it('should produce optimized queries for real-world examples', () => {
      const examples = [
        {
          input: 'What are the best practices for React state management?',
          expectedPattern: /best practices.*react state management.*2025/i,
        },
        {
          input: 'How do I optimize React performance?',
          expectedPattern: /optimize react performance.*tutorial/i,
        },
        {
          input: 'Why should I use Next.js instead of Create React App?',
          // Modal verb "should" is now removed for cleaner queries
          expectedPattern: /use next.*js.*instead.*create react app/i,
        },
        {
          input: 'What is the difference between REST and GraphQL?',
          // "difference" already indicates comparison - no need to add "comparison"
          expectedPattern: /difference.*rest.*graphql/i,
        },
      ];

      examples.forEach(({ input, expectedPattern }) => {
        const result = simpleOptimizeQuery(input);
        expect(result).toMatch(expectedPattern);
        expect(result).not.toBe(input);
        expect(result.toLowerCase()).not.toMatch(/^(what|how|why)\s/);
      });
    });
  });

  describe('isOptimizedQuery', () => {
    it('should return true for optimized queries', () => {
      const optimizedQueries = [
        'React hooks best practices 2025',
        'Docker Ubuntu installation setup',
        'TypeScript benefits comparison',
        'Next.js performance optimization',
      ];

      optimizedQueries.forEach((query) => {
        expect(isOptimizedQuery(query)).toBe(true);
      });
    });

    it('should return false for queries starting with question words', () => {
      const questionQueries = [
        'What are the best practices?',
        'How do I set this up?',
        'Why should I use this?',
        'When should I do this?',
        'Where can I find this?',
        'Who created this?',
        'Which one is better?',
      ];

      questionQueries.forEach((query) => {
        expect(isOptimizedQuery(query)).toBe(false);
      });
    });

    it('should return false for queries ending with question mark', () => {
      const queries = [
        'React hooks?',
        'Best practices for TypeScript?',
      ];

      queries.forEach((query) => {
        expect(isOptimizedQuery(query)).toBe(false);
      });
    });

    it('should return false for empty or whitespace queries', () => {
      expect(isOptimizedQuery('')).toBe(false);
      expect(isOptimizedQuery('   ')).toBe(false);
      expect(isOptimizedQuery('\n\t')).toBe(false);
    });

    it('should validate optimization results', () => {
      const userQueries = [
        'What are the best practices for React?',
        'How do I set up Docker?',
        'Why use TypeScript?',
      ];

      userQueries.forEach((userQuery) => {
        const optimized = simpleOptimizeQuery(userQuery);
        expect(isOptimizedQuery(optimized)).toBe(true);
        expect(isOptimizedQuery(userQuery)).toBe(false);
      });
    });
  });
});
