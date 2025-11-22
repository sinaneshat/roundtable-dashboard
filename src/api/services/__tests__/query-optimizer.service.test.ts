/**
 * Query Optimizer Service Tests
 *
 * Tests for simpleOptimizeQuery function that transforms user queries
 * into search-optimized queries when AI generation fails.
 *
 * @module api/services/__tests__/query-optimizer.service.test
 */

import { describe, expect, it } from 'vitest';

import { isOptimizedQuery, simpleOptimizeQuery } from '../query-optimizer.service';

describe('simpleOptimizeQuery', () => {
  // ============================================================================
  // Basic Functionality
  // ============================================================================
  describe('basic functionality', () => {
    it('should return empty string for empty input', () => {
      expect(simpleOptimizeQuery('')).toBe('');
      expect(simpleOptimizeQuery('   ')).toBe('');
    });

    it('should remove question words from start', () => {
      const result = simpleOptimizeQuery('What are React hooks?');
      expect(result).not.toMatch(/^what\s/i);
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toContain('hooks');
    });

    it('should remove personal pronouns', () => {
      const result = simpleOptimizeQuery('How do I use TypeScript?');
      expect(result).not.toMatch(/\bI\b/);
      expect(result.toLowerCase()).toContain('typescript');
    });

    it('should remove profanity', () => {
      const result = simpleOptimizeQuery('What the fuck is React?');
      expect(result).not.toMatch(/fuck/i);
      expect(result.toLowerCase()).toContain('react');
    });

    it('should add year for trending topics', () => {
      const result = simpleOptimizeQuery('What are the latest React features?');
      expect(result).toMatch(/2025/);
    });

    it('should add year for financial topics', () => {
      const result = simpleOptimizeQuery('How do I invest in Bitcoin?');
      expect(result).toMatch(/2025/);
    });
  });

  // ============================================================================
  // Comparison Handling
  // ============================================================================
  describe('comparison handling', () => {
    it('should detect and format X vs Y comparisons', () => {
      const result = simpleOptimizeQuery('Should I use React or Vue for my project?');
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toContain('vue');
      expect(result.toLowerCase()).toContain('comparison');
    });

    it('should handle "versus" keyword', () => {
      const result = simpleOptimizeQuery('Next.js versus Create React App');
      expect(result.toLowerCase()).toContain('next');
      expect(result.toLowerCase()).toContain('create react app');
    });
  });

  // ============================================================================
  // Long Instructional Messages (Critical Bug Fix)
  // ============================================================================
  describe('long instructional messages', () => {
    it('should extract technical terms from long TypeScript instructions', () => {
      const longInstruction = `Continue and fix any TypeScript or ESLint bad practices.
        No ignore TypeScript flag, no usage of any or unknown or overgeneralize types
        like Record<string, unknown> and such practices, no force typecasting,
        no inline type extensions, no hard coded types or interfaces that aren't
        inferred types and built upon and extensions of pre-existing types.`;

      const result = simpleOptimizeQuery(longInstruction);

      // Should be short and focused
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);

      // Should contain key technical terms
      expect(result.toLowerCase()).toMatch(/typescript|eslint|types?|interface|pattern/);
    });

    it('should handle long testing instructions', () => {
      const testInstruction = `Run all the tests and make sure all of them are passing
        and updated to simulate the exact behavior of my UI and how it interacts
        with the store and APIs with the same order so you can exactly test it
        just like the code has been built.`;

      const result = simpleOptimizeQuery(testInstruction);

      // Should be short
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);

      // Should contain testing-related terms
      expect(result.toLowerCase()).toMatch(/test|store|api|ui/);
    });

    it('should handle enum-based pattern refactoring instructions', () => {
      const enumInstruction = `Learn and follow and refactor using enum based patterns.
        Lots of places to use enum based patterns in your changes.
        Do not leave behind any legacy or backwards compatible code.
        Make sure to clean up after yourself and always use the established
        patterns from the codebase. Follow TypeScript best practices and
        ensure all types are properly inferred.`;

      const result = simpleOptimizeQuery(enumInstruction);

      // Should be short
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);

      // Should contain relevant terms
      expect(result.toLowerCase()).toMatch(/enum|pattern|typescript|type/);
    });

    it('should handle mixed instructional messages', () => {
      const mixedInstruction = `Fix TypeScript errors and run tests. Make sure to follow
        established patterns and clean up after yourself. Always use enum based patterns
        where possible and never leave legacy code behind.`;

      const result = simpleOptimizeQuery(mixedInstruction);

      // Should be short and focused
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);

      // Should extract key terms
      expect(result.toLowerCase()).toMatch(/typescript|test|enum|pattern/);
    });

    it('should not truncate short questions even if they contain instruction words', () => {
      const shortQuestion = 'How do I fix TypeScript errors?';
      const result = simpleOptimizeQuery(shortQuestion);

      // Should still contain key terms
      expect(result.toLowerCase()).toContain('typescript');
      expect(result.toLowerCase()).toMatch(/error|fix/);
    });

    it('should handle very long messages with multiple technical domains', () => {
      const veryLongMessage = `Continue and fix any TypeScript or ESLint bad practices.
        No ignore TypeScript flag, no usage of any or unknown or overgeneralize types
        like Record<string, unknown> and such practices, no force typecasting,
        no inline type extensions, no hard coded types or interfaces that aren't
        inferred types and built upon and extensions of pre-existing types.
        And for anything TypeScript and type practice related, learn and follow
        the established patterns and fix any of the TypeScript and ESLint errors
        remaining and test all the tests and make sure all of them are passing
        and updated to simulate the exact behavior of my UI and how it interacts
        with the store and APIs with the same order so you can exactly test it
        just like the code has been built and if it's broken then you will know
        how to fix and where to fix the code. So many enum based patterns during
        your changes that could've been made reusable and cause code reduction
        and simplifications. Learn and follow and refactor using enum based patterns,
        lots of places to use enum based patterns in your changes. Do not leave
        behind any legacy to do or backwards compatible or any code that is duplicated
        fully migrates and clean up after yourself always make sure to never do any
        re-exports of the same thing with different const assignments or different
        renames from different parts of the code or from multiple places, only
        exception being the barrel exports and make sure that there's always one
        single source of truth for all exports in the barrel exports and that will
        be used for all cases always.`;

      const result = simpleOptimizeQuery(veryLongMessage);

      // Should produce a focused, short query
      expect(result.split(/\s+/).length).toBeLessThanOrEqual(12);

      // Should extract the most relevant technical terms
      expect(result.toLowerCase()).toMatch(/typescript|eslint|test|enum|pattern|type/);
    });
  });

  // ============================================================================
  // Technical Term Preservation
  // ============================================================================
  describe('technical term preservation', () => {
    it('should preserve technology names with dots', () => {
      const result = simpleOptimizeQuery('How do I use Next.js with TypeScript?');
      expect(result.toLowerCase()).toContain('next.js');
      expect(result.toLowerCase()).toContain('typescript');
    });

    it('should preserve capitalized technology names', () => {
      const result = simpleOptimizeQuery('What is React and Redux?');
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toContain('redux');
    });

    it('should handle multiple technologies', () => {
      const result = simpleOptimizeQuery('How do I integrate MongoDB with Express and Node.js?');
      expect(result.toLowerCase()).toContain('mongodb');
      expect(result.toLowerCase()).toContain('express');
      expect(result.toLowerCase()).toContain('node');
    });
  });

  // ============================================================================
  // Short Query Enhancement
  // ============================================================================
  describe('short query enhancement', () => {
    it('should add context for single-word queries', () => {
      const result = simpleOptimizeQuery('TypeScript');
      expect(result.toLowerCase()).toContain('typescript');
      expect(result.toLowerCase()).toMatch(/definition|explanation/);
    });

    it('should add guide for two-word queries', () => {
      const result = simpleOptimizeQuery('React hooks');
      expect(result.toLowerCase()).toContain('react');
      expect(result.toLowerCase()).toContain('hooks');
      expect(result.toLowerCase()).toMatch(/guide/);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle queries with only profanity and filler', () => {
      const result = simpleOptimizeQuery('What the fuck is this shit I don\'t know');
      // Should not return empty
      expect(result.length).toBeGreaterThan(0);
      // Should not contain profanity
      expect(result).not.toMatch(/fuck|shit/i);
    });

    it('should handle queries with mixed case', () => {
      const result = simpleOptimizeQuery('WHAT IS REACT JS?');
      expect(result.toLowerCase()).toContain('react');
    });

    it('should handle queries with special characters', () => {
      const result = simpleOptimizeQuery('How do I use C++?');
      expect(result).not.toBe('');
    });

    it('should handle queries with numbers', () => {
      const result = simpleOptimizeQuery('What is Web3?');
      expect(result.toLowerCase()).toContain('web3');
    });

    it('should always return something different from input', () => {
      const input = 'test query';
      const result = simpleOptimizeQuery(input);
      // Should either modify or add context
      expect(result).not.toBe(input);
    });
  });

  // ============================================================================
  // Tutorial/How-to Enhancement
  // ============================================================================
  describe('tutorial enhancement', () => {
    it('should add tutorial for how-to questions', () => {
      const result = simpleOptimizeQuery('How to create a React component?');
      expect(result.toLowerCase()).toMatch(/tutorial/);
    });

    it('should not add tutorial if already present', () => {
      const result = simpleOptimizeQuery('React hooks tutorial');
      // Should not duplicate
      const tutorialCount = (result.toLowerCase().match(/tutorial/g) || []).length;
      expect(tutorialCount).toBeLessThanOrEqual(1);
    });
  });
});

describe('isOptimizedQuery', () => {
  it('should return false for empty string', () => {
    expect(isOptimizedQuery('')).toBe(false);
    expect(isOptimizedQuery('   ')).toBe(false);
  });

  it('should return false for queries starting with question words', () => {
    expect(isOptimizedQuery('What is React?')).toBe(false);
    expect(isOptimizedQuery('How do I use hooks?')).toBe(false);
    expect(isOptimizedQuery('Why is TypeScript better?')).toBe(false);
  });

  it('should return false for queries ending with question mark', () => {
    expect(isOptimizedQuery('React hooks?')).toBe(false);
  });

  it('should return true for optimized queries', () => {
    expect(isOptimizedQuery('React hooks guide')).toBe(true);
    expect(isOptimizedQuery('TypeScript best practices 2025')).toBe(true);
    expect(isOptimizedQuery('MongoDB Express integration')).toBe(true);
  });
});
