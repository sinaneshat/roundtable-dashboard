/**
 * Content Extraction Service
 *
 * Two-stage pipeline: Readability (content extraction) + Turndown (markdown conversion)
 * - @mozilla/readability: Extracts main article content, removes nav/ads/footers
 * - turndown + turndown-plugin-gfm: Converts clean HTML to proper markdown with tables/code blocks
 * - linkedom: Provides DOM implementation for Cloudflare Workers
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
// @ts-expect-error - turndown-plugin-gfm has no type declarations
import { gfm } from 'turndown-plugin-gfm';
import * as z from 'zod';

/**
 * Zod schema for extracted markdown content - SINGLE SOURCE OF TRUTH
 * Internal schema (not exported for API boundaries)
 */
const _ExtractedMarkdownContentSchema = z.object({
  markdown: z.string(),
  text: z.string(),
  title: z.string().optional(),
  byline: z.string().optional(),
  siteName: z.string().optional(),
  excerpt: z.string().optional(),
  readingTime: z.number().int().nonnegative().optional(),
  wordCount: z.number().int().nonnegative().optional(),
  readabilityUsed: z.boolean(),
});

export type ExtractedMarkdownContent = z.infer<typeof _ExtractedMarkdownContentSchema>;

// Cache Turndown instance for reuse
let turndownInstance: TurndownService | null = null;

function getTurndownService(): TurndownService {
  if (turndownInstance)
    return turndownInstance;

  turndownInstance = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // Add GFM support for tables, strikethrough, task lists
  turndownInstance.use(gfm);

  // Custom rule: Remove unwanted elements before conversion
  turndownInstance.addRule('removeUnwanted', {
    filter: (node) => {
      const tagName = node.nodeName.toLowerCase();
      return ['script', 'style', 'nav', 'noscript', 'iframe', 'svg'].includes(tagName);
    },
    replacement: () => '',
  });

  // Custom rule: Preserve code blocks better
  turndownInstance.addRule('fencedCodeBlock', {
    filter: (node, _options) => {
      return (
        node.nodeName === 'PRE'
        && node.firstChild !== null
        && node.firstChild.nodeName === 'CODE'
      );
    },
    replacement: (_content, node) => {
      const codeNode = node.firstChild;
      // Type-safe check: only Elements have getAttribute
      const isElement = (n: unknown): n is Element =>
        n !== null && typeof n === 'object' && 'getAttribute' in n;
      if (!isElement(codeNode)) {
        return `\n\`\`\`\n${node.textContent || ''}\n\`\`\`\n`;
      }
      const className = codeNode.getAttribute('class') || '';
      const languageMatch = className.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : '';
      const code = codeNode.textContent || '';
      return `\n\`\`\`${language}\n${code}\n\`\`\`\n`;
    },
  });

  return turndownInstance;
}

/**
 * Extract main content from HTML using Readability
 * Returns article object or null if extraction fails
 */
function extractWithReadability(
  html: string,
  url: string,
): ReturnType<Readability['parse']> {
  try {
    const { document } = parseHTML(html);

    // Set document URL for resolving relative links
    const baseElement = document.createElement('base');
    baseElement.setAttribute('href', url);
    document.head.appendChild(baseElement);

    const reader = new Readability(document);
    return reader.parse();
  } catch {
    return null;
  }
}

/**
 * Basic HTML to markdown conversion (fallback)
 * Used when Readability extraction fails
 */
function basicHtmlToMarkdown(html: string): string {
  const turndown = getTurndownService();

  try {
    // Parse with linkedom to get clean DOM
    const { document } = parseHTML(html);

    // Remove common non-content elements
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
      try {
        document.querySelectorAll(selector).forEach((el: Element) => el.remove());
      } catch {
        // Selector may not be supported, skip
      }
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

    let contentElement: Element | null = null;
    for (const selector of contentSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element && (element.textContent?.length || 0) > 200) {
          contentElement = element;
          break;
        }
      } catch {
        // Selector may not be supported, skip
      }
    }

    const targetElement = contentElement || document.body;
    const markdown = turndown.turndown(targetElement?.innerHTML || html);

    return cleanupMarkdown(markdown);
  } catch {
    // Ultimate fallback: regex-based conversion
    return regexHtmlToMarkdown(html);
  }
}

/**
 * Regex-based HTML to markdown (last resort fallback)
 * Used when DOM parsing fails entirely
 */
function regexHtmlToMarkdown(html: string): string {
  try {
    const markdown = html
      // Headers
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n')
      // Bold and italic
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Code
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n')
      // Lists
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      // Paragraphs and line breaks
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Remove remaining tags
      .replace(/<[^>]*>/g, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return markdown;
  } catch {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}

/**
 * Clean up markdown output
 */
function cleanupMarkdown(markdown: string): string {
  return `${markdown
    // Remove excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing whitespace from lines
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    // Remove leading blank lines
    .replace(/^\n+/, '')
    // Ensure single trailing newline
    .trimEnd()}\n`;
}

/**
 * Extract text content from HTML
 */
function extractTextContent(html: string): string {
  try {
    const { document } = parseHTML(html);

    // Remove script, style, and hidden elements
    const unwanted = document.querySelectorAll(
      'script, style, nav, header, footer, [aria-hidden="true"]',
    );
    unwanted.forEach((el: Element) => el.remove());

    const text = document.body?.textContent || '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    // Fallback: strip tags with regex
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Calculate word count from text
 */
function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter(word => word.length > 0)
    .length;
}

/**
 * Extract and convert HTML to markdown using Readability + Turndown pipeline
 *
 * Two-stage pipeline:
 * 1. @mozilla/readability extracts main article content (removes ads, nav, footers)
 * 2. turndown converts clean HTML to proper markdown (tables, code blocks, lists)
 *
 * Falls back to basic conversion if Readability fails.
 *
 * @param html - Raw HTML content
 * @param url - Source URL (used for resolving relative links)
 * @returns Extracted content with markdown and metadata
 */
export function extractAndConvertToMarkdown(
  html: string,
  url: string,
): ExtractedMarkdownContent {
  // Try Readability extraction first
  const article = extractWithReadability(html, url);

  if (article && article.content) {
    // Readability succeeded - convert extracted content to markdown
    const turndown = getTurndownService();
    const markdown = cleanupMarkdown(turndown.turndown(article.content));
    const text = article.textContent || extractTextContent(article.content);
    const wordCount = countWords(text);

    return {
      markdown,
      text,
      title: article.title || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
      excerpt: article.excerpt || undefined,
      wordCount,
      readingTime: Math.ceil(wordCount / 200),
      readabilityUsed: true,
    };
  }

  // Readability failed - use basic conversion
  const markdown = basicHtmlToMarkdown(html);
  const text = extractTextContent(html);
  const wordCount = countWords(text);

  return {
    markdown,
    text,
    wordCount,
    readingTime: Math.ceil(wordCount / 200),
    readabilityUsed: false,
  };
}

/**
 * Convert raw HTML to markdown (simple wrapper for direct HTML conversion)
 * Does not use Readability - just Turndown with cleanup
 *
 * @param html - Raw HTML content
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string): string {
  try {
    const turndown = getTurndownService();
    return cleanupMarkdown(turndown.turndown(html));
  } catch {
    return regexHtmlToMarkdown(html);
  }
}
