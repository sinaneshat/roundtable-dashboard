/**
 * Citation Context Builder Tests
 *
 * Tests citation marker extraction, resolution, and all source types
 * including RAG (indexed files) for multi-round, multi-participant scenarios.
 */

import { describe, expect, it } from 'vitest';

import { CitationSourceTypes } from '@/api/core/enums';
import type { CitableSource, CitationSourceMap } from '@/api/types/citations';

import {
  extractCitationMarkers,
  resolveCitations,
  resolveSourceId,
} from '../citation-context-builder';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSource(
  type: keyof typeof CitationSourceTypes,
  id: string,
  title: string,
): CitableSource {
  const prefixes: Record<string, string> = {
    MEMORY: 'mem',
    THREAD: 'thd',
    ATTACHMENT: 'att',
    SEARCH: 'sch',
    ANALYSIS: 'ana',
    RAG: 'rag',
  };

  const prefix = prefixes[type];
  const sourceType = CitationSourceTypes[type];

  return {
    id: `${prefix}_${id}`,
    type: sourceType,
    sourceId: id,
    title,
    content: `Content for ${title}`,
    metadata: {},
  };
}

function createMockSourceMap(sources: CitableSource[]): CitationSourceMap {
  return new Map(sources.map(s => [s.id, s]));
}

// ============================================================================
// extractCitationMarkers Tests
// ============================================================================

