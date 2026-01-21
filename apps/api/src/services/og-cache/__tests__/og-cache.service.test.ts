/**
 * OG Cache Service Unit Tests
 *
 * Tests for Open Graph image caching utilities including:
 * - Version hash generation for cache invalidation
 * - Cache key generation
 * - Response creation from cached data
 */

import type { OgImageType } from '@roundtable/shared/enums';
import { describe, expect, it } from 'vitest';

import {
  createCachedImageResponse,
  generateOgCacheKey,
  generateOgVersionHash,
} from '../og-cache.service';

describe('generateOgVersionHash', () => {
  it('should generate consistent hash for same input', () => {
    const data = {
      title: 'Test Thread',
      mode: 'analyzing',
      participantCount: 3,
      messageCount: 10,
    };

    const hash1 = generateOgVersionHash(data);
    const hash2 = generateOgVersionHash(data);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different title', () => {
    const hash1 = generateOgVersionHash({ title: 'Thread A' });
    const hash2 = generateOgVersionHash({ title: 'Thread B' });

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different mode', () => {
    const hash1 = generateOgVersionHash({ mode: 'analyzing' });
    const hash2 = generateOgVersionHash({ mode: 'brainstorming' });

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different participant count', () => {
    const hash1 = generateOgVersionHash({ participantCount: 2 });
    const hash2 = generateOgVersionHash({ participantCount: 3 });

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash for different message count', () => {
    const hash1 = generateOgVersionHash({ messageCount: 5 });
    const hash2 = generateOgVersionHash({ messageCount: 10 });

    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hash when updatedAt changes', () => {
    const hash1 = generateOgVersionHash({ updatedAt: new Date('2024-01-01') });
    const hash2 = generateOgVersionHash({ updatedAt: new Date('2024-01-02') });

    expect(hash1).not.toBe(hash2);
  });

  it('should handle Date object for updatedAt', () => {
    const date = new Date('2024-06-15T10:30:00Z');
    const hash = generateOgVersionHash({ updatedAt: date });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should handle ISO string for updatedAt', () => {
    const hash = generateOgVersionHash({ updatedAt: '2024-06-15T10:30:00Z' });

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
  });

  it('should handle empty/missing values gracefully', () => {
    const hash = generateOgVersionHash({});

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(8); // Padded to 8 chars
  });

  it('should produce hexadecimal hash', () => {
    const hash = generateOgVersionHash({ title: 'Test' });

    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe('generateOgCacheKey', () => {
  it('should generate correct key format for public-thread type', () => {
    const key = generateOgCacheKey(
      'public-thread' as OgImageType,
      'my-thread-slug',
      'abc12345',
    );

    expect(key).toBe('og-images/public-thread/my-thread-slug-abc12345.png');
  });

  it('should generate correct key format for thread type', () => {
    const key = generateOgCacheKey(
      'thread' as OgImageType,
      'thread-123',
      'def67890',
    );

    expect(key).toBe('og-images/thread/thread-123-def67890.png');
  });

  it('should generate correct key format for page type', () => {
    const key = generateOgCacheKey(
      'page' as OgImageType,
      'privacy',
      'hash1234',
    );

    expect(key).toBe('og-images/page/privacy-hash1234.png');
  });

  it('should handle special characters in identifier', () => {
    const key = generateOgCacheKey(
      'public-thread' as OgImageType,
      'thread-with-dashes-123',
      'version1',
    );

    expect(key).toContain('thread-with-dashes-123');
  });

  it('should always end with .png extension', () => {
    const key = generateOgCacheKey(
      'page' as OgImageType,
      'test',
      'hash',
    );

    expect(key).toMatch(/\.png$/);
  });

  it('should include all three parts in the key', () => {
    const type = 'public-thread' as OgImageType;
    const identifier = 'my-slug';
    const versionHash = 'v123';

    const key = generateOgCacheKey(type, identifier, versionHash);

    expect(key).toContain(type);
    expect(key).toContain(identifier);
    expect(key).toContain(versionHash);
  });
});

describe('createCachedImageResponse', () => {
  it('should create Response with correct status', () => {
    const data = new ArrayBuffer(100);
    const response = createCachedImageResponse(data);

    expect(response.status).toBe(200);
  });

  it('should set correct Content-Type header', () => {
    const data = new ArrayBuffer(100);
    const response = createCachedImageResponse(data);

    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('should set Cache-Control header', () => {
    const data = new ArrayBuffer(100);
    const response = createCachedImageResponse(data);

    const cacheControl = response.headers.get('Cache-Control');
    expect(cacheControl).toContain('public');
    expect(cacheControl).toContain('max-age');
    expect(cacheControl).toContain('immutable');
  });

  it('should set X-OG-Cache header to HIT', () => {
    const data = new ArrayBuffer(100);
    const response = createCachedImageResponse(data);

    expect(response.headers.get('X-OG-Cache')).toBe('HIT');
  });

  it('should merge custom headers', () => {
    const data = new ArrayBuffer(100);
    const customHeaders = {
      'X-Custom-Header': 'custom-value',
    };
    const response = createCachedImageResponse(data, customHeaders);

    expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
    // Original headers should still be present
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('should allow custom headers to override defaults', () => {
    const data = new ArrayBuffer(100);
    const customHeaders = {
      'X-OG-Cache': 'STALE',
    };
    const response = createCachedImageResponse(data, customHeaders);

    expect(response.headers.get('X-OG-Cache')).toBe('STALE');
  });

  it('should return Response with body', async () => {
    const originalData = new ArrayBuffer(50);
    const view = new Uint8Array(originalData);
    for (let i = 0; i < 50; i++) {
      view[i] = i;
    }

    const response = createCachedImageResponse(originalData);
    const responseData = await response.arrayBuffer();

    expect(responseData.byteLength).toBe(50);
  });
});

describe('cache Key Uniqueness', () => {
  it('should generate unique keys for different threads', () => {
    const key1 = generateOgCacheKey('public-thread' as OgImageType, 'thread-a', 'hash1');
    const key2 = generateOgCacheKey('public-thread' as OgImageType, 'thread-b', 'hash1');

    expect(key1).not.toBe(key2);
  });

  it('should generate unique keys for different versions of same thread', () => {
    const key1 = generateOgCacheKey('public-thread' as OgImageType, 'my-thread', 'v1');
    const key2 = generateOgCacheKey('public-thread' as OgImageType, 'my-thread', 'v2');

    expect(key1).not.toBe(key2);
  });

  it('should generate unique keys for same content in different types', () => {
    const key1 = generateOgCacheKey('public-thread' as OgImageType, 'test', 'hash');
    const key2 = generateOgCacheKey('thread' as OgImageType, 'test', 'hash');

    expect(key1).not.toBe(key2);
  });
});

describe('version Hash Stability', () => {
  it('should produce stable hashes across multiple calls', () => {
    const data = {
      title: 'Stable Test',
      mode: 'analyzing',
      participantCount: 5,
      messageCount: 25,
      updatedAt: new Date('2024-01-15T12:00:00Z'),
    };

    const hashes = Array.from({ length: 10 }, () => generateOgVersionHash(data));

    // All hashes should be identical
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(1);
  });

  it('should handle empty strings in content', () => {
    const hash = generateOgVersionHash({
      title: '',
      mode: '',
    });

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(8);
  });

  it('should handle zero counts', () => {
    const hash = generateOgVersionHash({
      participantCount: 0,
      messageCount: 0,
    });

    expect(hash).toBeDefined();
    expect(hash).toHaveLength(8);
  });
});
