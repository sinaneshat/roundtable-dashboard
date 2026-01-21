/**
 * Turnstile Validation Service
 *
 * Server-side validation of Cloudflare Turnstile tokens.
 * Validates tokens against Cloudflare's Siteverify API.
 */

import type { Context } from 'hono';

import type { ApiEnv } from '@/types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileValidationResult = {
  'success': boolean;
  'challenge_ts'?: string;
  'hostname'?: string;
  'action'?: string;
  'cdata'?: string;
  'error-codes'?: string[];
  'metadata'?: {
    ephemeral_id?: string;
  };
};

export type TurnstileValidationOptions = {
  expectedAction?: string;
  expectedHostname?: string;
  timeout?: number;
};

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
      'success': false,
      'error-codes': ['invalid-input-response'],
    };
  }

  if (token.length > 2048) {
    return {
      'success': false,
      'error-codes': ['invalid-input-response'],
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
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    const result: TurnstileValidationResult = await response.json();

    // Additional validation if options provided
    if (result.success) {
      if (options.expectedAction && result.action !== options.expectedAction) {
        return {
          'success': false,
          'error-codes': ['action-mismatch'],
        };
      }

      if (options.expectedHostname && result.hostname !== options.expectedHostname) {
        return {
          'success': false,
          'error-codes': ['hostname-mismatch'],
        };
      }
    }

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        'success': false,
        'error-codes': ['timeout-error'],
      };
    }

    return {
      'success': false,
      'error-codes': ['internal-error'],
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
      'success': false,
      'error-codes': ['missing-secret-key'],
    };
  }

  // Get client IP from Cloudflare headers
  const remoteIp = c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || c.req.header('X-Real-IP');

  return validateTurnstileToken(token, secretKey, remoteIp, options);
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