describe('citation-context-builder', () => {
  describe('extractCitationMarkers', () => {
    it('should extract memory citations', () => {
      const text = 'According to the requirements [mem_abc12345], we should implement...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['mem_abc12345']);
    });

    it('should extract thread citations', () => {
      const text = 'As discussed previously [thd_xyz789], the approach is...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['thd_xyz789']);
    });

    it('should extract attachment citations', () => {
      const text = 'The uploaded document [att_file123] contains...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['att_file123']);
    });

    it('should extract search citations', () => {
      const text = 'Based on the search results [sch_query456]...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['sch_query456']);
    });

    it('should extract analysis citations', () => {
      const text = 'The moderator analysis [ana_round1] indicates...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['ana_round1']);
    });

    it('should extract RAG/indexed file citations', () => {
      const text = 'From the indexed project files [rag_doc789], we can see...';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['rag_doc789']);
    });

    it('should extract multiple citations of same type', () => {
      const text = 'Sources [mem_abc123] and [mem_def456] both mention...';

      const markers = extractCitationMarkers(text);

      expect(markers).toContain('mem_abc123');
      expect(markers).toContain('mem_def456');
      expect(markers).toHaveLength(2);
    });

    it('should extract multiple citations of different types', () => {
      const text = `
        The requirements [mem_req001] align with what we discussed [thd_chat01].
        The uploaded file [att_doc001] and indexed files [rag_idx001] confirm this.
        Search results [sch_web001] and analysis [ana_rnd001] support the approach.
      `;

      const markers = extractCitationMarkers(text);

      expect(markers).toContain('mem_req001');
      expect(markers).toContain('thd_chat01');
      expect(markers).toContain('att_doc001');
      expect(markers).toContain('rag_idx001');
      expect(markers).toContain('sch_web001');
      expect(markers).toContain('ana_rnd001');
      expect(markers).toHaveLength(6);
    });

    it('should deduplicate repeated citations', () => {
      const text = 'First [mem_abc123], then [mem_abc123] again, and [mem_abc123] once more.';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual(['mem_abc123']);
    });

    it('should return empty array for text without citations', () => {
      const text = 'This is a response without any citations.';

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual([]);
    });

    it('should not match invalid citation formats', () => {
      const text = `
        Invalid: [mem_] [_abc123] [memabc123] [MEM_abc123]
        Also invalid: mem_abc123 [mem-abc123] [mem abc123]
      `;

      const markers = extractCitationMarkers(text);

      expect(markers).toEqual([]);
    });

    it('should handle citations at various positions', () => {
      const text = `[mem_start] Beginning. Middle [thd_mid123]. End [rag_endx].`;

      const markers = extractCitationMarkers(text);

      expect(markers).toContain('mem_start');
      expect(markers).toContain('thd_mid123');
      expect(markers).toContain('rag_endx');
    });

    it('should handle alphanumeric IDs', () => {
      const text = '[mem_ABC123xyz] [thd_999aaa] [rag_MixedCase99]';

      const markers = extractCitationMarkers(text);

      expect(markers).toContain('mem_ABC123xyz');
      expect(markers).toContain('thd_999aaa');
      expect(markers).toContain('rag_MixedCase99');
    });
  });

  // ============================================================================
  // resolveSourceId Tests
  // ============================================================================

  describe('resolveSourceId', () => {
    it('should resolve existing source ID', () => {
      const source = createMockSource('MEMORY', 'abc12345', 'Project Requirements');
      const sourceMap = createMockSourceMap([source]);

      const resolved = resolveSourceId('mem_abc12345', sourceMap);

      expect(resolved).toBeDefined();
      expect(resolved?.title).toBe('Project Requirements');
      expect(resolved?.type).toBe(CitationSourceTypes.MEMORY);
    });

    it('should return undefined for non-existent ID', () => {
      const source = createMockSource('MEMORY', 'abc12345', 'Project Requirements');
      const sourceMap = createMockSourceMap([source]);

      const resolved = resolveSourceId('mem_nonexistent', sourceMap);

      expect(resolved).toBeUndefined();
    });

    it('should resolve all source types', () => {
      const sources = [
        createMockSource('MEMORY', 'mem1', 'Memory Source'),
        createMockSource('THREAD', 'thd1', 'Thread Source'),
        createMockSource('ATTACHMENT', 'att1', 'Attachment Source'),
        createMockSource('SEARCH', 'sch1', 'Search Source'),
        createMockSource('ANALYSIS', 'ana1', 'Analysis Source'),
        createMockSource('RAG', 'rag1', 'RAG Source'),
      ];
      const sourceMap = createMockSourceMap(sources);

      expect(resolveSourceId('mem_mem1', sourceMap)?.type).toBe(CitationSourceTypes.MEMORY);
      expect(resolveSourceId('thd_thd1', sourceMap)?.type).toBe(CitationSourceTypes.THREAD);
      expect(resolveSourceId('att_att1', sourceMap)?.type).toBe(CitationSourceTypes.ATTACHMENT);
      expect(resolveSourceId('sch_sch1', sourceMap)?.type).toBe(CitationSourceTypes.SEARCH);
      expect(resolveSourceId('ana_ana1', sourceMap)?.type).toBe(CitationSourceTypes.ANALYSIS);
      expect(resolveSourceId('rag_rag1', sourceMap)?.type).toBe(CitationSourceTypes.RAG);
    });
  });

  // ============================================================================
  // resolveCitations Tests
  // ============================================================================

  describe('resolveCitations', () => {
    it('should resolve all citations in text', () => {
      const sources = [
        createMockSource('MEMORY', 'mem1', 'Memory 1'),
        createMockSource('THREAD', 'thd1', 'Thread 1'),
      ];
      const sourceMap = createMockSourceMap(sources);
      const text = 'Info from [mem_mem1] and [thd_thd1].';

      const resolved = resolveCitations(text, sourceMap);

      expect(resolved).toHaveLength(2);
      expect(resolved[0].sourceId).toBe('mem_mem1');
      expect(resolved[0].displayNumber).toBe(1);
      expect(resolved[0].source?.title).toBe('Memory 1');
      expect(resolved[1].sourceId).toBe('thd_thd1');
      expect(resolved[1].displayNumber).toBe(2);
      expect(resolved[1].source?.title).toBe('Thread 1');
    });

    it('should assign sequential display numbers', () => {
      const sources = [
        createMockSource('MEMORY', 'a', 'A'),
        createMockSource('MEMORY', 'b', 'B'),
        createMockSource('MEMORY', 'c', 'C'),
      ];
      const sourceMap = createMockSourceMap(sources);
      const text = '[mem_a] [mem_b] [mem_c]';

      const resolved = resolveCitations(text, sourceMap);

      expect(resolved[0].displayNumber).toBe(1);
      expect(resolved[1].displayNumber).toBe(2);
      expect(resolved[2].displayNumber).toBe(3);
    });

    it('should handle unresolvable citations', () => {
      const sourceMap = createMockSourceMap([]);
      const text = '[mem_unknown] citation.';

      const resolved = resolveCitations(text, sourceMap);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].sourceId).toBe('mem_unknown');
      expect(resolved[0].source).toBeUndefined();
    });

    it('should return empty array for text without citations', () => {
      const sourceMap = createMockSourceMap([]);
      const text = 'No citations here.';

      const resolved = resolveCitations(text, sourceMap);

      expect(resolved).toEqual([]);
    });
  });

  // ============================================================================
  // Multi-Round, Multi-Participant Citation Scenarios
  // ============================================================================

  describe('multi-round citation scenarios', () => {
    it('should support citations across multiple conversation rounds', () => {
      // Simulates: Round 1 creates memory, Round 2 participant cites it
      const round1Memory = createMockSource('MEMORY', 'r1mem001', 'Round 1 Requirements');
      const round2Analysis = createMockSource('ANALYSIS', 'r2ana001', 'Round 2 Analysis');

      const sourceMap = createMockSourceMap([round1Memory, round2Analysis]);

      // Participant in round 3 cites both
      const round3Response = `
        Based on the initial requirements [mem_r1mem001] established in round 1,
        and the subsequent analysis [ana_r2ana001] from round 2,
        we can conclude...
      `;

      const resolved = resolveCitations(round3Response, sourceMap);

      expect(resolved).toHaveLength(2);
      expect(resolved.find(r => r.sourceId === 'mem_r1mem001')?.source?.title)
        .toBe('Round 1 Requirements');
      expect(resolved.find(r => r.sourceId === 'ana_r2ana001')?.source?.title)
        .toBe('Round 2 Analysis');
    });

    it('should support RAG citations from indexed project files', () => {
      // Simulates: User uploaded files get indexed, AI cites them
      const ragSource = createMockSource('RAG', 'doc12345', 'project-spec.pdf');
      ragSource.metadata = {
        filename: 'project-spec.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024000,
      };

      const sourceMap = createMockSourceMap([ragSource]);

      const aiResponse = `
        According to the project specification document [rag_doc12345],
        the system should support OAuth 2.0 authentication.
      `;

      const resolved = resolveCitations(aiResponse, sourceMap);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].source?.type).toBe(CitationSourceTypes.RAG);
      expect(resolved[0].source?.metadata.filename).toBe('project-spec.pdf');
    });

    it('should support citations from multiple source types in one response', () => {
      // Comprehensive scenario: AI combines info from all sources
      const sources = [
        createMockSource('MEMORY', 'req001', 'User Requirements'),
        createMockSource('THREAD', 'prev01', 'Previous Discussion'),
        createMockSource('ATTACHMENT', 'upld01', 'uploaded-doc.pdf'),
        createMockSource('SEARCH', 'web001', 'Web Search Results'),
        createMockSource('ANALYSIS', 'mod001', 'Moderator Synthesis'),
        createMockSource('RAG', 'idx001', 'indexed-file.md'),
      ];

      const sourceMap = createMockSourceMap(sources);

      const comprehensiveResponse = `
        Based on the user's requirements [mem_req001] and previous discussion [thd_prev01],
        combined with insights from the uploaded document [att_upld01] and indexed files [rag_idx001],
        along with web research [sch_web001], the moderator analysis [ana_mod001] suggests...
      `;

      const resolved = resolveCitations(comprehensiveResponse, sourceMap);

      expect(resolved).toHaveLength(6);

      // Verify all types are represented
      const types = resolved.map(r => r.source?.type).filter(Boolean);
      expect(types).toContain(CitationSourceTypes.MEMORY);
      expect(types).toContain(CitationSourceTypes.THREAD);
      expect(types).toContain(CitationSourceTypes.ATTACHMENT);
      expect(types).toContain(CitationSourceTypes.SEARCH);
      expect(types).toContain(CitationSourceTypes.ANALYSIS);
      expect(types).toContain(CitationSourceTypes.RAG);
    });
  });

  // ============================================================================
  // Multi-Participant Citation Scenarios
  // ============================================================================

  describe('multi-participant citation scenarios', () => {
    it('should allow different participants to cite same sources', () => {
      // Scenario: Multiple AI participants reference same project context
      const sharedMemory = createMockSource('MEMORY', 'shared001', 'Shared Project Context');
      const sharedRag = createMockSource('RAG', 'docshare', 'shared-document.pdf');

      const sourceMap = createMockSourceMap([sharedMemory, sharedRag]);

      // Participant 1 response
      const participant1Response = `
        As an analyst, I reference the project context [mem_shared001]
        and the specification document [rag_docshare].
      `;

      // Participant 2 response
      const participant2Response = `
        From a technical perspective, the context [mem_shared001]
        indicates that per the spec [rag_docshare], we should...
      `;

      // Participant 3 response
      const participant3Response = `
        Building on the shared understanding [mem_shared001],
        and aligning with the documentation [rag_docshare]...
      `;

      const resolved1 = resolveCitations(participant1Response, sourceMap);
      const resolved2 = resolveCitations(participant2Response, sourceMap);
      const resolved3 = resolveCitations(participant3Response, sourceMap);

      // All participants should resolve same sources
      expect(resolved1.map(r => r.sourceId)).toEqual(resolved2.map(r => r.sourceId));
      expect(resolved2.map(r => r.sourceId)).toEqual(resolved3.map(r => r.sourceId));

      // Each should have 2 citations
      expect(resolved1).toHaveLength(2);
      expect(resolved2).toHaveLength(2);
      expect(resolved3).toHaveLength(2);
    });

    it('should maintain citation context across participant turns', () => {
      // Simulates: 3-round discussion with different participants
      const sources = [
        // Round 1: Initial context
        createMockSource('MEMORY', 'r1ctx', 'Initial Context'),
        // Round 2: Search results added
        createMockSource('SEARCH', 'r2sch', 'Round 2 Search'),
        // Round 3: Analysis added
        createMockSource('ANALYSIS', 'r3ana', 'Round 3 Analysis'),
      ];

      const sourceMap = createMockSourceMap(sources);

      // Round 1, Participant A: Cites initial context
      const r1pA = 'Starting point [mem_r1ctx] for discussion.';
      expect(resolveCitations(r1pA, sourceMap)).toHaveLength(1);

      // Round 2, Participant B: Cites initial + new search
      const r2pB = 'Building on [mem_r1ctx], search shows [sch_r2sch].';
      expect(resolveCitations(r2pB, sourceMap)).toHaveLength(2);

      // Round 3, Participant C: Cites all previous sources
      const r3pC = 'Context [mem_r1ctx], search [sch_r2sch], analysis [ana_r3ana].';
      const finalResolved = resolveCitations(r3pC, sourceMap);
      expect(finalResolved).toHaveLength(3);
    });

    it('should support participant citing another participant via thread', () => {
      // Scenario: Participant B cites Participant A's earlier message
      const participantAThread = createMockSource('THREAD', 'pAthd', 'Participant A Discussion');
      participantAThread.metadata = {
        threadTitle: 'Technical Analysis',
        roundNumber: 1,
      };

      const sourceMap = createMockSourceMap([participantAThread]);

      // Participant B's response referencing Participant A
      const participantBResponse = `
        As Participant A noted in their analysis [thd_pAthd],
        the technical approach should prioritize...
      `;

      const resolved = resolveCitations(participantBResponse, sourceMap);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].source?.type).toBe(CitationSourceTypes.THREAD);
      expect(resolved[0].source?.metadata.roundNumber).toBe(1);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle very long citation IDs', () => {
      const longId = 'abcdefghijklmnopqrstuvwxyz123456';

      const text = `[rag_${longId}]`;
      const markers = extractCitationMarkers(text);

      expect(markers).toContain(`rag_${longId}`);
    });

    it('should handle citations in markdown formatting', () => {
      const markdownText = `
        **Bold text with citation [mem_md001]**

        - List item [mem_md001]
        - Another item

        > Blockquote [mem_md001]

        \`code [mem_md001]\`
      `;

      const markers = extractCitationMarkers(markdownText);

      // Should find all 4 occurrences but deduplicate
      expect(markers).toEqual(['mem_md001']);
    });

    it('should handle citations in code blocks', () => {
      const codeText = `
        Reference the file [rag_code01] for implementation.

        \`\`\`javascript
        // See [rag_code01] for full implementation
        function example() {}
        \`\`\`
      `;

      const markers = extractCitationMarkers(codeText);

      expect(markers).toEqual(['rag_code01']);
    });

    it('should handle empty source map', () => {
      const sourceMap = createMockSourceMap([]);
      const text = '[mem_orphan] [thd_orphan] [rag_orphan]';

      const resolved = resolveCitations(text, sourceMap);

      expect(resolved).toHaveLength(3);
      expect(resolved.every(r => r.source === undefined)).toBe(true);
    });

    it('should handle source map with thousands of entries', () => {
      // Performance test: ensure large maps work efficiently
      const sources: CitableSource[] = [];
      for (let i = 0; i < 1000; i++) {
        sources.push(createMockSource('MEMORY', `bulk${i.toString().padStart(4, '0')}`, `Memory ${i}`));
      }
      const sourceMap = createMockSourceMap(sources);

      const text = '[mem_bulk0500] [mem_bulk0999]';
      const resolved = resolveCitations(text, sourceMap);

      expect(resolved).toHaveLength(2);
      expect(resolved[0].source?.title).toBe('Memory 500');
      expect(resolved[1].source?.title).toBe('Memory 999');
    });
  });
});
