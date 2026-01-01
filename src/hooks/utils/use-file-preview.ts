'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import {
  FILE_TYPE_TO_ICON,
  FilePreviewTypes,
  FilePreviewTypeSchema,
  getFileTypeLabelFromMime,
  getPreviewTypeFromMime,
} from '@/api/core/enums';

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

export const FilePreviewSchema = z.object({
  id: z.string(),
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  type: FilePreviewTypeSchema,
  url: z.string().optional(),
  textPreview: z.string().optional(),
  loading: z.boolean(),
  error: z.string().optional(),
});

export const UseFilePreviewOptionsSchema = z.object({
  maxTextPreviewLength: z.number().optional(),
  autoGenerate: z.boolean().optional(),
});

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type FilePreview = z.infer<typeof FilePreviewSchema>;
export type UseFilePreviewOptions = z.infer<typeof UseFilePreviewOptionsSchema>;

export type UseFilePreviewReturn = {
  previews: FilePreview[];
  addFiles: (files: File[]) => void;
  removePreview: (id: string) => void;
  clearPreviews: () => void;
  regeneratePreview: (id: string) => void;
  getPreviewByFile: (file: File) => FilePreview | undefined;
  isLoading: boolean;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generatePreviewId(): string {
  return `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function readTextContent(file: File, maxLength: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      if (typeof content !== 'string') {
        reject(new Error('FileReader did not return a string'));
        return;
      }
      resolve(content.slice(0, maxLength));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file.slice(0, maxLength * 2));
  });
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useFilePreview(options: UseFilePreviewOptions = {}): UseFilePreviewReturn {
  const { maxTextPreviewLength = 500, autoGenerate = true } = options;

  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const objectUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      urls.clear();
    };
  }, []);

  const generatePreview = useCallback(
    async (file: File, _id: string): Promise<Partial<FilePreview>> => {
      const type = getPreviewTypeFromMime(file.type);

      try {
        switch (type) {
          case FilePreviewTypes.IMAGE: {
            const url = URL.createObjectURL(file);
            objectUrlsRef.current.add(url);
            return { url, loading: false };
          }
          case FilePreviewTypes.TEXT:
          case FilePreviewTypes.CODE: {
            const textPreview = await readTextContent(file, maxTextPreviewLength);
            return { textPreview, loading: false };
          }
          case FilePreviewTypes.PDF:
          case FilePreviewTypes.DOCUMENT:
          default:
            return { loading: false };
        }
      } catch (error) {
        console.error('[File Preview] Preview generation failed:', error);
        return {
          loading: false,
          error: error instanceof Error ? error.message : 'Preview generation failed',
        };
      }
    },
    [maxTextPreviewLength],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const newPreviews: FilePreview[] = files.map(file => ({
        id: generatePreviewId(),
        file,
        type: getPreviewTypeFromMime(file.type),
        loading: autoGenerate,
      }));

      setPreviews(prev => [...prev, ...newPreviews]);

      if (autoGenerate) {
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

  const getPreviewByFile = useCallback(
    (file: File): FilePreview | undefined => {
      return previews.find(p => p.file === file);
    },
    [previews],
  );

  const isLoading = useMemo(() => previews.some(p => p.loading), [previews]);

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

export function getFileIconName(mimeType: string): string {
  const type = getPreviewTypeFromMime(mimeType);
  return FILE_TYPE_TO_ICON[type];
}

export function getFileTypeLabel(mimeType: string): string {
  return getFileTypeLabelFromMime(mimeType);
}

export function supportsInlinePreview(mimeType: string): boolean {
  const type = getPreviewTypeFromMime(mimeType);
  return type === FilePreviewTypes.IMAGE || type === FilePreviewTypes.TEXT || type === FilePreviewTypes.CODE;
}
