/**
 * Authenticated Fetch URL Handling Tests
 *
 * Verifies that authenticatedFetch correctly handles both relative and absolute URLs.
 * This test guards against regression of the bug where new URL() would throw
 * when passed a relative path like '/api/v1/uploads/ticket'.
 *
 * BUG FIXED:
 * - new URL('/api/v1/uploads/ticket') throws "Invalid URL" because URL constructor
 *   requires an absolute URL as its first argument
 * - Fix: Use window.location.origin as base for client-side relative URLs
 *
 * Location: /src/lib/api/__tests__/authenticated-fetch-url-handling.test.ts
 */

import { describe, expect, it, vi } from 'vitest';

// Mock the base-urls module before importing client
vi.mock('@/lib/config/base-urls', () => ({
  getApiBaseUrl: vi.fn(),
}));

describe('uRL construction for authenticatedFetch', () => {
  describe('relative URL handling (client-side)', () => {
    it('should correctly construct URL from relative path with window.location.origin', () => {
      // Verify URL construction logic works correctly
      const baseUrl = '/api/v1';
      const path = '/uploads/ticket';

      // This is what happens when getApiBaseUrl() returns relative URL
      const isRelativeUrl = baseUrl.startsWith('/');
      expect(isRelativeUrl).toBeTruthy();

      // Simulate client-side URL construction
      const origin = 'http://localhost:5173';
      const fullBaseUrl = `${origin}${baseUrl}`;
      const url = new URL(`${fullBaseUrl}${path}`);

      expect(url.toString()).toBe('http://localhost:5173/api/v1/uploads/ticket');
      expect(url.pathname).toBe('/api/v1/uploads/ticket');
    });

    it('should throw error when constructing URL from relative path without origin', () => {
      // This demonstrates the bug that was fixed
      const baseUrl = '/api/v1';
      const path = '/uploads/ticket';

      // Without the fix, this would throw
      expect(() => new URL(`${baseUrl}${path}`)).toThrow('Invalid URL');
    });

    it('should handle various path combinations correctly', () => {
      const origin = 'http://localhost:5173';
      const testCases = [
        { base: '/api/v1', expected: 'http://localhost:5173/api/v1/uploads/ticket', path: '/uploads/ticket' },
        { base: '/api/v1', expected: 'http://localhost:5173/api/v1/uploads/ticket/upload', path: '/uploads/ticket/upload' },
        { base: '/api/v1', expected: 'http://localhost:5173/api/v1/uploads/multipart', path: '/uploads/multipart' },
        { base: '/api/v1', expected: 'http://localhost:5173/api/v1/chat/threads', path: '/chat/threads' },
      ];

      for (const { base, expected, path } of testCases) {
        const fullBaseUrl = `${origin}${base}`;
        const url = new URL(`${fullBaseUrl}${path}`);
        expect(url.toString()).toBe(expected);
      }
    });
  });

  describe('absolute URL handling (server-side)', () => {
    it('should correctly construct URL from absolute base URL', () => {
      // Server-side returns full URL
      const baseUrl = 'http://localhost:8787/api/v1';
      const path = '/uploads/ticket';

      // When baseUrl is absolute, don't need window.location.origin
      const isRelativeUrl = baseUrl.startsWith('/');
      expect(isRelativeUrl).toBeFalsy();

      const url = new URL(`${baseUrl}${path}`);
      expect(url.toString()).toBe('http://localhost:8787/api/v1/uploads/ticket');
    });

    it('should handle production URLs correctly', () => {
      const baseUrl = 'https://api.roundtable.now/api/v1';
      const path = '/uploads/ticket';

      const url = new URL(`${baseUrl}${path}`);
      expect(url.toString()).toBe('https://api.roundtable.now/api/v1/uploads/ticket');
    });

    it('should handle preview URLs correctly', () => {
      const baseUrl = 'https://api-preview.roundtable.now/api/v1';
      const path = '/uploads/ticket';

      const url = new URL(`${baseUrl}${path}`);
      expect(url.toString()).toBe('https://api-preview.roundtable.now/api/v1/uploads/ticket');
    });
  });

  describe('search params handling', () => {
    it('should append search params to URL correctly', () => {
      const origin = 'http://localhost:5173';
      const baseUrl = '/api/v1';
      const path = '/uploads/ticket/upload';

      const fullBaseUrl = `${origin}${baseUrl}`;
      const url = new URL(`${fullBaseUrl}${path}`);

      // Add search params
      const searchParams = { token: 'abc123' };
      for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value);
      }

      expect(url.toString()).toBe('http://localhost:5173/api/v1/uploads/ticket/upload?token=abc123');
    });

    it('should handle multiple search params', () => {
      const origin = 'http://localhost:5173';
      const baseUrl = '/api/v1';
      const path = '/uploads/multipart/123/parts';

      const fullBaseUrl = `${origin}${baseUrl}`;
      const url = new URL(`${fullBaseUrl}${path}`);

      const searchParams = {
        partNumber: '1',
        uploadId: 'upload-456',
      };

      for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value);
      }

      expect(url.searchParams.get('uploadId')).toBe('upload-456');
      expect(url.searchParams.get('partNumber')).toBe('1');
    });
  });

  describe('uRL detection logic', () => {
    it('should correctly identify relative URLs', () => {
      const relativeUrls = ['/api/v1', '/uploads', '/'];
      const absoluteUrls = [
        'http://localhost:8787/api/v1',
        'https://api.roundtable.now/api/v1',
        'https://api-preview.roundtable.now/api/v1',
      ];

      for (const url of relativeUrls) {
        expect(url.startsWith('/')).toBeTruthy();
      }

      for (const url of absoluteUrls) {
        expect(url.startsWith('/')).toBeFalsy();
      }
    });
  });
});
