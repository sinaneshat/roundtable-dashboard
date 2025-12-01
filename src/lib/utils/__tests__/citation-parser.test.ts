/**
 * Unit Tests for Citation Parser Utility
 *
 * Tests the citation parsing system used to extract and process citation markers
 * from AI response text. Citations are in the format [source_id] where source_id
 * follows the pattern: {prefix}_{id} (e.g., mem_abc123, thd_xyz456)
 *
 * @see src/lib/utils/citation-parser.ts
 */

import { describe, expect, it } from 'vitest';

import { CitationSourceTypes } from '@/api/core/enums';
import {
  countCitations,
  extractCitationIds,
  getSourceTypeFromId,
  hasCitations,
  parseCitations,
  stripCitations,
  toDbCitations,
} from '@/lib/utils/citation-parser';

describe('extractCitationIds', () => {
  describe('basic extraction', () => {
    it('extracts single citation from text', () => {
      const text = 'This is from the project requirements [mem_abc123].';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123']);
    });

    it('extracts multiple citations from text', () => {
      const text = 'Based on [mem_abc123] and [thd_xyz456], the feature should work.';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123', 'thd_xyz456']);
    });

    it('returns unique citation IDs only', () => {
      const text = 'First [mem_abc123], then again [mem_abc123], and [thd_xyz456].';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123', 'thd_xyz456']);
    });

    it('returns empty array for text without citations', () => {
      const text = 'This text has no citations.';
      const ids = extractCitationIds(text);
      expect(ids).toEqual([]);
    });
  });

  describe('all source types', () => {
    it('extracts memory citations (mem_)', () => {
      const ids = extractCitationIds('From memory [mem_12345abc]');
      expect(ids).toEqual(['mem_12345abc']);
    });

    it('extracts thread citations (thd_)', () => {
      const ids = extractCitationIds('From thread [thd_67890xyz]');
      expect(ids).toEqual(['thd_67890xyz']);
    });

    it('extracts attachment citations (att_)', () => {
      const ids = extractCitationIds('From file [att_abcdef12]');
      expect(ids).toEqual(['att_abcdef12']);
    });

    it('extracts search citations (sch_)', () => {
      const ids = extractCitationIds('From search [sch_search12]');
      expect(ids).toEqual(['sch_search12']);
    });

    it('extracts analysis citations (ana_)', () => {
      const ids = extractCitationIds('From analysis [ana_analyze1]');
      expect(ids).toEqual(['ana_analyze1']);
    });
  });

  describe('edge cases', () => {
    it('ignores invalid prefixes', () => {
      const text = 'Invalid [xyz_abc123] and valid [mem_abc123].';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123']);
    });

    it('handles adjacent citations', () => {
      const text = '[mem_abc123][thd_xyz456]';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123', 'thd_xyz456']);
    });

    it('handles citations in markdown', () => {
      const text = '**Bold text** [mem_abc123] _italic_ [thd_xyz456]';
      const ids = extractCitationIds(text);
      expect(ids).toEqual(['mem_abc123', 'thd_xyz456']);
    });

    it('handles empty string', () => {
      const ids = extractCitationIds('');
      expect(ids).toEqual([]);
    });
  });
});

describe('getSourceTypeFromId', () => {
  it('returns MEMORY for mem_ prefix', () => {
    expect(getSourceTypeFromId('mem_abc123')).toBe(CitationSourceTypes.MEMORY);
  });

  it('returns THREAD for thd_ prefix', () => {
    expect(getSourceTypeFromId('thd_xyz456')).toBe(CitationSourceTypes.THREAD);
  });

  it('returns ATTACHMENT for att_ prefix', () => {
    expect(getSourceTypeFromId('att_file789')).toBe(CitationSourceTypes.ATTACHMENT);
  });

  it('returns SEARCH for sch_ prefix', () => {
    expect(getSourceTypeFromId('sch_query123')).toBe(CitationSourceTypes.SEARCH);
  });

  it('returns ANALYSIS for ana_ prefix', () => {
    expect(getSourceTypeFromId('ana_insight1')).toBe(CitationSourceTypes.ANALYSIS);
  });

  it('returns undefined for invalid prefix', () => {
    expect(getSourceTypeFromId('xyz_abc123')).toBeUndefined();
  });

  it('returns undefined for malformed ID', () => {
    expect(getSourceTypeFromId('nounderscore')).toBeUndefined();
  });
});

