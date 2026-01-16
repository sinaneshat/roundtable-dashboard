/**
 * File Validation Hook Tests
 *
 * Tests verify that file validation correctly enforces size limits
 * and type restrictions, particularly for visual files (images + PDFs)
 * that have stricter limits due to AI model processing requirements.
 *
 * CRITICAL: Visual files (images, PDFs) are converted to base64 for AI
 * model consumption, which requires significant memory. The 4MB limit
 * prevents Cloudflare Worker memory exhaustion (128MB limit).
 *
 * Test Scenarios:
 * 1. Basic file validation (empty, filename length, MIME type)
 * 2. Visual file size limits (images and PDFs at 4MB max)
 * 3. Non-visual file size limits (text/code at 100MB max)
 * 4. Multipart upload strategy selection
 * 5. File category detection
 *
 * Location: /src/hooks/utils/__tests__/use-file-validation.test.ts
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  FileCategories,
  MAX_SINGLE_UPLOAD_SIZE,
  MAX_VISUAL_FILE_SIZE,
  UploadStrategies,
} from '@/api/core/enums';

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
    it('should accept PDF under 4MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', 3 * 1024 * 1024, 'application/pdf'); // 3MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
      expect(validation.fileCategory).toBe(FileCategories.DOCUMENT);
    });

    it('should accept PDF exactly at 4MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', MAX_VISUAL_FILE_SIZE, 'application/pdf'); // 4MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject PDF over 4MB limit with specific error', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-document.pdf', 5 * 1024 * 1024, 'application/pdf'); // 5MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
      expect(validation.error?.message).toContain('PDF');
      expect(validation.error?.message).toContain('4 MB');
      expect(validation.error?.details?.maxSize).toBe(MAX_VISUAL_FILE_SIZE);
      expect(validation.error?.details?.actualSize).toBe(5 * 1024 * 1024);
    });

    it('should reject 5.8MB PDF (real-world screenshot capture)', () => {
      const { result } = renderHook(() => useFileValidation());
      // This matches the actual file size from the bug report
      const file = createMockFile('screencapture.pdf', 5.8 * 1024 * 1024, 'application/pdf');

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
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

    it.each(imageTypes)('should accept %s under 4MB limit', (mimeType) => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('image.ext', 2 * 1024 * 1024, mimeType); // 2MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.IMAGE);
    });

    it.each(imageTypes)('should reject %s over 4MB limit', (mimeType) => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-image.ext', 6 * 1024 * 1024, mimeType); // 6MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
      expect(validation.error?.message).toContain('Image');
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

    it('should allow text files larger than visual limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large.txt', 10 * 1024 * 1024, 'text/plain'); // 10MB (> 4MB visual limit)

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
    // Even if we tried to upload a 150MB PDF, it would fail at the 4MB visual limit first
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
  it('should expose maxVisualFileSize constant', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxVisualFileSize).toBe(MAX_VISUAL_FILE_SIZE);
    expect(result.current.constants.maxVisualFileSize).toBe(4 * 1024 * 1024);
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
      createMockFile('small.pdf', 2 * 1024 * 1024, 'application/pdf'), // Valid
      createMockFile('large.pdf', 6 * 1024 * 1024, 'application/pdf'), // Invalid - too large
      createMockFile('code.js', 10 * 1024 * 1024, 'text/javascript'), // Valid - text files have higher limit
    ];

    const results = result.current.validateFiles(files);

    expect(results.get(files[0])?.valid).toBe(true);
    expect(results.get(files[1])?.valid).toBe(false);
    expect(results.get(files[1])?.error?.code).toBe('visual_file_too_large');
    expect(results.get(files[2])?.valid).toBe(true);
  });
});
