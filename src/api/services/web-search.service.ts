/**
 * Web Search Service
 *
 * **BACKEND SERVICE**: Performs web searches using DuckDuckGo and Tavily
 * Following backend-patterns.md: Service layer for business logic, external integrations
 *
 * **PURPOSE**:
 * - Consolidates web search logic for pre-search functionality
 * - Provides reusable search functionality with AI-powered query generation
 * - Handles query generation and result parsing with streaming support
 *
 * **BROWSER STRATEGY**:
 * - LOCAL (development): Uses fallback fetch (no browser) - avoids Chrome binary requirement
 * - LIVE (preview/prod): Uses Cloudflare Browser binding via @cloudflare/puppeteer
 *
 * **REFACTOR NOTES**:
 * - Eliminated callback-based streaming pattern (performPreSearches removed)
 * - Aligned with AI SDK v5 streamObject pattern from analysis.handler.ts
 * - Extracted common logic into reusable functions
 * - Maintained type safety with Zod schemas throughout
 *
 * @module api/services/web-search
 */

import { streamObject } from 'ai';

import { createError, normalizeError } from '@/api/common/error-handling';
import { AIModels } from '@/api/core/ai-models';
import type { WebSearchComplexity } from '@/api/core/enums';
import type { WebSearchResult, WebSearchResultItem } from '@/api/routes/chat/schema';
// ============================================================================
// Zod Schemas
// ============================================================================
// Import schema from route definitions for consistency
import { GeneratedSearchQuerySchema } from '@/api/routes/chat/schema';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { buildWebSearchQueryPrompt, WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT } from '@/api/services/prompts.service';
import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

// ============================================================================
// Type Definitions (imported from schema.ts - no manual definitions)
// ============================================================================

// Re-export types for external use
export type { WebSearchDepth } from '@/api/core/enums';
export type { WebSearchResult, WebSearchResultItem };
export type { GeneratedSearchQuery } from '@/api/routes/chat/schema';

// Schema consolidated into GeneratedSearchQuerySchema in route schema file

// ============================================================================
// Query Generation
// ============================================================================

/**
 * Stream search query generation (gradual)
 *
 * Uses streamObject for progressive query generation like analysis streaming.
 * Returns stream iterator that yields partial query as it's generated.
 *
 * Pattern from: /src/api/routes/chat/handlers/analysis.handler.ts:91-120
 *
 * ✅ ERROR HANDLING: Comprehensive error context following error-metadata.service.ts pattern
 *
 * @param userMessage - User's question to generate query for
 * @param env - Cloudflare environment bindings
 * @param logger - Optional logger for error tracking
 * @returns Stream object with partialObjectStream
 * @throws HttpException with error context if query generation fails
 */
export function streamSearchQuery(
  userMessage: string,
  env: ApiEnv['Bindings'],
  logger?: TypedLogger,
) {
  try {
    initializeOpenRouter(env);
    const client = openRouterService.getClient();

    // ✅ AI SDK v5: streamObject for gradual query generation
    // Pattern from /src/api/routes/chat/handlers/analysis.handler.ts:91
    // Using internal schema that matches API contract
    return streamObject({
      model: client.chat(AIModels.WEB_SEARCH),
      schema: GeneratedSearchQuerySchema, // Use API schema for consistency
      mode: 'json', // ✅ CRITICAL: Force JSON mode for OpenRouter compatibility
      system: WEB_SEARCH_COMPLEXITY_ANALYSIS_PROMPT,
      prompt: buildWebSearchQueryPrompt(userMessage),
      maxRetries: 3, // Increased retries for better reliability
    });
  } catch (error) {
    // ✅ LOG: Query generation failure
    if (logger) {
      logger.error('Search query generation failed', {
        error: normalizeError(error),
        userMessage: userMessage.substring(0, 100), // Log first 100 chars
      });
    }

    // ✅ ERROR CONTEXT: External service error for AI query generation
    throw createError.internal(
      'Failed to generate search query',
      {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'query_generation',
      },
    );
  }
}

// ============================================================================
// Browser Initialization
// ============================================================================

/**
 * Initialize browser per environment
 *
 * LOCAL: Disabled (fallback to fetch) - avoids Chrome binary requirement
 * LIVE: puppeteer.launch(env.BROWSER) - Cloudflare Browser binding
 *
 * @param env - Cloudflare environment bindings
 * @returns Browser instance or null
 */
async function initBrowser(env: ApiEnv['Bindings']) {
  const isLocal = process.env.NODE_ENV === 'development';

  // Local: Skip browser, use fallback fetch
  if (isLocal) {
    return null;
  }

  // Live: Cloudflare Browser binding
  try {
    const puppeteer = await import('@cloudflare/puppeteer');
    return await puppeteer.default.launch(env.BROWSER);
  } catch {
    return null;
  }
}

