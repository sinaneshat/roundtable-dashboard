/**
 * File Capability Filtering Logic Unit Tests
 *
 * Tests the file capability utilities that determine model compatibility
 * with different file types (images, PDFs, documents).
 *
 * Key Behaviors Tested:
 * 1. MIME type classification (images vs documents)
 * 2. File array capability detection (hasImages, hasDocuments)
 * 3. Model compatibility checking (vision vs file support)
 * 4. Incompatibility reason detection (NO_VISION vs NO_FILE_SUPPORT)
 * 5. Detailed incompatibility tracking (vision vs file separately)
 * 6. Thread-level file detection (images vs documents in messages)
 *
 * Related Files:
 * - src/lib/utils/file-capability.ts - Implementation under test
 * - src/api/core/enums/file-types.ts - MIME type definitions and enums
 */

import { describe, expect, it } from 'vitest';

import { IncompatibilityReasons } from '@/api/core/enums';
import type {
  FileForCapabilityCheck,
  ModelFileCapabilities,
} from '@/lib/utils/file-capability';
import {
  filesHaveDocuments,
  filesHaveImages,
  getDetailedIncompatibleModelIds,
  getIncompatibilityReason,
  getIncompatibleModelIds,
  isDocumentFile,
  isImageFile,
  isModelCompatibleWithFiles,
  threadHasDocumentFiles,
  threadHasImageFiles,
} from '@/lib/utils/file-capability';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create mock file for capability testing
 */
function createMockFile(mimeType: string): FileForCapabilityCheck {
  return { mimeType };
}

/**
 * Create mock model with capabilities
 */
function createMockModel(
  id: string,
  vision: boolean,
  file: boolean,
): { id: string; capabilities: ModelFileCapabilities } {
  return {
    id,
    capabilities: { vision, file },
  };
}

/**
 * Create mock message with file parts
 */
function createMockMessage(mediaTyes: string[]): { parts?: unknown[] } {
  return {
    parts: mediaTyes.map(mediaType => ({
      type: 'file',
      mediaType,
    })),
  };
}

// ============================================================================
// MIME TYPE CLASSIFICATION
// ============================================================================

describe('isImageFile', () => {
  it('should identify PNG as image', () => {
    expect(isImageFile('image/png')).toBe(true);
  });

  it('should identify JPEG as image', () => {
    expect(isImageFile('image/jpeg')).toBe(true);
  });

  it('should identify WebP as image', () => {
    expect(isImageFile('image/webp')).toBe(true);
  });

  it('should identify GIF as image', () => {
    expect(isImageFile('image/gif')).toBe(true);
  });

  it('should identify SVG as image', () => {
    expect(isImageFile('image/svg+xml')).toBe(true);
  });

  it('should identify AVIF as image', () => {
    expect(isImageFile('image/avif')).toBe(true);
  });

  it('should identify HEIC as image', () => {
    expect(isImageFile('image/heic')).toBe(true);
  });

  it('should identify HEIF as image', () => {
    expect(isImageFile('image/heif')).toBe(true);
  });

  it('should identify BMP as image', () => {
    expect(isImageFile('image/bmp')).toBe(true);
  });

  it('should identify TIFF as image', () => {
    expect(isImageFile('image/tiff')).toBe(true);
  });

  it('should not identify PDF as image', () => {
    expect(isImageFile('application/pdf')).toBe(false);
  });

  it('should not identify text file as image', () => {
    expect(isImageFile('text/plain')).toBe(false);
  });

  it('should not identify unknown MIME type as image', () => {
    expect(isImageFile('application/unknown')).toBe(false);
  });
});

