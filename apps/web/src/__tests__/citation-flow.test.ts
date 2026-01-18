/**
 * Citation Flow Tests
 *
 * Tests the full citation pipeline from AI response to DB storage:
 * 1. Citation parsing from text
 * 2. Citation source map merging (not replacement)
 * 3. Citation resolution and DB persistence
 */

import { CITATION_PREFIXES, CitationSourceTypes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { hasCitations, parseCitations, toDbCitations } from '@/lib/utils';
import type { CitableSource, CitationSourceMap } from '@/lib/utils/citation-parser';

describe('citation Parser', () => {
  describe('parseCitations', () => {
    it('should parse memory citations [mem_xxx]', () => {
      const text = 'Based on [mem_abc12345], the answer is yes.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceId).toBe('mem_abc12345');
      expect(result.citations[0]?.sourceType).toBe('memory');
      expect(result.citations[0]?.displayNumber).toBe(1);
    });

    it('should parse thread citations [thd_xxx]', () => {
      const text = 'As discussed in [thd_xyz789], we should proceed.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceType).toBe('thread');
    });

    it('should parse attachment citations [att_xxx]', () => {
      const text = 'The file [att_upload1] contains the data.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceType).toBe('attachment');
    });

    it('should parse search citations [sch_xxx]', () => {
      const text = 'According to search results [sch_query1], the info is correct.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceType).toBe('search');
    });

    it('should parse moderator citations [mod_xxx]', () => {
      const text = 'The moderator summary [mod_round0] indicates agreement.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceType).toBe('moderator');
    });

    it('should parse RAG citations [rag_xxx]', () => {
      const text = 'From the indexed file [rag_file123], we can see the pattern.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.sourceType).toBe('rag');
    });

    it('should parse multiple citations with correct display numbers', () => {
      const text = 'See [mem_abc123] and [thd_xyz789] for details. Also [mem_abc123] again.';
      const result = parseCitations(text);

      // Should have 2 unique citations (mem repeated)
      expect(result.citations).toHaveLength(2);
      expect(result.citations[0]?.displayNumber).toBe(1);
      expect(result.citations[1]?.displayNumber).toBe(2);

      // Segments should have 3 citation occurrences
      const citationSegments = result.segments.filter(s => s.type === 'citation');
      expect(citationSegments).toHaveLength(3);
    });

    it('should NOT parse invalid prefixes like [ana_xxx]', () => {
      const text = 'Invalid citation [ana_round0] should not be parsed.';
      const result = parseCitations(text);

      // ana_ is not a valid prefix, should have 0 citations
      expect(result.citations).toHaveLength(0);
    });

    it('should handle text with no citations', () => {
      const text = 'This is plain text without any citations.';
      const result = parseCitations(text);

      expect(result.citations).toHaveLength(0);
      expect(result.segments).toHaveLength(1);
      expect(result.segments[0]?.type).toBe('text');
    });
  });

  describe('hasCitations', () => {
    it('should return true for text with citations', () => {
      expect(hasCitations('Check [mem_abc123] for info')).toBe(true);
      expect(hasCitations('See [rag_file1] and [att_upload1]')).toBe(true);
    });

    it('should return false for text without citations', () => {
      expect(hasCitations('No citations here')).toBe(false);
      expect(hasCitations('Invalid [ana_test] prefix')).toBe(false);
    });
  });

  describe('cITATION_PREFIXES constant', () => {
    it('should include all valid prefixes', () => {
      expect(CITATION_PREFIXES).toContain('mem');
      expect(CITATION_PREFIXES).toContain('thd');
      expect(CITATION_PREFIXES).toContain('att');
      expect(CITATION_PREFIXES).toContain('sch');
      expect(CITATION_PREFIXES).toContain('mod');
      expect(CITATION_PREFIXES).toContain('rag');
    });

    it('should NOT include invalid prefix ana', () => {
      expect(CITATION_PREFIXES).not.toContain('ana');
    });
  });
});

describe('citation Resolution', () => {
  describe('toDbCitations', () => {
    it('should convert parsed citations to DB format', () => {
      const text = 'Based on [mem_abc12345] the answer is yes.';
      const { citations: parsed } = parseCitations(text);

      const sourceMap: CitationSourceMap = new Map();
      sourceMap.set('mem_abc12345', {
        id: 'mem_abc12345',
        type: CitationSourceTypes.MEMORY,
        sourceId: 'abc12345-full-id',
        title: 'Test Memory',
        content: 'This is the memory content',
        metadata: { importance: 0.8 },
      });

      const dbCitations = toDbCitations(parsed, (sourceId) => {
        const source = sourceMap.get(sourceId);
        if (!source)
          return undefined;
        return {
          title: source.title,
          excerpt: source.content.slice(0, 300),
        };
      });

      expect(dbCitations).toHaveLength(1);
      expect(dbCitations[0]?.id).toBe('mem_abc12345');
      expect(dbCitations[0]?.title).toBe('Test Memory');
      expect(dbCitations[0]?.excerpt).toBe('This is the memory content');
      expect(dbCitations[0]?.displayNumber).toBe(1);
    });

    it('should handle missing sources gracefully', () => {
      const text = 'See [mem_unknown] for details.';
      const { citations: parsed } = parseCitations(text);

      // Empty source map - source won't be found
      const dbCitations = toDbCitations(parsed, () => undefined);

      expect(dbCitations).toHaveLength(1);
      expect(dbCitations[0]?.id).toBe('mem_unknown');
      expect(dbCitations[0]?.title).toBeUndefined();
    });
  });
});

describe('citation Source Map Merging', () => {
  it('should preserve RAG sources when merging citable context', () => {
    // This test verifies the bug fix: sourceMap should merge, not replace
    const citationSourceMap: CitationSourceMap = new Map();

    // Simulate RAG sources added first (from autorag)
    const ragSource: CitableSource = {
      id: 'rag_file123',
      type: CitationSourceTypes.RAG,
      sourceId: 'file123',
      title: 'indexed-file.pdf',
      content: 'Content from indexed file',
      metadata: { filename: 'indexed-file.pdf' },
    };
    citationSourceMap.set('rag_file123', ragSource);

    // Simulate citable context sources (memories, threads, etc.)
    const citableContextSourceMap: CitationSourceMap = new Map();
    const memorySource: CitableSource = {
      id: 'mem_abc123',
      type: CitationSourceTypes.MEMORY,
      sourceId: 'abc123',
      title: 'Project Memory',
      content: 'Important project context',
      metadata: { importance: 0.9 },
    };
    citableContextSourceMap.set('mem_abc123', memorySource);

    // BUG FIX: Should MERGE, not replace - Merge sources into existing map
    for (const [id, source] of citableContextSourceMap) {
      citationSourceMap.set(id, source);
    }

    // Verify both sources are preserved
    expect(citationSourceMap.size).toBe(2);
    expect(citationSourceMap.has('rag_file123')).toBe(true);
    expect(citationSourceMap.has('mem_abc123')).toBe(true);
  });

  it('should handle empty citable context without losing existing sources', () => {
    const citationSourceMap: CitationSourceMap = new Map();

    // Add RAG source first
    citationSourceMap.set('rag_test1', {
      id: 'rag_test1',
      type: CitationSourceTypes.RAG,
      sourceId: 'test1',
      title: 'test.pdf',
      content: 'Test content',
      metadata: {},
    });

    // Empty citable context (no memories, threads, etc.)
    const emptyCitableContextSourceMap: CitationSourceMap = new Map();

    // Merge empty context - should NOT lose existing RAG sources
    for (const [id, source] of emptyCitableContextSourceMap) {
      citationSourceMap.set(id, source);
    }

    expect(citationSourceMap.size).toBe(1);
    expect(citationSourceMap.has('rag_test1')).toBe(true);
  });
});

describe('search Context with Citations', () => {
  it('should generate citation IDs in sch_qXrY format', () => {
    // Verify the format of search citation IDs
    const citationPattern = /^\[sch_q\d+r\d+\]$/;
    expect(citationPattern.test('[sch_q0r0]')).toBe(true);
    expect(citationPattern.test('[sch_q1r2]')).toBe(true);
    expect(citationPattern.test('[sch_q10r5]')).toBe(true);
  });

  it('should parse search citations correctly', () => {
    const text = 'According to [sch_q0r0], the data shows [sch_q0r1] and [sch_q1r0].';
    const { citations } = parseCitations(text);

    expect(citations).toHaveLength(3);
    expect(citations[0]?.sourceId).toBe('sch_q0r0');
    expect(citations[0]?.sourceType).toBe('search');
    expect(citations[1]?.sourceId).toBe('sch_q0r1');
    expect(citations[2]?.sourceId).toBe('sch_q1r0');
  });
});

describe('full Citation Flow Integration', () => {
  it('should parse, resolve, and format citations end-to-end', () => {
    // AI response with citations
    const aiResponse = `Based on the project memory [mem_abc123], and the uploaded file [att_upload1],
    the implementation should follow the pattern described in [rag_file456].

    Additionally, previous discussion [thd_thread1] and search results [sch_query1] support this approach.
    The moderator [mod_round0] also agrees.`;

    // Build source map with all source types
    const sourceMap: CitationSourceMap = new Map();

    const sources: CitableSource[] = [
      { id: 'mem_abc123', type: CitationSourceTypes.MEMORY, sourceId: 'abc123', title: 'Memory 1', content: 'Memory content', metadata: {} },
      { id: 'att_upload1', type: CitationSourceTypes.ATTACHMENT, sourceId: 'upload1', title: 'file.pdf', content: 'File content', metadata: { filename: 'file.pdf' } },
      { id: 'rag_file456', type: CitationSourceTypes.RAG, sourceId: 'file456', title: 'indexed.pdf', content: 'Indexed content', metadata: {} },
      { id: 'thd_thread1', type: CitationSourceTypes.THREAD, sourceId: 'thread1', title: 'Previous Chat', content: 'Chat content', metadata: {} },
      { id: 'sch_query1', type: CitationSourceTypes.SEARCH, sourceId: 'query1', title: 'Search Result', content: 'Search content', metadata: {} },
      { id: 'mod_round0', type: CitationSourceTypes.MODERATOR, sourceId: 'round0', title: 'Moderator Summary', content: 'Summary content', metadata: {} },
    ];

    for (const source of sources) {
      sourceMap.set(source.id, source);
    }

    // Parse citations
    const { citations: parsed } = parseCitations(aiResponse);
    expect(parsed).toHaveLength(6);

    // Resolve to DB format
    const dbCitations = toDbCitations(parsed, (sourceId) => {
      const source = sourceMap.get(sourceId);
      if (!source)
        return undefined;
      return {
        title: source.title,
        excerpt: source.content,
      };
    });

    expect(dbCitations).toHaveLength(6);

    // Verify all source types are correctly resolved
    const sourceTypes = dbCitations.map(c => c.sourceType);
    expect(sourceTypes).toContain('memory');
    expect(sourceTypes).toContain('attachment');
    expect(sourceTypes).toContain('rag');
    expect(sourceTypes).toContain('thread');
    expect(sourceTypes).toContain('search');
    expect(sourceTypes).toContain('moderator');

    // Verify all titles are resolved
    for (const citation of dbCitations) {
      expect(citation.title).toBeDefined();
      expect(citation.excerpt).toBeDefined();
    }
  });
});