// ============================================================================
// Page Content Extraction
// ============================================================================

/**
 * Extract full content from a webpage using Puppeteer
 *
 * Uses page.evaluate() with improved content extraction techniques.
 * Waits for main content to load and extracts text, metadata, and structure.
 *
 * @param url - URL to scrape content from
 * @param env - Cloudflare environment bindings
 * @param timeout - Max time to wait for page load
 * @returns Extracted content and metadata
 */
async function extractPageContent(
  url: string,
  env: ApiEnv['Bindings'],
  timeout = 15000,
): Promise<{
  content: string;
  metadata: {
    title?: string;
    author?: string;
    publishedDate?: string;
    description?: string;
    imageUrl?: string;
    faviconUrl?: string;
    wordCount: number;
    readingTime: number;
  };
}> {
  const browser = await initBrowser(env);

  // Fallback if no browser available
  if (!browser) {
    return {
      content: '',
      metadata: { wordCount: 0, readingTime: 0 },
    };
  }

  try {
    const page = await browser.newPage();

    // Set viewport for consistent rendering
    await page.setViewport({ width: 1280, height: 800 });

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block fonts, most stylesheets, and media but keep images for favicon
      if (['font', 'media', 'websocket', 'manifest'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    // Wait for potential main content to load
    try {
      await page.waitForSelector('article, main, [role="main"], .content, .post-content', {
        timeout: 3000,
      });
    } catch {
      // Continue even if no main content selector found
    }

    // Extract content using page.evaluate()
    const extracted = await page.evaluate(() => {
      // Helper to clean text
      const cleanText = (text: string): string => {
        return text
          .replace(/\s+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      };

      // Remove unwanted elements
      const unwantedSelectors = [
        'script',
        'style',
        'nav',
        'header',
        'footer',
        '.sidebar',
        '.advertisement',
        '.ads',
        '.popup',
        '.cookie-notice',
        '.newsletter',
        '.social-share',
        '[aria-hidden="true"]',
        '.navigation',
        '.menu',
        '.comments',
        '.related-posts',
      ];

      unwantedSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });

      // Try to find main content area
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-body',
        '.story-body',
        '#content',
        '.markdown-body',
        '.prose',
      ];

      let mainContent = '';
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          mainContent = element.textContent || '';
          if (mainContent.length > 200)
            break;
        }
      }

      // Fallback to body if no main content found
      if (mainContent.length < 200) {
        mainContent = document.body.textContent || '';
      }

      // Extract metadata
      const getMetaContent = (name: string): string | null => {
        const meta = document.querySelector(
          `meta[property="${name}"], meta[name="${name}"]`,
        ) as HTMLMetaElement;
        return meta?.content || null;
      };

      const title
        = document.querySelector('h1')?.textContent
          || document.title
          || getMetaContent('og:title')
          || '';

      const author
        = getMetaContent('author')
          || getMetaContent('article:author')
          || document.querySelector('.author, .by-author, [rel="author"]')?.textContent
          || null;

      const description
        = getMetaContent('description')
          || getMetaContent('og:description')
          || document.querySelector('meta[name="description"]')?.getAttribute('content')
          || null;

      const publishedDate
        = getMetaContent('article:published_time')
          || getMetaContent('publish_date')
          || document.querySelector('time[datetime]')?.getAttribute('datetime')
          || null;

      const imageUrl
        = getMetaContent('og:image')
          || getMetaContent('twitter:image')
          || null;

      // Get favicon
      const faviconUrl = (() => {
        const favicon = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]') as HTMLLinkElement;
        if (favicon?.href)
          return favicon.href;

        // Try standard favicon path
        return `${window.location.origin}/favicon.ico`;
      })();

      // Clean and prepare content
      const cleanedContent = cleanText(mainContent);
      const wordCount = cleanedContent.split(/\s+/).length;
      const readingTime = Math.ceil(wordCount / 200); // ~200 words per minute

      return {
        content: cleanedContent.substring(0, 15000), // Increased limit for better content
        metadata: {
          title: cleanText(title),
          author: author ? cleanText(author) : undefined,
          publishedDate: publishedDate || undefined,
          description: description ? cleanText(description) : undefined,
          imageUrl: imageUrl || undefined,
          faviconUrl: faviconUrl || undefined,
          wordCount,
          readingTime,
        },
      };
    });

    await page.close();
    return extracted;
  } catch {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    return {
      content: '',
      metadata: { wordCount: 0, readingTime: 0 },
    };
  }
}

// ============================================================================
// DuckDuckGo Search with Browser
// ============================================================================