describe('isDocumentFile', () => {
  it('should identify PDF as document', () => {
    expect(isDocumentFile('application/pdf')).toBe(true);
  });

  it('should identify Word DOC as document', () => {
    expect(isDocumentFile('application/msword')).toBe(true);
  });

  it('should identify Word DOCX as document', () => {
    expect(
      isDocumentFile(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe(true);
  });

  it('should identify Excel XLS as document', () => {
    expect(isDocumentFile('application/vnd.ms-excel')).toBe(true);
  });

  it('should identify Excel XLSX as document', () => {
    expect(
      isDocumentFile(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBe(true);
  });

  it('should identify PowerPoint PPT as document', () => {
    expect(isDocumentFile('application/vnd.ms-powerpoint')).toBe(true);
  });

  it('should identify PowerPoint PPTX as document', () => {
    expect(
      isDocumentFile(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ),
    ).toBe(true);
  });

  it('should not identify image as document', () => {
    expect(isDocumentFile('image/png')).toBe(false);
  });

  it('should not identify text file as document', () => {
    expect(isDocumentFile('text/plain')).toBe(false);
  });

  it('should not identify unknown MIME type as document', () => {
    expect(isDocumentFile('application/unknown')).toBe(false);
  });
});

// ============================================================================
// FILE ARRAY CAPABILITY DETECTION
// ============================================================================

describe('filesHaveImages', () => {
  it('should return true when files contain images', () => {
    const files = [createMockFile('image/png'), createMockFile('image/jpeg')];
    expect(filesHaveImages(files)).toBe(true);
  });

  it('should return true when files contain mixed image and document', () => {
    const files = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];
    expect(filesHaveImages(files)).toBe(true);
  });

  it('should return false when files contain only documents', () => {
    const files = [createMockFile('application/pdf')];
    expect(filesHaveImages(files)).toBe(false);
  });

  it('should return false when files contain only text', () => {
    const files = [createMockFile('text/plain')];
    expect(filesHaveImages(files)).toBe(false);
  });

  it('should return false for empty file array', () => {
    expect(filesHaveImages([])).toBe(false);
  });

  it('should detect single image in array of non-images', () => {
    const files = [
      createMockFile('text/plain'),
      createMockFile('application/pdf'),
      createMockFile('image/webp'),
    ];
    expect(filesHaveImages(files)).toBe(true);
  });
});

describe('filesHaveDocuments', () => {
  it('should return true when files contain PDF', () => {
    const files = [createMockFile('application/pdf')];
    expect(filesHaveDocuments(files)).toBe(true);
  });

  it('should return true when files contain Word document', () => {
    const files = [createMockFile('application/msword')];
    expect(filesHaveDocuments(files)).toBe(true);
  });

  it('should return true when files contain mixed document and image', () => {
    const files = [
      createMockFile('application/pdf'),
      createMockFile('image/png'),
    ];
    expect(filesHaveDocuments(files)).toBe(true);
  });

  it('should return false when files contain only images', () => {
    const files = [createMockFile('image/png'), createMockFile('image/jpeg')];
    expect(filesHaveDocuments(files)).toBe(false);
  });

  it('should return false when files contain only text', () => {
    const files = [createMockFile('text/plain')];
    expect(filesHaveDocuments(files)).toBe(false);
  });

  it('should return false for empty file array', () => {
    expect(filesHaveDocuments([])).toBe(false);
  });

  it('should detect single document in array of non-documents', () => {
    const files = [
      createMockFile('text/plain'),
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];
    expect(filesHaveDocuments(files)).toBe(true);
  });
});

// ============================================================================
// MODEL COMPATIBILITY CHECKING
// ============================================================================

describe('isModelCompatibleWithFiles', () => {
  describe('empty files array', () => {
    it('should be compatible with model that has no vision and no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(isModelCompatibleWithFiles(capabilities, [])).toBe(true);
    });

    it('should be compatible with model that has vision but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(isModelCompatibleWithFiles(capabilities, [])).toBe(true);
    });

    it('should be compatible with model that has both vision and file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(isModelCompatibleWithFiles(capabilities, [])).toBe(true);
    });
  });

  describe('image files only', () => {
    const imageFiles = [
      createMockFile('image/png'),
      createMockFile('image/jpeg'),
    ];

    it('should be incompatible with model without vision support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(isModelCompatibleWithFiles(capabilities, imageFiles)).toBe(false);
    });

    it('should be compatible with model with vision support but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(isModelCompatibleWithFiles(capabilities, imageFiles)).toBe(true);
    });

    it('should be compatible with model with both vision and file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(isModelCompatibleWithFiles(capabilities, imageFiles)).toBe(true);
    });
  });

  describe('document files only', () => {
    const documentFiles = [createMockFile('application/pdf')];

    it('should be incompatible with model without file support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(isModelCompatibleWithFiles(capabilities, documentFiles)).toBe(
        false,
      );
    });

    it('should be incompatible with model with vision but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(isModelCompatibleWithFiles(capabilities, documentFiles)).toBe(
        false,
      );
    });

    it('should be compatible with model with both vision and file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(isModelCompatibleWithFiles(capabilities, documentFiles)).toBe(
        true,
      );
    });
  });

  describe('mixed images and documents', () => {
    const mixedFiles = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];

    it('should be incompatible with model without vision or file support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(isModelCompatibleWithFiles(capabilities, mixedFiles)).toBe(false);
    });

    it('should be incompatible with model with vision but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(isModelCompatibleWithFiles(capabilities, mixedFiles)).toBe(false);
    });

    it('should be incompatible with model with file support but no vision', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: true };
      expect(isModelCompatibleWithFiles(capabilities, mixedFiles)).toBe(false);
    });

    it('should be compatible with model with both vision and file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(isModelCompatibleWithFiles(capabilities, mixedFiles)).toBe(true);
    });
  });

  describe('text files (non-visual, non-document)', () => {
    const textFiles = [createMockFile('text/plain')];

    it('should be compatible with model without vision or file support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(isModelCompatibleWithFiles(capabilities, textFiles)).toBe(true);
    });

    it('should be compatible with any model capabilities', () => {
      const capabilities1: ModelFileCapabilities = { vision: true, file: false };
      const capabilities2: ModelFileCapabilities = { vision: false, file: true };
      const capabilities3: ModelFileCapabilities = { vision: true, file: true };

      expect(isModelCompatibleWithFiles(capabilities1, textFiles)).toBe(true);
      expect(isModelCompatibleWithFiles(capabilities2, textFiles)).toBe(true);
      expect(isModelCompatibleWithFiles(capabilities3, textFiles)).toBe(true);
    });
  });
});

