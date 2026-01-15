/**
 * Signed URL Service
 *
 * Generates cryptographically signed, time-limited URLs for secure file downloads.
 * Follows backend-patterns.md service layer conventions.
 *
 * Security: HMAC-SHA256 signature, time-limited expiration, user/thread binding.
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

const encoder = new TextEncoder();

export async function importSigningKey(secret: string): Promise<CryptoKey> {
  const keyData = encoder.encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function generateSignatureWithKey(
  key: CryptoKey,
  uploadId: string,
  expiration: number,
  userId: string,
  threadId?: string,
): Promise<string> {
  const payload = [uploadId, expiration.toString(), userId, threadId || ''].join(':');
  const payloadData = encoder.encode(payload);
  const signature = await crypto.subtle.sign('HMAC', key, payloadData);
  const signatureArray = new Uint8Array(signature);
  const base64 = btoa(String.fromCharCode(...signatureArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateSignature(
  secret: string,
  uploadId: string,
  expiration: number,
  userId: string,
  threadId?: string,
): Promise<string> {
  const key = await importSigningKey(secret);
  return generateSignatureWithKey(key, uploadId, expiration, userId, threadId);
}

async function verifySignature(
  secret: string,
  uploadId: string,
  expiration: number,
  userId: string,
  threadId: string | undefined,
  providedSignature: string,
): Promise<boolean> {
  const expected = await generateSignature(secret, uploadId, expiration, userId, threadId);
  return expected === providedSignature;
}

// ============================================================================
// SIGNED URL GENERATION
// ============================================================================

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

  const clampedExpiration = Math.min(Math.max(expirationMs, MIN_URL_EXPIRATION_MS), MAX_URL_EXPIRATION_MS);
  const expiration = Date.now() + clampedExpiration;

  const effectiveUserId = isPublic ? 'public' : userId;

  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    const errorContext: ErrorContext = {
      errorType: 'validation',
      field: 'BETTER_AUTH_SECRET',
    };
    throw createError.internal('BETTER_AUTH_SECRET not configured', errorContext);
  }

  const signature = await generateSignature(secret, uploadId, expiration, effectiveUserId, threadId);

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

export async function generateSignedDownloadPath(
  c: Context<ApiEnv>,
  options: SignedUrlOptions,
): Promise<string> {
  const fullUrl = await generateSignedDownloadUrl(c, options);
  const url = new URL(fullUrl);
  return `${url.pathname}${url.search}`;
}

// ============================================================================
// BATCH SIGNING (PERF OPTIMIZED)
// ============================================================================

export type BatchSignOptions = {
  uploadId: string;
  userId: string;
  threadId?: string;
  expirationMs?: number;
  isPublic?: boolean;
};

export async function generateBatchSignedPaths(
  c: Context<ApiEnv>,
  items: BatchSignOptions[],
): Promise<Map<string, string>> {
  if (items.length === 0)
    return new Map();

  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    const errorContext: ErrorContext = {
      errorType: 'validation',
      field: 'BETTER_AUTH_SECRET',
    };
    throw createError.internal('BETTER_AUTH_SECRET not configured', errorContext);
  }

  const key = await importSigningKey(secret);
  const now = Date.now();
  const results = new Map<string, string>();

  await Promise.all(
    items.map(async (item) => {
      const {
        uploadId,
        userId,
        threadId,
        expirationMs = DEFAULT_URL_EXPIRATION_MS,
        isPublic = false,
      } = item;

      const clampedExpiration = Math.min(Math.max(expirationMs, MIN_URL_EXPIRATION_MS), MAX_URL_EXPIRATION_MS);
      const expiration = now + clampedExpiration;
      const effectiveUserId = isPublic ? 'public' : userId;

      const signature = await generateSignatureWithKey(key, uploadId, expiration, effectiveUserId, threadId);

      const params = new URLSearchParams();
      params.set('exp', expiration.toString());
      params.set('uid', effectiveUserId);
      if (threadId)
        params.set('tid', threadId);
      params.set('sig', signature);

      results.set(uploadId, `/api/v1/uploads/${encodeURIComponent(uploadId)}/download?${params.toString()}`);
    }),
  );

  return results;
}

// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================

export async function validateSignedUrl(
  c: Context<ApiEnv>,
  uploadId: string,
): Promise<ValidateSignatureResult> {
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { valid: false, error: 'Server configuration error' };
  }

  const exp = c.req.query('exp');
  const uid = c.req.query('uid');
  const tid = c.req.query('tid');
  const sig = c.req.query('sig');

  if (!exp || !uid || !sig) {
    return { valid: false, error: 'Missing signature parameters' };
  }

  const expiration = Number.parseInt(exp, 10);
  if (Number.isNaN(expiration)) {
    return { valid: false, error: 'Invalid expiration format' };
  }

  if (Date.now() > expiration) {
    return { valid: false, error: 'URL has expired' };
  }

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
// HELPERS
// ============================================================================

export function hasSignatureParams(c: Context<ApiEnv>): boolean {
  return Boolean(c.req.query('sig') && c.req.query('exp') && c.req.query('uid'));
}

export function getUrlRemainingValidity(c: Context<ApiEnv>): number | null {
  const exp = c.req.query('exp');
  if (!exp) {
    return null;
  }

  const expiration = Number.parseInt(exp, 10);
  if (Number.isNaN(expiration)) {
    return null;
  }

  const remaining = Math.max(0, expiration - Date.now());
  return Math.floor(remaining / 1000);
}
