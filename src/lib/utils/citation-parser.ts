/**
 * Citation Parser Utility
 *
 * Parses AI response text to extract and process citation markers.
 * Citations can be in two formats:
 * - Single: [source_id] e.g., [sch_q0r0]
 * - Multiple (comma-separated): [id1, id2] e.g., [sch_q0r0, sch_q0r1]
 *
 * Source IDs follow the pattern prefix_id where prefix is:
 * - mem_abc123 (memory)
 * - thd_abc123 (thread)
 * - att_abc123 (attachment)
 * - sch_abc123 (search)
 * - mod_abc123 (moderator)
 * - rag_abc123 (indexed file)
 *
 * @module lib/utils/citation-parser
 */

import type { CitationPrefix, CitationSourceType } from '@/api/core/enums';
import { CITATION_PREFIXES, CitationPrefixToSourceType, CitationSegmentTypes } from '@/api/core/enums';
import type { DbCitation } from '@/db/schemas/chat-metadata';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a parsed citation marker from AI response text
 */
export type ParsedCitation = {
  /** The full citation marker as it appears in text (e.g., "[mem_abc123]") */
  marker: string;
  /** The source ID extracted from the marker (e.g., "mem_abc123") */
  sourceId: string;
  /** The type prefix extracted from source ID */
  typePrefix: string;
  /** The source type derived from prefix */
  sourceType: CitationSourceType;
  /** Display number for UI rendering (1, 2, 3...) */
  displayNumber: number;
  /** Start index in original text */
  startIndex: number;
  /** End index in original text */
  endIndex: number;
};

/**
 * A segment of text that is either plain text or a citation
 */
export type TextSegment = {
  type: 'text';
  content: string;
} | {
  type: 'citation';
  content: string;
  citation: ParsedCitation;
};

/**
 * Result from parsing citations in text
 */
export type ParsedCitationResult = {
  /** Array of text and citation segments */
  segments: TextSegment[];
  /** Array of unique citations found in order of appearance */
  citations: ParsedCitation[];
  /** Original text with citations */
  originalText: string;
  /** Text with citation markers removed */
  plainText: string;
};

// ============================================================================
// Constants (derived from enums for single source of truth)
// ============================================================================

/**
 * Regular expression to match single citation markers
 * Matches patterns like: [mem_abc12345], [thd_xyz456], etc.
 * Pattern is built from CITATION_PREFIXES enum (single source of truth)
 */
const CITATION_PATTERN = new RegExp(
  `\\[(${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+\\]`,
  'g',
);

/**
 * Regular expression to match comma-separated citation markers
 * Matches patterns like: [sch_q0r0, sch_q0r1] or [sch_q0r0,sch_q0r1]
 * Used to normalize multi-citations into individual markers before parsing
 */
const MULTI_CITATION_PATTERN = new RegExp(
  `\\[((${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+(?:\\s*,\\s*(${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+)+)\\]`,
  'g',
);

/**
 * Single citation ID pattern for extracting IDs from multi-citation matches
 */
const SINGLE_ID_PATTERN = new RegExp(
  `(${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+`,
  'g',
);

/**
 * Type guard to check if a string is a valid citation prefix
 */
function isValidPrefix(prefix: string): prefix is CitationPrefix {
  return (CITATION_PREFIXES as readonly string[]).includes(prefix);
}

/**
 * Normalize text by splitting comma-separated citations into individual markers
 * Converts [sch_q0r0, sch_q0r1] into [sch_q0r0][sch_q0r1]
 * This ensures consistent parsing regardless of citation format
 */