// ============================================================================
// INCOMPATIBILITY REASON DETECTION
// ============================================================================

describe('getIncompatibilityReason', () => {
  describe('empty files array', () => {
    it('should return null for model with no capabilities', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(getIncompatibilityReason(capabilities, [])).toBeNull();
    });

    it('should return null for model with all capabilities', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(getIncompatibilityReason(capabilities, [])).toBeNull();
    });
  });

  describe('image files only', () => {
    const imageFiles = [
      createMockFile('image/png'),
      createMockFile('image/jpeg'),
    ];

    it('should return NO_VISION for model without vision support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(getIncompatibilityReason(capabilities, imageFiles)).toBe(
        IncompatibilityReasons.NO_VISION,
      );
    });

    it('should return null for model with vision support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(getIncompatibilityReason(capabilities, imageFiles)).toBeNull();
    });
  });

  describe('document files only', () => {
    const documentFiles = [createMockFile('application/pdf')];

    it('should return NO_FILE_SUPPORT for model without file support', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(getIncompatibilityReason(capabilities, documentFiles)).toBe(
        IncompatibilityReasons.NO_FILE_SUPPORT,
      );
    });

    it('should return NO_FILE_SUPPORT for model with vision but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(getIncompatibilityReason(capabilities, documentFiles)).toBe(
        IncompatibilityReasons.NO_FILE_SUPPORT,
      );
    });

    it('should return null for model with file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(getIncompatibilityReason(capabilities, documentFiles)).toBeNull();
    });
  });

  describe('mixed images and documents', () => {
    const mixedFiles = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];

    it('should return NO_VISION for model without vision (prioritizes vision check)', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(getIncompatibilityReason(capabilities, mixedFiles)).toBe(
        IncompatibilityReasons.NO_VISION,
      );
    });

    it('should return NO_FILE_SUPPORT for model with vision but no file support', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: false };
      expect(getIncompatibilityReason(capabilities, mixedFiles)).toBe(
        IncompatibilityReasons.NO_FILE_SUPPORT,
      );
    });

    it('should return NO_VISION for model with file support but no vision', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: true };
      expect(getIncompatibilityReason(capabilities, mixedFiles)).toBe(
        IncompatibilityReasons.NO_VISION,
      );
    });

    it('should return null for model with both capabilities', () => {
      const capabilities: ModelFileCapabilities = { vision: true, file: true };
      expect(getIncompatibilityReason(capabilities, mixedFiles)).toBeNull();
    });
  });

  describe('text files (non-visual, non-document)', () => {
    const textFiles = [createMockFile('text/plain')];

    it('should return null for model without any capabilities', () => {
      const capabilities: ModelFileCapabilities = { vision: false, file: false };
      expect(getIncompatibilityReason(capabilities, textFiles)).toBeNull();
    });

    it('should return null for model with any capabilities', () => {
      const capabilities1: ModelFileCapabilities = { vision: true, file: false };
      const capabilities2: ModelFileCapabilities = { vision: false, file: true };
      const capabilities3: ModelFileCapabilities = { vision: true, file: true };

      expect(getIncompatibilityReason(capabilities1, textFiles)).toBeNull();
      expect(getIncompatibilityReason(capabilities2, textFiles)).toBeNull();
      expect(getIncompatibilityReason(capabilities3, textFiles)).toBeNull();
    });
  });
});