/**
 * Perform DuckDuckGo search using browser automation
 *
 * Uses puppeteer (local) or Cloudflare Browser (live) to scrape DuckDuckGo.
 * Falls back to simple fetch if browser unavailable.
 *
 * @param query - Search query string
 * @param maxResults - Maximum number of results to return
 * @param env - Cloudflare environment bindings
 * @returns Array of search results with title, URL, snippet
 */
async function searchDuckDuckGo(
  query: string,
  maxResults: number,
  env: ApiEnv['Bindings'],
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const browser = await initBrowser(env);

  if (!browser) {
    // Fallback: Simple fetch without browser
    return searchDuckDuckGoFallback(query, maxResults);
  }

  try {
    const page = await browser.newPage();
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 15000 });

    // Get page content and parse
    const html = await page.content();
    await page.close();
    await browser.close();

    return parseDuckDuckGoResults(html, maxResults);
  } catch {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    return searchDuckDuckGoFallback(query, maxResults);
  }
}

/**
 * Fallback: DuckDuckGo HTML scraping without browser
 *
 * Used when browser is unavailable. Simple regex-based parsing.
 *
 * @param query - Search query string
 * @param maxResults - Maximum number of results to return
 * @returns Array of search results
 */
async function searchDuckDuckGoFallback(
  query: string,
  maxResults: number,
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok)
      return [];

    const html = await response.text();
    return parseDuckDuckGoResults(html, maxResults);
  } catch {
    return [];
  }
}

/**
 * Parse DuckDuckGo HTML results
 *
 * Extracted common parsing logic to reduce duplication.
 *
 * @param html - DuckDuckGo search results HTML
 * @param maxResults - Maximum number of results to return
 * @returns Array of parsed search results
 */
function parseDuckDuckGoResults(
  html: string,
  maxResults: number,
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const resultDivRegex = /<div class="result results_links results_links_deep web-result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="result/g;
  const resultDivs = Array.from(html.matchAll(resultDivRegex));

  for (let i = 0; i < Math.min(resultDivs.length, maxResults); i++) {
    const resultHtml = resultDivs[i]?.[1];
    if (!resultHtml)
      continue;

    // Extract URL
    const mainLinkMatch = resultHtml.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"/);
    let url = mainLinkMatch?.[1] || null;

    // If not found, try the result__url link
    if (!url) {
      const urlMatch = resultHtml.match(/<a[^>]*class="result__url"[^>]*href="([^"]+)"/);
      url = urlMatch?.[1] || null;
    }

    // Clean and extract actual URL
    if (url) {
      url = decodeURIComponent(url);

      // Handle protocol-relative URLs
      if (url.startsWith('//')) {
        url = `https:${url}`;
      }

      // Extract actual URL from DuckDuckGo redirect URL
      if (url.includes('duckduckgo.com/l/')) {
        try {
          const redirectUrl = new URL(url);
          const actualUrl = redirectUrl.searchParams.get('uddg');
          if (actualUrl) {
            url = actualUrl;
          }
        } catch {
          // Keep original URL if parsing fails
        }
      }
    }

    // Extract title
    const titleMatch = resultHtml.match(/<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>/);
    const title = titleMatch?.[1]?.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') || null;

    // Extract snippet - DuckDuckGo uses result__snippet class
    const snippetMatch = resultHtml.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let snippet = '';
    if (snippetMatch?.[1]) {
      // Clean up HTML entities and extract text
      snippet = snippetMatch[1]
        .replace(/<[^>]*>/g, '') // Remove any HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .substring(0, 500);
    }

    if (url && title) {
      results.push({ url, title, snippet });
    }
  }

  return results;
}

// ============================================================================
// Web Search Execution
// ============================================================================

/**
 * Perform web search with intelligent depth selection
 *
 * For BASIC queries: Quick search, may only use snippets
 * For MODERATE: Standard search with partial content extraction
 * For DEEP: Comprehensive search with full content from all sources
 *
 * ✅ ERROR HANDLING: Comprehensive error context following error-metadata.service.ts pattern
 * ✅ LOGGING: Edge case logging for empty results and extraction failures
 *
 * @param query - Search query string
 * @param sourceCount - Number of sources to extract content from (1-5)
 * @param requiresFullContent - Whether to extract full page content
 * @param env - Cloudflare environment bindings
 * @param complexity - Optional complexity level for metadata
 * @param logger - Optional logger for error tracking
 * @returns Formatted search result with appropriate content depth
 */
