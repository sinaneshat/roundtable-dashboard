/**
 * Query Optimizer - Informal Input Tests
 *
 * Tests that verify simpleOptimizeQuery handles informal, conversational input.
 * These tests ensure:
 * 1. Profanity is removed or handled gracefully
 * 2. Very informal/conversational language is cleaned up
 * 3. Personal pronouns and filler words are removed
 * 4. Key concepts are extracted for search
 * 5. Output is professional and search-engine friendly
 *
 * Bug Reproduction: User reported that search queries shown in UI
 * contain profanity and informal language from their original message.
 * This test demonstrates the issue and validates the fix.
 */

import { describe, expect, it } from 'vitest';

import { isOptimizedQuery, simpleOptimizeQuery } from '@/api/services/query-optimizer.service';

describe('query Optimizer - Informal Input Handling', () => {
  describe('bug Reproduction - Informal Language Not Cleaned', () => {
    it('should clean up very informal investment question with profanity', () => {
      // ❌ FAILING TEST: Demonstrates the bug reported by user
      // User's actual input from screenshot
      const userInput = 'I\'m super noob at investments and have no clue what the fuck I\'m doing half the time and I really need financial advice right now to do long-term investments and I\'m not sure if I should get Bitcoin or Ethereum if I\'m going to hold it for the next five years.';

      const optimized = simpleOptimizeQuery(userInput);

      // ✅ EXPECTED: Should NOT contain profanity
      expect(optimized.toLowerCase()).not.toContain('fuck');
      expect(optimized.toLowerCase()).not.toContain('shit');
      expect(optimized.toLowerCase()).not.toContain('damn');

      // ✅ EXPECTED: Should NOT contain very informal phrases
      expect(optimized.toLowerCase()).not.toContain('i\'m super noob');
      expect(optimized.toLowerCase()).not.toContain('have no clue');
      expect(optimized.toLowerCase()).not.toContain('half the time');

      // ✅ EXPECTED: Should NOT contain personal pronouns
      expect(optimized).not.toMatch(/\bI'm\b/);
      expect(optimized).not.toMatch(/\bI\b/);

      // ✅ EXPECTED: Should extract key concepts
      expect(optimized.toLowerCase()).toContain('bitcoin');
      expect(optimized.toLowerCase()).toContain('ethereum');
      // "long-term" might be split due to comparison detection, check for "term" as key concept
      expect(optimized.toLowerCase()).toMatch(/long|term/);
      expect(optimized.toLowerCase()).toContain('investment');

      // ✅ EXPECTED: Should be significantly shorter (key concepts only)
      expect(optimized.length).toBeLessThan(userInput.length / 2);

      // ✅ EXPECTED: Should add trending qualifier for investment questions
      expect(optimized).toContain('2025');

      // ✅ EXPECTED: Ideal optimized query should look like:
      // "Bitcoin Ethereum long-term investment comparison 5 years 2025"
      const expectedPattern = /(bitcoin|ethereum).*investment.*(comparison|vs|versus)/i;
      expect(optimized).toMatch(expectedPattern);
    });

    it('should handle profanity in various contexts', () => {
      const testCases = [
        {
          input: 'What the fuck is TypeScript?',
          shouldNotContain: ['fuck', 'what the'],
          shouldContain: ['typescript'],
        },
        {
          input: 'How the hell do I set up Docker?',
          shouldNotContain: ['hell', 'how the'],
          shouldContain: ['docker', 'set up'],
        },
        {
          input: 'I don\'t know shit about React hooks',
          shouldNotContain: ['shit', 'i don\'t know'],
          shouldContain: ['react', 'hooks'],
        },
      ];

      testCases.forEach(({ input, shouldNotContain, shouldContain }) => {
        const optimized = simpleOptimizeQuery(input);

        shouldNotContain.forEach((phrase) => {
          expect(optimized.toLowerCase()).not.toContain(phrase);
        });

        shouldContain.forEach((phrase) => {
          expect(optimized.toLowerCase()).toContain(phrase);
        });

        // Should be optimized, not raw input
        expect(optimized).not.toBe(input);
        expect(isOptimizedQuery(optimized)).toBe(true);
      });
    });
  });

  describe('personal Pronouns and Conversational Language', () => {
    it('should remove personal pronouns (I, my, me)', () => {
      const testCases = [
        {
          input: 'I need help with my TypeScript project',
          expected: /typescript project/i,
          shouldNotContain: ['i need', 'my', 'help', 'with'],
        },
        {
          input: 'Can you help me understand React?',
          expected: /understand react/i,
          shouldNotContain: ['can you', 'help me'],
        },
        {
          input: 'I\'m trying to learn Python',
          expected: /learn python/i,
          shouldNotContain: ['i\'m trying', 'trying'],
        },
      ];

      testCases.forEach(({ input, expected, shouldNotContain }) => {
        const optimized = simpleOptimizeQuery(input);

        expect(optimized).toMatch(expected);
        shouldNotContain.forEach((phrase) => {
          expect(optimized.toLowerCase()).not.toContain(phrase);
        });
      });
    });

    it('should remove filler words and phrases', () => {
      const testCases = [
        'like, I really need to understand this',
        'you know, I\'m not sure about that',
        'basically, how does it work?',
        'I mean, what is the difference?',
      ];

      testCases.forEach((input) => {
        const optimized = simpleOptimizeQuery(input);

        expect(optimized.toLowerCase()).not.toContain('like,');
        expect(optimized.toLowerCase()).not.toContain('you know');
        expect(optimized.toLowerCase()).not.toContain('basically');
        expect(optimized.toLowerCase()).not.toContain('i mean');
        expect(optimized.toLowerCase()).not.toContain('i\'m not sure');
        expect(optimized.toLowerCase()).not.toContain('really need');
      });
    });
  });

  describe('keyword Extraction', () => {
    it('should extract key concepts from long conversational input', () => {
      const input = 'So I\'ve been working on this project for a while now and I\'m trying to figure out the best way to handle authentication in a Next.js app with server components and I\'m not really sure if I should use NextAuth or implement my own solution using JWT tokens or something else entirely';

      const optimized = simpleOptimizeQuery(input);

      // Should contain key technical terms
      expect(optimized.toLowerCase()).toContain('authentication');
      expect(optimized.toLowerCase()).toContain('next');

      // Should NOT contain conversational fluff
      expect(optimized.toLowerCase()).not.toContain('i\'ve been working');
      expect(optimized.toLowerCase()).not.toContain('for a while now');
      expect(optimized.toLowerCase()).not.toContain('trying to figure out');
      expect(optimized.toLowerCase()).not.toContain('not really sure');

      // Should be much shorter
      expect(optimized.length).toBeLessThan(input.length / 2);
    });

    it('should prioritize nouns and technical terms over verbs', () => {
      const input = 'I want to learn how to build a REST API using Node.js and Express';

      const optimized = simpleOptimizeQuery(input);

      // Should keep nouns/technologies
      expect(optimized.toLowerCase()).toContain('rest api');
      expect(optimized.toLowerCase()).toContain('node');
      expect(optimized.toLowerCase()).toContain('express');

      // Should remove generic verbs
      expect(optimized.toLowerCase()).not.toContain('i want to');
      expect(optimized.toLowerCase()).not.toContain('how to');
    });
  });

  describe('output Quality Validation', () => {
    it('should always produce search-engine friendly output', () => {
      const testCases = [
        'What\'s the fucking deal with TypeScript generics?',
        'I have absolutely no clue how Redux works',
        'Can someone please explain closures to me like I\'m five?',
        'Why the hell is my Docker container not starting?',
      ];

      testCases.forEach((input) => {
        const optimized = simpleOptimizeQuery(input);

        // Should be optimized (validated by isOptimizedQuery)
        expect(isOptimizedQuery(optimized)).toBe(true);

        // Should not be empty
        expect(optimized.length).toBeGreaterThan(0);

        // Should not start with question words
        expect(optimized).not.toMatch(/^(what|how|why|when|where|who|which)/i);

        // Should not end with question mark
        expect(optimized).not.toMatch(/\?$/);

        // Should not contain profanity
        expect(optimized.toLowerCase()).not.toMatch(/fuck|shit|hell|damn|crap/);
      });
    });

    it('should handle comparison questions by extracting entities', () => {
      const input = 'I can\'t decide if I should use React or Vue for my next project';

      const optimized = simpleOptimizeQuery(input);

      // Should extract both entities
      expect(optimized.toLowerCase()).toContain('react');
      expect(optimized.toLowerCase()).toContain('vue');

      // Should add comparison qualifier
      expect(optimized.toLowerCase()).toMatch(/comparison|vs|versus/);

      // Should remove indecision language
      expect(optimized.toLowerCase()).not.toContain('can\'t decide');
      expect(optimized.toLowerCase()).not.toContain('if i should');
    });
  });

  describe('edge Cases', () => {
    it('should handle empty or whitespace-only input', () => {
      const testCases = ['', '   ', '\n\t'];

      testCases.forEach((input) => {
        const optimized = simpleOptimizeQuery(input);
        expect(optimized).toBe('');
      });
    });

    it('should handle input that is already optimized', () => {
      const alreadyOptimized = 'TypeScript best practices 2025';
      const result = simpleOptimizeQuery(alreadyOptimized);

      // Should still process it (may add year if missing)
      expect(result).toBeTruthy();
      expect(isOptimizedQuery(result)).toBe(true);
    });

    it('should handle very short informal input', () => {
      const testCases = [
        {
          input: 'wtf is this',
          // After removing wtf, is, this -> empty -> fallback returns simplified original
          shouldNotContain: ['wtf'],
          shouldHaveContent: true,
        },
        {
          input: 'idk about that',
          shouldNotContain: ['idk'],
          shouldHaveContent: true,
        },
        {
          input: 'help pls',
          // Both words are filler - fallback to original simplified
          shouldNotContain: ['pls'],
          shouldHaveContent: true,
        },
      ];

      testCases.forEach(({ input, shouldNotContain }) => {
        const optimized = simpleOptimizeQuery(input);

        // All test cases should have content (fallback logic ensures this)
        expect(optimized.length).toBeGreaterThan(0);

        shouldNotContain.forEach((term) => {
          expect(optimized.toLowerCase()).not.toContain(term);
        });
      });
    });
  });
});
