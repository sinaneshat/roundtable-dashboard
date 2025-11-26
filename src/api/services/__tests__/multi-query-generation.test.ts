/**
 * Multi-Query Generation Tests
 *
 * Tests to validate that the AI is generating multiple strategic queries
 * instead of just rephrasing the user's input.
 *
 * These tests validate the fix for: "Web search always showing user's exact prompt"
 *
 * @see docs/WEB_SEARCH_MULTI_QUERY_FIX.md for full context
 */

import { describe, expect, it } from 'vitest';

import { buildWebSearchQueryPrompt, WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT } from '../prompts.service';

describe('multi-Query Generation - Prompt Validation', () => {
  describe('system Prompt (WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT)', () => {
    it('should emphasize generating MULTIPLE DIFFERENT queries', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('MULTIPLE DIFFERENT queries');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('explore DIFFERENT aspects');
    });

    it('should include critical rule about NOT just rephrasing', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('NEVER just rephrase');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('🚨 **CRITICAL RULE**');
    });

    it('should provide negative example showing what is WRONG', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('❌ BAD');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('This is WRONG');
    });

    it('should provide positive examples showing correct multi-query decomposition', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('✅ GOOD');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('Multiple distinct angles');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('three different aspects');
    });

    it('should explain multi-query strategy (1-3 queries max)', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('1 query');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('2 queries');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('3 queries');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('MAXIMUM 3');
    });

    it('should emphasize each query must target DIFFERENT aspect', () => {
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('Each query MUST target a DIFFERENT aspect');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('Don\'t repeat the same search');
    });

    it('should include concrete examples of multi-query breakdowns', () => {
      // Docker example
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('Docker production');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('security hardening');
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('monitoring tools');

      // Comparison example
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('React vs Vue');

      // Microservices example
      expect(WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT).toContain('microservices');
    });
  });

  describe('user Prompt Template (buildWebSearchQueryPrompt)', () => {
    it('should generate prompt with user question', () => {
      const prompt = buildWebSearchQueryPrompt('How to set up Docker?');
      expect(prompt).toContain('USER QUESTION: "How to set up Docker?"');
    });

    it('should emphasize breaking question into DIFFERENT queries', () => {
      const prompt = buildWebSearchQueryPrompt('test query');
      expect(prompt).toContain('Break this question into strategic search queries');
      expect(prompt).toContain('explore DIFFERENT aspects');
      expect(prompt).toContain('DO NOT just rephrase the question');
    });

    it('should include decomposition strategy examples', () => {
      const prompt = buildWebSearchQueryPrompt('test query');
      expect(prompt).toContain('**DECOMPOSITION STRATEGY EXAMPLES**');
      expect(prompt).toContain('Q: "What is GraphQL?"');
      expect(prompt).toContain('Q: "GraphQL vs REST API performance"');
    });

    it('should include multiple positive examples (max 3 queries)', () => {
      const prompt = buildWebSearchQueryPrompt('test query');

      // Simple question example
      expect(prompt).toContain('Q: "What is GraphQL?"');
      expect(prompt).toContain('1 query (simple fact)');

      // Comparison example
      expect(prompt).toContain('Q: "GraphQL vs REST API performance"');
      expect(prompt).toContain('2 queries (comparison)');

      // Multi-faceted example
      expect(prompt).toContain('Q: "How to implement authentication in Next.js?"');
      expect(prompt).toContain('3 queries (multi-faceted');

      // Max queries example
      expect(prompt).toContain('Q: "Best practices for React state management"');
      expect(prompt).toContain('3 queries (MAXIMUM');
    });

    it('should remind to generate DIFFERENT angles at the end', () => {
      const prompt = buildWebSearchQueryPrompt('test query');
      expect(prompt).toContain('🚨 **REMEMBER**');
      expect(prompt).toContain('don\'t just repeat the same search with different wording');
    });

    it('should require JSON-only output', () => {
      const prompt = buildWebSearchQueryPrompt('test query');
      expect(prompt).toContain('Return ONLY valid JSON, no other text');
    });
  });

  describe('prompt Structure Validation', () => {
    it('should define required JSON structure', () => {
      const prompt = buildWebSearchQueryPrompt('test');
      expect(prompt).toContain('"totalQueries"');
      expect(prompt).toContain('"analysisRationale"');
      expect(prompt).toContain('"queries"');
    });

    it('should specify query object fields', () => {
      const prompt = buildWebSearchQueryPrompt('test');
      expect(prompt).toContain('query:');
      expect(prompt).toContain('rationale:');
      expect(prompt).toContain('searchDepth:');
      expect(prompt).toContain('complexity:');
      expect(prompt).toContain('sourceCount:');
    });

    it('should list optional fields', () => {
      const prompt = buildWebSearchQueryPrompt('test');
      expect(prompt).toContain('topic:');
      expect(prompt).toContain('timeRange:');
      expect(prompt).toContain('needsAnswer:');
      expect(prompt).toContain('includeImages:');
    });
  });

  describe('example Quality Validation (System Prompt)', () => {
    it('docker example should show 3 different queries', () => {
      const prompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;

      // Should have 3 distinct queries
      expect(prompt).toContain('Docker production configuration best practices');
      expect(prompt).toContain('Docker security hardening');
      expect(prompt).toContain('Docker monitoring tools production');

      // Each should have different rationale
      expect(prompt).toContain('Production-specific setup');
      expect(prompt).toContain('Security considerations');
      expect(prompt).toContain('Observability setup');
    });

    it('comparison example should search each framework separately', () => {
      const prompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;

      // Should have 2 separate queries
      expect(prompt).toContain('React framework benefits startups');
      expect(prompt).toContain('Vue framework benefits startups');

      // Different rationales
      expect(prompt).toContain('React advantages');
      expect(prompt).toContain('Vue advantages');
    });

    it('microservices example should have 3 distinct queries (max allowed)', () => {
      const prompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;

      // Should have 3 different approaches (max allowed)
      expect(prompt).toContain('microservices design patterns');
      expect(prompt).toContain('microservices communication protocols');
      expect(prompt).toContain('microservices deployment monitoring');
    });
  });

  describe('negative Example Quality', () => {
    it('should show exactly what NOT to do in system prompt', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;

      // System prompt should have the bad example
      expect(systemPrompt).toContain('❌ BAD (Single query just rephrasing)');
      expect(systemPrompt).toContain('totalQueries":1');
      expect(systemPrompt).toContain('This is WRONG - only one query');
    });
  });

  describe('emphasis and Formatting', () => {
    it('should use emojis to highlight critical sections', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('🚨');
      expect(systemPrompt).toContain('🔑');
      expect(systemPrompt).toContain('❌');
      expect(systemPrompt).toContain('✅');
      expect(systemPrompt).toContain('👆');
    });

    it('should use bold/caps for emphasis', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('**CRITICAL RULE**');
      expect(systemPrompt).toContain('**MULTI-QUERY STRATEGY**');
      expect(systemPrompt).toContain('MULTIPLE DIFFERENT');
      expect(systemPrompt).toContain('DIFFERENT aspect');
    });
  });
});

describe('multi-Query Generation - Expected Behavior', () => {
  describe('query Count Guidelines', () => {
    it('should generate 1 query only for ultra-simple facts', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('1 query');
      expect(systemPrompt).toContain('ultra-simple fact lookups');
    });

    it('should generate 2 queries for comparisons', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('2 queries');
      expect(systemPrompt).toContain('Comparisons (A vs B)');
    });

    it('should generate 3 queries max for multi-faceted or complex topics', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('3 queries');
      expect(systemPrompt).toContain('Multi-faceted or complex topics');
      expect(systemPrompt).toContain('THIS IS THE MAX');
    });
  });

  describe('query Decomposition Rules', () => {
    it('should remove question words', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('Remove question words');
    });

    it('should use keywords not sentences', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('keywords not sentences');
      expect(systemPrompt).toContain('3-8 words');
    });

    it('should add year for current topics', () => {
      const systemPrompt = WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT;
      expect(systemPrompt).toContain('Add year (2025)');
      expect(systemPrompt).toContain('ONLY for current/recent topics');
    });
  });
});