// ============================================================================
// BASIC INCOMPATIBLE MODEL IDS
// ============================================================================

describe('getIncompatibleModelIds', () => {
  const models = [
    createMockModel('gpt-4o-mini', true, false), // vision only
    createMockModel('gpt-5-nano', true, true), // vision + file
    createMockModel('deepseek-chat', false, false), // no capabilities
    createMockModel('text-model', false, false), // no capabilities
  ];

  it('should return empty set for empty files array', () => {
    const result = getIncompatibleModelIds(models, []);
    expect(result.size).toBe(0);
  });

  it('should identify models incompatible with image files', () => {
    const imageFiles = [createMockFile('image/png')];
    const result = getIncompatibleModelIds(models, imageFiles);

    expect(result.has('gpt-4o-mini')).toBe(false); // has vision
    expect(result.has('gpt-5-nano')).toBe(false); // has vision
    expect(result.has('deepseek-chat')).toBe(true); // no vision
    expect(result.has('text-model')).toBe(true); // no vision
  });

  it('should identify models incompatible with document files', () => {
    const documentFiles = [createMockFile('application/pdf')];
    const result = getIncompatibleModelIds(models, documentFiles);

    expect(result.has('gpt-4o-mini')).toBe(true); // no file support
    expect(result.has('gpt-5-nano')).toBe(false); // has file support
    expect(result.has('deepseek-chat')).toBe(true); // no file support
    expect(result.has('text-model')).toBe(true); // no file support
  });

  it('should identify models incompatible with mixed files', () => {
    const mixedFiles = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];
    const result = getIncompatibleModelIds(models, mixedFiles);

    expect(result.has('gpt-4o-mini')).toBe(true); // no file support
    expect(result.has('gpt-5-nano')).toBe(false); // has both
    expect(result.has('deepseek-chat')).toBe(true); // no capabilities
    expect(result.has('text-model')).toBe(true); // no capabilities
  });

  it('should return empty set for text files', () => {
    const textFiles = [createMockFile('text/plain')];
    const result = getIncompatibleModelIds(models, textFiles);

    expect(result.size).toBe(0); // all models support text
  });
});

// ============================================================================
// DETAILED INCOMPATIBLE MODEL IDS
// ============================================================================

