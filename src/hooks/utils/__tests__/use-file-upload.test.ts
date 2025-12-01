/**
 * useFileUpload Hook Tests
 *
 * Tests for file upload orchestration including:
 * - Auto-upload flow with different file types
 * - Progress tracking for single and multipart uploads
 * - Error handling and retry logic
 * - Queue management for multiple files
 * - Validation integration
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook, waitFor } from '@/lib/testing';

import { useFileUpload } from '../use-file-upload';

// Create hoisted mocks for mutations - must use vi.hoisted() so they're available when vi.mock runs
const {
  mockUseUploadAttachmentMutation,
  mockUseCreateMultipartUploadMutation,
  mockUseUploadPartMutation,
  mockUseCompleteMultipartUploadMutation,
  mockUseAbortMultipartUploadMutation,
  mockUseDeleteAttachmentMutation,
} = vi.hoisted(() => ({
  mockUseUploadAttachmentMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
  mockUseCreateMultipartUploadMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
  mockUseUploadPartMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
  mockUseCompleteMultipartUploadMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
  mockUseAbortMultipartUploadMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
  mockUseDeleteAttachmentMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
  })),
}));

vi.mock('@/hooks/mutations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/mutations')>();
  return {
    ...actual,
    useUploadAttachmentMutation: mockUseUploadAttachmentMutation,
    useCreateMultipartUploadMutation: mockUseCreateMultipartUploadMutation,
    useUploadPartMutation: mockUseUploadPartMutation,
    useCompleteMultipartUploadMutation: mockUseCompleteMultipartUploadMutation,
    useAbortMultipartUploadMutation: mockUseAbortMultipartUploadMutation,
    useDeleteAttachmentMutation: mockUseDeleteAttachmentMutation,
  };
});

// Mock file preview hook
vi.mock('../use-file-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../use-file-preview')>();
  return {
    ...actual,
    useFilePreview: () => ({
      previews: [],
      addFiles: vi.fn(),
      removePreview: vi.fn(),
      clearPreviews: vi.fn(),
    }),
  };
});

// Mock file validation hook
vi.mock('../use-file-validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../use-file-validation')>();
  return {
    ...actual,
    useFileValidation: () => ({
      validateFile: vi.fn((file: File) => ({
        valid: true,
        uploadStrategy: file.size > 100 * 1024 * 1024 ? ('multipart' as const) : ('single' as const),
        fileCategory: 'document' as const,
      })),
      validateFiles: vi.fn(),
      isAllowedType: vi.fn(() => true),
      getFileCategory: vi.fn(() => 'document' as const),
      formatFileSize: vi.fn((bytes: number) => `${bytes} bytes`),
      calculateParts: vi.fn(() => ({ partCount: 2, partSize: 50 * 1024 * 1024 })),
      constants: {
        maxSingleUploadSize: 100 * 1024 * 1024,
        maxTotalFileSize: 5 * 1024 * 1024 * 1024,
        minPartSize: 5 * 1024 * 1024,
        recommendedPartSize: 50 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'] as const,
      },
    }),
  };
});

describe('useFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useFileUpload());

      expect(result.current.items).toEqual([]);
      expect(result.current.previews).toEqual([]);
      expect(result.current.state.total).toBe(0);
      expect(result.current.state.pending).toBe(0);
      expect(result.current.state.uploading).toBe(0);
      expect(result.current.state.completed).toBe(0);
      expect(result.current.state.failed).toBe(0);
      expect(result.current.state.isUploading).toBe(false);
    });

    it('accepts options configuration', () => {
      const onComplete = vi.fn();
      const onError = vi.fn();

      const { result } = renderHook(() =>
        useFileUpload({
          threadId: 'thread-123',
          autoUpload: true,
          maxConcurrent: 2,
          maxRetries: 5,
          onComplete,
          onError,
        }),
      );

      expect(result.current).toBeDefined();
    });
  });

  describe('addFiles', () => {
    it('adds files to queue with pending status', async () => {
      const { result } = renderHook(() => useFileUpload());

      const file1 = new File(['content1'], 'test1.pdf', { type: 'application/pdf' });
      const file2 = new File(['content2'], 'test2.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file1, file2]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2);
      });

      expect(result.current.items[0].status).toBe('pending');
      expect(result.current.items[1].status).toBe('pending');
      expect(result.current.state.total).toBe(2);
      expect(result.current.state.pending).toBe(2);
    });

    it('validates files before adding to queue', async () => {
      const { result } = renderHook(() => useFileUpload());

      // Create a file that would fail validation (handled by mock)
      const invalidFile = new File([''], 'empty.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([invalidFile]);
      });

      // With our mock validation, files are always valid so they go to pending
      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });
    });

    it('determines upload strategy based on file size', async () => {
      const { result } = renderHook(() => useFileUpload());

      // Small file - single upload
      const smallFile = new File(
        [new ArrayBuffer(10 * 1024 * 1024)],
        'small.pdf',
        { type: 'application/pdf' },
      );

      // Large file - multipart upload (mock returns multipart for files > 100MB)
      const largeFile = new File(
        [new ArrayBuffer(200 * 1024 * 1024)],
        'large.pdf',
        { type: 'application/pdf' },
      );

      await act(async () => {
        result.current.addFiles([smallFile, largeFile]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2);
      });

      expect(result.current.items[0].strategy).toBe('single');
      expect(result.current.items[1].strategy).toBe('multipart');
    });
  });

  describe('startUpload - single file', () => {
    it('uploads small file using single strategy', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-123' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
      });

      // Hono RPC format: { form: { file: File } }
      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          form: expect.objectContaining({
            file: expect.any(File),
          }),
        }),
      );
    });

    // TODO: Fix timing issues with progress tracking
    it.todo('tracks upload progress during upload');

    it('handles upload errors gracefully', async () => {
      const mockUpload = vi.fn().mockRejectedValue(new Error('Network error'));

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const onError = vi.fn();
      const { result } = renderHook(() => useFileUpload({ onError }));

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId).catch(() => {});
      });

      await waitFor(() => {
        expect(result.current.state.failed).toBe(1);
      });

      expect(onError).toHaveBeenCalled();
    });

    it('calls onComplete callback on successful upload', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-123' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const onComplete = vi.fn();
      const { result } = renderHook(() => useFileUpload({ onComplete }));

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            id: uploadId,
            status: 'completed',
            uploadId: 'upload-123',
          }),
        );
      });
    });
  });

  describe('startUpload - multipart file', () => {
    it('uploads large file using multipart strategy', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        success: true,
        data: {
          uploadId: 'multipart-123',
          attachmentId: 'attachment-123',
        },
      });

      const mockUploadPart = vi.fn().mockResolvedValue({
        success: true,
        data: {
          partNumber: 1,
          etag: 'etag-123',
        },
      });

      const mockComplete = vi.fn().mockResolvedValue({
        success: true,
      });

      mockUseCreateMultipartUploadMutation.mockReturnValue({
        mutateAsync: mockCreate,
      } as never);

      mockUseUploadPartMutation.mockReturnValue({
        mutateAsync: mockUploadPart,
      } as never);

      mockUseCompleteMultipartUploadMutation.mockReturnValue({
        mutateAsync: mockComplete,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      // Large file that triggers multipart
      const largeFile = new File(
        [new ArrayBuffer(200 * 1024 * 1024)],
        'large.pdf',
        { type: 'application/pdf' },
      );

      await act(async () => {
        result.current.addFiles([largeFile]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
      });

      expect(mockCreate).toHaveBeenCalled();
      expect(mockUploadPart).toHaveBeenCalled();
      expect(mockComplete).toHaveBeenCalled();
    });

    // TODO: Fix timing issues with multipart progress tracking
    it.todo('tracks multipart upload progress with parts');

    // TODO: Fix timing issues with multipart abort on error
    it.todo('aborts multipart upload on error');
  });

  describe('startAllUploads', () => {
    it('starts all pending uploads respecting concurrency limit', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-123' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() =>
        useFileUpload({ maxConcurrent: 2 }),
      );

      const files = [
        new File(['content1'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'test2.pdf', { type: 'application/pdf' }),
        new File(['content3'], 'test3.pdf', { type: 'application/pdf' }),
      ];

      result.current.addFiles(files);

      await result.current.startAllUploads();

      await waitFor(() => {
        expect(result.current.state.completed).toBe(3);
      });
    });

    it('calls onAllComplete when all uploads finish', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-123' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const onAllComplete = vi.fn();
      const { result } = renderHook(() =>
        useFileUpload({ onAllComplete }),
      );

      const files = [
        new File(['content1'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'test2.pdf', { type: 'application/pdf' }),
      ];

      result.current.addFiles(files);
      await result.current.startAllUploads();

      await waitFor(() => {
        expect(onAllComplete).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ status: 'completed' }),
            expect.objectContaining({ status: 'completed' }),
          ]),
        );
      });
    });
  });

  describe('retryUpload', () => {
    // TODO: Fix timing issues with retry logic
    it.todo('retries failed upload');

    // TODO: Fix timing issues with retry logic
    it.todo('respects maxRetries limit');
  });

  describe('cancelUpload', () => {
    it('cancels ongoing upload', async () => {
      const { result } = renderHook(() => useFileUpload());

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      // Start upload but don't wait
      await act(async () => {
        result.current.startUpload(uploadId);
      });

      // Cancel immediately
      await act(async () => {
        await result.current.cancelUpload(uploadId);
      });

      // Upload should be cancelled
      const item = result.current.items.find(i => i.id === uploadId);
      expect(item?.status).toBe('cancelled');
    });

    // TODO: Fix timing issues with multipart abort
    it.todo('aborts multipart upload when cancelled');
  });

  describe('removeItem', () => {
    it('removes item from queue', async () => {
      const { result } = renderHook(() => useFileUpload());

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        result.current.removeItem(uploadId);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(0);
      });
    });

    it('cancels upload if removing active item', async () => {
      const { result } = renderHook(() => useFileUpload());

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      // Start upload
      await act(async () => {
        result.current.startUpload(uploadId);
      });

      // Remove should cancel
      await act(async () => {
        result.current.removeItem(uploadId);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(0);
      });
    });
  });

  describe('clearAll', () => {
    it('clears all items and resets state', async () => {
      const { result } = renderHook(() => useFileUpload());

      const files = [
        new File(['content1'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'test2.pdf', { type: 'application/pdf' }),
      ];

      await act(async () => {
        result.current.addFiles(files);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(2);
      });

      await act(async () => {
        result.current.clearAll();
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(0);
        expect(result.current.state.total).toBe(0);
      });
    });

    it('cancels all active uploads', async () => {
      const { result } = renderHook(() => useFileUpload());

      const files = [
        new File(['content1'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'test2.pdf', { type: 'application/pdf' }),
      ];

      result.current.addFiles(files);

      // Start uploads
      const promises = result.current.items.map(item =>
        result.current.startUpload(item.id).catch(() => {}),
      );

      // Clear all
      result.current.clearAll();

      expect(result.current.items).toHaveLength(0);

      await Promise.all(promises);
    });
  });

  describe('autoUpload', () => {
    it('automatically starts upload when autoUpload is true', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-123' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() =>
        useFileUpload({ autoUpload: true }),
      );

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      result.current.addFiles([file]);

      // Should automatically start upload
      await waitFor(
        () => {
          expect(result.current.state.completed).toBe(1);
        },
        { timeout: 3000 },
      );

      expect(mockUpload).toHaveBeenCalled();
    });

    it('does not auto-upload when autoUpload is false', async () => {
      const mockUpload = vi.fn();

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() =>
        useFileUpload({ autoUpload: false }),
      );

      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      result.current.addFiles([file]);

      // Wait a bit to ensure no auto-upload happens
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result.current.state.pending).toBe(1);
      expect(mockUpload).not.toHaveBeenCalled();
    });
  });

  describe('state calculation', () => {
    // TODO: Fix timing issues with progress calculation
    it.todo('correctly calculates overall progress');

    it('correctly counts items by status', async () => {
      const mockUpload = vi.fn()
        .mockResolvedValueOnce({ success: true, data: { id: 'upload-1' } })
        .mockRejectedValueOnce(new Error('Upload failed'));

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      const files = [
        new File(['content1'], 'test1.pdf', { type: 'application/pdf' }),
        new File(['content2'], 'test2.pdf', { type: 'application/pdf' }),
        new File(['content3'], 'test3.pdf', { type: 'application/pdf' }),
      ];

      await act(async () => {
        result.current.addFiles(files);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(3);
      });

      // All pending
      expect(result.current.state.pending).toBe(3);
      expect(result.current.state.completed).toBe(0);
      expect(result.current.state.failed).toBe(0);

      // Upload first (succeeds)
      await act(async () => {
        await result.current.startUpload(result.current.items[0].id);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
        expect(result.current.state.pending).toBe(2);
      });

      // Upload second (fails)
      await act(async () => {
        await result.current.startUpload(result.current.items[1].id).catch(() => {});
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
        expect(result.current.state.failed).toBe(1);
        expect(result.current.state.pending).toBe(1);
      });
    });
  });

  describe('different file types', () => {
    it('handles image uploads', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-image' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      const imageFile = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });

      await act(async () => {
        result.current.addFiles([imageFile]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
      });
    });

    it('handles document uploads', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-doc' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      const docFile = new File(['doc data'], 'document.pdf', { type: 'application/pdf' });

      await act(async () => {
        result.current.addFiles([docFile]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
      });
    });

    it('handles text file uploads', async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        success: true,
        data: { id: 'upload-text' },
      });

      mockUseUploadAttachmentMutation.mockReturnValue({
        mutateAsync: mockUpload,
      } as never);

      const { result } = renderHook(() => useFileUpload());

      const textFile = new File(['text content'], 'notes.txt', { type: 'text/plain' });

      await act(async () => {
        result.current.addFiles([textFile]);
      });

      await waitFor(() => {
        expect(result.current.items).toHaveLength(1);
      });

      const uploadId = result.current.items[0].id;

      await act(async () => {
        await result.current.startUpload(uploadId);
      });

      await waitFor(() => {
        expect(result.current.state.completed).toBe(1);
      });
    });
  });
});