describe('parseCitations', () => {
  describe('basic parsing', () => {
    it('parses text with single citation', () => {
      const text = 'The requirement states [mem_abc123] that we need this.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].sourceId).toBe('mem_abc123');
      expect(result.citations[0].sourceType).toBe(CitationSourceTypes.MEMORY);
      expect(result.citations[0].displayNumber).toBe(1);
    });

    it('parses text with multiple citations and assigns sequential display numbers', () => {
      const text = 'Based on [mem_abc123] and [thd_xyz456], plus [att_file12].';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(3);
      expect(result.citations[0].displayNumber).toBe(1);
      expect(result.citations[1].displayNumber).toBe(2);
      expect(result.citations[2].displayNumber).toBe(3);
    });

    it('assigns same display number to repeated citations', () => {
      const text = 'First [mem_abc123], elaboration [thd_xyz456], back to [mem_abc123].';
      const result = parseCitations(text);

      // Unique citations
      expect(result.citations).toHaveLength(2);

      // Segments include all occurrences
      const citationSegments = result.segments.filter(s => s.type === 'citation');
      expect(citationSegments).toHaveLength(3);

      // First and third citation have same display number
      const memCitations = citationSegments.filter(
        s => s.type === 'citation' && s.citation.sourceId === 'mem_abc123',
      );
      expect(memCitations).toHaveLength(2);
      expect(memCitations[0].citation.displayNumber).toBe(1);
      expect(memCitations[1].citation.displayNumber).toBe(1);
    });
  });

  describe('segment generation', () => {
    it('generates text and citation segments in order', () => {
      const text = 'Start [mem_abc123] middle [thd_xyz456] end.';
      const result = parseCitations(text);

      expect(result.segments).toHaveLength(5);
      expect(result.segments[0]).toEqual({ type: 'text', content: 'Start ' });
      expect(result.segments[1].type).toBe('citation');
      expect(result.segments[2]).toEqual({ type: 'text', content: ' middle ' });
      expect(result.segments[3].type).toBe('citation');
      expect(result.segments[4]).toEqual({ type: 'text', content: ' end.' });
    });

    it('handles text starting with citation', () => {
      const text = '[mem_abc123] starts the text.';
      const result = parseCitations(text);

      expect(result.segments[0].type).toBe('citation');
      expect(result.segments[1]).toEqual({ type: 'text', content: ' starts the text.' });
    });

    it('handles text ending with citation', () => {
      const text = 'Text ends with [mem_abc123]';
      const result = parseCitations(text);

      expect(result.segments[0]).toEqual({ type: 'text', content: 'Text ends with ' });
      expect(result.segments[1].type).toBe('citation');
    });
  });

  describe('plain text extraction', () => {
    it('removes citation markers from plain text', () => {
      const text = 'The [mem_abc123] requirement [thd_xyz456] is important.';
      const result = parseCitations(text);

      expect(result.plainText).toBe('The  requirement  is important.');
    });

    it('preserves original text', () => {
      const text = 'Some [mem_abc123] text.';
      const result = parseCitations(text);

      expect(result.originalText).toBe(text);
    });
  });

  describe('citation metadata', () => {
    it('includes marker, startIndex, and endIndex', () => {
      const text = 'Text [mem_abc123] here.';
      const result = parseCitations(text);

      const citation = result.citations[0];
      expect(citation.marker).toBe('[mem_abc123]');
      expect(citation.startIndex).toBe(5);
      expect(citation.endIndex).toBe(17);
    });

    it('includes typePrefix', () => {
      const result = parseCitations('[mem_abc123] [thd_xyz456]');
      expect(result.citations[0].typePrefix).toBe('mem');
      expect(result.citations[1].typePrefix).toBe('thd');
    });
  });

  describe('edge cases', () => {
    it('handles text with no citations', () => {
      const text = 'No citations here.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(0);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]).toEqual({ type: 'text', content: text });
      expect(result.plainText).toBe(text);
    });

    it('handles empty string', () => {
      const result = parseCitations('');

      expect(result.citations).toHaveLength(0);
      expect(result.segments).toHaveLength(0);
      expect(result.plainText).toBe('');
    });

    it('skips invalid citation prefixes', () => {
      const text = 'Invalid [xyz_abc123] but valid [mem_def456].';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].sourceId).toBe('mem_def456');
    });
  });
});

