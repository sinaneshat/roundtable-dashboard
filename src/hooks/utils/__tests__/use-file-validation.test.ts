/**
 * File Validation Hook Tests
 *
 * Tests verify that file validation correctly enforces size limits
 * and type restrictions for visual files (images + PDFs).
 *
 * SIZE LIMITS (URL-based delivery to AI providers):
 * - Images: 20MB max (MAX_IMAGE_FILE_SIZE)
 * - PDFs: 100MB max (MAX_PDF_FILE_SIZE)
 * - Other files: 100MB single upload / 5GB multipart
 *
 * Test Scenarios:
 * 1. Basic file validation (empty, filename length, MIME type)
 * 2. Visual file size limits (images at 20MB, PDFs at 100MB)
 * 3. Non-visual file size limits (text/code at 100MB max)
 * 4. Multipart upload strategy selection
 * 5. File category detection
 *
 * Location: /src/hooks/utils/__tests__/use-file-validation.test.ts
 */

import { describe, expect, it } from 'vitest';

import {
  FileCategories,
  MAX_IMAGE_FILE_SIZE,
  MAX_PDF_FILE_SIZE,
  MAX_SINGLE_UPLOAD_SIZE,
  UploadStrategies,
} from '@/api/core/enums';
import { renderHook } from '@/lib/testing';

import { useFileValidation } from '../use-file-validation';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock File object with specified properties
 */
function createMockFile(
  name: string,
  size: number,
  type: string,
): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type });
}

// ============================================================================
// Visual File Size Validation Tests
// ============================================================================

describe('useFileValidation - Visual File Size Limits', () => {
  describe('pDF files', () => {
    it('should accept PDF under 100MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', 50 * 1024 * 1024, 'application/pdf'); // 50MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
      expect(validation.fileCategory).toBe(FileCategories.DOCUMENT);
    });

    it('should accept PDF exactly at 100MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', MAX_PDF_FILE_SIZE, 'application/pdf'); // 100MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject PDF over 100MB limit with specific error', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-document.pdf', 110 * 1024 * 1024, 'application/pdf'); // 110MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
      expect(validation.error?.message).toContain('PDF');
      expect(validation.error?.message).toContain('100 MB');
      expect(validation.error?.details?.maxSize).toBe(MAX_PDF_FILE_SIZE);
      expect(validation.error?.details?.actualSize).toBe(110 * 1024 * 1024);
    });

    it('should accept 50MB PDF (previously rejected at 4MB)', () => {
      const { result } = renderHook(() => useFileValidation());
      // Large PDFs are now supported via URL-based delivery
      const file = createMockFile('large-document.pdf', 50 * 1024 * 1024, 'application/pdf');

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  describe('image files', () => {
    const imageTypes = [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/avif',
      'image/heic',
      'image/heif',
      'image/bmp',
      'image/tiff',
    ];

    it.each(imageTypes)('should accept %s under 20MB limit', (mimeType) => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('image.ext', 15 * 1024 * 1024, mimeType); // 15MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.IMAGE);
    });

    it.each(imageTypes)('should reject %s over 20MB limit', (mimeType) => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-image.ext', 25 * 1024 * 1024, mimeType); // 25MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
      expect(validation.error?.message).toContain('Image');
      expect(validation.error?.message).toContain('20 MB');
    });
  });
});

// ============================================================================
// Non-Visual File Size Tests
// ============================================================================

describe('useFileValidation - Non-Visual File Size Limits', () => {
  describe('text files', () => {
    it('should accept text files up to 100MB', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large.txt', 50 * 1024 * 1024, 'text/plain'); // 50MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.TEXT);
    });

    it('should allow text files larger than image limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large.txt', 25 * 1024 * 1024, 'text/plain'); // 25MB (> 20MB image limit)

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });
  });

  describe('code files', () => {
    it('should accept code files over visual limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('app.js', 8 * 1024 * 1024, 'text/javascript'); // 8MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.CODE);
    });
  });

  describe('jSON files', () => {
    it('should accept JSON files over visual limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('data.json', 20 * 1024 * 1024, 'application/json'); // 20MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.TEXT);
    });
  });
});

