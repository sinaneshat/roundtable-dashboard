import { z } from '@hono/zod-openapi';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

const PLATFORMS = ['reddit', 'twitter', 'instagram'] as const;

/**
 * Discover trends request
 */
export const DiscoverTrendsRequestSchema = z.object({
  keyword: z.string().min(2).max(100).openapi({
    example: 'AI regulations',
    description: 'Keyword to search for trending topics (2-100 characters)',
  }),
  platforms: z.array(z.enum(PLATFORMS)).default(['reddit', 'twitter']).openapi({
    example: ['reddit', 'twitter'],
    description: 'Platforms to search for trends',
  }),
  maxSuggestions: z.number().int().min(1).max(10).default(5).openapi({
    example: 5,
    description: 'Maximum number of suggestions to return (1-10)',
  }),
}).openapi('DiscoverTrendsRequest');

export type DiscoverTrendsRequest = z.infer<typeof DiscoverTrendsRequestSchema>;

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Single trend suggestion
 */
export const TrendSuggestionSchema = z.object({
  prompt: z.string().openapi({
    example: 'What are the implications of the new EU AI Act for startups?',
    description: 'Generated discussion prompt',
  }),
  topic: z.string().openapi({
    example: 'EU AI Act startup impact',
    description: 'Brief topic name',
  }),
  platform: z.enum(PLATFORMS).openapi({
    example: 'reddit',
    description: 'Source platform where trend was found',
  }),
  relevanceScore: z.number().min(0).max(100).openapi({
    example: 85,
    description: 'Relevance score (0-100)',
  }),
  suggestedRounds: z.number().int().min(1).max(5).openapi({
    example: 3,
    description: 'Suggested number of discussion rounds (1-5)',
  }),
  reasoning: z.string().openapi({
    example: 'High engagement on r/startups with 500+ comments discussing compliance challenges',
    description: 'Why this topic is trending and the round count rationale',
  }),
}).openapi('TrendSuggestion');

export type TrendSuggestion = z.infer<typeof TrendSuggestionSchema>;

/**
 * Search summary metadata
 */
export const SearchSummarySchema = z.object({
  totalResultsAnalyzed: z.number().openapi({
    example: 15,
    description: 'Total search results analyzed',
  }),
  platformsSearched: z.array(z.string()).openapi({
    example: ['reddit', 'twitter'],
    description: 'Platforms that were searched',
  }),
  keyword: z.string().openapi({
    example: 'AI regulations',
    description: 'Original search keyword',
  }),
}).openapi('SearchSummary');

export type SearchSummary = z.infer<typeof SearchSummarySchema>;

/**
 * Discover trends response
 */
export const DiscoverTrendsResponseSchema = z.object({
  suggestions: z.array(TrendSuggestionSchema).openapi({
    description: 'List of trend suggestions',
  }),
  searchSummary: SearchSummarySchema.openapi({
    description: 'Summary of the search operation',
  }),
}).openapi('DiscoverTrendsResponse');

export type DiscoverTrendsResponse = z.infer<typeof DiscoverTrendsResponseSchema>;
