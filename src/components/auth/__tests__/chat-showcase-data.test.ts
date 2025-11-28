import { describe, expect, it } from 'vitest';

import { MessagePartTypes } from '@/api/core/enums';

import {
  MOCK_ANALYSIS,
  MOCK_PARTICIPANT_MESSAGES,
  MOCK_PARTICIPANTS,
  MOCK_PRE_SEARCH,
  MOCK_USER,
  MOCK_USER_MESSAGE,
} from '../chat-showcase-data';

describe('chat-showcase-data', () => {
  describe('unique IDs', () => {
    it('should have unique IDs across all mock data items', () => {
      const allIds = new Set<string>();

      // Collect all IDs
      allIds.add(MOCK_USER_MESSAGE.id);
      allIds.add(MOCK_PRE_SEARCH.id);
      allIds.add(MOCK_ANALYSIS.id);
      MOCK_PARTICIPANT_MESSAGES.forEach(msg => allIds.add(msg.id));

      // Total count should equal unique count
      const expectedCount = 1 + 1 + 1 + MOCK_PARTICIPANT_MESSAGES.length;
      expect(allIds.size).toBe(expectedCount);
    });

    it('should have unique participant message IDs', () => {
      const messageIds = MOCK_PARTICIPANT_MESSAGES.map(msg => msg.id);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);
    });

    it('should have demo prefix in all IDs for disambiguation', () => {
      expect(MOCK_USER_MESSAGE.id).toContain('demo');
      expect(MOCK_PRE_SEARCH.id).toContain('demo');
      expect(MOCK_ANALYSIS.id).toContain('demo');
      MOCK_PARTICIPANT_MESSAGES.forEach((msg) => {
        expect(msg.id).toContain('demo');
      });
    });

    it('should have matching participant message IDs in analysis', () => {
      const analysisMessageIds = MOCK_ANALYSIS.participantMessageIds;
      const actualMessageIds = MOCK_PARTICIPANT_MESSAGES.map(msg => msg.id);
      expect(analysisMessageIds).toEqual(actualMessageIds);
    });
  });

  describe('mOCK_PRE_SEARCH structure', () => {
    it('should have complete searchData structure', () => {
      expect(MOCK_PRE_SEARCH.searchData).toBeDefined();
      expect(MOCK_PRE_SEARCH.searchData?.queries).toBeDefined();
      expect(MOCK_PRE_SEARCH.searchData?.results).toBeDefined();
      expect(MOCK_PRE_SEARCH.searchData?.analysis).toBeDefined();
    });

    it('should have multiple queries for comprehensive demo', () => {
      expect(MOCK_PRE_SEARCH.searchData?.queries.length).toBeGreaterThanOrEqual(2);
    });

    it('should have results for each query', () => {
      const queries = MOCK_PRE_SEARCH.searchData?.queries || [];
      const results = MOCK_PRE_SEARCH.searchData?.results || [];
      expect(results).toHaveLength(queries.length);
    });

    it('should have rich metadata in search results', () => {
      const results = MOCK_PRE_SEARCH.searchData?.results || [];
      results.forEach((queryResult) => {
        queryResult.results.forEach((result) => {
          // Required fields
          expect(result.title).toBeDefined();
          expect(result.url).toBeDefined();
          expect(result.content).toBeDefined();
          expect(result.score).toBeGreaterThanOrEqual(0);
          expect(result.score).toBeLessThanOrEqual(1);

          // Rich content fields
          expect(result.domain).toBeDefined();
        });
      });
    });

    it('should have favicon URLs in metadata', () => {
      const results = MOCK_PRE_SEARCH.searchData?.results || [];
      const allResultItems = results.flatMap(r => r.results);
      const resultsWithFavicons = allResultItems.filter(
        r => r.metadata?.faviconUrl,
      );
      expect(resultsWithFavicons.length).toBeGreaterThan(0);
    });

    it('should have unique URLs for all search results', () => {
      const results = MOCK_PRE_SEARCH.searchData?.results || [];
      const allUrls = results.flatMap(r => r.results.map(item => item.url));
      const uniqueUrls = new Set(allUrls);
      expect(uniqueUrls.size).toBe(allUrls.length);
    });

    it('should have correct query indices and totals', () => {
      const queries = MOCK_PRE_SEARCH.searchData?.queries || [];
      queries.forEach((query, idx) => {
        expect(query.index).toBe(idx);
        expect(query.total).toBe(queries.length);
      });
    });
  });

  describe('mOCK_PARTICIPANTS', () => {
    it('should have at least 2 participants for meaningful demo', () => {
      expect(MOCK_PARTICIPANTS.length).toBeGreaterThanOrEqual(2);
    });

    it('should have unique model IDs', () => {
      const modelIds = MOCK_PARTICIPANTS.map(p => p.modelId);
      const uniqueModelIds = new Set(modelIds);
      expect(uniqueModelIds.size).toBe(modelIds.length);
    });

    it('should have roles assigned to all participants', () => {
      MOCK_PARTICIPANTS.forEach((participant) => {
        expect(participant.role).toBeDefined();
        expect(participant.role.length).toBeGreaterThan(0);
      });
    });
  });

  describe('mOCK_PARTICIPANT_MESSAGES', () => {
    it('should have one message per participant', () => {
      expect(MOCK_PARTICIPANT_MESSAGES).toHaveLength(MOCK_PARTICIPANTS.length);
    });

    it('should have matching participant indices', () => {
      MOCK_PARTICIPANT_MESSAGES.forEach((msg, idx) => {
        expect(msg.participantIndex).toBe(idx);
        expect(msg.metadata.participantIndex).toBe(idx);
      });
    });

    it('should have text content in all messages', () => {
      MOCK_PARTICIPANT_MESSAGES.forEach((msg) => {
        expect(msg.parts.length).toBeGreaterThan(0);
        const textPart = msg.parts.find(p => p.type === MessagePartTypes.TEXT);
        expect(textPart).toBeDefined();
        expect(textPart).toHaveProperty('text');
        // Type assertion after validation - textPart is guaranteed to be defined and have TEXT type
        const validatedTextPart = textPart as { type: typeof MessagePartTypes.TEXT; text: string };
        expect(validatedTextPart.text.length).toBeGreaterThan(0);
      });
    });
  });

  describe('mOCK_ANALYSIS', () => {
    it('should have complete analysis data structure', () => {
      expect(MOCK_ANALYSIS.analysisData).toBeDefined();
      expect(MOCK_ANALYSIS.analysisData?.summary).toBeDefined();
      expect(MOCK_ANALYSIS.analysisData?.recommendations).toBeDefined();
      expect(MOCK_ANALYSIS.analysisData?.contributorPerspectives).toBeDefined();
    });

    it('should have contributor perspective for each participant', () => {
      const perspectives = MOCK_ANALYSIS.analysisData?.contributorPerspectives || [];
      expect(perspectives).toHaveLength(MOCK_PARTICIPANTS.length);
    });

    it('should have recommendations with unique titles', () => {
      const recommendations = MOCK_ANALYSIS.analysisData?.recommendations || [];
      const titles = recommendations.map(r => r.title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(titles.length);
    });

    it('should have non-empty recommendation titles', () => {
      const recommendations = MOCK_ANALYSIS.analysisData?.recommendations || [];
      recommendations.forEach((rec) => {
        expect(rec.title).toBeDefined();
        expect(rec.title.length).toBeGreaterThan(0);
      });
    });
  });

  describe('mOCK_USER', () => {
    it('should have user name defined', () => {
      expect(MOCK_USER.name).toBeDefined();
      expect(MOCK_USER.name.length).toBeGreaterThan(0);
    });
  });
});