function normalizeMultipleCitations(text: string): string {
  MULTI_CITATION_PATTERN.lastIndex = 0;
  return text.replace(MULTI_CITATION_PATTERN, (match) => {
    // Extract all individual citation IDs from the match
    SINGLE_ID_PATTERN.lastIndex = 0;
    const ids = match.match(SINGLE_ID_PATTERN);
    if (!ids || ids.length === 0)
      return match;
    // Convert to individual bracketed citations
    return ids.map(id => `[${id}]`).join('');
  });
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse text into segments of plain text and citations
 *
 * This is the main parsing function that breaks down AI response text
 * into segments that can be rendered with inline citations.
 * Handles both single citations [id] and comma-separated [id1, id2] formats.
 *
 * @param text - AI response text containing citation markers
 * @returns Parsed result with segments, citations, and plain text
 */
export function parseCitations(text: string): ParsedCitationResult {
  // First normalize any comma-separated citations into individual markers
  // [sch_q0r0, sch_q0r1] becomes [sch_q0r0][sch_q0r1]
  const normalizedText = normalizeMultipleCitations(text);

  const segments: TextSegment[] = [];
  const citations: ParsedCitation[] = [];
  const seenIds = new Set<string>();
  let displayNumberCounter = 1;

  // Map from source ID to display number (for consistent numbering)
  const idToDisplayNumber = new Map<string, number>();

  // Reset regex
  CITATION_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // eslint-disable-next-line no-cond-assign
  while ((match = CITATION_PATTERN.exec(normalizedText)) !== null) {
    const marker = match[0];
    const sourceId = marker.slice(1, -1);
    const prefix = sourceId.split('_')[0] ?? '';

    // Use type guard to safely access the prefix-to-source-type map
    if (!isValidPrefix(prefix)) {
      // Invalid prefix, treat as plain text
      continue;
    }

    const sourceType = CitationPrefixToSourceType[prefix];

    // Add preceding text as segment
    if (match.index > lastIndex) {
      segments.push({
        type: CitationSegmentTypes.TEXT,
        content: normalizedText.slice(lastIndex, match.index),
      });
    }

    // Get or assign display number
    let displayNumber = idToDisplayNumber.get(sourceId);
    if (displayNumber === undefined) {
      displayNumber = displayNumberCounter++;
      idToDisplayNumber.set(sourceId, displayNumber);
    }

    // Create parsed citation
    const citation: ParsedCitation = {
      marker,
      sourceId,
      typePrefix: prefix,
      sourceType,
      displayNumber,
      startIndex: match.index,
      endIndex: match.index + marker.length,
    };

    // Add citation segment
    segments.push({
      type: CitationSegmentTypes.CITATION,
      content: marker,
      citation,
    });

    // Track unique citations
    if (!seenIds.has(sourceId)) {
      seenIds.add(sourceId);
      citations.push(citation);
    }

    lastIndex = match.index + marker.length;
  }

  // Add remaining text as segment
  if (lastIndex < normalizedText.length) {
    segments.push({
      type: CitationSegmentTypes.TEXT,
      content: normalizedText.slice(lastIndex),
    });
  }

  // Generate plain text (citations removed)
  const plainText = segments
    .filter(s => s.type === CitationSegmentTypes.TEXT)
    .map(s => s.content)
    .join('');

  return {
    segments,
    citations,
    originalText: text,
    plainText,
  };
}

/**
 * Convert parsed citations to DbCitation format for storage
 *
 * @param parsedCitations - Array of parsed citations
 * @param sourceDataResolver - Optional function to resolve source data for each citation
 * @returns Array of DbCitation objects ready for storage
 */
export function toDbCitations(
  parsedCitations: ParsedCitation[],
  sourceDataResolver?: (sourceId: string) => {
    title?: string;
    excerpt?: string;
    url?: string;
    threadId?: string;
    threadTitle?: string;
    roundNumber?: number;
    // Attachment-specific fields
    downloadUrl?: string;
    filename?: string;
    mimeType?: string;
    fileSize?: number;
  } | undefined,
): DbCitation[] {
  return parsedCitations.map((citation) => {
    const sourceData = sourceDataResolver?.(citation.sourceId);

    return {
      id: citation.sourceId,
      sourceType: citation.sourceType,
      sourceId: citation.sourceId.split('_').slice(1).join('_'), // Original record ID
      displayNumber: citation.displayNumber,
      title: sourceData?.title,
      excerpt: sourceData?.excerpt,
      url: sourceData?.url,
      threadId: sourceData?.threadId,
      threadTitle: sourceData?.threadTitle,
      roundNumber: sourceData?.roundNumber,
      // Attachment-specific fields
      downloadUrl: sourceData?.downloadUrl,
      filename: sourceData?.filename,
      mimeType: sourceData?.mimeType,
      fileSize: sourceData?.fileSize,
    };
  });
}

/**
 * Check if text contains any citation markers
 * Handles both single [id] and comma-separated [id1, id2] formats
 *
 * @param text - Text to check
 * @returns True if text contains at least one citation marker
 */
export function hasCitations(text: string): boolean {
  CITATION_PATTERN.lastIndex = 0;
  MULTI_CITATION_PATTERN.lastIndex = 0;
  return CITATION_PATTERN.test(text) || MULTI_CITATION_PATTERN.test(text);
}

/**
 * Clean and format raw content for citation excerpt display
 * Removes HTML entities, excess whitespace, and normalizes text
 *
 * @param content - Raw content from scraped source
 * @param maxLength - Maximum length of excerpt (default 200)
 * @returns Cleaned and truncated excerpt
 */
export function cleanCitationExcerpt(content: string, maxLength = 200): string {
  if (!content) {
    return '';
  }

  let cleaned = content
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Normalize whitespace (collapse multiple spaces, newlines, tabs)
    .replace(/\s+/g, ' ')
    // Remove leading/trailing whitespace
    .trim();

  // Add sentence breaks for readability if content is long
  // Look for patterns like "wordWord" (camelCase joins from bad HTML parsing)
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');

  // Truncate to max length at word boundary
  if (cleaned.length > maxLength) {
    const truncated = cleaned.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    cleaned = lastSpace > maxLength * 0.7
      ? `${truncated.slice(0, lastSpace)}...`
      : `${truncated}...`;
  }

  return cleaned;
}
