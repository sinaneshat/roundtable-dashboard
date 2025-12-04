/**
 * Streaming Citation Integration Tests
 *
 * Tests the full citation flow from system prompt generation through response parsing.
 * These tests verify that:
 * 1. System prompts include citation instructions and source IDs
 * 2. Citation source maps are properly built
 * 3. Citations in AI responses are correctly parsed and resolved
 * 4. The end-to-end citation flow works correctly
 *
 * @module api/services/__tests__/streaming-citation-integration.test
 */

import { describe, expect, it } from 'vitest';

import { CitationSourcePrefixes, CitationSourceTypes } from '@/api/core/enums';
import { extractCitationMarkers, resolveCitations } from '@/api/services/citation-context-builder';
import { buildAttachmentCitationPrompt } from '@/api/services/prompts.service';
import type { AttachmentCitationInfo, CitableSource, CitationSourceMap } from '@/api/types/citations';
import { hasCitations, parseCitations, toDbCitations } from '@/lib/utils/citation-parser';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a mock attachment with citation info
 */
function createMockAttachmentInfo(
  id: string,
  filename: string,
  textContent?: string | null,
): AttachmentCitationInfo {
  const citationId = `${CitationSourcePrefixes[CitationSourceTypes.ATTACHMENT]}_${id.slice(0, 8)}`;

  return {
    filename,
    citationId,
    mimeType: textContent ? 'text/plain' : 'application/pdf',
    fileSize: textContent?.length ?? 50000,
    roundNumber: 0,
    textContent: textContent ?? null,
  };
}

/**
 * Create a citable source for testing
 */
function createCitableSource(
  id: string,
  filename: string,
  content: string,
): CitableSource {
  const citationId = `${CitationSourcePrefixes[CitationSourceTypes.ATTACHMENT]}_${id.slice(0, 8)}`;

  return {
    id: citationId,
    type: CitationSourceTypes.ATTACHMENT,
    sourceId: id,
    title: filename,
    content,
    metadata: {
      filename,
      downloadUrl: `/api/v1/uploads/${id}/download`,
      mimeType: 'text/plain',
      fileSize: content.length,
    },
  };
}

/**
 * Build a source map from citable sources
 */
function buildSourceMap(sources: CitableSource[]): CitationSourceMap {
  return new Map(sources.map(s => [s.id, s]));
}

// ============================================================================
// System Prompt Attachment Context Tests (Clean XML Format)
// ============================================================================

