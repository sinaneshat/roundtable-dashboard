/**
 * Attachment Content Service Tests
 *
 * Tests for loadAttachmentContent which converts uploaded files to base64 data URLs
 * for AI model consumption. External AI providers cannot access localhost URLs,
 * so ALL attachments must be converted to data URLs before sending to models.
 *
 * Key behaviors tested:
 * - Text files (text/plain) are converted to base64 data URLs
 * - Images and PDFs are converted to base64 data URLs
 * - Unsupported MIME types are skipped
 * - Empty/missing attachments return empty results
 *
 * NOTE: Size limits are now enforced in frontend validation (use-file-validation.ts),
 * not in this service. Large files are supported via URL-based delivery in
 * loadAttachmentContentUrl() for production environments.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Import after mocks
import { getFile } from '@/api/services/uploads';
import type {
  LoadAttachmentContentParams,
} from '@/api/types/uploads';

import { loadAttachmentContent } from '../attachment-content.service';

// Mock dependencies
vi.mock('@/api/services/uploads', () => ({
  getFile: vi.fn(),
}));

vi.mock('@/db', () => ({
  upload: {
    id: 'id',
    mimeType: 'mimeType',
    filename: 'filename',
    fileSize: 'fileSize',
    r2Key: 'r2Key',
  },
}));

// ============================================================================
// Test Helpers
// ============================================================================

function createMockDb(uploads: Array<{
  id: string;
  mimeType: string;
  filename: string;
  fileSize: number;
  r2Key: string;
}>) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(uploads),
  } as unknown as LoadAttachmentContentParams['db'];
}

function createTextContent(text: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(text).buffer;
}

function createMockLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as LoadAttachmentContentParams['logger'];
}

// ============================================================================
// Tests: Text File Processing
// ============================================================================

describe('attachment Content Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('text File Processing (text/plain)', () => {
    it('should convert text/plain files to base64 data URLs', async () => {
      const textContent = 'Hello, this is a test file content.';
      const textBuffer = createTextContent(textContent);

      const uploads = [{
        id: 'upload-1',
        mimeType: 'text/plain',
        filename: 'test.txt',
        fileSize: textBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-1_test.txt',
      }];

      const db = createMockDb(uploads);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: textBuffer,
        found: true,
        contentType: 'text/plain',
        contentLength: textBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-1'],
        r2Bucket: undefined,
        db,
        logger,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('text/plain');
      expect(result.fileParts[0]?.filename).toBe('test.txt');
      expect(result.fileParts[0]?.url).toMatch(/^data:text\/plain;base64,/);
      expect(result.stats.loaded).toBe(1);
      expect(result.stats.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should convert text/markdown files to base64 data URLs', async () => {
      const markdownContent = '# Heading\n\nSome **bold** text.';
      const textBuffer = createTextContent(markdownContent);

      const uploads = [{
        id: 'upload-md',
        mimeType: 'text/markdown',
        filename: 'readme.md',
        fileSize: textBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-md_readme.md',
      }];

      const db = createMockDb(uploads);

      vi.mocked(getFile).mockResolvedValue({
        data: textBuffer,
        found: true,
        contentType: 'text/markdown',
        contentLength: textBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-md'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('text/markdown');
      expect(result.fileParts[0]?.url).toMatch(/^data:text\/markdown;base64,/);
    });

    it('should convert text/csv files to base64 data URLs', async () => {
      const csvContent = 'name,age,city\nAlice,30,NYC\nBob,25,LA';
      const textBuffer = createTextContent(csvContent);

      const uploads = [{
        id: 'upload-csv',
        mimeType: 'text/csv',
        filename: 'data.csv',
        fileSize: textBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-csv_data.csv',
      }];

      const db = createMockDb(uploads);

      vi.mocked(getFile).mockResolvedValue({
        data: textBuffer,
        found: true,
        contentType: 'text/csv',
        contentLength: textBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-csv'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('text/csv');
    });

    it('should convert application/json files to base64 data URLs', async () => {
      const jsonContent = JSON.stringify({ key: 'value', count: 42 });
      const textBuffer = createTextContent(jsonContent);

      const uploads = [{
        id: 'upload-json',
        mimeType: 'application/json',
        filename: 'config.json',
        fileSize: textBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-json_config.json',
      }];

      const db = createMockDb(uploads);

      vi.mocked(getFile).mockResolvedValue({
        data: textBuffer,
        found: true,
        contentType: 'application/json',
        contentLength: textBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-json'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('application/json');
      expect(result.fileParts[0]?.url).toMatch(/^data:application\/json;base64,/);
    });
  });

  // ============================================================================
  // Tests: Visual File Processing (Images, PDFs)
  // ============================================================================

  describe('visual File Processing (Images, PDFs)', () => {
    it('should convert image/png files to base64 data URLs', async () => {
      // Minimal PNG header for testing
      const pngBuffer = new Uint8Array([
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A,
      ]).buffer;

      const uploads = [{
        id: 'upload-png',
        mimeType: 'image/png',
        filename: 'screenshot.png',
        fileSize: pngBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-png_screenshot.png',
      }];

      const db = createMockDb(uploads);

      vi.mocked(getFile).mockResolvedValue({
        data: pngBuffer,
        found: true,
        contentType: 'image/png',
        contentLength: pngBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-png'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('image/png');
      expect(result.fileParts[0]?.url).toMatch(/^data:image\/png;base64,/);
    });

    it('should convert application/pdf files to base64 data URLs', async () => {
      const pdfContent = '%PDF-1.4\n% Test PDF';
      const pdfBuffer = createTextContent(pdfContent);

      const uploads = [{
        id: 'upload-pdf',
        mimeType: 'application/pdf',
        filename: 'document.pdf',
        fileSize: pdfBuffer.byteLength,
        r2Key: 'uploads/user-1/upload-pdf_document.pdf',
      }];

      const db = createMockDb(uploads);

      vi.mocked(getFile).mockResolvedValue({
        data: pdfBuffer,
        found: true,
        contentType: 'application/pdf',
        contentLength: pdfBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-pdf'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(1);
      expect(result.fileParts[0]?.mimeType).toBe('application/pdf');
      expect(result.fileParts[0]?.url).toMatch(/^data:application\/pdf;base64,/);
    });
  });

  // ============================================================================
  // Tests: Unsupported MIME Types
  // ============================================================================

  describe('unsupported MIME Types', () => {
    it('should skip unsupported MIME types (video/mp4)', async () => {
      const uploads = [{
        id: 'upload-video',
        mimeType: 'video/mp4',
        filename: 'video.mp4',
        fileSize: 1024,
        r2Key: 'uploads/user-1/upload-video_video.mp4',
      }];

      const db = createMockDb(uploads);
      const logger = createMockLogger();

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-video'],
        r2Bucket: undefined,
        db,
        logger,
      });

      expect(result.fileParts).toHaveLength(0);
      expect(result.stats.skipped).toBe(1);
      expect(result.stats.loaded).toBe(0);
      expect(getFile).not.toHaveBeenCalled();
    });

    it('should skip unknown MIME types', async () => {
      const uploads = [{
        id: 'upload-unknown',
        mimeType: 'application/octet-stream',
        filename: 'unknown.bin',
        fileSize: 1024,
        r2Key: 'uploads/user-1/upload-unknown_unknown.bin',
      }];

      const db = createMockDb(uploads);

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-unknown'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(0);
      expect(result.stats.skipped).toBe(1);
    });
  });

  // ============================================================================
  // Tests: Large File Processing
  // ============================================================================

  describe('large File Processing', () => {
    it('should process files within memory-safe limit (10MB)', async () => {
      // Files within MAX_BASE64_FILE_SIZE (10MB) are processed
      const largeContent = 'x'.repeat(1000);
      const textBuffer = createTextContent(largeContent);

      const largeFile = {
        id: 'upload-large',
        mimeType: 'text/plain',
        filename: 'large.txt',
        fileSize: 8 * 1024 * 1024, // 8MB - within 10MB limit
        r2Key: 'uploads/user-1/upload-large_large.txt',
      };

      const db = createMockDb([largeFile]);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: textBuffer,
        found: true,
        contentType: 'text/plain',
        contentLength: textBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-large'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // Files within limit should be processed successfully
      expect(result.fileParts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(getFile).toHaveBeenCalled();
    });

    it('should skip files exceeding memory-safe limit', async () => {
      // Files over MAX_BASE64_FILE_SIZE are skipped to prevent OOM in Workers
      // Using 30MB to exceed both 10MB (prod) and 25MB (local) limits
      const largeFile = {
        id: 'upload-large',
        mimeType: 'text/plain',
        filename: 'large.txt',
        fileSize: 30 * 1024 * 1024, // 30MB - exceeds both 10MB and 25MB limits
        r2Key: 'uploads/user-1/upload-large_large.txt',
      };

      const db = createMockDb([largeFile]);
      const logger = createMockLogger();

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-large'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // Large files should be skipped (not loaded into memory)
      expect(result.fileParts).toHaveLength(0);
      expect(result.stats.skipped).toBe(1);
      expect(getFile).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Tests: Edge Cases
  // ============================================================================

  describe('edge Cases', () => {
    it('should return empty results for empty attachmentIds', async () => {
      const db = createMockDb([]);

      const result = await loadAttachmentContent({
        attachmentIds: [],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.total).toBe(0);
    });

    it('should return empty results for undefined attachmentIds', async () => {
      const db = createMockDb([]);

      const result = await loadAttachmentContent({
        attachmentIds: undefined as unknown as string[],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(0);
      expect(result.stats.total).toBe(0);
    });

    it('should handle file not found in storage', async () => {
      const uploads = [{
        id: 'upload-missing',
        mimeType: 'text/plain',
        filename: 'missing.txt',
        fileSize: 100,
        r2Key: 'uploads/user-1/upload-missing_missing.txt',
      }];

      const db = createMockDb(uploads);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: null,
        found: false,
        contentType: null,
        contentLength: 0,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-missing'],
        r2Bucket: undefined,
        db,
        logger,
      });

      expect(result.fileParts).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain('not found');
    });

    it('should process multiple files of different types', async () => {
      const textBuffer = createTextContent('text content');
      const jsonBuffer = createTextContent('{"key": "value"}');

      const uploads = [
        {
          id: 'upload-txt',
          mimeType: 'text/plain',
          filename: 'file.txt',
          fileSize: textBuffer.byteLength,
          r2Key: 'uploads/user-1/upload-txt_file.txt',
        },
        {
          id: 'upload-json',
          mimeType: 'application/json',
          filename: 'data.json',
          fileSize: jsonBuffer.byteLength,
          r2Key: 'uploads/user-1/upload-json_data.json',
        },
        {
          id: 'upload-video',
          mimeType: 'video/mp4', // Unsupported - should be skipped
          filename: 'video.mp4',
          fileSize: 1024,
          r2Key: 'uploads/user-1/upload-video_video.mp4',
        },
      ];

      const db = createMockDb(uploads);

      vi.mocked(getFile)
        .mockResolvedValueOnce({
          data: textBuffer,
          found: true,
          contentType: 'text/plain',
          contentLength: textBuffer.byteLength,
        })
        .mockResolvedValueOnce({
          data: jsonBuffer,
          found: true,
          contentType: 'application/json',
          contentLength: jsonBuffer.byteLength,
        });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-txt', 'upload-json', 'upload-video'],
        r2Bucket: undefined,
        db,
      });

      expect(result.fileParts).toHaveLength(2); // txt and json
      expect(result.stats.loaded).toBe(2);
      expect(result.stats.skipped).toBe(1); // video
      expect(result.stats.total).toBe(3);
    });
  });

  // ============================================================================
  // Tests: PDF Processing (New 10MB Limit)
  // ============================================================================

  describe('pdf processing', () => {
    it('should process PDF files within 10MB limit (e.g., 5.8MB dashboard export)', async () => {
      // Simulates the test.pdf file (5.8MB Iran Monitor dashboard export)
      const pdfBuffer = new ArrayBuffer(100); // Mock buffer

      const pdfFile = {
        id: 'upload-dashboard-pdf',
        mimeType: 'application/pdf',
        filename: 'dashboard-export.pdf',
        fileSize: 5.8 * 1024 * 1024, // 5.8MB - within new 10MB limit
        r2Key: 'uploads/user-1/upload-dashboard-pdf_dashboard-export.pdf',
      };

      const db = createMockDb([pdfFile]);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: pdfBuffer,
        found: true,
        contentType: 'application/pdf',
        contentLength: pdfBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-dashboard-pdf'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // PDF within 10MB limit should be processed
      expect(result.fileParts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.fileParts[0]?.mimeType).toBe('application/pdf');
      expect(getFile).toHaveBeenCalled();
    });

    it('should process PDF files at exactly 10MB', async () => {
      // Test boundary condition - exactly at the limit
      const pdfBuffer = new ArrayBuffer(100);

      const pdfFile = {
        id: 'upload-large-pdf',
        mimeType: 'application/pdf',
        filename: 'large-document.pdf',
        fileSize: 10 * 1024 * 1024, // Exactly 10MB
        r2Key: 'uploads/user-1/upload-large-pdf_large-document.pdf',
      };

      const db = createMockDb([pdfFile]);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: pdfBuffer,
        found: true,
        contentType: 'application/pdf',
        contentLength: pdfBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-large-pdf'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // PDFs at exactly 10MB should be processed
      expect(result.fileParts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip PDF files exceeding MAX_BASE64_FILE_SIZE limit', async () => {
      // Files over MAX_BASE64_FILE_SIZE (10MB prod / 25MB local) should be skipped
      // Using 30MB to exceed both environments
      const oversizedPdf = {
        id: 'upload-oversized-pdf',
        mimeType: 'application/pdf',
        filename: 'oversized.pdf',
        fileSize: 30 * 1024 * 1024, // 30MB - exceeds both 10MB and 25MB limits
        r2Key: 'uploads/user-1/upload-oversized-pdf_oversized.pdf',
      };

      const db = createMockDb([oversizedPdf]);
      const logger = createMockLogger();

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-oversized-pdf'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // Oversized PDFs should be skipped
      expect(result.fileParts).toHaveLength(0);
      expect(result.stats.skipped).toBe(1);
      expect(getFile).not.toHaveBeenCalled();
      expect(logger?.warn).toHaveBeenCalled();
    });

    it('should process image files within 10MB limit', async () => {
      // Images (like screenshots) are common in PDFs that are exported dashboards
      const imageBuffer = new ArrayBuffer(100);

      const imageFile = {
        id: 'upload-screenshot',
        mimeType: 'image/png',
        filename: 'dashboard-screenshot.png',
        fileSize: 8 * 1024 * 1024, // 8MB - within 10MB limit
        r2Key: 'uploads/user-1/upload-screenshot_dashboard-screenshot.png',
      };

      const db = createMockDb([imageFile]);
      const logger = createMockLogger();

      vi.mocked(getFile).mockResolvedValue({
        data: imageBuffer,
        found: true,
        contentType: 'image/png',
        contentLength: imageBuffer.byteLength,
      });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-screenshot'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // Images within limit should be processed for vision models
      expect(result.fileParts).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.fileParts[0]?.mimeType).toBe('image/png');
    });

    it('should handle multiple mixed-size files correctly', async () => {
      const smallPdfBuffer = new ArrayBuffer(100);
      const mediumPdfBuffer = new ArrayBuffer(100);

      const uploads = [
        {
          id: 'upload-small-pdf',
          mimeType: 'application/pdf',
          filename: 'small.pdf',
          fileSize: 2 * 1024 * 1024, // 2MB
          r2Key: 'uploads/user-1/upload-small-pdf_small.pdf',
        },
        {
          id: 'upload-medium-pdf',
          mimeType: 'application/pdf',
          filename: 'medium.pdf',
          fileSize: 8 * 1024 * 1024, // 8MB - within 10MB limit
          r2Key: 'uploads/user-1/upload-medium-pdf_medium.pdf',
        },
        {
          id: 'upload-oversized-pdf',
          mimeType: 'application/pdf',
          filename: 'oversized.pdf',
          fileSize: 30 * 1024 * 1024, // 30MB - exceeds both 10MB and 25MB limits
          r2Key: 'uploads/user-1/upload-oversized-pdf_oversized.pdf',
        },
      ];

      const db = createMockDb(uploads);
      const logger = createMockLogger();

      vi.mocked(getFile)
        .mockResolvedValueOnce({
          data: smallPdfBuffer,
          found: true,
          contentType: 'application/pdf',
          contentLength: smallPdfBuffer.byteLength,
        })
        .mockResolvedValueOnce({
          data: mediumPdfBuffer,
          found: true,
          contentType: 'application/pdf',
          contentLength: mediumPdfBuffer.byteLength,
        });

      const result = await loadAttachmentContent({
        attachmentIds: ['upload-small-pdf', 'upload-medium-pdf', 'upload-oversized-pdf'],
        r2Bucket: undefined,
        db,
        logger,
      });

      // 2 PDFs within limit should be processed, 1 should be skipped
      expect(result.fileParts).toHaveLength(2);
      expect(result.stats.loaded).toBe(2);
      expect(result.stats.skipped).toBe(1);
      expect(result.stats.total).toBe(3);
    });
  });
});
