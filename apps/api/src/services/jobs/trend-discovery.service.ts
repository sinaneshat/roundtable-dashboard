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

type Platform = 'reddit' | 'twitter' | 'instagram';

type TrendDiscoveryResult = {
  suggestions: TrendSuggestion[];
  searchSummary: {
    totalResultsAnalyzed: number;
    platformsSearched: string[];
    keyword: string;
  };
};

const PLATFORM_SEARCH_CONFIGS: Record<Platform, { query: (keyword: string) => string; domain: string }> = {
  reddit: {
    query: (keyword: string) => `site:reddit.com ${keyword} discussion`,
    domain: 'reddit.com',
  },
  twitter: {
    query: (keyword: string) => `(site:twitter.com OR site:x.com) ${keyword} trending`,
    domain: 'twitter.com',
  },
  instagram: {
    query: (keyword: string) => `site:instagram.com ${keyword} viral`,
    domain: 'instagram.com',
  },
};

const TrendExtractionSchema = z.object({
  suggestions: z.array(z.object({
    topic: z.string().describe('Brief topic name (3-8 words)'),
    prompt: z.string().describe('Engaging discussion prompt (50-200 characters)'),
    platform: z.enum(['reddit', 'twitter', 'instagram']).describe('Source platform'),
    relevanceScore: z.number().min(0).max(100).describe('Relevance/trending score'),
    suggestedRounds: z.number().min(1).max(5).describe('Suggested discussion rounds'),
    reasoning: z.string().describe('Why trending and rounds rationale'),
  })),
});

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
  results: Array<{ platform: Platform; title: string; snippet: string; url: string }>,
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
        query: config.query(keyword),
        maxResults: 3,
        searchDepth: 'basic',
        chunksPerSource: 1,
        includeImages: false,
        includeImageDescriptions: false,
        includeRawContent: false,
        includeAnswer: false,
        includeFavicon: false,
        autoParameters: false,
      };

      const result = await performWebSearch(
        searchParams,
        env,
      );

      return result.results.map(r => ({
        platform,
        title: r.title,
        snippet: r.content || r.excerpt || '',
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
      suggestions: [],
      searchSummary: {
        totalResultsAnalyzed: 0,
        platformsSearched: platforms,
        keyword,
      },
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
      schema: TrendExtractionSchema,
      system: `You are a trend analyst. Extract trending topics from social media search results and generate discussion prompts for AI roundtable debates. Be concise and focus on genuinely trending topics.`,
      prompt: buildExtractionPrompt(keyword, formattedResults),
      temperature: 0.7,
    });

    // Limit to maxSuggestions and ensure proper typing
    const suggestions: TrendSuggestion[] = object.suggestions
      .slice(0, maxSuggestions)
      .map(s => ({
        topic: s.topic,
        prompt: s.prompt,
        platform: s.platform,
        relevanceScore: Math.round(s.relevanceScore),
        suggestedRounds: Math.min(5, Math.max(1, Math.round(s.suggestedRounds))),
        reasoning: s.reasoning,
      }));

    return {
      suggestions,
      searchSummary: {
        totalResultsAnalyzed: allResults.length,
        platformsSearched: platforms,
        keyword,
      },
    };
  } catch {
    // Return empty suggestions on AI failure
    return {
      suggestions: [],
      searchSummary: {
        totalResultsAnalyzed: allResults.length,
        platformsSearched: platforms,
        keyword,
      },
    };
  }
}
