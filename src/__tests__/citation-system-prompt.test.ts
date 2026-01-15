/**
 * Citation System Prompt Integration Tests
 *
 * Tests that the system prompt correctly includes citation instructions
 * when there are available sources (attachments, RAG, memories, etc.)
 */

import { describe, expect, it } from 'vitest';

import { CitationSourcePrefixes, CitationSourceTypes } from '@/api/core/enums';
// Import the function we're testing
import { buildAttachmentCitationPrompt } from '@/api/services/prompts';
import type { AttachmentCitationInfo } from '@/api/types/citations';

describe('citation System Prompt', () => {
  describe('buildAttachmentCitationPrompt', () => {
    it('should include citation instructions when attachments exist', () => {
      const attachments: AttachmentCitationInfo[] = [
        {
          filename: 'test.txt',
          citationId: 'att_abc12345',
          mimeType: 'text/plain',
          fileSize: 1024,
          roundNumber: null,
          textContent: 'This is test content',
        },
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      // Should include citation instructions (mandatory header with emphasis)
      expect(prompt).toContain('## 🚨 MANDATORY: File Citation Requirements');
      expect(prompt).toContain('[att_xxxxxxxx]');
      expect(prompt).toContain('att_abc12345');

      // Should include the file content
      expect(prompt).toContain('This is test content');
      expect(prompt).toContain('test.txt');
    });

    it('should return empty string when no attachments', () => {
      const prompt = buildAttachmentCitationPrompt([]);
      expect(prompt).toBe('');
    });

    it('should handle binary files (images/PDFs) correctly', () => {
      const attachments: AttachmentCitationInfo[] = [
        {
          filename: 'image.png',
          citationId: 'att_img12345',
          mimeType: 'image/png',
          fileSize: 50000,
          roundNumber: null,
          textContent: null, // Binary file has no text content
        },
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      expect(prompt).toContain('att_img12345');
      expect(prompt).toContain('image.png');
      expect(prompt).toContain('[Visual/document content');
    });

    it('should include multiple attachments with unique citation IDs', () => {
      const attachments: AttachmentCitationInfo[] = [
        {
          filename: 'doc1.txt',
          citationId: 'att_doc1xxxx',
          mimeType: 'text/plain',
          fileSize: 512,
          roundNumber: null,
          textContent: 'Document 1 content',
        },
        {
          filename: 'doc2.txt',
          citationId: 'att_doc2xxxx',
          mimeType: 'text/plain',
          fileSize: 256,
          roundNumber: null,
          textContent: 'Document 2 content',
        },
      ];

      const prompt = buildAttachmentCitationPrompt(attachments);

      expect(prompt).toContain('att_doc1xxxx');
      expect(prompt).toContain('att_doc2xxxx');
      expect(prompt).toContain('Document 1 content');
      expect(prompt).toContain('Document 2 content');
    });
  });

  describe('citation ID Generation', () => {
    it('should generate correct citation IDs from source prefixes', () => {
      const testCases: Array<{ type: keyof typeof CitationSourceTypes; expectedPrefix: string }> = [
        { type: 'MEMORY', expectedPrefix: 'mem' },
        { type: 'THREAD', expectedPrefix: 'thd' },
        { type: 'ATTACHMENT', expectedPrefix: 'att' },
        { type: 'SEARCH', expectedPrefix: 'sch' },
        { type: 'MODERATOR', expectedPrefix: 'mod' },
        { type: 'RAG', expectedPrefix: 'rag' },
      ];

      for (const { type, expectedPrefix } of testCases) {
        const sourceType = CitationSourceTypes[type];
        const prefix = CitationSourcePrefixes[sourceType];
        expect(prefix).toBe(expectedPrefix);
      }
    });

    it('should NOT have ana prefix (old incorrect prefix)', () => {
      // The old buggy code used 'ana' prefix - verify it's not in our system
      const allPrefixes = Object.values(CitationSourcePrefixes);
      expect(allPrefixes).not.toContain('ana');
    });
  });
});

describe('citation Flow Verification', () => {
  it('should verify citation format matches parser expectations', () => {
    // Parser expects: [prefix_sourceId]
    // Example: [mem_abc123], [att_upload1], [rag_file456]

    const validCitationFormats = [
      '[mem_abc12345]',
      '[thd_thread1]',
      '[att_upload1]',
      '[sch_query123]',
      '[mod_round0xx]',
      '[rag_file456]',
    ];

    const invalidCitationFormats = [
      '[ana_round0]', // Old incorrect prefix
      '[sum_abc123]', // Old incorrect prefix for summary
      '[memory_abc]', // Full word instead of prefix
      'mem_abc123', // Missing brackets
      '[mem]', // Missing source ID
    ];

    // Regex pattern from citation-parser.ts (derived from CITATION_PREFIXES)
    // Using non-capturing group (?:...) since we only need to test matches, not extract
    const citationPattern = /\[(?:mem|thd|att|sch|mod|rag)_[a-zA-Z0-9]+\]/g;

    for (const format of validCitationFormats) {
      citationPattern.lastIndex = 0;
      expect(citationPattern.test(format), `Expected ${format} to match`).toBe(true);
    }

    for (const format of invalidCitationFormats) {
      citationPattern.lastIndex = 0;
      expect(citationPattern.test(format), `Expected ${format} to NOT match`).toBe(false);
    }
  });
});
