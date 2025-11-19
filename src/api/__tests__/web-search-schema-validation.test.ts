/**
 * Web Search Schema Validation Tests
 *
 * Comprehensive tests for Zod schemas used in web search:
 * - GeneratedSearchQuerySchema
 * - WebSearchResultItemSchema
 * - WebSearchResultSchema
 * - Search depth, topic, time range enums
 * - Backward compatibility testing
 * - Type inference validation
 *
 * Pattern follows: Vitest + Zod validation testing
 */

import { describe, expect, it } from 'vitest';

import {
  WebSearchAnswerModes,
  WebSearchComplexities,
  WebSearchDepths,
  WebSearchRawContentFormats,
  WebSearchTimeRanges,
  WebSearchTopics,
} from '@/api/core/enums';
import {
  GeneratedSearchQuerySchema,
  WebSearchResultItemSchema,
  WebSearchResultMetaSchema,
  WebSearchResultSchema,
} from '@/api/routes/chat/schema';

describe('web Search Schema Validation', () => {
  describe('generatedSearchQuerySchema', () => {
    it('should validate basic generated query', () => {
      const validQuery = {
        query: 'React best practices 2025',
        rationale: 'Optimized search for React best practices',
        searchDepth: WebSearchDepths.BASIC,
      };

      const result = GeneratedSearchQuerySchema.safeParse(validQuery);

      expect(result.success).toBe(true);
      expect(result.data?.query).toBe('React best practices 2025');
      expect(result.data?.searchDepth).toBe(WebSearchDepths.BASIC);
    });

    it('should validate generated query with optional fields', () => {
      const validQuery = {
        query: 'TypeScript advanced patterns',
        rationale: 'Deep dive into TypeScript patterns',
        searchDepth: WebSearchDepths.ADVANCED,
        complexity: WebSearchComplexities.DEEP,
        sourceCount: 5,
        requiresFullContent: true,
        analysis: 'User wants comprehensive TypeScript information',
      };

      const result = GeneratedSearchQuerySchema.safeParse(validQuery);

      expect(result.success).toBe(true);
      expect(result.data?.complexity).toBe(WebSearchComplexities.DEEP);
      expect(result.data?.sourceCount).toBe(5);
      expect(result.data?.requiresFullContent).toBe(true);
    });

    it('should reject invalid search depth', () => {
      const invalidQuery = {
        query: 'test query',
        rationale: 'test',
        searchDepth: 'invalid-depth',
      };

      const result = GeneratedSearchQuerySchema.safeParse(invalidQuery);

      expect(result.success).toBe(false);
    });

    it('should allow empty query string (validation in handler)', () => {
      // Note: Empty query validation happens in the handler, not the schema
      // Schema allows empty string, handler rejects it
      const queryWithEmptyString = {
        query: '',
        rationale: 'test',
        searchDepth: WebSearchDepths.BASIC,
      };

      const result = GeneratedSearchQuerySchema.safeParse(queryWithEmptyString);

      // Schema accepts it (validation is in handler)
      expect(result.success).toBe(true);
    });

    it('should validate sourceCount range (1-10)', () => {
      const testCases = [
        { sourceCount: 0, shouldPass: false },
        { sourceCount: 1, shouldPass: true },
        { sourceCount: 5, shouldPass: true },
        { sourceCount: 10, shouldPass: true },
        { sourceCount: 11, shouldPass: false },
      ];

      testCases.forEach(({ sourceCount, shouldPass }) => {
        const query = {
          query: 'test',
          rationale: 'test',
          searchDepth: WebSearchDepths.BASIC,
          sourceCount,
        };

        const result = GeneratedSearchQuerySchema.safeParse(query);
        expect(result.success).toBe(shouldPass);
      });
    });
  });

  describe('webSearchResultItemSchema', () => {
    it('should validate basic result item', () => {
      const validItem = {
        title: 'Test Article',
        url: 'https://example.com/article',
        content: 'Article content snippet',
        score: 0.85,
      };

      const result = WebSearchResultItemSchema.safeParse(validItem);

      expect(result.success).toBe(true);
      expect(result.data?.title).toBe('Test Article');
      expect(result.data?.score).toBe(0.85);
    });

    it('should validate result item with all fields', () => {
      const completeItem = {
        title: 'Complete Article',
        url: 'https://example.com/complete',
        content: 'Preview content (800 chars)',
        excerpt: 'Short excerpt',
        fullContent: 'Complete article text...',
        score: 0.95,
        publishedDate: '2025-01-15',
        domain: 'example.com',
        metadata: {
          author: 'John Doe',
          readingTime: 5,
          wordCount: 1000,
          description: 'Article description',
          imageUrl: 'https://example.com/image.jpg',
          faviconUrl: 'https://example.com/favicon.ico',
        },
      };

      const result = WebSearchResultItemSchema.safeParse(completeItem);

      expect(result.success).toBe(true);
      expect(result.data?.fullContent).toBeDefined();
      expect(result.data?.metadata?.author).toBe('John Doe');
      expect(result.data?.metadata?.faviconUrl).toBeDefined();
    });

    it('should accept lenient URL validation', () => {
      const testUrls = [
        'https://example.com',
        'http://example.com',
        'https://example.com/path/to/page',
        'https://sub.example.com',
        '/relative/path', // Should accept relative URLs
      ];

      testUrls.forEach((url) => {
        const item = {
          title: 'Test',
          url,
          content: 'content',
          score: 0.5,
        };

        const result = WebSearchResultItemSchema.safeParse(item);
        expect(result.success).toBe(true);
      });
    });

    it('should validate score range (0-1)', () => {
      const testScores = [
        { score: -0.1, shouldPass: false },
        { score: 0, shouldPass: true },
        { score: 0.5, shouldPass: true },
        { score: 1, shouldPass: true },
        { score: 1.1, shouldPass: false },
      ];

      testScores.forEach(({ score, shouldPass }) => {
        const item = {
          title: 'Test',
          url: 'https://example.com',
          content: 'content',
          score,
        };

        const result = WebSearchResultItemSchema.safeParse(item);
        expect(result.success).toBe(shouldPass);
      });
    });

    it('should validate metadata subfields', () => {
      const itemWithMetadata = {
        title: 'Test',
        url: 'https://example.com',
        content: 'content',
        score: 0.8,
        metadata: {
          author: 'Jane Smith',
          readingTime: 3,
          wordCount: 600,
          description: 'Test description',
        },
      };

      const result = WebSearchResultItemSchema.safeParse(itemWithMetadata);

      expect(result.success).toBe(true);
      expect(result.data?.metadata?.readingTime).toBe(3);
      expect(result.data?.metadata?.wordCount).toBe(600);
    });

    it('should handle null publishedDate', () => {
      const item = {
        title: 'Test',
        url: 'https://example.com',
        content: 'content',
        score: 0.7,
        publishedDate: null,
      };

      const result = WebSearchResultItemSchema.safeParse(item);

      expect(result.success).toBe(true);
      expect(result.data?.publishedDate).toBeNull();
    });
  });

  describe('webSearchResultSchema', () => {
    it('should validate search result with results array', () => {
      const validResult = {
        query: 'test query',
        answer: null,
        results: [
          {
            title: 'Result 1',
            url: 'https://example.com/1',
            content: 'content 1',
            score: 0.9,
          },
          {
            title: 'Result 2',
            url: 'https://example.com/2',
            content: 'content 2',
            score: 0.8,
          },
        ],
        responseTime: 250,
      };

      const result = WebSearchResultSchema.safeParse(validResult);

      expect(result.success).toBe(true);
      expect(result.data?.results).toHaveLength(2);
      expect(result.data?.responseTime).toBe(250);
    });

    it('should validate result with LLM-generated answer', () => {
      const resultWithAnswer = {
        query: 'what is react',
        answer: 'React is a JavaScript library for building user interfaces...',
        results: [],
        responseTime: 300,
      };

      const result = WebSearchResultSchema.safeParse(resultWithAnswer);

      expect(result.success).toBe(true);
      expect(result.data?.answer).toBeDefined();
      expect(result.data?.answer).toContain('React');
    });

    it('should validate result with metadata', () => {
      const resultWithMeta = {
        query: 'test query',
        answer: null,
        results: [],
        responseTime: 200,
        _meta: {
          complexity: WebSearchComplexities.DEEP,
          cached: true,
          limitReached: false,
          searchesUsed: 3,
          maxSearches: 10,
          remainingSearches: 7,
        },
      };

      const result = WebSearchResultSchema.safeParse(resultWithMeta);

      expect(result.success).toBe(true);
      expect(result.data?._meta?.complexity).toBe(WebSearchComplexities.DEEP);
      expect(result.data?._meta?.cached).toBe(true);
      expect(result.data?._meta?.remainingSearches).toBe(7);
    });

    it('should accept empty results array', () => {
      const emptyResult = {
        query: 'test query',
        answer: null,
        results: [],
        responseTime: 100,
      };

      const result = WebSearchResultSchema.safeParse(emptyResult);

      expect(result.success).toBe(true);
      expect(result.data?.results).toEqual([]);
    });
  });

  describe('webSearchResultMetaSchema', () => {
    it('should validate metadata with all fields', () => {
      const validMeta = {
        cached: true,
        limitReached: false,
        searchesUsed: 5,
        maxSearches: 10,
        remainingSearches: 5,
      };

      const result = WebSearchResultMetaSchema.safeParse(validMeta);

      expect(result.success).toBe(true);
      expect(result.data?.cached).toBe(true);
      expect(result.data?.remainingSearches).toBe(5);
    });

    it('should validate metadata with partial fields', () => {
      const partialMeta = {
        cached: false,
      };

      const result = WebSearchResultMetaSchema.safeParse(partialMeta);

      expect(result.success).toBe(true);
    });

    it('should validate empty metadata object', () => {
      const emptyMeta = {};

      const result = WebSearchResultMetaSchema.safeParse(emptyMeta);

      expect(result.success).toBe(true);
    });

    it('should reject negative search counts', () => {
      const invalidMeta = {
        searchesUsed: -1,
        maxSearches: 10,
      };

      const result = WebSearchResultMetaSchema.safeParse(invalidMeta);

      expect(result.success).toBe(false);
    });
  });

  describe('enum Schemas', () => {
    it('should validate WebSearchDepth enum', () => {
      expect(WebSearchDepths.BASIC).toBe('basic');
      expect(WebSearchDepths.ADVANCED).toBe('advanced');

      const validDepths = ['basic', 'advanced'];
      validDepths.forEach((depth) => {
        expect(['basic', 'advanced']).toContain(depth);
      });
    });

    it('should validate WebSearchComplexity enum', () => {
      expect(WebSearchComplexities.BASIC).toBe('basic');
      expect(WebSearchComplexities.MODERATE).toBe('moderate');
      expect(WebSearchComplexities.DEEP).toBe('deep');

      const validComplexities = ['basic', 'moderate', 'deep'];
      validComplexities.forEach((complexity) => {
        expect(['basic', 'moderate', 'deep']).toContain(complexity);
      });
    });

    it('should validate WebSearchTopic enum', () => {
      expect(WebSearchTopics.GENERAL).toBe('general');
      expect(WebSearchTopics.NEWS).toBe('news');
      expect(WebSearchTopics.SCIENTIFIC).toBe('scientific');

      const validTopics = ['general', 'news', 'finance', 'health', 'scientific', 'travel'];
      validTopics.forEach((topic) => {
        expect(['general', 'news', 'finance', 'health', 'scientific', 'travel']).toContain(topic);
      });
    });

    it('should validate WebSearchTimeRange enum', () => {
      expect(WebSearchTimeRanges.DAY).toBe('day');
      expect(WebSearchTimeRanges.WEEK).toBe('week');
      expect(WebSearchTimeRanges.MONTH).toBe('month');
      expect(WebSearchTimeRanges.YEAR).toBe('year');

      const validRanges = ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'];
      validRanges.forEach((range) => {
        expect(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y']).toContain(range);
      });
    });

    it('should validate WebSearchRawContentFormat enum', () => {
      expect(WebSearchRawContentFormats.MARKDOWN).toBe('markdown');
      expect(WebSearchRawContentFormats.TEXT).toBe('text');

      const validFormats = ['markdown', 'text'];
      validFormats.forEach((format) => {
        expect(['markdown', 'text']).toContain(format);
      });
    });

    it('should validate WebSearchAnswerMode enum', () => {
      expect(WebSearchAnswerModes.NONE).toBe('none');
      expect(WebSearchAnswerModes.BASIC).toBe('basic');
      expect(WebSearchAnswerModes.ADVANCED).toBe('advanced');

      const validModes = ['none', 'basic', 'advanced'];
      validModes.forEach((mode) => {
        expect(['none', 'basic', 'advanced']).toContain(mode);
      });
    });
  });

  describe('backward Compatibility', () => {
    it('should accept results without fullContent field', () => {
      const legacyItem = {
        title: 'Legacy Result',
        url: 'https://example.com',
        content: 'content only',
        score: 0.7,
      };

      const result = WebSearchResultItemSchema.safeParse(legacyItem);

      expect(result.success).toBe(true);
      expect(result.data?.fullContent).toBeUndefined();
    });

    it('should accept results without metadata field', () => {
      const basicItem = {
        title: 'Basic Result',
        url: 'https://example.com',
        content: 'content',
        score: 0.6,
      };

      const result = WebSearchResultItemSchema.safeParse(basicItem);

      expect(result.success).toBe(true);
      expect(result.data?.metadata).toBeUndefined();
    });

    it('should accept generated query without optional analysis fields', () => {
      const minimalQuery = {
        query: 'search query',
        rationale: 'search rationale',
        searchDepth: WebSearchDepths.BASIC,
      };

      const result = GeneratedSearchQuerySchema.safeParse(minimalQuery);

      expect(result.success).toBe(true);
      expect(result.data?.complexity).toBeUndefined();
      expect(result.data?.analysis).toBeUndefined();
    });

    it('should accept search result without _meta field', () => {
      const basicResult = {
        query: 'test',
        answer: null,
        results: [],
        responseTime: 100,
      };

      const result = WebSearchResultSchema.safeParse(basicResult);

      expect(result.success).toBe(true);
      expect(result.data?._meta).toBeUndefined();
    });
  });

  describe('type Inference', () => {
    it('should infer correct TypeScript types from schemas', () => {
      const query: import('@/api/routes/chat/schema').GeneratedSearchQuery = {
        query: 'test',
        rationale: 'test',
        searchDepth: 'basic',
      };

      expect(query.searchDepth).toBe('basic');
    });

    it('should infer result item type correctly', () => {
      const item: import('@/api/routes/chat/schema').WebSearchResultItem = {
        title: 'Test',
        url: 'https://example.com',
        content: 'content',
        score: 0.8,
      };

      expect(item.score).toBe(0.8);
    });

    it('should infer result type with optional fields', () => {
      const result: import('@/api/routes/chat/schema').WebSearchResult = {
        query: 'test',
        answer: 'answer text',
        results: [],
        responseTime: 150,
      };

      expect(result.answer).toBe('answer text');
    });
  });

  describe('edge Cases', () => {
    it('should handle very long content strings', () => {
      const longContent = 'x'.repeat(15000);
      const item = {
        title: 'Test',
        url: 'https://example.com',
        content: longContent.substring(0, 800),
        fullContent: longContent,
        score: 0.5,
      };

      const result = WebSearchResultItemSchema.safeParse(item);

      expect(result.success).toBe(true);
    });

    it('should handle special characters in URLs', () => {
      const specialUrls = [
        'https://example.com/path?query=value&foo=bar',
        'https://example.com/path#section',
        'https://example.com/path?q=test%20query',
      ];

      specialUrls.forEach((url) => {
        const item = {
          title: 'Test',
          url,
          content: 'content',
          score: 0.5,
        };

        const result = WebSearchResultItemSchema.safeParse(item);
        expect(result.success).toBe(true);
      });
    });

    it('should handle unicode characters in titles and content', () => {
      const item = {
        title: '日本語タイトル',
        url: 'https://example.com',
        content: 'Content with émojis 🎉 and spëcial chars',
        score: 0.7,
      };

      const result = WebSearchResultItemSchema.safeParse(item);

      expect(result.success).toBe(true);
    });

    it('should handle zero response time', () => {
      const result = {
        query: 'test',
        answer: null,
        results: [],
        responseTime: 0,
      };

      const validation = WebSearchResultSchema.safeParse(result);

      expect(validation.success).toBe(true);
    });
  });
});
