/**
 * File Preview Utilities
 *
 * Generate previews for uploaded files (images, PDFs, etc.)
 * Handles client-side preview generation and cleanup
 *
 * Location: /src/hooks/utils/use-file-preview.ts
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import type { FilePreviewType } from '@/api/core/enums';
import {
  FilePreviewTypeSchema,
  getFileTypeLabelFromMime,
  MIME_TYPE_CATEGORIES,
} from '@/api/core/enums';

// ============================================================================
// ZOD SCHEMAS - Type-safe preview structures
// ============================================================================

/**
 * File preview schema
 */
export const FilePreviewSchema = z.object({
  id: z.string(),
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  type: FilePreviewTypeSchema,
  /** Object URL for images (needs cleanup) */
  url: z.string().optional(),
  /** Text content preview for text/code files */
  textPreview: z.string().optional(),
  /** Whether preview is loading */
  loading: z.boolean(),
  /** Preview generation error */
  error: z.string().optional(),
});

export const UseFilePreviewOptionsSchema = z.object({
  /** Max text preview length (default: 500 chars) */
  maxTextPreviewLength: z.number().optional(),
  /** Auto-generate previews when files are added */
  autoGenerate: z.boolean().optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type FilePreview = z.infer<typeof FilePreviewSchema>;
export type UseFilePreviewOptions = z.infer<typeof UseFilePreviewOptionsSchema>;

export type UseFilePreviewReturn = {
  /** Current file previews */
  previews: FilePreview[];
  /** Add files and generate previews */
  addFiles: (files: File[]) => void;
  /** Remove a preview by ID */
  removePreview: (id: string) => void;
  /** Clear all previews */
  clearPreviews: () => void;
  /** Regenerate preview for a file */
  regeneratePreview: (id: string) => void;
  /** Get preview by file */
  getPreviewByFile: (file: File) => FilePreview | undefined;
  /** Check if any previews are loading */
  isLoading: boolean;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique ID for preview
 */
function generatePreviewId(): string {
  return `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Determine preview type from MIME type
 */
function getPreviewType(mimeType: string): FilePreviewType {
  if ((MIME_TYPE_CATEGORIES.image as readonly string[]).includes(mimeType)) {
    return 'image';
  }
  if (mimeType === 'application/pdf') {
    return 'pdf';
  }
  if ((MIME_TYPE_CATEGORIES.text as readonly string[]).includes(mimeType)) {
    return 'text';
  }
  if ((MIME_TYPE_CATEGORIES.code as readonly string[]).includes(mimeType)) {
    return 'code';
  }
  if (MIME_TYPE_CATEGORIES.document.some(t => mimeType.includes(t))) {
    return 'document';
  }
  return 'unknown';
}

/**
 * Read text content from file
 */
async function readTextContent(file: File, maxLength: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // FileReader.result is string when readAsText() was called
      // Runtime check ensures type safety without forced cast
      const content = reader.result;
      if (typeof content !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      resolve(content.slice(0, maxLength));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file.slice(0, maxLength * 2)); // Read extra to handle multibyte chars
  });
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * File preview generation hook
 *
 * Manages file preview generation and cleanup for upload UI
 * Automatically cleans up object URLs on unmount
 *
 * @example
 * const { previews, addFiles, removePreview, clearPreviews } = useFilePreview();
 *
 * const handleFileSelect = (files: File[]) => {
 *   addFiles(files);
 * };
 *
 * return (
 *   <div>
 *     {previews.map(preview => (
 *       <FilePreviewCard
 *         key={preview.id}
 *         preview={preview}
 *         onRemove={() => removePreview(preview.id)}
 *       />
 *     ))}
 *   </div>
 * );
 */
export function useFilePreview(options: UseFilePreviewOptions = {}): UseFilePreviewReturn {
  const { maxTextPreviewLength = 500, autoGenerate = true } = options;

  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // Cleanup object URLs on unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urls.clear();
    };
  }, []);

  /**
   * Generate preview for a single file
   */
  const generatePreview = useCallback(
    async (file: File, _id: string): Promise<Partial<FilePreview>> => {
      const type = getPreviewType(file.type);

      try {
        switch (type) {
          case 'image': {
            const url = URL.createObjectURL(file);
            objectUrlsRef.current.add(url);
            return { url, loading: false };
          }
          case 'text':
          case 'code': {
            const textPreview = await readTextContent(file, maxTextPreviewLength);
            return { textPreview, loading: false };
          }
          case 'pdf':
          case 'document':
          default:
            // For PDFs and documents, just mark as loaded
            // Actual preview would need a PDF renderer
            return { loading: false };
        }
      } catch (error) {
        return {
          loading: false,
          error: error instanceof Error ? error.message : 'Preview generation failed',
        };
      }
    },
    [maxTextPreviewLength],
  );

  /**
   * Add files and generate previews
   */
  const addFiles = useCallback(
    (files: File[]) => {
      const newPreviews: FilePreview[] = files.map(file => ({
        id: generatePreviewId(),
        file,
        type: getPreviewType(file.type),
        loading: autoGenerate,
      }));

      setPreviews(prev => [...prev, ...newPreviews]);

      if (autoGenerate) {
        // Generate previews asynchronously
        newPreviews.forEach(async (preview) => {
          const generated = await generatePreview(preview.file, preview.id);
          setPreviews((prev) => {
            const idx = prev.findIndex(p => p.id === preview.id);
            if (idx === -1)
              return prev;
            const updated = [...prev];
            const existing = updated[idx]!;
            updated[idx] = {
              id: existing.id,
              file: existing.file,
              type: existing.type,
              loading: generated.loading ?? existing.loading,
              url: generated.url ?? existing.url,
              textPreview: generated.textPreview ?? existing.textPreview,
              error: generated.error ?? existing.error,
            };
            return updated;
          });
        });
      }
    },
    [autoGenerate, generatePreview],
  );

  /**
   * Remove a preview by ID
   */
  const removePreview = useCallback((id: string) => {
    setPreviews((prev) => {
      const preview = prev.find(p => p.id === id);
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
        objectUrlsRef.current.delete(preview.url);
      }
      return prev.filter(p => p.id !== id);
    });
  }, []);

  /**
   * Clear all previews
   */
  const clearPreviews = useCallback(() => {
    setPreviews((prev) => {
      prev.forEach((preview) => {
        if (preview.url) {
          URL.revokeObjectURL(preview.url);
          objectUrlsRef.current.delete(preview.url);
        }
      });
      return [];
    });
  }, []);

  /**
   * Regenerate preview for a file
   */
  const regeneratePreview = useCallback(
    async (id: string) => {
      setPreviews((prev) => {
        const idx = prev.findIndex(p => p.id === id);
        if (idx === -1)
          return prev;
        const updated = [...prev];
        const existing = updated[idx]!;
        updated[idx] = {
          id: existing.id,
          file: existing.file,
          type: existing.type,
          loading: true,
          url: existing.url,
          textPreview: existing.textPreview,
          error: undefined,
        };
        return updated;
      });

      const preview = previews.find(p => p.id === id);
      if (!preview)
        return;

      const generated = await generatePreview(preview.file, id);
      setPreviews((prev) => {
        const idx = prev.findIndex(p => p.id === id);
        if (idx === -1)
          return prev;
        const updated = [...prev];
        const existing = updated[idx]!;
        updated[idx] = {
          id: existing.id,
          file: existing.file,
          type: existing.type,
          loading: generated.loading ?? existing.loading,
          url: generated.url ?? existing.url,
          textPreview: generated.textPreview ?? existing.textPreview,
          error: generated.error ?? existing.error,
        };
        return updated;
      });
    },
    [generatePreview, previews],
  );

  /**
   * Get preview by file reference
   */
  const getPreviewByFile = useCallback(
    (file: File): FilePreview | undefined => {
      return previews.find(p => p.file === file);
    },
    [previews],
  );

  const isLoading = previews.some(p => p.loading);

  return {
    previews,
    addFiles,
    removePreview,
    clearPreviews,
    regeneratePreview,
    getPreviewByFile,
    isLoading,
  };
}

// ============================================================================
// STANDALONE UTILITY FUNCTIONS
// ============================================================================

/**
 * Get file icon name based on MIME type
 * For use with lucide-react or similar icon libraries
 */
export function getFileIconName(mimeType: string): string {
  const type = getPreviewType(mimeType);
  switch (type) {
    case 'image':
      return 'image';
    case 'pdf':
      return 'file-text';
    case 'text':
      return 'file-text';
    case 'code':
      return 'file-code';
    case 'document':
      return 'file';
    default:
      return 'file';
  }
}

/**
 * Get human-readable file type label
 * Delegates to single source of truth in @/api/core/enums
 */
export function getFileTypeLabel(mimeType: string): string {
  return getFileTypeLabelFromMime(mimeType);
}

/**
 * Check if file type supports inline preview
 */
export function supportsInlinePreview(mimeType: string): boolean {
  const type = getPreviewType(mimeType);
  return type === 'image' || type === 'text' || type === 'code';
}
