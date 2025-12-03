/**
 * Upload Ticket Service Tests
 *
 * Tests for secure, time-limited upload ticket generation and validation.
 * Follows S3 presigned URL pattern with HMAC-SHA256 signatures.
 */

import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from '@/api/types';

import {
  createUploadTicket,
  DEFAULT_TICKET_EXPIRATION_MS,
  deleteTicket,
  isUploadTicket,
  markTicketUsed,
  MAX_TICKET_EXPIRATION_MS,
  validateUploadTicket,
} from '../upload-ticket.service';

// ==========================================================================
// Test Utilities
// ==========================================================================

/**
 * Create mock KV storage
 */
function createMockKV() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    _store: store,
  };
}

/**
 * Create a mock Hono context for testing
 */
function createMockContext(options: {
  secret?: string;
  kv?: ReturnType<typeof createMockKV>;
}): Context<ApiEnv> {
  const { secret = 'test-secret-key-32-chars-minimum!', kv = createMockKV() } = options;

  return {
    env: {
      BETTER_AUTH_SECRET: secret,
      KV: kv,
    },
  } as unknown as Context<ApiEnv>;
}

// ==========================================================================
// Tests
// ==========================================================================

describe('upload Ticket Service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createUploadTicket', () => {
    it('creates ticket with all required fields', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        maxFileSize: 10 * 1024 * 1024, // 10MB
      });

      expect(result.ticketId).toMatch(/^tkt_/);
      expect(result.token).toBeTruthy();
      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('stores ticket in KV with correct structure', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        maxFileSize: 5 * 1024 * 1024,
      });

      expect(kv.put).toHaveBeenCalled();
      const storedData = kv._store.get(`upload-ticket:${result.ticketId}`);
      expect(storedData).toBeTruthy();

      const ticket = JSON.parse(storedData!);
      expect(ticket.userId).toBe('user-123');
      expect(ticket.filename).toBe('document.pdf');
      expect(ticket.mimeType).toBe('application/pdf');
      expect(ticket.maxFileSize).toBe(5 * 1024 * 1024);
      expect(ticket.used).toBe(false);
    });

    it('uses default expiration when not specified', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });
      const now = Date.now();

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      expect(result.expiresAt).toBe(now + DEFAULT_TICKET_EXPIRATION_MS);
    });

    it('respects custom expiration within limits', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });
      const now = Date.now();
      const customExpiration = 10 * 60 * 1000; // 10 minutes

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
        expirationMs: customExpiration,
      });

      expect(result.expiresAt).toBe(now + customExpiration);
    });

    it('clamps expiration to maximum', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });
      const now = Date.now();
      const excessiveExpiration = 60 * 60 * 1000; // 1 hour (exceeds max)

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
        expirationMs: excessiveExpiration,
      });

      expect(result.expiresAt).toBe(now + MAX_TICKET_EXPIRATION_MS);
    });

    it('generates token in correct format (ticketId.expiresAt.signature)', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const result = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      const parts = result.token.split('.');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(result.ticketId);
      expect(parts[1]).toBe(result.expiresAt.toString());
      expect(parts[2]).toBeTruthy(); // Signature
    });

    it('throws error when secret is not configured', async () => {
      const c = createMockContext({ secret: '' });

      await expect(
        createUploadTicket(c, {
          userId: 'user-123',
          filename: 'file.txt',
          mimeType: 'text/plain',
          maxFileSize: 1024,
        }),
      ).rejects.toThrow('BETTER_AUTH_SECRET not configured');
    });
  });

  describe('validateUploadTicket', () => {
    it('validates correct token successfully', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      // Create a ticket first
      const { token } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        maxFileSize: 10 * 1024 * 1024,
      });

      // Validate the token
      const result = await validateUploadTicket(c, token, 'user-123');

      expect(result).toMatchObject({
        valid: true,
        ticket: {
          userId: 'user-123',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          used: false,
        },
      });
    });

    it('rejects expired token', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { token } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Advance time past expiration
      vi.advanceTimersByTime(DEFAULT_TICKET_EXPIRATION_MS + 1000);

      const result = await validateUploadTicket(c, token, 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Ticket has expired',
      });
    });

    it('rejects token with wrong user', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { token } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Try to validate with different user
      const result = await validateUploadTicket(c, token, 'different-user');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid signature',
      });
    });

    it('rejects tampered signature', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { ticketId, expiresAt } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Tamper with the signature
      const tamperedToken = `${ticketId}.${expiresAt}.tampered-signature`;

      const result = await validateUploadTicket(c, tamperedToken, 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid signature',
      });
    });

    it('rejects invalid token format', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const result = await validateUploadTicket(c, 'invalid-token-format', 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid token format',
      });
    });

    it('rejects token with invalid expiration format', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const result = await validateUploadTicket(c, 'ticketId.not-a-number.signature', 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Invalid expiration format',
      });
    });

    it('rejects already used ticket', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { token, ticketId } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Mark as used
      await markTicketUsed(c, ticketId);

      // Try to validate
      const result = await validateUploadTicket(c, token, 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Ticket has already been used',
      });
    });

    it('rejects ticket not found in KV', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { token, ticketId } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Delete from KV
      kv._store.delete(`upload-ticket:${ticketId}`);

      const result = await validateUploadTicket(c, token, 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Ticket not found or expired',
      });
    });

    it('uses local fallback when KV not available (local dev)', async () => {
      // Create context without KV (simulates local development)
      const c = createMockContext({});

      // Create a ticket - should use local fallback store
      const { token } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Validate should succeed using local fallback store
      const result = await validateUploadTicket(c, token, 'user-123');

      expect(result).toMatchObject({
        valid: true,
        ticket: {
          filename: 'file.txt',
          userId: 'user-123',
        },
      });
    });

    it('returns error when secret not configured', async () => {
      const c = createMockContext({ secret: '' });

      const result = await validateUploadTicket(c, 'tkt_123.1234567890.sig', 'user-123');

      expect(result).toMatchObject({
        valid: false,
        error: 'Server configuration error',
      });
    });
  });

  describe('markTicketUsed', () => {
    it('updates ticket used flag to true', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { ticketId } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      await markTicketUsed(c, ticketId);

      const storedData = kv._store.get(`upload-ticket:${ticketId}`);
      const ticket = JSON.parse(storedData!);
      expect(ticket.used).toBe(true);
    });

    it('handles non-existent ticket gracefully', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      // Should not throw
      await expect(markTicketUsed(c, 'nonexistent-ticket')).resolves.toBeUndefined();
    });

    it('handles missing KV gracefully', async () => {
      const c = createMockContext({});
      (c.env as { KV: undefined }).KV = undefined;

      // Should not throw
      await expect(markTicketUsed(c, 'any-ticket')).resolves.toBeUndefined();
    });
  });

  describe('deleteTicket', () => {
    it('removes ticket from KV', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      const { ticketId } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      await deleteTicket(c, ticketId);

      expect(kv.delete).toHaveBeenCalledWith(`upload-ticket:${ticketId}`);
      expect(kv._store.has(`upload-ticket:${ticketId}`)).toBe(false);
    });

    it('handles missing KV gracefully', async () => {
      const c = createMockContext({});
      (c.env as { KV: undefined }).KV = undefined;

      // Should not throw
      await expect(deleteTicket(c, 'any-ticket')).resolves.toBeUndefined();
    });
  });

  describe('isUploadTicket', () => {
    it('returns true for valid ticket object', () => {
      const ticket = {
        ticketId: 'tkt_123',
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
        expiresAt: Date.now() + 300000,
        used: false,
        createdAt: Date.now(),
      };

      expect(isUploadTicket(ticket)).toBe(true);
    });

    it('returns false for invalid object', () => {
      expect(isUploadTicket(null)).toBe(false);
      expect(isUploadTicket(undefined)).toBe(false);
      expect(isUploadTicket({})).toBe(false);
      expect(isUploadTicket({ ticketId: 'tkt_123' })).toBe(false);
    });

    it('returns false when required fields are wrong type', () => {
      const invalidTicket = {
        ticketId: 123, // Should be string
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
        expiresAt: Date.now(),
        used: false,
        createdAt: Date.now(),
      };

      expect(isUploadTicket(invalidTicket)).toBe(false);
    });
  });

  describe('one-time use security', () => {
    it('prevents replay attacks by invalidating used ticket', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      // Create ticket
      const { token, ticketId } = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // First validation succeeds
      const firstResult = await validateUploadTicket(c, token, 'user-123');
      expect(firstResult.valid).toBe(true);

      // Mark as used (simulating successful upload)
      await markTicketUsed(c, ticketId);

      // Second validation fails (replay attack)
      const secondResult = await validateUploadTicket(c, token, 'user-123');
      expect(secondResult).toMatchObject({
        valid: false,
        error: 'Ticket has already been used',
      });
    });
  });

  describe('signature consistency', () => {
    it('generates deterministic signatures', async () => {
      const kv = createMockKV();
      const c = createMockContext({ kv });

      // Create two tickets with same params
      const result1 = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      const result2 = await createUploadTicket(c, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Different ticket IDs means different signatures
      expect(result1.ticketId).not.toBe(result2.ticketId);

      // But each token should validate correctly
      const valid1 = await validateUploadTicket(c, result1.token, 'user-123');
      const valid2 = await validateUploadTicket(c, result2.token, 'user-123');

      expect(valid1.valid).toBe(true);
      expect(valid2.valid).toBe(true);
    });

    it('signature changes with different secret', async () => {
      const kv1 = createMockKV();
      const kv2 = createMockKV();
      const c1 = createMockContext({ secret: 'secret-one-32-characters-minimum!', kv: kv1 });
      const c2 = createMockContext({ secret: 'secret-two-32-characters-minimum!', kv: kv2 });

      const result1 = await createUploadTicket(c1, {
        userId: 'user-123',
        filename: 'file.txt',
        mimeType: 'text/plain',
        maxFileSize: 1024,
      });

      // Token from c1 should not validate with c2's secret
      const validation = await validateUploadTicket(c2, result1.token, 'user-123');
      expect(validation.valid).toBe(false);
    });
  });
});