describe('getDetailedIncompatibleModelIds', () => {
  const models = [
    createMockModel('gpt-4o-mini', true, false), // vision only
    createMockModel('gpt-5-nano', true, true), // vision + file
    createMockModel('deepseek-chat', false, false), // no capabilities
    createMockModel('claude-vision', true, false), // vision only
  ];

  it('should return empty sets for empty files array', () => {
    const result = getDetailedIncompatibleModelIds(models, []);

    expect(result.incompatibleIds.size).toBe(0);
    expect(result.visionIncompatibleIds.size).toBe(0);
    expect(result.fileIncompatibleIds.size).toBe(0);
  });

  it('should track vision incompatibility for image files', () => {
    const imageFiles = [createMockFile('image/png')];
    const result = getDetailedIncompatibleModelIds(models, imageFiles);

    // deepseek-chat lacks vision
    expect(result.incompatibleIds.has('deepseek-chat')).toBe(true);
    expect(result.visionIncompatibleIds.has('deepseek-chat')).toBe(true);
    expect(result.fileIncompatibleIds.has('deepseek-chat')).toBe(false);

    // models with vision are compatible
    expect(result.incompatibleIds.has('gpt-4o-mini')).toBe(false);
    expect(result.incompatibleIds.has('gpt-5-nano')).toBe(false);
    expect(result.incompatibleIds.has('claude-vision')).toBe(false);
  });

  it('should track file incompatibility for document files', () => {
    const documentFiles = [createMockFile('application/pdf')];
    const result = getDetailedIncompatibleModelIds(models, documentFiles);

    // gpt-4o-mini has vision but lacks file support
    expect(result.incompatibleIds.has('gpt-4o-mini')).toBe(true);
    expect(result.visionIncompatibleIds.has('gpt-4o-mini')).toBe(false);
    expect(result.fileIncompatibleIds.has('gpt-4o-mini')).toBe(true);

    // claude-vision has vision but lacks file support
    expect(result.incompatibleIds.has('claude-vision')).toBe(true);
    expect(result.visionIncompatibleIds.has('claude-vision')).toBe(false);
    expect(result.fileIncompatibleIds.has('claude-vision')).toBe(true);

    // deepseek-chat lacks both
    expect(result.incompatibleIds.has('deepseek-chat')).toBe(true);
    expect(result.visionIncompatibleIds.has('deepseek-chat')).toBe(false);
    expect(result.fileIncompatibleIds.has('deepseek-chat')).toBe(true);

    // gpt-5-nano has file support
    expect(result.incompatibleIds.has('gpt-5-nano')).toBe(false);
  });

  it('should track both incompatibilities for mixed files', () => {
    const mixedFiles = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];
    const result = getDetailedIncompatibleModelIds(models, mixedFiles);

    // gpt-4o-mini: has vision, lacks file support
    expect(result.incompatibleIds.has('gpt-4o-mini')).toBe(true);
    expect(result.visionIncompatibleIds.has('gpt-4o-mini')).toBe(false);
    expect(result.fileIncompatibleIds.has('gpt-4o-mini')).toBe(true);

    // deepseek-chat: lacks vision AND file support
    expect(result.incompatibleIds.has('deepseek-chat')).toBe(true);
    expect(result.visionIncompatibleIds.has('deepseek-chat')).toBe(true);
    expect(result.fileIncompatibleIds.has('deepseek-chat')).toBe(true);

    // gpt-5-nano: has both capabilities
    expect(result.incompatibleIds.has('gpt-5-nano')).toBe(false);
    expect(result.visionIncompatibleIds.has('gpt-5-nano')).toBe(false);
    expect(result.fileIncompatibleIds.has('gpt-5-nano')).toBe(false);
  });

  it('should return empty sets for text files', () => {
    const textFiles = [createMockFile('text/plain')];
    const result = getDetailedIncompatibleModelIds(models, textFiles);

    expect(result.incompatibleIds.size).toBe(0);
    expect(result.visionIncompatibleIds.size).toBe(0);
    expect(result.fileIncompatibleIds.size).toBe(0);
  });

  it('should not duplicate model IDs in incompatibleIds set', () => {
    const mixedFiles = [
      createMockFile('image/png'),
      createMockFile('application/pdf'),
    ];
    const result = getDetailedIncompatibleModelIds(models, mixedFiles);

    // deepseek-chat should only appear once in incompatibleIds
    // even though it fails both vision and file checks
    const incompatibleArray = Array.from(result.incompatibleIds);
    const deepseekCount = incompatibleArray.filter(id => id === 'deepseek-chat').length;
    expect(deepseekCount).toBe(1);
  });
});

// ============================================================================
// THREAD-LEVEL FILE DETECTION
// ============================================================================

describe('threadHasImageFiles', () => {
  it('should return false for empty messages array', () => {
    expect(threadHasImageFiles([])).toBe(false);
  });

  it('should return false for messages without parts', () => {
    const messages = [{ id: '1' }, { id: '2' }];
    expect(threadHasImageFiles(messages)).toBe(false);
  });

  it('should detect image in single message', () => {
    const messages = [createMockMessage(['image/png'])];
    expect(threadHasImageFiles(messages)).toBe(true);
  });

  it('should detect image in multiple messages', () => {
    const messages = [
      createMockMessage(['text/plain']),
      createMockMessage(['image/jpeg']),
    ];
    expect(threadHasImageFiles(messages)).toBe(true);
  });

  it('should return false when only documents present', () => {
    const messages = [createMockMessage(['application/pdf'])];
    expect(threadHasImageFiles(messages)).toBe(false);
  });

  it('should return true when mixed image and document files', () => {
    const messages = [
      createMockMessage(['image/png', 'application/pdf']),
    ];
    expect(threadHasImageFiles(messages)).toBe(true);
  });

  it('should handle messages with empty parts array', () => {
    const messages = [{ parts: [] }];
    expect(threadHasImageFiles(messages)).toBe(false);
  });

  it('should handle parts without file type', () => {
    const messages = [
      {
        parts: [
          { type: 'text', content: 'Hello' },
          { type: 'file', mediaType: 'image/png' },
        ],
      },
    ];
    expect(threadHasImageFiles(messages)).toBe(true);
  });

  it('should ignore parts without mediaType', () => {
    const messages = [
      {
        parts: [
          { type: 'file' }, // missing mediaType
          { type: 'text', content: 'Hello' },
        ],
      },
    ];
    expect(threadHasImageFiles(messages)).toBe(false);
  });
});

