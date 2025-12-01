/**
 * Storage Service Tests
 *
 * Tests for the storage abstraction layer that works with both:
 * - Cloudflare R2 (production)
 * - Local filesystem (development)
 */

import { Buffer } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteFile,
  fileExists,
  getFile,
  isLocalDevelopment,
  putFile,
} from '../storage.service';

// Create hoisted mocks for fs.promises - use Uint8Array to avoid Buffer hoisting issue
const mockFsPromises = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockImplementation(() => Promise.resolve(new Uint8Array([116, 101, 115, 116, 32, 99, 111, 110, 116, 101, 110, 116]))), // 'test content'
  unlink: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs module before importing the service
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      promises: mockFsPromises,
    },
    promises: mockFsPromises,
  };
});

describe('storage Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isLocalDevelopment', () => {
    it('returns true when R2 bucket is undefined', () => {
      expect(isLocalDevelopment(undefined)).toBe(true);
    });

    it('returns false when R2 bucket is defined', () => {
      const mockBucket = {} as R2Bucket;
      expect(isLocalDevelopment(mockBucket)).toBe(false);
    });
  });

  describe('putFile - local development', () => {
    it('stores file locally when R2 is unavailable', async () => {
      const result = await putFile(
        undefined, // No R2
        'test/file.txt',
        Buffer.from('test content'),
        { contentType: 'text/plain' },
      );

      expect(result.success).toBe(true);
      expect(result.key).toBe('test/file.txt');
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('stores file with ArrayBuffer', async () => {
      const arrayBuffer = new ArrayBuffer(10);
      const result = await putFile(
        undefined,
        'test/file.bin',
        arrayBuffer,
        { contentType: 'application/octet-stream' },
      );

      expect(result.success).toBe(true);
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('stores metadata in sidecar file', async () => {
      await putFile(
        undefined,
        'test/file.txt',
        Buffer.from('content'),
        {
          contentType: 'text/plain',
          customMetadata: { userId: 'user-123' },
        },
      );

      // Should write both the file and metadata
      expect(mockFsPromises.writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('putFile - R2 production', () => {
    it('uploads to R2 when bucket is available', async () => {
      const mockPut = vi.fn().mockResolvedValue({});
      const mockBucket = { put: mockPut } as unknown as R2Bucket;

      const result = await putFile(
        mockBucket,
        'test/file.txt',
        Buffer.from('test content'),
        {
          contentType: 'text/plain',
          customMetadata: { userId: 'user-123' },
        },
      );

      expect(result.success).toBe(true);
      expect(mockPut).toHaveBeenCalledWith(
        'test/file.txt',
        expect.any(Buffer),
        expect.objectContaining({
          httpMetadata: { contentType: 'text/plain' },
          customMetadata: { userId: 'user-123' },
        }),
      );
    });

    it('handles R2 upload errors', async () => {
      const mockPut = vi.fn().mockRejectedValue(new Error('R2 error'));
      const mockBucket = { put: mockPut } as unknown as R2Bucket;

      const result = await putFile(
        mockBucket,
        'test/file.txt',
        Buffer.from('test content'),
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('R2 error');
    });
  });

  describe('getFile - local development', () => {
    it('retrieves file from local filesystem', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(Buffer.from('file content'));

      const result = await getFile(undefined, 'test/file.txt');

      expect(result.data).toBeTruthy();
    });

    it('returns null for non-existent file', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await getFile(undefined, 'test/nonexistent.txt');

      expect(result.data).toBeNull();
    });
  });

  describe('getFile - R2 production', () => {
    it('retrieves file from R2', async () => {
      const mockArrayBuffer = new ArrayBuffer(10);
      const mockGet = vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: { userId: 'user-123' },
      });
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFile(mockBucket, 'test/file.txt');

      expect(result.data).toEqual(mockArrayBuffer);
      expect(result.metadata?.contentType).toBe('text/plain');
    });

    it('returns null when file not found in R2', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFile(mockBucket, 'test/nonexistent.txt');

      expect(result.data).toBeNull();
    });
  });

  describe('deleteFile - local development', () => {
    it('deletes file from local filesystem', async () => {
      const result = await deleteFile(undefined, 'test/file.txt');

      expect(result.success).toBe(true);
      expect(mockFsPromises.unlink).toHaveBeenCalled();
    });

    it('handles delete errors gracefully', async () => {
      mockFsPromises.unlink.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await deleteFile(undefined, 'test/nonexistent.txt');

      expect(result.success).toBe(false);
    });
  });

  describe('deleteFile - R2 production', () => {
    it('deletes file from R2', async () => {
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      const mockBucket = { delete: mockDelete } as unknown as R2Bucket;

      const result = await deleteFile(mockBucket, 'test/file.txt');

      expect(result.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('test/file.txt');
    });
  });

  describe('fileExists - local development', () => {
    it('returns true when file exists locally', async () => {
      const exists = await fileExists(undefined, 'test/file.txt');
      expect(exists).toBe(true);
    });

    it('returns false when file does not exist locally', async () => {
      mockFsPromises.access.mockRejectedValueOnce(new Error('ENOENT'));

      const exists = await fileExists(undefined, 'test/nonexistent.txt');
      expect(exists).toBe(false);
    });
  });

  describe('fileExists - R2 production', () => {
    it('returns true when file exists in R2', async () => {
      const mockHead = vi.fn().mockResolvedValue({ size: 100 });
      const mockBucket = { head: mockHead } as unknown as R2Bucket;

      const exists = await fileExists(mockBucket, 'test/file.txt');

      expect(exists).toBe(true);
      expect(mockHead).toHaveBeenCalledWith('test/file.txt');
    });

    it('returns false when file does not exist in R2', async () => {
      const mockHead = vi.fn().mockResolvedValue(null);
      const mockBucket = { head: mockHead } as unknown as R2Bucket;

      const exists = await fileExists(mockBucket, 'test/nonexistent.txt');

      expect(exists).toBe(false);
    });
  });
});
