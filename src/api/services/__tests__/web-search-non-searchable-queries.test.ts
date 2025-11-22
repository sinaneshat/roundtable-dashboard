/**
 * Web Search Non-Searchable Queries Tests
 *
 * Tests for handling edge cases where user queries are not suitable for web search:
 * - Greetings (hi, hello, hey)
 * - Commands (do this, run that)
 * - Very short queries (1-2 words that aren't search-worthy)
 * - Gibberish or typos
 *
 * @module api/services/__tests__/web-search-non-searchable-queries.test
 */

import { describe, expect, it } from 'vitest';

import { isQuerySearchable, simpleOptimizeQuery } from '../query-optimizer.service';

describe('non-searchable query handling', () => {
  // ============================================================================
  // Greeting Queries - Critical Bug Fix
  // ============================================================================
  describe('greeting queries', () => {
    it('should handle "say hi, 1 word onyl" gracefully', () => {
      const result = simpleOptimizeQuery('say hi, 1 word onyl');
      // Should not return empty
      expect(result.length).toBeGreaterThan(0);
      // Should not just be whitespace
      expect(result.trim()).not.toBe('');
    });

    it('should handle "hi" single word greeting', () => {
      const result = simpleOptimizeQuery('hi');
      expect(result.length).toBeGreaterThan(0);
      // Single word should get context added
      expect(result.toLowerCase()).toMatch(/definition|explanation/);
    });

    it('should handle "hello" greeting', () => {
      const result = simpleOptimizeQuery('hello');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "hey there" greeting', () => {
      const result = simpleOptimizeQuery('hey there');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "yo" slang greeting', () => {
      const result = simpleOptimizeQuery('yo');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Command-like Queries
  // ============================================================================
  describe('command-like queries', () => {
    it('should handle "do this"', () => {
      const result = simpleOptimizeQuery('do this');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "run the code"', () => {
      const result = simpleOptimizeQuery('run the code');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "fix it"', () => {
      const result = simpleOptimizeQuery('fix it');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Very Short Queries
  // ============================================================================
  describe('very short queries', () => {
    it('should handle single letter "a"', () => {
      const result = simpleOptimizeQuery('a');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle single number "1"', () => {
      const result = simpleOptimizeQuery('1');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "ok"', () => {
      const result = simpleOptimizeQuery('ok');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "yes"', () => {
      const result = simpleOptimizeQuery('yes');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "no"', () => {
      const result = simpleOptimizeQuery('no');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Gibberish and Typos
  // ============================================================================
  describe('gibberish and typos', () => {
    it('should handle "asdf"', () => {
      const result = simpleOptimizeQuery('asdf');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "onyl" typo for "only"', () => {
      const result = simpleOptimizeQuery('onyl');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle keyboard smash', () => {
      const result = simpleOptimizeQuery('aksjdhf');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Mixed Non-Searchable Content
  // ============================================================================
  describe('mixed non-searchable content', () => {
    it('should handle "say hi, 1 word only" with correct spelling', () => {
      const result = simpleOptimizeQuery('say hi, 1 word only');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle instructions without searchable content', () => {
      const result = simpleOptimizeQuery('just do it please');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "tell me something"', () => {
      const result = simpleOptimizeQuery('tell me something');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle "give me an answer"', () => {
      const result = simpleOptimizeQuery('give me an answer');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Queries that Should Still Work
  // ============================================================================
  describe('queries that should still optimize correctly', () => {
    it('should still extract "React" from a short query', () => {
      const result = simpleOptimizeQuery('React');
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toMatch(/definition|explanation/);
    });

    it('should still work with "what is X" pattern', () => {
      const result = simpleOptimizeQuery('what is AI');
      expect(result.toLowerCase()).toContain('ai');
    });

    it('should still work with tech terms', () => {
      const result = simpleOptimizeQuery('TypeScript errors');
      expect(result.toLowerCase()).toContain('typescript');
      expect(result.toLowerCase()).toContain('error');
    });
  });
});

describe('isQuerySearchable', () => {
  it('should return false for "say hi, 1 word onyl"', () => {
    expect(isQuerySearchable('say hi, 1 word onyl')).toBe(false);
  });

  it('should return false for greetings', () => {
    expect(isQuerySearchable('hi')).toBe(false);
    expect(isQuerySearchable('hello')).toBe(false);
    expect(isQuerySearchable('hey')).toBe(false);
  });

  it('should return false for single filler words', () => {
    expect(isQuerySearchable('ok')).toBe(false);
    expect(isQuerySearchable('yes')).toBe(false);
    expect(isQuerySearchable('please')).toBe(false);
  });

  it('should return true for actual search queries', () => {
    expect(isQuerySearchable('React hooks')).toBe(true);
    expect(isQuerySearchable('TypeScript best practices')).toBe(true);
    expect(isQuerySearchable('how to use Docker')).toBe(true);
  });

  it('should return true for single tech terms', () => {
    expect(isQuerySearchable('React')).toBe(true);
    expect(isQuerySearchable('TypeScript')).toBe(true);
    expect(isQuerySearchable('JavaScript')).toBe(true);
  });
});
