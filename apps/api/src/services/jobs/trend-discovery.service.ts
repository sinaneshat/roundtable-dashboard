/**
 * Trend Discovery Service
 *
 * Searches social media platforms for trending topics and uses AI to extract
 * discussion prompts with suggested round counts for automated jobs.
 */

import { ModelIds } from '@roundtable/shared/enums';
import { generateObject } from 'ai';
import { z } from 'zod';

import type { TrendSuggestion } from '@/routes/admin/jobs/trends/schema';
import type { WebSearchParameters } from '@/routes/chat/schema';
import { performWebSearch } from '@/services/search/web-search.service';
import type { ApiEnv } from '@/types';

import { initializeOpenRouter, openRouterService } from '../models';

// 5-part enum pattern for Platform
const PLATFORMS = ['reddit', 'twitter', 'instagram'] as const;
const PlatformSchema = z.enum(PLATFORMS);
type Platform = z.infer<typeof PlatformSchema>;
const Platforms = {
  INSTAGRAM: 'instagram',
  REDDIT: 'reddit',
  TWITTER: 'twitter',
} as const;

type TrendDiscoveryResult = {
  suggestions: TrendSuggestion[];
  searchSummary: {
    totalResultsAnalyzed: number;
    platformsSearched: string[];
    keyword: string;
  };
};

const PLATFORM_SEARCH_CONFIGS: Record<Platform, { query: (keyword: string) => string; domain: string }> = {
  [Platforms.INSTAGRAM]: {
    domain: 'instagram.com',
    query: (keyword: string) => `site:instagram.com ${keyword} viral`,
  },
  [Platforms.REDDIT]: {
    domain: 'reddit.com',
    query: (keyword: string) => `site:reddit.com ${keyword} discussion`,
  },
  [Platforms.TWITTER]: {
    domain: 'twitter.com',
    query: (keyword: string) => `(site:twitter.com OR site:x.com) ${keyword} trending`,
  },
};

const TrendExtractionSchema = z.object({
  suggestions: z.array(z.object({
    platform: PlatformSchema.describe('Source platform'),
    prompt: z.string().describe('Engaging discussion prompt (50-200 characters)'),
    reasoning: z.string().describe('Why trending and rounds rationale'),
    relevanceScore: z.number().min(0).max(100).describe('Relevance/trending score'),
    suggestedRounds: z.number().min(1).max(5).describe('Suggested discussion rounds'),
    topic: z.string().describe('Brief topic name (3-8 words)'),
  }).strict()),
}).strict();

function buildExtractionPrompt(keyword: string, formattedResults: string): string {
  return `Analyze these social media search results about "${keyword}".

Extract trending topics and generate discussion prompts for a multi-AI roundtable.

Search Results:
${formattedResults}

Guidelines:
- Higher rounds (4-5) for complex/controversial topics that benefit from multiple perspectives
- Lower rounds (2-3) for simpler/factual topics
- Prompts should encourage diverse AI perspectives and debate
- Focus on genuinely trending discussions, not ads/spam
- relevanceScore: 80-100 for highly trending topics with lots of engagement, 50-79 for moderately trending, below 50 for less relevant
- Generate prompts that are thought-provoking questions, not statements

Output ${Math.min(5, Math.ceil(formattedResults.length / 1000))} suggestions maximum.`;
}

function formatSearchResults(
  results: { platform: Platform; title: string; snippet: string; url: string }[],
): string {
  return results
    .map((r, i) => `[${i + 1}] [${r.platform}] ${r.title}\n${r.snippet}\nURL: ${r.url}`)
    .join('\n\n');
}

/**
 * Discover trending topics from social media platforms
 */
export async function discoverTrends(
  keyword: string,
  platforms: Platform[],
  maxSuggestions: number,
  env: ApiEnv['Bindings'],
): Promise<TrendDiscoveryResult> {
  // Search each platform in parallel
  const searchPromises = platforms.map(async (platform) => {
    const config = PLATFORM_SEARCH_CONFIGS[platform];
    try {
      const searchParams: WebSearchParameters = {
        autoParameters: false,
        chunksPerSource: 1,
        includeAnswer: false,
        includeFavicon: false,
        includeImageDescriptions: false,
        includeImages: false,
        includeRawContent: false,
        maxResults: 3,
        query: config.query(keyword),
        searchDepth: 'basic',
      };

      const result = await performWebSearch(
        searchParams,
        env,
      );

      return result.results.map(r => ({
        platform,
        snippet: r.content || r.excerpt || '',
        title: r.title,
        url: r.url,
      }));
    } catch {
      return [];
    }
  });

  const searchResults = await Promise.all(searchPromises);
  const allResults = searchResults.flat();

  if (allResults.length === 0) {
    return {
      searchSummary: {
        keyword,
        platformsSearched: platforms,
        totalResultsAnalyzed: 0,
      },
      suggestions: [],
    };
  }

  // Format results for AI extraction
  const formattedResults = formatSearchResults(allResults);

  // Use AI to extract trends
  try {
    initializeOpenRouter(env);
    const client = await openRouterService.getClient();

    const { object } = await generateObject({
      model: client.chat(ModelIds.GOOGLE_GEMINI_2_5_FLASH),
      prompt: buildExtractionPrompt(keyword, formattedResults),
      schema: TrendExtractionSchema,
      system: `You are a trend analyst. Extract trending topics from social media search results and generate discussion prompts for AI roundtable debates. Be concise and focus on genuinely trending topics.`,
      temperature: 0.7,
    });

    // Limit to maxSuggestions and ensure proper typing
    const suggestions: TrendSuggestion[] = object.suggestions
      .slice(0, maxSuggestions)
      .map(s => ({
        platform: s.platform,
        prompt: s.prompt,
        reasoning: s.reasoning,
        relevanceScore: Math.round(s.relevanceScore),
        suggestedRounds: Math.min(5, Math.max(1, Math.round(s.suggestedRounds))),
        topic: s.topic,
      }));

    return {
      searchSummary: {
        keyword,
        platformsSearched: platforms,
        totalResultsAnalyzed: allResults.length,
      },
      suggestions,
    };
  } catch {
    // Return empty suggestions on AI failure
    return {
      searchSummary: {
        keyword,
        platformsSearched: platforms,
        totalResultsAnalyzed: allResults.length,
      },
      suggestions: [],
    };
  }
}