describe('threadHasDocumentFiles', () => {
  it('should return false for empty messages array', () => {
    expect(threadHasDocumentFiles([])).toBe(false);
  });

  it('should return false for messages without parts', () => {
    const messages = [{ id: '1' }, { id: '2' }];
    expect(threadHasDocumentFiles(messages)).toBe(false);
  });

  it('should detect PDF in single message', () => {
    const messages = [createMockMessage(['application/pdf'])];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });

  it('should detect Word document in multiple messages', () => {
    const messages = [
      createMockMessage(['text/plain']),
      createMockMessage(['application/msword']),
    ];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });

  it('should return false when only images present', () => {
    const messages = [createMockMessage(['image/png', 'image/jpeg'])];
    expect(threadHasDocumentFiles(messages)).toBe(false);
  });

  it('should return true when mixed image and document files', () => {
    const messages = [
      createMockMessage(['image/png', 'application/pdf']),
    ];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });

  it('should handle messages with empty parts array', () => {
    const messages = [{ parts: [] }];
    expect(threadHasDocumentFiles(messages)).toBe(false);
  });

  it('should handle parts without file type', () => {
    const messages = [
      {
        parts: [
          { type: 'text', content: 'Hello' },
          { type: 'file', mediaType: 'application/pdf' },
        ],
      },
    ];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });

  it('should ignore parts without mediaType', () => {
    const messages = [
      {
        parts: [
          { type: 'file' }, // missing mediaType
          { type: 'text', content: 'Hello' },
        ],
      },
    ];
    expect(threadHasDocumentFiles(messages)).toBe(false);
  });

  it('should detect Excel document', () => {
    const messages = [
      createMockMessage([
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ]),
    ];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });

  it('should detect PowerPoint document', () => {
    const messages = [
      createMockMessage([
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ]),
    ];
    expect(threadHasDocumentFiles(messages)).toBe(true);
  });
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('edge cases', () => {
  describe('model capabilities with undefined file support', () => {
    it('should treat undefined file support as false', () => {
      const capabilities: ModelFileCapabilities = { vision: true };
      const documentFiles = [createMockFile('application/pdf')];

      expect(isModelCompatibleWithFiles(capabilities, documentFiles)).toBe(
        false,
      );
      expect(getIncompatibilityReason(capabilities, documentFiles)).toBe(
        IncompatibilityReasons.NO_FILE_SUPPORT,
      );
    });
  });

  describe('multiple files of same type', () => {
    it('should handle multiple images correctly', () => {
      const files = [
        createMockFile('image/png'),
        createMockFile('image/jpeg'),
        createMockFile('image/webp'),
      ];
      expect(filesHaveImages(files)).toBe(true);
      expect(filesHaveDocuments(files)).toBe(false);
    });

    it('should handle multiple documents correctly', () => {
      const files = [
        createMockFile('application/pdf'),
        createMockFile('application/msword'),
        createMockFile(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ];
      expect(filesHaveImages(files)).toBe(false);
      expect(filesHaveDocuments(files)).toBe(true);
    });
  });

  describe('thread messages with nested parts', () => {
    it('should handle complex message structures', () => {
      const messages = [
        {
          parts: [
            { type: 'text', content: 'Hello' },
            { type: 'file', mediaType: 'image/png' },
            { type: 'text', content: 'World' },
          ],
        },
        {
          parts: [
            { type: 'file', mediaType: 'application/pdf' },
          ],
        },
      ];

      expect(threadHasImageFiles(messages)).toBe(true);
      expect(threadHasDocumentFiles(messages)).toBe(true);
    });
  });
});