describe('toDbCitations', () => {
  it('converts parsed citations to DbCitation format', () => {
    const text = '[mem_abc123] and [thd_xyz456]';
    const { citations: parsedCitations } = parseCitations(text);

    const dbCitations = toDbCitations(parsedCitations);

    expect(dbCitations).toHaveLength(2);
    expect(dbCitations[0].id).toBe('mem_abc123');
    expect(dbCitations[0].sourceType).toBe(CitationSourceTypes.MEMORY);
    expect(dbCitations[0].sourceId).toBe('abc123');
    expect(dbCitations[0].displayNumber).toBe(1);
  });

  it('uses sourceDataResolver to add metadata', () => {
    const text = '[mem_abc123]';
    const { citations: parsedCitations } = parseCitations(text);

    const resolver = (sourceId: string) => ({
      title: `Title for ${sourceId}`,
      excerpt: `Excerpt for ${sourceId}`,
      url: 'https://example.com',
      threadId: 'thread123',
      threadTitle: 'Thread Title',
      roundNumber: 1,
    });

    const dbCitations = toDbCitations(parsedCitations, resolver);

    expect(dbCitations[0].title).toBe('Title for mem_abc123');
    expect(dbCitations[0].excerpt).toBe('Excerpt for mem_abc123');
    expect(dbCitations[0].url).toBe('https://example.com');
    expect(dbCitations[0].threadId).toBe('thread123');
    expect(dbCitations[0].threadTitle).toBe('Thread Title');
    expect(dbCitations[0].roundNumber).toBe(1);
  });

  it('handles missing resolver data gracefully', () => {
    const text = '[mem_abc123]';
    const { citations: parsedCitations } = parseCitations(text);

    const dbCitations = toDbCitations(parsedCitations, () => undefined);

    expect(dbCitations[0].title).toBeUndefined();
    expect(dbCitations[0].excerpt).toBeUndefined();
  });
});

describe('hasCitations', () => {
  it('returns true when text contains citations', () => {
    expect(hasCitations('Text with [mem_abc123] citation.')).toBe(true);
    expect(hasCitations('[thd_xyz456]')).toBe(true);
  });

  it('returns false when text has no citations', () => {
    expect(hasCitations('No citations here.')).toBe(false);
    expect(hasCitations('')).toBe(false);
  });

  it('returns false for invalid citation formats', () => {
    expect(hasCitations('[invalid_abc123]')).toBe(false);
    expect(hasCitations('[mem]')).toBe(false);
    expect(hasCitations('mem_abc123')).toBe(false); // Missing brackets
  });
});

describe('stripCitations', () => {
  it('removes all citation markers from text', () => {
    const text = 'The [mem_abc123] feature requires [thd_xyz456] approval.';
    const stripped = stripCitations(text);

    expect(stripped).toBe('The  feature requires  approval.');
  });

  it('returns original text when no citations', () => {
    const text = 'No citations here.';
    expect(stripCitations(text)).toBe(text);
  });

  it('handles text that is only citations', () => {
    const text = '[mem_abc123][thd_xyz456]';
    expect(stripCitations(text)).toBe('');
  });
});

describe('countCitations', () => {
  it('counts unique citations in text', () => {
    const text = '[mem_abc123] [thd_xyz456] [att_file12]';
    expect(countCitations(text)).toBe(3);
  });

  it('counts duplicate citations only once', () => {
    const text = '[mem_abc123] [mem_abc123] [thd_xyz456]';
    expect(countCitations(text)).toBe(2);
  });

  it('returns 0 for text without citations', () => {
    expect(countCitations('No citations')).toBe(0);
    expect(countCitations('')).toBe(0);
  });
});

describe('streaming simulation - citations arriving progressively', () => {
  /**
   * These tests simulate how citations might appear during AI streaming,
   * ensuring the parser handles partial data correctly.
   */

  it('handles citation appearing mid-stream', () => {
    // Initial text without complete citation
    const phase1 = 'Based on the requirements';
    expect(hasCitations(phase1)).toBe(false);

    // Citation starts appearing
    const phase2 = 'Based on the requirements [mem_abc';
    expect(hasCitations(phase2)).toBe(false);

    // Complete citation
    const phase3 = 'Based on the requirements [mem_abc123]';
    expect(hasCitations(phase3)).toBe(true);
    expect(countCitations(phase3)).toBe(1);
  });

  it('handles multiple citations streaming in', () => {
    // First citation complete
    const phase1 = 'First source [mem_abc123] mentions';
    expect(countCitations(phase1)).toBe(1);

    // Second citation incomplete
    const phase2 = 'First source [mem_abc123] mentions that [thd_';
    expect(countCitations(phase2)).toBe(1);

    // Both complete
    const phase3 = 'First source [mem_abc123] mentions that [thd_xyz456] confirms';
    expect(countCitations(phase3)).toBe(2);
  });
});
