/**
 * Attachment Context Prompt Tests
 *
 * Tests for buildAttachmentCitationPrompt which produces clean XML-formatted
 * context following AI SDK v5 patterns. No forced citation markers - models
 * naturally reference files by name.
 *
 * @module api/services/__tests__/attachment-citation-prompt.test
 */

import { describe, expect, it } from 'vitest';

import type { AttachmentCitationInfo } from '@/api/types/citations';

import { buildAttachmentCitationPrompt } from '../prompts.service';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockAttachment(
  overrides?: Partial<AttachmentCitationInfo>,
): AttachmentCitationInfo {
  return {
    filename: 'test-document.pdf',
    citationId: 'att_abc12345', // Still in type but not used in output
    mimeType: 'application/pdf',
    fileSize: 102400, // 100KB
    roundNumber: 0,
    textContent: null,
    ...overrides,
  };
}

// ============================================================================
// buildAttachmentCitationPrompt Tests
// ============================================================================

describe('buildAttachmentCitationPrompt', () => {
  describe('basic functionality', () => {
    it('should return empty string for no attachments', () => {
      const result = buildAttachmentCitationPrompt([]);
      expect(result).toBe('');
    });

    it('should return non-empty string for single attachment', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);
      expect(result).not.toBe('');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('xml format structure', () => {
    it('should wrap all files in <uploaded-files> tag', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('<uploaded-files>');
      expect(result).toContain('</uploaded-files>');
    });

    it('should use <file> tags for each attachment', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('<file');
      expect(result).toContain('</file>');
    });

    it('should include file attributes: index, name, type, size', () => {
      const attachments = [
        createMockAttachment({
          filename: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 51200, // 50KB
        }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('index="1"');
      expect(result).toContain('name="report.pdf"');
      expect(result).toContain('type="application/pdf"');
      expect(result).toContain('size="50.0KB"');
    });

    it('should use sequential index for multiple files', () => {
      const attachments = [
        createMockAttachment({ filename: 'file1.pdf' }),
        createMockAttachment({ filename: 'file2.pdf' }),
        createMockAttachment({ filename: 'file3.pdf' }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('index="1"');
      expect(result).toContain('index="2"');
      expect(result).toContain('index="3"');
    });
  });

  describe('file content handling', () => {
    it('should include text content for text files', () => {
      const attachments = [
        createMockAttachment({
          filename: 'readme.md',
          mimeType: 'text/markdown',
          textContent: '# Project Overview\n\nThis is the project documentation.',
        }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('Project Overview');
      expect(result).toContain('project documentation');
    });

    it('should indicate visual content for non-text files', () => {
      const attachments = [
        createMockAttachment({
          filename: 'screenshot.png',
          mimeType: 'image/png',
          textContent: null,
        }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('[Visual content');
    });
  });

  describe('special characters and edge cases', () => {
    it('should handle filenames with special characters', () => {
      const attachments = [
        createMockAttachment({
          filename: 'file (1) [final].pdf',
        }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('file (1) [final].pdf');
    });

    it('should handle very long filenames', () => {
      const longFilename = 'this-is-a-very-long-filename-that-exceeds-normal-lengths-for-testing-purposes.pdf';
      const attachments = [
        createMockAttachment({ filename: longFilename }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain(longFilename);
    });

    it('should handle unicode filenames', () => {
      const attachments = [
        createMockAttachment({ filename: '文档.pdf' }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('文档.pdf');
    });

    it('should display file sizes correctly', () => {
      const attachments = [
        createMockAttachment({ fileSize: 10 * 1024 * 1024 }), // 10MB = 10240KB
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result).toContain('KB');
    });
  });

  describe('citation format with IDs and instructions', () => {
    it('should NOT include MANDATORY or REQUIRED language', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result.toLowerCase()).not.toContain('mandatory');
      expect(result.toLowerCase()).not.toContain('required');
      expect(result).not.toContain('⚠️');
    });

    it('should include citation ID attributes and format instructions', () => {
      const attachments = [
        createMockAttachment({ citationId: 'att_example123' }),
      ];
      const result = buildAttachmentCitationPrompt(attachments);

      // Citation IDs should be in XML attributes
      expect(result).toContain('id="att_example123"');
      // Should include citation format instruction
      expect(result).toContain('[att_xxxxxxxx]');
    });

    it('should NOT include reference tables', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);

      expect(result.toLowerCase()).not.toContain('reference table');
      expect(result).not.toContain('→');
    });

    it('should include clear numbered rules', () => {
      const attachments = [createMockAttachment()];
      const result = buildAttachmentCitationPrompt(attachments);

      // Should have numbered rules for clarity
      expect(result).toContain('**Rules**:');
      expect(result).toMatch(/1\.\s+Use the EXACT citation ID/);
      expect(result).toMatch(/2\.\s+Place citations inline/);
    });
  });

  describe('consistency', () => {
    it('should produce consistent output for same input', () => {
      const attachment = createMockAttachment();

      const result1 = buildAttachmentCitationPrompt([attachment]);
      const result2 = buildAttachmentCitationPrompt([attachment]);

      expect(result1).toBe(result2);
    });

    it('should handle empty text content same as null', () => {
      const attachmentNull = createMockAttachment({ textContent: null });
      const attachmentEmpty = createMockAttachment({ textContent: '' });

      const resultNull = buildAttachmentCitationPrompt([attachmentNull]);
      const resultEmpty = buildAttachmentCitationPrompt([attachmentEmpty]);

      // Both should indicate visual content since no text to display
      expect(resultNull).toContain('[Visual content');
      // Empty string is falsy so should also be treated as no content
      expect(resultEmpty).toContain('[Visual content');
    });
  });
});
