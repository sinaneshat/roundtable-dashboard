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
  copyFile,
  deleteFile,
  fileExists,
  getFile,
  getFileStream,
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

  // ==========================================================================
  // getFileStream Tests - Official Cloudflare R2 Streaming Pattern
  // ==========================================================================

  describe('getFileStream - local development', () => {
    it('returns streaming result with body for existing file', async () => {
      mockFsPromises.readFile.mockResolvedValueOnce(Buffer.from('file content'));

      const result = await getFileStream(undefined, 'test/file.txt');

      expect(result.found).toBe(true);
      expect(result.body).toBeTruthy();
      expect(result.size).toBeGreaterThan(0);
      expect(result.preconditionsMet).toBe(true);
    });

    it('returns not found for non-existent file', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await getFileStream(undefined, 'test/nonexistent.txt');

      expect(result.found).toBe(false);
      expect(result.body).toBeNull();
    });

    it('provides writeHttpMetadata callback that sets content-type', async () => {
      mockFsPromises.readFile
        .mockResolvedValueOnce(Buffer.from('content'))
        .mockResolvedValueOnce(JSON.stringify({ contentType: 'text/plain' }));

      const result = await getFileStream(undefined, 'test/file.txt');
      const headers = new Headers();
      result.writeHttpMetadata(headers);

      expect(headers.get('content-type')).toBe('text/plain');
    });

    it('generates ETag from file size', async () => {
      const content = Buffer.from('test content');
      mockFsPromises.readFile.mockResolvedValueOnce(content);

      const result = await getFileStream(undefined, 'test/file.txt');

      expect(result.httpEtag).toBeTruthy();
      expect(result.httpEtag).toMatch(/^"[0-9a-f]+"$/);
    });
  });

  describe('getFileStream - R2 production', () => {
    it('returns streaming result following official R2 pattern', async () => {
      const mockBody = new ReadableStream();
      const mockWriteHttpMetadata = vi.fn((headers: Headers) => {
        headers.set('content-type', 'application/pdf');
      });

      const mockGet = vi.fn().mockResolvedValue({
        body: mockBody,
        writeHttpMetadata: mockWriteHttpMetadata,
        httpEtag: '"abc123"',
        size: 1024,
        customMetadata: { userId: 'user-123' },
      });
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFileStream(mockBucket, 'test/file.pdf');

      expect(result.found).toBe(true);
      expect(result.body).toBe(mockBody);
      expect(result.httpEtag).toBe('"abc123"');
      expect(result.size).toBe(1024);
      expect(result.customMetadata?.userId).toBe('user-123');
      expect(result.preconditionsMet).toBe(true);
    });

    it('returns not found when object does not exist in R2', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFileStream(mockBucket, 'test/nonexistent.txt');

      expect(result.found).toBe(false);
      expect(result.body).toBeNull();
    });

    it('passes conditional request options (onlyIf)', async () => {
      const mockGet = vi.fn().mockResolvedValue({
        body: new ReadableStream(),
        writeHttpMetadata: vi.fn(),
        httpEtag: '"abc123"',
        size: 100,
      });
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const requestHeaders = new Headers({ 'if-none-match': '"abc123"' });
      await getFileStream(mockBucket, 'test/file.txt', { onlyIf: requestHeaders });

      expect(mockGet).toHaveBeenCalledWith('test/file.txt', {
        onlyIf: requestHeaders,
        range: undefined,
      });
    });

    it('handles precondition failed (body is null but object exists)', async () => {
      // R2 returns object without body when preconditions fail (304 scenario)
      const mockGet = vi.fn().mockResolvedValue({
        // No body property or body is null
        writeHttpMetadata: vi.fn(),
        httpEtag: '"abc123"',
        size: 100,
      });
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFileStream(mockBucket, 'test/file.txt');

      expect(result.found).toBe(true);
      expect(result.body).toBeNull();
      expect(result.preconditionsMet).toBe(false);
    });

    it('writeHttpMetadata callback invokes R2 object method', async () => {
      const mockWriteHttpMetadata = vi.fn();
      const mockGet = vi.fn().mockResolvedValue({
        body: new ReadableStream(),
        writeHttpMetadata: mockWriteHttpMetadata,
        httpEtag: '"test"',
        size: 50,
      });
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await getFileStream(mockBucket, 'test/file.txt');
      const headers = new Headers();
      result.writeHttpMetadata(headers);

      expect(mockWriteHttpMetadata).toHaveBeenCalledWith(headers);
    });
  });

  // ==========================================================================
  // copyFile Tests
  // ==========================================================================

  describe('copyFile - local development', () => {
    it('copies file successfully', async () => {
      // getFile internally calls readFile twice: once for file content, once for metadata
      mockFsPromises.readFile
        .mockResolvedValueOnce(Buffer.from('file content')) // File content
        .mockRejectedValueOnce(new Error('ENOENT')); // No metadata file (expected)

      const result = await copyFile(undefined, 'source/file.txt', 'dest/file.txt');

      expect(result.success).toBe(true);
      expect(result.key).toBe('dest/file.txt');
      // Should read source and write to destination
      expect(mockFsPromises.readFile).toHaveBeenCalled();
      expect(mockFsPromises.writeFile).toHaveBeenCalled();
    });

    it('returns error when source file not found', async () => {
      mockFsPromises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await copyFile(undefined, 'nonexistent.txt', 'dest.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Source file not found');
    });
  });

  describe('copyFile - R2 production', () => {
    it('copies file in R2 by read and write', async () => {
      const mockArrayBuffer = new ArrayBuffer(10);
      const mockGet = vi.fn().mockResolvedValue({
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
        httpMetadata: { contentType: 'text/plain' },
      });
      const mockPut = vi.fn().mockResolvedValue({});
      const mockBucket = { get: mockGet, put: mockPut } as unknown as R2Bucket;

      const result = await copyFile(mockBucket, 'source/file.txt', 'dest/file.txt');

      expect(result.success).toBe(true);
      expect(result.key).toBe('dest/file.txt');
      expect(mockGet).toHaveBeenCalledWith('source/file.txt');
      expect(mockPut).toHaveBeenCalledWith(
        'dest/file.txt',
        mockArrayBuffer,
        expect.any(Object),
      );
    });

    it('returns error when source not found in R2', async () => {
      const mockGet = vi.fn().mockResolvedValue(null);
      const mockBucket = { get: mockGet } as unknown as R2Bucket;

      const result = await copyFile(mockBucket, 'nonexistent.txt', 'dest.txt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Source file not found');
    });
  });
});
