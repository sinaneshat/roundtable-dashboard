/**
 * Signed URL Service
 *
 * Generates cryptographically signed, time-limited URLs for secure file downloads.
 * Prevents URL guessing attacks and enables access control for both private and public files.
 *
 * Security features:
 * - HMAC-SHA256 signature prevents URL tampering
 * - Time-limited expiration prevents indefinite access
 * - User/thread binding prevents unauthorized access
 * - Rate limiting protection via separate preset
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import type { Context } from 'hono';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { ApiEnv } from '@/api/types';
import type { SignedUrlOptions, ValidateSignatureResult } from '@/api/types/uploads';
import {
  DEFAULT_URL_EXPIRATION_MS,
  MAX_URL_EXPIRATION_MS,
  MIN_URL_EXPIRATION_MS,
} from '@/api/types/uploads';

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for URL parameters
 */
async function generateSignature(
  secret: string,
  uploadId: string,
  expiration: number,
  userId: string,
  threadId?: string,
): Promise<string> {
  // Create signing payload (order matters for reproducibility)
  const payload = [uploadId, expiration.toString(), userId, threadId || ''].join(':');

  // Import key for HMAC
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Generate signature
  const payloadData = encoder.encode(payload);
  const signature = await crypto.subtle.sign('HMAC', key, payloadData);

  // Convert to URL-safe base64
  const signatureArray = new Uint8Array(signature);
  const base64 = btoa(String.fromCharCode(...signatureArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify HMAC-SHA256 signature
 */
async function verifySignature(
  secret: string,
  uploadId: string,
  expiration: number,
  userId: string,
  threadId: string | undefined,
  providedSignature: string,
): Promise<boolean> {
  const expectedSignature = await generateSignature(secret, uploadId, expiration, userId, threadId);
  return expectedSignature === providedSignature;
}

// ============================================================================
// SIGNED URL GENERATION
// ============================================================================

/**
 * Generate a signed download URL
 *
 * @example
 * const url = await generateSignedDownloadUrl(c, {
 *   uploadId: 'abc123',
 *   userId: 'user456',
 *   threadId: 'thread789',
 *   expirationMs: 3600000, // 1 hour
 * });
 * // Result: /api/v1/uploads/abc123/download?exp=1699999999999&uid=user456&tid=thread789&sig=xxx
 */
export async function generateSignedDownloadUrl(
  c: Context<ApiEnv>,
  options: SignedUrlOptions,
): Promise<string> {
  const {
    uploadId,
    userId,
    threadId,
    expirationMs = DEFAULT_URL_EXPIRATION_MS,
    isPublic = false,
  } = options;

  // Validate expiration
  const clampedExpiration = Math.min(Math.max(expirationMs, MIN_URL_EXPIRATION_MS), MAX_URL_EXPIRATION_MS);
  const expiration = Date.now() + clampedExpiration;

  // Use userId or 'public' marker for public threads
  const effectiveUserId = isPublic ? 'public' : userId;

  // Get signing secret from environment
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    const errorContext: ErrorContext = {
      errorType: 'validation',
      field: 'BETTER_AUTH_SECRET',
    };
    throw createError.internal('BETTER_AUTH_SECRET not configured - cannot generate signed URLs', errorContext);
  }

  // Generate signature
  const signature = await generateSignature(secret, uploadId, expiration, effectiveUserId, threadId);

  // Build URL with query parameters
  const baseUrl = new URL(c.req.url).origin;
  const url = new URL(`${baseUrl}/api/v1/uploads/${encodeURIComponent(uploadId)}/download`);

  url.searchParams.set('exp', expiration.toString());
  url.searchParams.set('uid', effectiveUserId);
  if (threadId) {
    url.searchParams.set('tid', threadId);
  }
  url.searchParams.set('sig', signature);

  return url.toString();
}

/**
 * Generate just the path portion of a signed URL (without origin)
 * Useful when the origin will be determined client-side
 */
export async function generateSignedDownloadPath(
  c: Context<ApiEnv>,
  options: SignedUrlOptions,
): Promise<string> {
  const fullUrl = await generateSignedDownloadUrl(c, options);
  const url = new URL(fullUrl);
  return `${url.pathname}${url.search}`;
}

// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================

/**
 * Validate a signed download URL
 *
 * @returns Object with validation result and parsed parameters
 */
export async function validateSignedUrl(
  c: Context<ApiEnv>,
  uploadId: string,
): Promise<ValidateSignatureResult> {
  // Get signing secret
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { valid: false, error: 'Server configuration error' };
  }

  // Extract query parameters
  const exp = c.req.query('exp');
  const uid = c.req.query('uid');
  const tid = c.req.query('tid');
  const sig = c.req.query('sig');

  // Validate required parameters
  if (!exp || !uid || !sig) {
    return { valid: false, error: 'Missing signature parameters' };
  }

  // Parse and validate expiration
  const expiration = Number.parseInt(exp, 10);
  if (Number.isNaN(expiration)) {
    return { valid: false, error: 'Invalid expiration format' };
  }

  if (Date.now() > expiration) {
    return { valid: false, error: 'URL has expired' };
  }

  // Verify signature
  const isValid = await verifySignature(secret, uploadId, expiration, uid, tid, sig);
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  return {
    valid: true,
    uploadId,
    userId: uid,
    threadId: tid,
    isPublic: uid === 'public',
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a URL has valid signature parameters (quick check without full validation)
 */
export function hasSignatureParams(c: Context<ApiEnv>): boolean {
  return Boolean(c.req.query('sig') && c.req.query('exp') && c.req.query('uid'));
}

/**
 * Get remaining validity time for a signed URL (in seconds)
 */
export function getUrlRemainingValidity(c: Context<ApiEnv>): number | null {
  const exp = c.req.query('exp');
  if (!exp)
    return null;

  const expiration = Number.parseInt(exp, 10);
  if (Number.isNaN(expiration))
    return null;

  const remaining = Math.max(0, expiration - Date.now());
  return Math.floor(remaining / 1000);
}