describe('system prompt attachment context', () => {
  describe('attachment context prompt generation', () => {
    it('should generate clean XML format for attachments', () => {
      const attachments = [
        createMockAttachmentInfo('upload001', 'requirements.txt', 'Feature requirements:\n1. User auth\n2. Dashboard'),
        createMockAttachmentInfo('upload002', 'api-spec.json', '{"endpoints": ["/users", "/data"]}'),
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      // Should use XML format
      expect(prompt).toContain('<uploaded-files>');
      expect(prompt).toContain('</uploaded-files>');
      expect(prompt).toContain('<file');
      expect(prompt).toContain('</file>');

      // Should contain file content
      expect(prompt).toContain('Feature requirements');
      expect(prompt).toContain('endpoints');
    });

    it('should include file metadata in XML attributes', () => {
      const attachments = [
        createMockAttachmentInfo('testfile1', 'doc.pdf'),
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      // Should have file attributes
      expect(prompt).toContain('name="doc.pdf"');
      expect(prompt).toContain('type="application/pdf"');
      expect(prompt).toContain('index="1"');
    });

    it('should include citation IDs and format instructions', () => {
      const attachments = [
        createMockAttachmentInfo('file123', 'invoice.pdf'),
        createMockAttachmentInfo('file456', 'contract.docx'),
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      // Should have citation IDs in XML attributes
      expect(prompt).toContain('id="att_file123"');
      expect(prompt).toContain('id="att_file456"');
      // Should have citation format instruction
      expect(prompt).toContain('[att_xxxxxxxx]');
      // Should NOT have verbose instructions
      expect(prompt).not.toContain('→');
      expect(prompt.toLowerCase()).not.toContain('mandatory');
    });
  });
});

// ============================================================================
// Citation Source Map Building Tests
// ============================================================================

describe('citation source map building', () => {
  it('should build source map with correct ID format', () => {
    const sources = [
      createCitableSource('upload_abc123', 'report.pdf', 'Annual report content'),
      createCitableSource('upload_def456', 'data.csv', 'Column1,Column2\n1,2'),
    ];

    const sourceMap = buildSourceMap(sources);

    expect(sourceMap.size).toBe(2);
    expect(sourceMap.has('att_upload_a')).toBe(true);
    expect(sourceMap.has('att_upload_d')).toBe(true);
  });

  it('should store full source metadata for resolution', () => {
    const source = createCitableSource('test_upload', 'analysis.md', '# Analysis\n\nKey findings...');
    const sourceMap = buildSourceMap([source]);

    const resolved = sourceMap.get('att_test_upl');
    expect(resolved).toBeDefined();
    expect(resolved?.title).toBe('analysis.md');
    expect(resolved?.content).toContain('Key findings');
    expect(resolved?.metadata.downloadUrl).toContain('/api/v1/uploads/');
  });
});

// ============================================================================
// AI Response Citation Parsing Tests
// ============================================================================

describe('aI response citation parsing', () => {
  describe('detecting citations in responses', () => {
    it('should detect attachment citations in AI response', () => {
      const aiResponse = 'Based on the uploaded file [att_abc12345], the requirements specify...';

      expect(hasCitations(aiResponse)).toBe(true);
    });

    it('should detect multiple citation types', () => {
      const aiResponse = `
        From the project memory [mem_project1],
        the uploaded document [att_doc00001],
        and previous discussion [thd_chat123],
        we can conclude...
      `;

      expect(hasCitations(aiResponse)).toBe(true);

      const markers = extractCitationMarkers(aiResponse);
      expect(markers).toContain('mem_project1');
      expect(markers).toContain('att_doc00001');
      expect(markers).toContain('thd_chat123');
    });

    it('should NOT detect false positives', () => {
      const noRealCitations = `
        This text mentions [something] but not valid citations.
        Also [invalid_prefix] and [mem_] without ID.
      `;

      expect(hasCitations(noRealCitations)).toBe(false);
    });
  });

  describe('parsing citations from response', () => {
    it('should parse single citation correctly', () => {
      const response = 'The invoice total is €180.00 [att_invoice1]';
      const result = parseCitations(response);

      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].sourceId).toBe('att_invoice1');
      expect(result.citations[0].sourceType).toBe(CitationSourceTypes.ATTACHMENT);
      expect(result.citations[0].displayNumber).toBe(1);
    });

    it('should parse multiple citations with sequential display numbers', () => {
      const response = `
        From the requirements [att_req00001],
        combined with the spec [att_spec0001],
        and referencing [att_req00001] again.
      `;

      const result = parseCitations(response);

      // Unique citations only
      expect(result.citations).toHaveLength(2);

      // Display numbers assigned in order of first appearance
      expect(result.citations[0].displayNumber).toBe(1);
      expect(result.citations[1].displayNumber).toBe(2);
    });

    it('should generate correct segments for rendering', () => {
      const response = 'Start [att_file1] middle [att_file2] end.';
      const result = parseCitations(response);

      // Should have 5 segments: text, citation, text, citation, text
      expect(result.segments).toHaveLength(5);
      expect(result.segments[0].type).toBe('text');
      expect(result.segments[1].type).toBe('citation');
      expect(result.segments[2].type).toBe('text');
      expect(result.segments[3].type).toBe('citation');
      expect(result.segments[4].type).toBe('text');
    });
  });
});

// ============================================================================
// Citation Resolution Tests
// ============================================================================

describe('citation resolution', () => {
  it('should resolve citations to full source data', () => {
    // Use alphanumeric ID only - regex [a-zA-Z0-9]+ doesn't match underscores
    const sources = [
      createCitableSource('upload12x', 'budget.xlsx', 'Q1 Budget: $50,000'),
    ];
    const sourceMap = buildSourceMap(sources);

    // Citation ID: att_ + first 8 chars of 'upload12x' = att_upload12
    const response = 'The budget shows [att_upload12] a total of $50,000.';
    const resolved = resolveCitations(response, sourceMap);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].source).toBeDefined();
    expect(resolved[0].source?.title).toBe('budget.xlsx');
    expect(resolved[0].source?.content).toContain('Q1 Budget');
  });

  it('should handle unresolvable citations gracefully', () => {
    const sourceMap = buildSourceMap([]);
    const response = 'Reference [att_unknown1] not in source map.';

    const resolved = resolveCitations(response, sourceMap);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].sourceId).toBe('att_unknown1');
    expect(resolved[0].source).toBeUndefined();
  });

  it('should convert to DbCitation format for storage', () => {
    const response = 'Data from [att_file0001] and [mem_project1]';
    const { citations: parsed } = parseCitations(response);

    const sourceResolver = (sourceId: string) => {
      if (sourceId === 'att_file0001') {
        return {
          title: 'data.csv',
          excerpt: 'CSV data content...',
          downloadUrl: '/api/v1/uploads/file0001/download',
          filename: 'data.csv',
          mimeType: 'text/csv',
          fileSize: 1024,
        };
      }
      return undefined;
    };

    const dbCitations = toDbCitations(parsed, sourceResolver);

    expect(dbCitations).toHaveLength(2);

    // First citation should have resolved data
    expect(dbCitations[0].title).toBe('data.csv');
    expect(dbCitations[0].downloadUrl).toContain('/api/v1/uploads/');
    expect(dbCitations[0].sourceType).toBe(CitationSourceTypes.ATTACHMENT);

    // Second citation has no resolver data
    expect(dbCitations[1].sourceType).toBe(CitationSourceTypes.MEMORY);
    expect(dbCitations[1].title).toBeUndefined();
  });
});