export async function performWebSearch(
  query: string,
  sourceCount: number,
  requiresFullContent: boolean,
  env: ApiEnv['Bindings'],
  complexity?: WebSearchComplexity,
  logger?: TypedLogger,
): Promise<WebSearchResult> {
  const startTime = performance.now();

  try {
    // Fetch more results than needed to ensure we get enough good sources
    const searchResults = await searchDuckDuckGo(query, sourceCount + 2, env);

    // ✅ LOG: Empty search results (edge case)
    if (searchResults.length === 0) {
      if (logger) {
        logger.warn('Web search returned no results', {
          logType: 'edge_case',
          query,
          sourceCount,
          complexity,
        });
      }

      return {
        query,
        answer: null,
        results: [],
        responseTime: performance.now() - startTime,
        _meta: complexity ? { complexity } : undefined,
      };
    }

    // Take only the requested number of sources
    const sourcesToExtract = searchResults.slice(0, Math.min(sourceCount, searchResults.length));

    // ✅ ALWAYS EXTRACT FULL CONTENT: Process all results with full content extraction
    // This ensures participants have complete context and UI can display full text
    const results: WebSearchResultItem[] = await Promise.all(
      sourcesToExtract.map(async (result) => {
        const domain = extractDomain(result.url);

        // Start with basic result
        const baseResult: WebSearchResultItem = {
          title: result.title,
          url: result.url,
          content: result.snippet, // Start with snippet
          excerpt: result.snippet,
          score: 0.5,
          publishedDate: null,
          domain,
        };

        // ✅ ALWAYS SCRAPE FULL CONTENT: Extract full page content for ALL searches
        // This provides:
        // 1. Complete context for AI participants (via fullContent field)
        // 2. Read more/read less functionality in UI
        // 3. Better answer quality from comprehensive information
        try {
          const extracted = await extractPageContent(result.url, env, 10000);
          if (extracted.content) {
            // Store full content (up to 15,000 chars)
            baseResult.fullContent = extracted.content;
            // Keep preview for backwards compatibility (800 chars)
            baseResult.content = extracted.content.substring(0, 800);
            // Add complete metadata
            baseResult.metadata = {
              author: extracted.metadata.author,
              readingTime: extracted.metadata.readingTime,
              wordCount: extracted.metadata.wordCount,
              description: extracted.metadata.description,
              imageUrl: extracted.metadata.imageUrl,
              faviconUrl: extracted.metadata.faviconUrl,
            };
            if (extracted.metadata.publishedDate) {
              baseResult.publishedDate = extracted.metadata.publishedDate;
            }
            // Use better title from page if available
            if (extracted.metadata.title && extracted.metadata.title.length > 0) {
              baseResult.title = extracted.metadata.title;
            }
          }
        } catch (extractError) {
          // ✅ LOG: Content extraction failure (edge case)
          if (logger) {
            logger.warn('Failed to extract page content', {
              logType: 'edge_case',
              url: result.url,
              error: normalizeError(extractError),
            });
          }
          // Fallback: Try to at least get favicon for better UI
          try {
            const faviconUrl = `https://${domain}/favicon.ico`;
            baseResult.metadata = {
              faviconUrl,
            };
          } catch {
            // Ignore favicon errors (not critical)
          }
        }

        return baseResult;
      }),
    );

    return {
      query,
      answer: null,
      results,
      responseTime: performance.now() - startTime,
      _meta: complexity ? { complexity } : undefined,
    };
  } catch (error) {
    // ✅ LOG: Complete search failure (critical edge case)
    if (logger) {
      logger.error('Web search failed completely', {
        logType: 'edge_case',
        query,
        sourceCount,
        requiresFullContent,
        complexity,
        error: normalizeError(error),
      });
    }

    // Return empty result instead of throwing (graceful degradation)
    return {
      query,
      answer: null,
      results: [],
      responseTime: performance.now() - startTime,
      _meta: complexity ? { complexity } : undefined,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract domain from URL
 *
 * @param url - URL to extract domain from
 * @returns Domain name without www prefix
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

/**
 * Create search result cache for request
 *
 * Simple Map-based cache for deduplicating searches within a single request.
 * Normalizes queries (lowercase, trim) to improve hit rate.
 *
 * @returns Cache object with get/set/has methods
 */
export function createSearchCache() {
  const cache = new Map<string, WebSearchResult>();

  const normalizeQuery = (query: string): string => {
    return query.toLowerCase().trim();
  };

  return {
    has: (query: string): boolean => {
      return cache.has(normalizeQuery(query));
    },
    get: (query: string): WebSearchResult | null => {
      return cache.get(normalizeQuery(query)) || null;
    },
    set: (query: string, result: WebSearchResult): void => {
      cache.set(normalizeQuery(query), result);
    },
  };
}

export type SearchCache = ReturnType<typeof createSearchCache>;
