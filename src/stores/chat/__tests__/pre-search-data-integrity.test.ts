/**
 * Pre-Search Data Integrity Tests
 *
 * Ensures ALL data generated from the backend for pre-searches is:
 * 1. Properly streamed to the frontend via SSE
 * 2. Stored correctly in the chat store
 * 3. Available for UI components to display
 * 4. No fields are missing or dropped during transfer
 *
 * These tests prevent regressions where data (like images, metadata)
 * is available in the backend response but not shown in the UI.
 *
 * Location: /src/stores/chat/__tests__/pre-search-data-integrity.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipant,
  createMockPreSearchDataPayload,
  createMockPreSearchDataPayloadMetadataOnly,
  createMockPreSearchDataPayloadMinimal,
  createMockPreSearchDataPayloadMultiQuery,
  createMockThread,
  createMockWebSearchResultItem,
  createMockWebSearchResultItemMetadataOnly,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// PRE-SEARCH DATA INTEGRITY TESTS
// ============================================================================

describe('pre-Search Data Integrity', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // COMPLETE DATA FLOW TESTS
  // ==========================================================================

  describe('complete Data Fields Preservation', () => {
    it('should preserve ALL WebSearchResultItem fields when storing search data', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant], []);

      // Add pre-search with comprehensive data
      store.getState().addPreSearch(createPendingPreSearch(0));
      const completeData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, completeData);

      // Verify ALL fields are preserved
      const storedData = store.getState().preSearches[0].searchData;
      expect(storedData).not.toBeNull();

      // Verify queries
      expect(storedData?.queries).toHaveLength(1);
      expect(storedData?.queries?.[0]?.query).toBe('test search query');
      expect(storedData?.queries?.[0]?.rationale).toBe('Test rationale explaining why this query was chosen');
      expect(storedData?.queries?.[0]?.searchDepth).toBe('basic');
      expect(storedData?.queries?.[0]?.index).toBe(0);
      expect(storedData?.queries?.[0]?.total).toBe(1);

      // Verify results structure
      expect(storedData?.results).toHaveLength(1);
      const resultGroup = storedData?.results?.[0];
      expect(resultGroup?.query).toBe('test search query');
      expect(resultGroup?.results).toHaveLength(2);
      expect(resultGroup?.responseTime).toBe(1250);

      // Verify first result item - ALL fields
      const firstResult = resultGroup?.results?.[0];
      expect(firstResult?.title).toBe('Complete Test Result with All Fields');
      expect(firstResult?.url).toBe('https://example.com/test-article');
      expect(firstResult?.content).toContain('Full content from the webpage');
      expect(firstResult?.excerpt).toContain('Short excerpt snippet');
      expect(firstResult?.fullContent).toContain('complete full content');
      expect(firstResult?.rawContent).toContain('# Test Article');
      expect(firstResult?.score).toBe(0.85);
      expect(firstResult?.domain).toBe('example.com');
      expect(firstResult?.publishedDate).toBe('2024-11-15T10:00:00Z');

      // Verify metadata is preserved
      expect(firstResult?.metadata).toBeDefined();
      expect(firstResult?.metadata?.author).toBe('John Author');
      expect(firstResult?.metadata?.description).toContain('Meta description');
      expect(firstResult?.metadata?.imageUrl).toBe('https://example.com/og-image.jpg');
      expect(firstResult?.metadata?.faviconUrl).toContain('google.com/s2/favicons');
      expect(firstResult?.metadata?.wordCount).toBe(1500);
      expect(firstResult?.metadata?.readingTime).toBe(8);

      // Verify images array is preserved
      expect(firstResult?.images).toHaveLength(3);
      expect(firstResult?.images?.[0]?.url).toBe('https://example.com/image1.jpg');
      expect(firstResult?.images?.[0]?.alt).toBe('First image');
      expect(firstResult?.images?.[1]?.url).toBe('https://example.com/image2.png');
      expect(firstResult?.images?.[2]?.url).toBe('https://example.com/image3.webp');

      // Verify key points are preserved
      expect(firstResult?.keyPoints).toHaveLength(2);
      expect(firstResult?.keyPoints?.[0]).toBe('Key point 1 from content');

      // Verify statistics
      expect(storedData?.analysis).toContain('Search analysis');
      expect(storedData?.successCount).toBe(1);
      expect(storedData?.failureCount).toBe(0);
      expect(storedData?.totalResults).toBe(2);
      expect(storedData?.totalTime).toBe(1250);
    });

    it('should preserve image URLs for og:image and page images separately', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const dataWithImages = createMockPreSearchDataPayload({
        results: [
          {
            query: 'image test',
            answer: null,
            results: [
              createMockWebSearchResultItem({
                metadata: {
                  imageUrl: 'https://example.com/og-image-preview.jpg', // og:image
                },
                images: [
                  { url: 'https://example.com/inline-img-1.jpg', alt: 'Inline 1' },
                  { url: 'https://example.com/inline-img-2.png', alt: 'Inline 2' },
                ],
              }),
            ],
            responseTime: 500,
          },
        ],
      });

      store.getState().updatePreSearchData(0, dataWithImages);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // og:image in metadata
      expect(result?.metadata?.imageUrl).toBe('https://example.com/og-image-preview.jpg');

      // Page images array
      expect(result?.images).toHaveLength(2);
      expect(result?.images?.[0]?.url).toBe('https://example.com/inline-img-1.jpg');
      expect(result?.images?.[1]?.url).toBe('https://example.com/inline-img-2.png');
    });
  });

  // ==========================================================================
  // MULTI-QUERY DATA INTEGRITY
  // ==========================================================================

  describe('multi-Query Data Integrity', () => {
    it('should preserve all queries and their results in multi-query scenarios', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const multiQueryData = createMockPreSearchDataPayloadMultiQuery();
      store.getState().updatePreSearchData(0, multiQueryData);

      const storedData = store.getState().preSearches[0].searchData;

      // Verify all 3 queries preserved
      expect(storedData?.queries).toHaveLength(3);
      expect(storedData?.queries?.[0]?.query).toBe('first aspect of topic');
      expect(storedData?.queries?.[0]?.searchDepth).toBe('advanced');
      expect(storedData?.queries?.[1]?.query).toBe('second aspect comparison');
      expect(storedData?.queries?.[1]?.searchDepth).toBe('basic');
      expect(storedData?.queries?.[2]?.query).toBe('third aspect implications');

      // Verify all 3 result groups preserved
      expect(storedData?.results).toHaveLength(3);
      expect(storedData?.results?.[0]?.results).toHaveLength(2);
      expect(storedData?.results?.[1]?.results).toHaveLength(1);
      expect(storedData?.results?.[2]?.results).toHaveLength(3);

      // Verify total results count
      expect(storedData?.totalResults).toBe(6);
      expect(storedData?.successCount).toBe(3);
    });

    it('should preserve query-result association correctly', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const multiQueryData = createMockPreSearchDataPayloadMultiQuery();
      store.getState().updatePreSearchData(0, multiQueryData);

      const storedData = store.getState().preSearches[0].searchData;

      // Each result group should match its query
      expect(storedData?.results?.[0]?.query).toBe('first aspect of topic');
      expect(storedData?.results?.[1]?.query).toBe('second aspect comparison');
      expect(storedData?.results?.[2]?.query).toBe('third aspect implications');
    });
  });

  // ==========================================================================
  // MINIMAL DATA HANDLING
  // ==========================================================================

  describe('minimal Data Handling (Graceful Degradation)', () => {
    it('should handle results without images or metadata gracefully', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const minimalData = createMockPreSearchDataPayloadMinimal();
      store.getState().updatePreSearchData(0, minimalData);

      const storedData = store.getState().preSearches[0].searchData;
      const result = storedData?.results?.[0]?.results?.[0];

      // Basic fields should still be present
      expect(result?.title).toBe('Minimal Result');
      expect(result?.url).toBe('https://minimal.com');
      expect(result?.content).toBe('Basic content only');

      // Optional fields should be undefined/null, not cause errors
      expect(result?.metadata).toBeUndefined();
      expect(result?.images).toBeUndefined();
      expect(result?.fullContent).toBeUndefined();
      expect(result?.rawContent).toBeUndefined();
    });

    it('should not throw when accessing missing optional fields', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const minimalData = createMockPreSearchDataPayloadMinimal();
      store.getState().updatePreSearchData(0, minimalData);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // Safe access patterns should work without throwing
      expect(() => {
        const _imageUrl = result?.metadata?.imageUrl;
        const _images = result?.images || [];
        const _author = result?.metadata?.author ?? 'Unknown';
        const _wordCount = result?.metadata?.wordCount ?? 0;
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // STREAMING STATE TRANSITIONS
  // ==========================================================================

  describe('streaming State Transitions', () => {
    it('should transition from PENDING to COMPLETE with data', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Initial state: PENDING with no data
      store.getState().addPreSearch(createPendingPreSearch(0));
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
      expect(store.getState().preSearches[0].searchData).toBeNull();

      // After streaming completes: COMPLETE with full data
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).not.toBeNull();
    });

    it('should allow partial data updates during streaming', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Simulate streaming: first just queries
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Then complete with full data
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData?.queries).toHaveLength(1);
      expect(store.getState().preSearches[0].searchData?.results).toHaveLength(1);
    });
  });

  // ==========================================================================
  // DATA CONSISTENCY ACROSS ROUNDS
  // ==========================================================================

  describe('data Consistency Across Multiple Rounds', () => {
    it('should maintain separate searchData for each round', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Round 0: Simple query
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayloadMinimal());

      // Round 1: Complex multi-query
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayloadMultiQuery());

      // Round 2: Standard query
      store.getState().addPreSearch(createPendingPreSearch(2));
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

      // Verify each round has distinct data
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(3);

      // Round 0: minimal
      expect(preSearches[0].searchData?.queries).toHaveLength(1);
      expect(preSearches[0].searchData?.totalResults).toBe(1);

      // Round 1: multi-query (3 queries, 6 results)
      expect(preSearches[1].searchData?.queries).toHaveLength(3);
      expect(preSearches[1].searchData?.totalResults).toBe(6);

      // Round 2: standard (1 query, 2 results)
      expect(preSearches[2].searchData?.queries).toHaveLength(1);
      expect(preSearches[2].searchData?.totalResults).toBe(2);
    });

    it('should not corrupt earlier rounds when adding new ones', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Setup round 0 with specific data
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload({
        analysis: 'Round 0 specific analysis',
        totalTime: 1000,
      }));

      const round0DataBefore = store.getState().preSearches[0].searchData;

      // Add round 1 with different data
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload({
        analysis: 'Round 1 different analysis',
        totalTime: 2000,
      }));

      // Verify round 0 is unchanged
      const round0DataAfter = store.getState().preSearches[0].searchData;
      expect(round0DataAfter?.analysis).toBe('Round 0 specific analysis');
      expect(round0DataAfter?.totalTime).toBe(1000);
      expect(round0DataAfter).toEqual(round0DataBefore);
    });
  });

  // ==========================================================================
  // FIELD PRESENCE VERIFICATION (UI CONTRACT)
  // ==========================================================================

  describe('uI Contract - Required Fields for Display', () => {
    it('should provide all fields needed by WebSearchResultItem component', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // Fields required by WebSearchResultItem component
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('domain');
      expect(result).toHaveProperty('score');

      // Optional but expected fields for rich display
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('images');
      expect(result).toHaveProperty('excerpt');
    });

    it('should provide all fields needed by WebSearchConfigurationDisplay component', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      const searchData = store.getState().preSearches[0].searchData;

      // Fields required by WebSearchConfigurationDisplay
      expect(searchData).toHaveProperty('queries');
      expect(searchData).toHaveProperty('results');
      expect(searchData).toHaveProperty('totalResults');
      expect(searchData).toHaveProperty('totalTime');
      expect(searchData).toHaveProperty('analysis');

      // Query fields
      const query = searchData?.queries?.[0];
      expect(query).toHaveProperty('query');
      expect(query).toHaveProperty('rationale');
      expect(query).toHaveProperty('searchDepth');
      expect(query).toHaveProperty('index');
      expect(query).toHaveProperty('total');
    });

    it('should provide image URLs in expected format for display', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // Image URLs should be complete URLs, not relative paths
      expect(result?.metadata?.imageUrl).toMatch(/^https?:\/\//);
      expect(result?.metadata?.faviconUrl).toMatch(/^https?:\/\//);

      result?.images?.forEach((img) => {
        expect(img.url).toMatch(/^https?:\/\//);
      });
    });
  });

  // ==========================================================================
  // METADATA-ONLY EXTRACTION (BROWSER UNAVAILABLE FIX)
  // ==========================================================================

  describe('metadata-Only Extraction (Lightweight Browser-Free)', () => {
    /**
     * These tests verify the fix for the bug where metadata was not applied
     * when browser was unavailable. The fix ensures metadata (og:image, favicon,
     * description) is applied even when fullContent/rawContent are empty.
     */

    it('should store metadata even when fullContent and rawContent are missing', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Use metadata-only payload (simulates browser unavailable scenario)
      const metadataOnlyData = createMockPreSearchDataPayloadMetadataOnly();
      store.getState().updatePreSearchData(0, metadataOnlyData);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // Metadata MUST be present even without fullContent
      expect(result?.metadata).toBeDefined();
      expect(result?.metadata?.imageUrl).toBe('https://example.com/og-preview.jpg');
      expect(result?.metadata?.faviconUrl).toContain('google.com/s2/favicons');
      expect(result?.metadata?.description).toBe('Page meta description from head tag');

      // fullContent and rawContent should be missing (browser unavailable)
      expect(result?.fullContent).toBeUndefined();
      expect(result?.rawContent).toBeUndefined();

      // Basic content from search API should still be present
      expect(result?.content).toBeDefined();
      expect(result?.content).toContain('Search snippet');
    });

    it('should provide og:image URL to UI even without page scraping', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const metadataOnlyData = createMockPreSearchDataPayloadMetadataOnly();
      store.getState().updatePreSearchData(0, metadataOnlyData);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // og:image should be available for UI display
      const ogImageUrl = result?.metadata?.imageUrl;
      expect(ogImageUrl).toBeDefined();
      expect(ogImageUrl).toMatch(/^https?:\/\//);
      expect(ogImageUrl).toBe('https://example.com/og-preview.jpg');
    });

    it('should provide favicon URL via Google service when page favicon unavailable', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const metadataOnlyData = createMockPreSearchDataPayloadMetadataOnly();
      store.getState().updatePreSearchData(0, metadataOnlyData);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // Favicon should use Google's service as fallback
      const faviconUrl = result?.metadata?.faviconUrl;
      expect(faviconUrl).toBeDefined();
      expect(faviconUrl).toContain('google.com/s2/favicons');
      expect(faviconUrl).toContain('domain=');
    });

    it('should handle partial metadata (only favicon, no og:image)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const metadataOnlyData = createMockPreSearchDataPayloadMetadataOnly();
      store.getState().updatePreSearchData(0, metadataOnlyData);

      // Second result has only favicon, no og:image
      const secondResult = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[1];

      expect(secondResult?.metadata).toBeDefined();
      expect(secondResult?.metadata?.faviconUrl).toContain('google.com/s2/favicons');
      expect(secondResult?.metadata?.imageUrl).toBeUndefined();
    });

    it('should allow UI to display metadata image when images array is empty', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const metadataOnlyData = createMockPreSearchDataPayloadMetadataOnly();
      store.getState().updatePreSearchData(0, metadataOnlyData);

      const result = store.getState().preSearches[0].searchData?.results?.[0]?.results?.[0];

      // images array is empty (no page scraping)
      expect(result?.images).toBeUndefined();

      // But metadata.imageUrl IS available (from og:image)
      expect(result?.metadata?.imageUrl).toBe('https://example.com/og-preview.jpg');

      // UI can use: result.metadata?.imageUrl || result.images?.[0]?.url
      const displayImageUrl = result?.metadata?.imageUrl || result?.images?.[0]?.url;
      expect(displayImageUrl).toBe('https://example.com/og-preview.jpg');
    });

    it('should preserve all fields from metadata-only WebSearchResultItem', () => {
      const metadataOnlyResult = createMockWebSearchResultItemMetadataOnly({
        title: 'Test Title',
        url: 'https://test.com/page',
        domain: 'test.com',
        metadata: {
          imageUrl: 'https://test.com/og.jpg',
          faviconUrl: 'https://www.google.com/s2/favicons?domain=test.com&sz=64',
          description: 'Test description',
        },
      });

      // Verify the factory produces correct structure
      expect(metadataOnlyResult.title).toBe('Test Title');
      expect(metadataOnlyResult.url).toBe('https://test.com/page');
      expect(metadataOnlyResult.domain).toBe('test.com');
      expect(metadataOnlyResult.metadata?.imageUrl).toBe('https://test.com/og.jpg');
      expect(metadataOnlyResult.metadata?.faviconUrl).toContain('google.com/s2/favicons');
      expect(metadataOnlyResult.metadata?.description).toBe('Test description');

      // No content extraction fields
      expect((metadataOnlyResult as Record<string, unknown>).fullContent).toBeUndefined();
      expect((metadataOnlyResult as Record<string, unknown>).rawContent).toBeUndefined();
    });

    it('should correctly combine metadata-only and full results in same payload', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Create mixed payload: some results with full content, some metadata-only
      const mixedData = createMockPreSearchDataPayload({
        results: [
          {
            query: 'mixed results',
            answer: null,
            results: [
              // Full result (browser available for this page)
              createMockWebSearchResultItem({
                title: 'Full Result',
                fullContent: 'Complete extracted content',
                rawContent: '# Markdown',
                metadata: {
                  imageUrl: 'https://full.com/og.jpg',
                  wordCount: 1500,
                  readingTime: 8,
                },
                images: [{ url: 'https://full.com/img1.jpg', alt: 'Image 1' }],
              }),
              // Metadata-only result (browser unavailable for this page)
              createMockWebSearchResultItemMetadataOnly({
                title: 'Metadata Only Result',
                metadata: {
                  imageUrl: 'https://meta.com/og.jpg',
                },
              }),
            ],
            responseTime: 1000,
          },
        ],
      });

      store.getState().updatePreSearchData(0, mixedData);

      const results = store.getState().preSearches[0].searchData?.results?.[0]?.results;

      // Full result has everything
      expect(results?.[0]?.fullContent).toBe('Complete extracted content');
      expect(results?.[0]?.rawContent).toBe('# Markdown');
      expect(results?.[0]?.images).toHaveLength(1);
      expect(results?.[0]?.metadata?.wordCount).toBe(1500);

      // Metadata-only result has metadata but no full content
      expect(results?.[1]?.fullContent).toBeUndefined();
      expect(results?.[1]?.rawContent).toBeUndefined();
      expect(results?.[1]?.metadata?.imageUrl).toBe('https://meta.com/og.jpg');
    });
  });

  // ==========================================================================
  // ERROR SCENARIOS
  // ==========================================================================

  describe('error Scenario Handling', () => {
    it('should handle empty results gracefully', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const emptyResultsData = createMockPreSearchDataPayload({
        results: [],
        totalResults: 0,
        successCount: 0,
        failureCount: 1,
      });

      store.getState().updatePreSearchData(0, emptyResultsData);

      const searchData = store.getState().preSearches[0].searchData;
      expect(searchData?.results).toHaveLength(0);
      expect(searchData?.totalResults).toBe(0);
      expect(searchData?.failureCount).toBe(1);
    });

    it('should handle partial failures in multi-query searches', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);
      store.getState().addPreSearch(createPendingPreSearch(0));

      const partialFailureData = createMockPreSearchDataPayload({
        queries: [
          { query: 'success query', rationale: '', searchDepth: 'basic', index: 0, total: 2 },
          { query: 'failed query', rationale: '', searchDepth: 'basic', index: 1, total: 2 },
        ],
        results: [
          {
            query: 'success query',
            answer: null,
            results: [createMockWebSearchResultItem()],
            responseTime: 500,
          },
          // Second query failed - no results
        ],
        successCount: 1,
        failureCount: 1,
        totalResults: 1,
      });

      store.getState().updatePreSearchData(0, partialFailureData);

      const searchData = store.getState().preSearches[0].searchData;
      expect(searchData?.queries).toHaveLength(2);
      expect(searchData?.results).toHaveLength(1); // Only successful query has results
      expect(searchData?.successCount).toBe(1);
      expect(searchData?.failureCount).toBe(1);
    });
  });
});