// ============================================================================
// Basic Validation Tests
// ============================================================================

describe('useFileValidation - Basic Validation', () => {
  it('should reject empty files', () => {
    const { result } = renderHook(() => useFileValidation());
    const file = createMockFile('empty.txt', 0, 'text/plain');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('empty_file');
  });

  it('should reject files with names over 255 characters', () => {
    const { result } = renderHook(() => useFileValidation());
    const longName = `${'a'.repeat(256)}.txt`;
    const file = createMockFile(longName, 100, 'text/plain');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('filename_too_long');
  });

  it('should reject unsupported MIME types', () => {
    const { result } = renderHook(() => useFileValidation());
    const file = createMockFile('video.mp4', 1000, 'video/mp4');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('invalid_type');
    expect(validation.error?.message).toContain('video/mp4');
  });
});

// ============================================================================
// Upload Strategy Selection Tests
// ============================================================================

describe('useFileValidation - Upload Strategy', () => {
  it('should select single upload for files under 100MB', () => {
    const { result } = renderHook(() => useFileValidation());
    const file = createMockFile('small.txt', 50 * 1024 * 1024, 'text/plain'); // 50MB

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(true);
    expect(validation.uploadStrategy).toBe(UploadStrategies.SINGLE);
  });

  it('should select multipart upload for files over 100MB', () => {
    const { result } = renderHook(() => useFileValidation());
    const file = createMockFile('large.txt', 150 * 1024 * 1024, 'text/plain'); // 150MB

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(true);
    expect(validation.uploadStrategy).toBe(UploadStrategies.MULTIPART);
    expect(validation.partCount).toBeGreaterThan(0);
    expect(validation.partSize).toBeGreaterThan(0);
  });

  it('should NOT allow multipart for visual files (blocked by size limit first)', () => {
    const { result } = renderHook(() => useFileValidation());
    // Even if we tried to upload a 150MB PDF, it would fail at the 100MB visual limit first
    const file = createMockFile('huge.pdf', 150 * 1024 * 1024, 'application/pdf');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('visual_file_too_large');
  });
});

// ============================================================================
// Constants Exposure Tests
// ============================================================================

describe('useFileValidation - Constants', () => {
  it('should expose maxImageFileSize constant', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxImageFileSize).toBe(MAX_IMAGE_FILE_SIZE);
    expect(result.current.constants.maxImageFileSize).toBe(20 * 1024 * 1024);
  });

  it('should expose maxPdfFileSize constant', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxPdfFileSize).toBe(MAX_PDF_FILE_SIZE);
    expect(result.current.constants.maxPdfFileSize).toBe(100 * 1024 * 1024);
  });

  it('should expose maxSingleUploadSize constant', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxSingleUploadSize).toBe(MAX_SINGLE_UPLOAD_SIZE);
  });
});

// ============================================================================
// Multiple Files Validation Tests
// ============================================================================

describe('useFileValidation - Multiple Files', () => {
  it('should validate multiple files independently', () => {
    const { result } = renderHook(() => useFileValidation());

    const files = [
      createMockFile('small.pdf', 50 * 1024 * 1024, 'application/pdf'), // Valid - under 100MB
      createMockFile('large.pdf', 110 * 1024 * 1024, 'application/pdf'), // Invalid - over 100MB limit
      createMockFile('code.js', 50 * 1024 * 1024, 'text/javascript'), // Valid - text files have 100MB limit
    ];

    const results = result.current.validateFiles(files);

    expect(results.get(files[0])?.valid).toBe(true);
    expect(results.get(files[1])?.valid).toBe(false);
    expect(results.get(files[1])?.error?.code).toBe('visual_file_too_large');
    expect(results.get(files[2])?.valid).toBe(true);
  });
});