// ============================================================================
// End-to-End Citation Flow Tests
// ============================================================================

describe('end-to-end citation flow', () => {
  /**
   * These tests simulate the complete flow:
   * 1. Build system prompt with attachments (clean XML format)
   * 2. AI may generate response with citations (not guaranteed)
   * 3. If citations present, parse and resolve
   *
   * Note: We no longer force citations. These tests verify the parsing/resolution
   * still works IF the AI naturally includes citation markers.
   */

  it('should provide context with citation IDs and parse AI citations', () => {
    // Step 1: Build system prompt with citation IDs
    const attachment = createMockAttachmentInfo(
      'invoice24',
      'invoice.pdf',
      'Invoice #1234\nTotal: €180.00\nDue: 2024-01-15',
    );
    const systemPrompt = buildAttachmentCitationPrompt([attachment]);

    // Verify system prompt has XML format with citation IDs
    expect(systemPrompt).toContain('<uploaded-files>');
    expect(systemPrompt).toContain('name="invoice.pdf"');
    expect(systemPrompt).toContain('id="att_invoice2"'); // Citation ID in attribute
    expect(systemPrompt).toContain('[att_xxxxxxxx]'); // Citation format instruction

    // Step 2: IF AI response happens to include citation (rare without forcing)
    // This tests that parsing still works
    const aiResponseWithCitation = `Based on the uploaded invoice [att_invoice2], the total amount due is €180.00.`;

    // Step 3: Parse citations IF they exist
    expect(hasCitations(aiResponseWithCitation)).toBe(true);
    const parsed = parseCitations(aiResponseWithCitation);
    expect(parsed.citations).toHaveLength(1);

    // Step 4: Build source map and resolve
    const source = createCitableSource(
      'invoice24',
      'invoice.pdf',
      'Invoice #1234\nTotal: €180.00\nDue: 2024-01-15',
    );
    const sourceMap = buildSourceMap([source]);

    const resolved = resolveCitations(aiResponseWithCitation, sourceMap);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].source?.title).toBe('invoice.pdf');
  });

  it('should provide clean context for multiple attachments', () => {
    const attachments = [
      createMockAttachmentInfo('contract1', 'contract.pdf', 'Service agreement...'),
      createMockAttachmentInfo('proposal1', 'proposal.docx', 'Project proposal...'),
      createMockAttachmentInfo('timeline1', 'timeline.xlsx', 'Phase 1: Q1, Phase 2: Q2'),
    ];

    const systemPrompt = buildAttachmentCitationPrompt(attachments);

    // Should have XML format with all files and citation IDs
    expect(systemPrompt).toContain('<uploaded-files>');
    expect(systemPrompt).toContain('name="contract.pdf"');
    expect(systemPrompt).toContain('name="proposal.docx"');
    expect(systemPrompt).toContain('name="timeline.xlsx"');

    // Should have citation IDs in XML attributes
    expect(systemPrompt).toContain('id="att_contract');
    expect(systemPrompt).toContain('id="att_proposal');
    expect(systemPrompt).toContain('id="att_timeline');
  });

  it('should handle responses without citations gracefully', () => {
    const attachment = createMockAttachmentInfo('file1', 'doc.pdf', 'Some content');
    const systemPrompt = buildAttachmentCitationPrompt([attachment]);

    // System prompt has XML with citation IDs and instructions
    expect(systemPrompt).toContain('<uploaded-files>');
    expect(systemPrompt).toContain('id="att_file1"');
    expect(systemPrompt).toContain('[att_xxxxxxxx]'); // Citation instructions included

    // AI response without citations - this is the expected common case now
    const aiResponse = 'Here is a general response without any specific citations to documents.';

    expect(hasCitations(aiResponse)).toBe(false);
    const parsed = parseCitations(aiResponse);
    expect(parsed.citations).toHaveLength(0);
  });

  it('should preserve citation context through storage flow', () => {
    // Simulates: parsing → toDbCitations → storage → retrieval → rendering

    const aiResponse = 'The budget [att_budget01] shows Q1 at $50,000.';
    const { citations: parsed } = parseCitations(aiResponse);

    const sourceData = {
      title: 'budget.xlsx',
      excerpt: 'Q1: $50,000, Q2: $60,000',
      downloadUrl: '/api/v1/uploads/budget01/download',
      filename: 'budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 25600,
    };

    const dbCitations = toDbCitations(parsed, () => sourceData);

    // Verify all data preserved for UI rendering
    expect(dbCitations[0]).toMatchObject({
      id: 'att_budget01',
      sourceType: CitationSourceTypes.ATTACHMENT,
      displayNumber: 1,
      title: 'budget.xlsx',
      excerpt: 'Q1: $50,000, Q2: $60,000',
      downloadUrl: '/api/v1/uploads/budget01/download',
      filename: 'budget.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: 25600,
    });
  });
});

