/**
 * File Validation Hook Tests
 *
 * Tests verify that file validation correctly enforces size limits
 * and type restrictions matching ChatGPT's limits (2026).
 *
 * SIZE LIMITS (enum-based, centralized):
 * - Images: 20MB max (MAX_IMAGE_FILE_SIZE)
 * - PDFs: 512MB max (MAX_PDF_FILE_SIZE)
 * - Spreadsheets: 50MB max (MAX_SPREADSHEET_FILE_SIZE)
 * - General: 512MB single upload / 5GB multipart
 *
 * Test Scenarios:
 * 1. Basic file validation (empty, filename length, MIME type)
 * 2. Type-specific size limits (images, PDFs, spreadsheets)
 * 3. General file size limits (text/code at 512MB max)
 * 4. Multipart upload strategy selection
 * 5. File category detection
 *
 * Location: /src/hooks/utils/__tests__/use-file-validation.test.ts
 */

import {
  FileCategories,
  MAX_IMAGE_FILE_SIZE,
  MAX_PDF_FILE_SIZE,
  MAX_SINGLE_UPLOAD_SIZE,
  MAX_SPREADSHEET_FILE_SIZE,
  UploadStrategies,
} from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

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
    it('should accept PDF under 512MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', 100 * 1024 * 1024, 'application/pdf'); // 100MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
      expect(validation.fileCategory).toBe(FileCategories.DOCUMENT);
    });

    it('should accept PDF exactly at 512MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('document.pdf', MAX_PDF_FILE_SIZE, 'application/pdf'); // 512MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject PDF over 512MB limit with specific error', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-document.pdf', 600 * 1024 * 1024, 'application/pdf'); // 600MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('visual_file_too_large');
      expect(validation.error?.message).toContain('PDF');
      expect(validation.error?.message).toContain('512 MB');
      expect(validation.error?.details?.maxSize).toBe(MAX_PDF_FILE_SIZE);
      expect(validation.error?.details?.actualSize).toBe(600 * 1024 * 1024);
    });

    it('should accept 200MB PDF (matches ChatGPT limits)', () => {
      const { result } = renderHook(() => useFileValidation());
      // Large PDFs are now supported via URL-based delivery matching ChatGPT
      const file = createMockFile('large-document.pdf', 200 * 1024 * 1024, 'application/pdf');

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
    it('should accept text files up to 512MB', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large.txt', 200 * 1024 * 1024, 'text/plain'); // 200MB

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
      const file = createMockFile('app.js', 50 * 1024 * 1024, 'text/javascript'); // 50MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.CODE);
    });
  });

  describe('jSON files', () => {
    it('should accept JSON files over visual limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('data.json', 50 * 1024 * 1024, 'application/json'); // 50MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
      expect(validation.fileCategory).toBe(FileCategories.TEXT);
    });
  });
});

// ============================================================================
// Spreadsheet File Size Tests (ChatGPT: 50MB limit)
// ============================================================================

