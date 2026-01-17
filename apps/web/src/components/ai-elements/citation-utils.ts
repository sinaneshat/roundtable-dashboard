/**
 * Citation Utility Functions
 *
 * Extracted from inline-citation.tsx for better code organization
 * and to satisfy react-refresh/only-export-components lint rule.
 */

import type { CitationSourceType } from '@roundtable/shared';
import { CitationSourceTypes } from '@roundtable/shared';

/**
 * Extract hostname from URL for display purposes
 * Removes 'www.' prefix for cleaner display
 */
export function extractHostname(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Format citation ID for human-readable display
 * Converts internal citation IDs to user-friendly labels
 */
export function formatCitationIdForDisplay(citationId: string, sourceType: CitationSourceType): string {
  // Parse search citations like "sch_q0r1" → "Search Result #2"
  if (sourceType === CitationSourceTypes.SEARCH) {
    const match = citationId.match(/^sch_q(\d+)r(\d+)$/);
    if (match) {
      const resultNum = Number.parseInt(match[2] ?? '0', 10) + 1;
      return `Web Search Result #${resultNum}`;
    }
  }

  // Parse memory citations like "mem_abc123" → "Memory"
  if (sourceType === CitationSourceTypes.MEMORY) {
    return 'Project Memory';
  }

  // Parse thread citations
  if (sourceType === CitationSourceTypes.THREAD) {
    return 'Previous Conversation';
  }

  // Parse moderator citations like "mod_round0" → "Round Summary"
  if (sourceType === CitationSourceTypes.MODERATOR) {
    const match = citationId.match(/^mod_round(\d+)/);
    if (match) {
      const roundNum = Number.parseInt(match[1] ?? '0', 10) + 1;
      return `Round ${roundNum} Summary`;
    }
  }

  // Parse RAG citations
  if (sourceType === CitationSourceTypes.RAG) {
    return 'Indexed Document';
  }

  // Fallback to citation ID
  return citationId;
}
