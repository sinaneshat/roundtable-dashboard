/**
 * Turnstile Validation Service
 *
 * Server-side validation of Cloudflare Turnstile tokens.
 * Validates tokens against Cloudflare's Siteverify API.
 */

import type { Context } from 'hono';
import { z } from 'zod';

import type { ApiEnv } from '@/types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Internal schemas with .strict() for Cloudflare Turnstile API responses
const _TurnstileValidationResultSchema = z.object({
  'action': z.string().optional(),
  'cdata': z.string().optional(),
  'challenge_ts': z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
  'hostname': z.string().optional(),
  'metadata': z.object({
    ephemeral_id: z.string().optional(),
  }).strict().optional(),
  'success': z.boolean(),
}).strict();

export type TurnstileValidationResult = z.infer<typeof _TurnstileValidationResultSchema>;

const _TurnstileValidationOptionsSchema = z.object({
  expectedAction: z.string().optional(),
  expectedHostname: z.string().optional(),
  timeout: z.number().optional(),
}).strict();

export type TurnstileValidationOptions = z.infer<typeof _TurnstileValidationOptionsSchema>;

/**
 * Validate a Turnstile token against Cloudflare's Siteverify API
 */
export async function validateTurnstileToken(
  token: string,
  secretKey: string,
  remoteIp?: string,
  options: TurnstileValidationOptions = {},
): Promise<TurnstileValidationResult> {
  const { timeout = 10000 } = options;

  // Input validation
  if (!token || typeof token !== 'string') {
    return {
      'error-codes': ['invalid-input-response'],
      'success': false,
    };
  }

  if (token.length > 2048) {
    return {
      'error-codes': ['invalid-input-response'],
      'success': false,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);

    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch(SITEVERIFY_URL, {
      body: formData,
      method: 'POST',
      signal: controller.signal,
    });

    const result: TurnstileValidationResult = await response.json();

    // Additional validation if options provided
    if (result.success) {
      if (options.expectedAction && result.action !== options.expectedAction) {
        return {
          'error-codes': ['action-mismatch'],
          'success': false,
        };
      }

      if (options.expectedHostname && result.hostname !== options.expectedHostname) {
        return {
          'error-codes': ['hostname-mismatch'],
          'success': false,
        };
      }
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        'error-codes': ['timeout-error'],
        'success': false,
      };
    }

    return {
      'error-codes': ['internal-error'],
      'success': false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate Turnstile token from Hono context
 * Extracts secret key from env and client IP from headers
 */
export async function validateTurnstileFromContext(
  c: Context<ApiEnv>,
  token: string,
  options: TurnstileValidationOptions = {},
): Promise<TurnstileValidationResult> {
  const secretKey = c.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    // In development without secret key, pass through
    if (c.env.NODE_ENV === 'development') {
      return { success: true };
    }
    return {
      'error-codes': ['missing-secret-key'],
      'success': false,
    };
  }

  // Get client IP from Cloudflare headers
  const remoteIp = c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || c.req.header('X-Real-IP');

  return await validateTurnstileToken(token, secretKey, remoteIp, options);
}

/**
 * Extract Turnstile token from request
 * Checks both header and body for the token
 */
export function extractTurnstileToken(c: Context<ApiEnv>): string | null {
  // Check header first (preferred for API calls)
  const headerToken = c.req.header('X-Turnstile-Token') || c.req.header('CF-Turnstile-Response');
  if (headerToken) {
    return headerToken;
  }

  return null;
}

/**
 * Extract Turnstile token from form data
 */
export async function extractTurnstileTokenFromBody(c: Context<ApiEnv>): Promise<string | null> {
  try {
    const contentType = c.req.header('Content-Type') || '';

    if (contentType.includes('application/json')) {
      const body = await c.req.json();
      return body['cf-turnstile-response'] || body.turnstileToken || null;
    }

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      return formData.get('cf-turnstile-response') as string || null;
    }
  } catch {
    // Ignore parsing errors
  }

  return null;
}
