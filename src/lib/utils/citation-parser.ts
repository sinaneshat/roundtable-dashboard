/**
 * Citation Parser Utility
 *
 * Parses AI response text to extract and process citation markers.
 * Citations are in the format [source_id] where source_id follows the pattern:
 * - mem_abc123 (memory)
 * - thd_abc123 (thread)
 * - att_abc123 (attachment)
 * - sch_abc123 (search)
 * - sum_abc123 (summary)
 *
 * @module lib/utils/citation-parser
 */

import type { CitationPrefix, CitationSourceType } from '@/api/core/enums';
import { CITATION_PREFIXES, CitationPrefixToSourceType } from '@/api/core/enums';
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
 * Regular expression to match citation markers
 * Matches patterns like: [mem_abc12345], [thd_xyz456], etc.
 * Pattern is built from CITATION_PREFIXES enum (single source of truth)
 */
const CITATION_PATTERN = new RegExp(
  `\\[(${CITATION_PREFIXES.join('|')})_[a-zA-Z0-9]+\\]`,
  'g',
);

/**
 * Type guard to check if a string is a valid citation prefix
 */
function isValidPrefix(prefix: string): prefix is CitationPrefix {
  return (CITATION_PREFIXES as readonly string[]).includes(prefix);
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Extract citation markers from text
 *
 * Returns unique source IDs found in the text, in order of first appearance.
 *
 * @param text - AI response text containing citation markers
 * @returns Array of unique source IDs (e.g., ["mem_abc123", "thd_xyz456"])
 */
export function extractCitationIds(text: string): string[] {
  const matches = text.match(CITATION_PATTERN) || [];
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const match of matches) {
    // Remove brackets to get source ID
    const sourceId = match.slice(1, -1);
    if (!seen.has(sourceId)) {
      seen.add(sourceId);
      ids.push(sourceId);
    }
  }

  return ids;
}

/**
 * Get source type from source ID prefix
 *
 * @param sourceId - Source ID (e.g., "mem_abc123")
 * @returns Source type or undefined if prefix not recognized
 */
export function getSourceTypeFromId(sourceId: string): CitationSourceType | undefined {
  const prefix = sourceId.split('_')[0] ?? '';
  if (!isValidPrefix(prefix)) {
    return undefined;
  }
  return CitationPrefixToSourceType[prefix];
}

/**
 * Parse text into segments of plain text and citations
 *
 * This is the main parsing function that breaks down AI response text
 * into segments that can be rendered with inline citations.
 *
 * @param text - AI response text containing citation markers
 * @returns Parsed result with segments, citations, and plain text
 */
export function parseCitations(text: string): ParsedCitationResult {
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
  while ((match = CITATION_PATTERN.exec(text)) !== null) {
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
        type: 'text',
        content: text.slice(lastIndex, match.index),
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
      type: 'citation',
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
  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  // Generate plain text (citations removed)
  const plainText = segments
    .filter(s => s.type === 'text')
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
 *
 * @param text - Text to check
 * @returns True if text contains at least one citation marker
 */
export function hasCitations(text: string): boolean {
  CITATION_PATTERN.lastIndex = 0;
  return CITATION_PATTERN.test(text);
}

/**
 * Remove all citation markers from text
 *
 * @param text - Text containing citation markers
 * @returns Text with all citation markers removed
 */
export function stripCitations(text: string): string {
  return text.replace(CITATION_PATTERN, '');
}

/**
 * Count unique citations in text
 *
 * @param text - Text containing citation markers
 * @returns Number of unique citations
 */
export function countCitations(text: string): number {
  return extractCitationIds(text).length;
}