// ============================================================================
// Citation Format Compliance Tests
// ============================================================================

describe('citation format compliance', () => {
  it('should use consistent prefix format across the system', () => {
    // All attachment citations must use att_ prefix
    const attachmentPrefix = CitationSourcePrefixes[CitationSourceTypes.ATTACHMENT];
    expect(attachmentPrefix).toBe('att');

    // Memory citations use mem_
    const memoryPrefix = CitationSourcePrefixes[CitationSourceTypes.MEMORY];
    expect(memoryPrefix).toBe('mem');

    // Thread citations use thd_
    const threadPrefix = CitationSourcePrefixes[CitationSourceTypes.THREAD];
    expect(threadPrefix).toBe('thd');
  });

  it('should generate citation IDs that match parser regex', () => {
    const attachment = createMockAttachmentInfo('test123abc', 'file.pdf');

    // The citation ID should match the parser pattern
    const citationIdPattern = /^att_[a-zA-Z0-9]+$/;
    expect(attachment.citationId).toMatch(citationIdPattern);
  });

  it('should handle citation IDs with various lengths', () => {
    // Short ID
    const short = createMockAttachmentInfo('abc', 'short.pdf');
    expect(short.citationId).toMatch(/^att_[a-zA-Z0-9]+$/);

    // Long ID (should be truncated to 8 chars)
    const long = createMockAttachmentInfo('abcdefghijklmnopqrstuvwxyz123456', 'long.pdf');
    expect(long.citationId).toMatch(/^att_[a-zA-Z0-9]+$/);
    expect(long.citationId.length).toBeLessThanOrEqual(12); // att_ + 8 chars
  });
});

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('citation edge cases', () => {
  it('should handle empty text gracefully', () => {
    expect(hasCitations('')).toBe(false);
    expect(parseCitations('').citations).toHaveLength(0);
    expect(extractCitationMarkers('')).toHaveLength(0);
  });

  it('should handle malformed citation markers', () => {
    const malformed = `
      [att_] no ID
      [_abc123] no prefix
      att_abc123 no brackets
      [ATT_abc123] wrong case
    `;

    expect(hasCitations(malformed)).toBe(false);
  });

  it('should handle citations in code blocks', () => {
    const withCodeBlock = `
      See the documentation [att_docs001].

      \`\`\`javascript
      // Comment mentioning [att_docs001]
      const data = load();
      \`\`\`

      More text with [att_docs001].
    `;

    const markers = extractCitationMarkers(withCodeBlock);
    // All occurrences should be detected (deduplication happens after)
    expect(markers).toContain('att_docs001');
  });

  it('should handle citations in lists', () => {
    const withList = `
      Sources:
      - First document [att_doc1]
      - Second document [att_doc2]
      - Third document [att_doc3]
    `;

    const markers = extractCitationMarkers(withList);
    expect(markers).toHaveLength(3);
  });
});
