/**
 * Signed URL Service Tests
 *
 * Tests for secure, time-limited URL generation and validation.
 * Verifies HMAC-SHA256 signatures, expiration handling, and access control.
 */

import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '@/api/types';

import {
  generateSignedDownloadPath,
  generateSignedDownloadUrl,
  getUrlRemainingValidity,
  hasSignatureParams,
  validateSignedUrl,
} from '../signed-url.service';

// ==========================================================================
// Test Utilities
// ==========================================================================

/**
 * Create a mock Hono context for testing
 */
function createMockContext(options: {
  url?: string;
  query?: Record<string, string>;
  secret?: string;
}): Context<ApiEnv> {
  const { url = 'https://app.example.com/api/v1/uploads/test-id/download', query = {}, secret = 'test-secret-key-32-chars-minimum!' } = options;

  return {
    req: {
      url,
      query: (key: string) => query[key],
      raw: {
        headers: new Headers(),
      },
    },
    env: {
      BETTER_AUTH_SECRET: secret,
    },
  } as unknown as Context<ApiEnv>;
}

/**
 * Extract query params from URL
 */
function extractQueryParams(url: string): Record<string, string> {
  const urlObj = new URL(url);
  const params: Record<string, string> = {};
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// ==========================================================================
// Tests
// ==========================================================================

describe('signed URL Service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateSignedDownloadUrl', () => {
    it('generates URL with all required parameters', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });

      const params = extractQueryParams(url);
      expect(url).toContain('/api/v1/uploads/upload-123/download');
      expect(params.exp).toBeTruthy();
      expect(params.uid).toBe('user-456');
      expect(params.sig).toBeTruthy();
    });

    it('includes thread ID when provided', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        threadId: 'thread-789',
      });

      const params = extractQueryParams(url);
      expect(params.tid).toBe('thread-789');
    });

    it('uses default expiration of 1 hour', async () => {
      const c = createMockContext({});
      const now = Date.now();

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });

      const params = extractQueryParams(url);
      const exp = Number.parseInt(params.exp, 10);
      // Default is 1 hour (3600000ms)
      expect(exp).toBe(now + 60 * 60 * 1000);
    });

    it('respects custom expiration within limits', async () => {
      const c = createMockContext({});
      const now = Date.now();
      const customExpiration = 30 * 60 * 1000; // 30 minutes

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        expirationMs: customExpiration,
      });

      const params = extractQueryParams(url);
      const exp = Number.parseInt(params.exp, 10);
      expect(exp).toBe(now + customExpiration);
    });

    it('clamps expiration to maximum (24 hours)', async () => {
      const c = createMockContext({});
      const now = Date.now();
      const excessiveExpiration = 48 * 60 * 60 * 1000; // 48 hours

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        expirationMs: excessiveExpiration,
      });

      const params = extractQueryParams(url);
      const exp = Number.parseInt(params.exp, 10);
      // Should be clamped to 24 hours max
      expect(exp).toBe(now + 24 * 60 * 60 * 1000);
    });

    it('clamps expiration to minimum (5 minutes)', async () => {
      const c = createMockContext({});
      const now = Date.now();
      const tooShortExpiration = 1 * 60 * 1000; // 1 minute

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        expirationMs: tooShortExpiration,
      });

      const params = extractQueryParams(url);
      const exp = Number.parseInt(params.exp, 10);
      // Should be clamped to 5 minutes min
      expect(exp).toBe(now + 5 * 60 * 1000);
    });

    it('uses "public" as userId for public access', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        isPublic: true,
      });

      const params = extractQueryParams(url);
      expect(params.uid).toBe('public');
    });

    it('throws error when secret is not configured', async () => {
      const c = createMockContext({ secret: '' });

      await expect(
        generateSignedDownloadUrl(c, {
          uploadId: 'upload-123',
          userId: 'user-456',
        }),
      ).rejects.toThrow('BETTER_AUTH_SECRET not configured');
    });

    it('uRL-encodes upload ID with special characters', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload/with/slashes',
        userId: 'user-456',
      });

      expect(url).toContain('upload%2Fwith%2Fslashes');
    });
  });

  describe('generateSignedDownloadPath', () => {
    it('returns path without origin', async () => {
      const c = createMockContext({});

      const path = await generateSignedDownloadPath(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });

      expect(path).toMatch(/^\/api\/v1\/uploads\/upload-123\/download\?/);
      expect(path).not.toContain('https://');
    });
  });

  describe('validateSignedUrl', () => {
    it('validates correct signature successfully', async () => {
      const c = createMockContext({});

      // Generate a URL first
      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        threadId: 'thread-789',
      });

      // Extract params and create validation context
      const params = extractQueryParams(url);
      const validateContext = createMockContext({
        query: params,
      });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: true,
        uploadId: 'upload-123',
        userId: 'user-456',
        threadId: 'thread-789',
        isPublic: false,
      });
    });

    it('validates public access URL', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        isPublic: true,
      });

      const params = extractQueryParams(url);
      const validateContext = createMockContext({ query: params });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: true,
        isPublic: true,
        userId: 'public',
      });
    });

    it('rejects expired URL', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
        expirationMs: 5 * 60 * 1000, // 5 minutes (minimum)
      });

      const params = extractQueryParams(url);
      const validateContext = createMockContext({ query: params });

      // Advance time past expiration
      vi.advanceTimersByTime(6 * 60 * 1000); // 6 minutes

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'URL has expired',
      });
    });

    it('rejects tampered signature', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });

      const params = extractQueryParams(url);
      // Tamper with signature
      params.sig = 'tampered-signature';

      const validateContext = createMockContext({ query: params });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid signature',
      });
    });

    it('rejects mismatched upload ID', async () => {
      const c = createMockContext({});

      const url = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });

      const params = extractQueryParams(url);
      const validateContext = createMockContext({ query: params });

      // Validate with different upload ID
      const result = await validateSignedUrl(validateContext, 'different-upload');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid signature',
      });
    });

    it('rejects missing signature parameters', async () => {
      const validateContext = createMockContext({
        query: { exp: '1234567890' }, // Missing uid and sig
      });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Missing signature parameters',
      });
    });

    it('rejects invalid expiration format', async () => {
      const validateContext = createMockContext({
        query: {
          exp: 'not-a-number',
          uid: 'user-456',
          sig: 'some-signature',
        },
      });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid expiration format',
      });
    });

    it('returns error when secret not configured', async () => {
      const validateContext = createMockContext({
        query: {
          exp: '1234567890',
          uid: 'user-456',
          sig: 'some-signature',
        },
        secret: '',
      });

      const result = await validateSignedUrl(validateContext, 'upload-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Server configuration error',
      });
    });
  });

  describe('hasSignatureParams', () => {
    it('returns true when all signature params present', () => {
      const c = createMockContext({
        query: {
          sig: 'some-signature',
          exp: '1234567890',
          uid: 'user-456',
        },
      });

      expect(hasSignatureParams(c)).toBe(true);
    });

    it('returns false when sig is missing', () => {
      const c = createMockContext({
        query: {
          exp: '1234567890',
          uid: 'user-456',
        },
      });

      expect(hasSignatureParams(c)).toBe(false);
    });

    it('returns false when exp is missing', () => {
      const c = createMockContext({
        query: {
          sig: 'some-signature',
          uid: 'user-456',
        },
      });

      expect(hasSignatureParams(c)).toBe(false);
    });

    it('returns false when uid is missing', () => {
      const c = createMockContext({
        query: {
          sig: 'some-signature',
          exp: '1234567890',
        },
      });

      expect(hasSignatureParams(c)).toBe(false);
    });

    it('returns false when all params missing', () => {
      const c = createMockContext({ query: {} });

      expect(hasSignatureParams(c)).toBe(false);
    });
  });

  describe('getUrlRemainingValidity', () => {
    it('returns remaining seconds for valid URL', () => {
      const futureExp = Date.now() + 30 * 60 * 1000; // 30 minutes from now
      const c = createMockContext({
        query: { exp: futureExp.toString() },
      });

      const remaining = getUrlRemainingValidity(c);

      expect(remaining).toBe(30 * 60); // 1800 seconds
    });

    it('returns 0 for expired URL', () => {
      const pastExp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
      const c = createMockContext({
        query: { exp: pastExp.toString() },
      });

      const remaining = getUrlRemainingValidity(c);

      expect(remaining).toBe(0);
    });

    it('returns null when exp param is missing', () => {
      const c = createMockContext({ query: {} });

      const remaining = getUrlRemainingValidity(c);

      expect(remaining).toBeNull();
    });

    it('returns null when exp is not a number', () => {
      const c = createMockContext({
        query: { exp: 'invalid' },
      });

      const remaining = getUrlRemainingValidity(c);

      expect(remaining).toBeNull();
    });
  });

  describe('signature consistency', () => {
    it('generates same signature for same inputs', async () => {
      const c = createMockContext({});
      const options = {
        uploadId: 'upload-123',
        userId: 'user-456',
        threadId: 'thread-789',
        expirationMs: 60 * 60 * 1000,
      };

      const url1 = await generateSignedDownloadUrl(c, options);
      const url2 = await generateSignedDownloadUrl(c, options);

      const params1 = extractQueryParams(url1);
      const params2 = extractQueryParams(url2);

      expect(params1.sig).toBe(params2.sig);
    });

    it('generates different signature for different upload IDs', async () => {
      const c = createMockContext({});

      const url1 = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-123',
        userId: 'user-456',
      });
      const url2 = await generateSignedDownloadUrl(c, {
        uploadId: 'upload-different',
        userId: 'user-456',
      });

      const params1 = extractQueryParams(url1);
      const params2 = extractQueryParams(url2);

      expect(params1.sig).not.toBe(params2.sig);
    });

    it('generates different signature with different secret', async () => {
      const c1 = createMockContext({ secret: 'secret-one-32-characters-minimum!' });
      const c2 = createMockContext({ secret: 'secret-two-32-characters-minimum!' });

      const options = {
        uploadId: 'upload-123',
        userId: 'user-456',
      };

      const url1 = await generateSignedDownloadUrl(c1, options);
      const url2 = await generateSignedDownloadUrl(c2, options);

      const params1 = extractQueryParams(url1);
      const params2 = extractQueryParams(url2);

      expect(params1.sig).not.toBe(params2.sig);
    });
  });
});