describe('useFileValidation - Spreadsheet File Size Limits', () => {
  describe('cSV files', () => {
    it('should accept CSV under 50MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('data.csv', 30 * 1024 * 1024, 'text/csv'); // 30MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
    });

    it('should accept CSV exactly at 50MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('data.csv', MAX_SPREADSHEET_FILE_SIZE, 'text/csv'); // 50MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
    });

    it('should reject CSV over 50MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large-data.csv', 60 * 1024 * 1024, 'text/csv'); // 60MB

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.code).toBe('file_too_large');
      expect(validation.error?.message).toContain('Spreadsheet');
      expect(validation.error?.details?.maxSize).toBe(MAX_SPREADSHEET_FILE_SIZE);
    });
  });

  describe('excel files', () => {
    it('should accept XLSX under 50MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('data.xlsx', 40 * 1024 * 1024, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(true);
    });

    it('should reject XLSX over 50MB limit', () => {
      const { result } = renderHook(() => useFileValidation());
      const file = createMockFile('large.xlsx', 60 * 1024 * 1024, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      const validation = result.current.validateFile(file);

      expect(validation.valid).toBe(false);
      expect(validation.error?.message).toContain('Spreadsheet');
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
  it('should select single upload for files under 512MB', () => {
    const { result } = renderHook(() => useFileValidation());
    const file = createMockFile('small.txt', 200 * 1024 * 1024, 'text/plain'); // 200MB

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(true);
    expect(validation.uploadStrategy).toBe(UploadStrategies.SINGLE);
  });

  it('should reject files over type-specific limit before multipart logic', () => {
    const { result } = renderHook(() => useFileValidation());
    // 600MB text file exceeds the 512MB general type limit
    // Multipart never triggers because type check fails first
    const file = createMockFile('huge-data.txt', 600 * 1024 * 1024, 'text/plain');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('file_too_large');
    expect(validation.error?.message).toContain('512 MB');
  });

  it('should accept file at exactly the type limit (512MB)', () => {
    const { result } = renderHook(() => useFileValidation());
    // Exactly at the 512MB limit for general files
    const file = createMockFile('max-data.txt', 512 * 1024 * 1024, 'text/plain');

    const validation = result.current.validateFile(file);

    // At exactly the limit, file is valid and uses single upload
    expect(validation.valid).toBe(true);
    expect(validation.uploadStrategy).toBe(UploadStrategies.SINGLE);
  });

  it('should NOT allow multipart for visual files (blocked by size limit first)', () => {
    const { result } = renderHook(() => useFileValidation());
    // Even if we tried to upload a 600MB PDF, it would fail at the 512MB limit first
    const file = createMockFile('huge.pdf', 600 * 1024 * 1024, 'application/pdf');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('visual_file_too_large');
  });

  it('should reject oversized images even if under general limit', () => {
    const { result } = renderHook(() => useFileValidation());
    // 25MB image should fail because images have 20MB limit, not the 512MB general limit
    const file = createMockFile('huge.png', 25 * 1024 * 1024, 'image/png');

    const validation = result.current.validateFile(file);

    expect(validation.valid).toBe(false);
    expect(validation.error?.code).toBe('visual_file_too_large');
    expect(validation.error?.message).toContain('Image');
  });
});

// ============================================================================
// Constants Exposure Tests
// ============================================================================

describe('useFileValidation - Constants', () => {
  it('should expose maxImageFileSize constant (20MB)', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxImageFileSize).toBe(MAX_IMAGE_FILE_SIZE);
    expect(result.current.constants.maxImageFileSize).toBe(20 * 1024 * 1024);
  });

  it('should expose maxPdfFileSize constant (512MB)', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxPdfFileSize).toBe(MAX_PDF_FILE_SIZE);
    expect(result.current.constants.maxPdfFileSize).toBe(512 * 1024 * 1024);
  });

  it('should expose maxSpreadsheetFileSize constant (50MB)', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxSpreadsheetFileSize).toBe(MAX_SPREADSHEET_FILE_SIZE);
    expect(result.current.constants.maxSpreadsheetFileSize).toBe(50 * 1024 * 1024);
  });

  it('should expose maxSingleUploadSize constant (512MB)', () => {
    const { result } = renderHook(() => useFileValidation());

    expect(result.current.constants.maxSingleUploadSize).toBe(MAX_SINGLE_UPLOAD_SIZE);
    expect(result.current.constants.maxSingleUploadSize).toBe(512 * 1024 * 1024);
  });
});

// ============================================================================
// Multiple Files Validation Tests
// ============================================================================

describe('useFileValidation - Multiple Files', () => {
  it('should validate multiple files independently', () => {
    const { result } = renderHook(() => useFileValidation());

    const files = [
      createMockFile('small.pdf', 200 * 1024 * 1024, 'application/pdf'), // Valid - under 512MB
      createMockFile('large.pdf', 600 * 1024 * 1024, 'application/pdf'), // Invalid - over 512MB limit
      createMockFile('code.js', 200 * 1024 * 1024, 'text/javascript'), // Valid - text files have 512MB limit
      createMockFile('huge-image.png', 25 * 1024 * 1024, 'image/png'), // Invalid - over 20MB image limit
      createMockFile('large-csv.csv', 60 * 1024 * 1024, 'text/csv'), // Invalid - over 50MB spreadsheet limit
    ];

    const results = result.current.validateFiles(files);

    expect(results.get(files[0])?.valid).toBe(true);
    expect(results.get(files[1])?.valid).toBe(false);
    expect(results.get(files[1])?.error?.code).toBe('visual_file_too_large');
    expect(results.get(files[2])?.valid).toBe(true);
    expect(results.get(files[3])?.valid).toBe(false);
    expect(results.get(files[3])?.error?.code).toBe('visual_file_too_large');
    expect(results.get(files[4])?.valid).toBe(false);
    expect(results.get(files[4])?.error?.code).toBe('file_too_large');
  });
});
