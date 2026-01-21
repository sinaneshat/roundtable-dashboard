/**
 * Upload Ticket Service
 *
 * JWT-based secure upload tickets following backend-patterns.md service layer.
 * Self-contained tokens handle Cloudflare KV's eventual consistency.
 *
 * Security: HS256 signature, 5min expiration, user binding, KV replay prevention.
 * Flow: Client requests ticket → JWT generated → Upload with token → Validation.
 */

import type { Context } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import * as z from 'zod';

import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import type { ApiEnv } from '@/types';

// ============================================================================
// CONSTANTS (Enum 5-part pattern)
// ============================================================================

export const TICKET_EXPIRATION_VALUES = [
  5 * 60 * 1000,
  15 * 60 * 1000,
] as const;

export const TicketExpirationSchema = z.enum([
  '5min',
  '15min',
] as const);

export type TicketExpiration = z.infer<typeof TicketExpirationSchema>;

export const TicketExpirations = {
  FIVE_MIN: '5min' as const,
  FIFTEEN_MIN: '15min' as const,
} as const;

export const DEFAULT_TICKET_EXPIRATION_MS = 5 * 60 * 1000;
export const MAX_TICKET_EXPIRATION_MS = 15 * 60 * 1000;

const TICKET_KV_PREFIX = 'upload-ticket:';
const JWT_ISSUER = 'roundtable:upload-ticket';
const JWT_AUDIENCE = 'roundtable:upload';

// ============================================================================
// SCHEMAS (Single source of truth - Zod first)
// ============================================================================

export const UploadTicketSchema = z.object({
  ticketId: z.string(),
  userId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  maxFileSize: z.number(),
  expiresAt: z.number(),
  used: z.boolean(),
  createdAt: z.number(),
});

export type UploadTicket = z.infer<typeof UploadTicketSchema>;

export const CreateTicketOptionsSchema = z.object({
  userId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  maxFileSize: z.number(),
  expirationMs: z.number().optional(),
});

export type CreateTicketOptions = z.infer<typeof CreateTicketOptionsSchema>;

export const ValidateTicketResultSchema = z.discriminatedUnion('valid', [
  z.object({
    valid: z.literal(true),
    ticket: UploadTicketSchema,
  }),
  z.object({
    valid: z.literal(false),
    error: z.string(),
  }),
]);

export type ValidateTicketResult = z.infer<typeof ValidateTicketResultSchema>;

const JwtPayloadSchema = z.object({
  tid: z.string(),
  uid: z.string(),
  fn: z.string(),
  mt: z.string(),
  ms: z.number(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ============================================================================
// TICKET OPERATIONS
// ============================================================================

function generateTicketId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const randomStr = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `tkt_${timestamp}_${randomStr}`;
}

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function createUploadTicket(
  c: Context<ApiEnv>,
  options: CreateTicketOptions,
): Promise<{ ticketId: string; token: string; expiresAt: number }> {
  const {
    userId,
    filename,
    mimeType,
    maxFileSize,
    expirationMs = DEFAULT_TICKET_EXPIRATION_MS,
  } = options;

  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    const errorContext: ErrorContext = {
      errorType: 'validation',
      field: 'BETTER_AUTH_SECRET',
    };
    throw createError.internal('BETTER_AUTH_SECRET not configured', errorContext);
  }

  const ticketId = generateTicketId();
  const actualExpiration = Math.min(expirationMs, MAX_TICKET_EXPIRATION_MS);
  const expiresAt = Date.now() + actualExpiration;

  const token = await new SignJWT({
    tid: ticketId,
    uid: userId,
    fn: filename,
    mt: mimeType,
    ms: maxFileSize,
  } satisfies Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(getSecretKey(secret));

  const ticket: UploadTicket = {
    ticketId,
    userId,
    filename,
    mimeType,
    maxFileSize,
    expiresAt,
    used: false,
    createdAt: Date.now(),
  };

  const kv = c.env.KV;
  if (kv) {
    kv.put(
      `${TICKET_KV_PREFIX}${ticketId}`,
      JSON.stringify(ticket),
      { expirationTtl: Math.ceil(actualExpiration / 1000) + 60 },
    ).catch(() => {});
  }

  return { ticketId, token, expiresAt };
}

export async function validateUploadTicket(
  c: Context<ApiEnv>,
  token: string,
  userId: string,
): Promise<ValidateTicketResult> {
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { valid: false, error: 'Server configuration error' };
  }

  let payload: JwtPayload;
  try {
    const result = await jwtVerify(token, getSecretKey(secret), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    const parsed = JwtPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      return { valid: false, error: 'Invalid token payload' };
    }
    payload = parsed.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { valid: false, error: 'Ticket has expired' };
      }
      if (error.message.includes('signature')) {
        return { valid: false, error: 'Invalid signature' };
      }
    }
    return { valid: false, error: 'Invalid token' };
  }

  if (payload.uid !== userId) {
    return { valid: false, error: 'User mismatch' };
  }

  const ticket: UploadTicket = {
    ticketId: payload.tid,
    userId: payload.uid,
    filename: payload.fn,
    mimeType: payload.mt,
    maxFileSize: payload.ms,
    expiresAt: (payload.exp ?? 0) * 1000,
    used: false,
    createdAt: (payload.iat ?? 0) * 1000,
  };

  const kv = c.env.KV;
  if (kv) {
    const ticketData = await kv.get(`${TICKET_KV_PREFIX}${payload.tid}`);
    if (ticketData) {
      const result = UploadTicketSchema.safeParse(JSON.parse(ticketData));
      if (result.success && result.data.used) {
        return { valid: false, error: 'Ticket has already been used' };
      }
    }
  }

  return { valid: true, ticket };
}

export async function markTicketUsed(
  c: Context<ApiEnv>,
  ticketId: string,
): Promise<void> {
  const kv = c.env.KV;
  if (!kv) {
    return;
  }

  const kvKey = `${TICKET_KV_PREFIX}${ticketId}`;
  const ticketData = await kv.get(kvKey);
  if (!ticketData) {
    return;
  }

  const result = UploadTicketSchema.safeParse(JSON.parse(ticketData));
  if (!result.success) {
    return;
  }

  const updatedTicket: UploadTicket = { ...result.data, used: true };
  await kv.put(kvKey, JSON.stringify(updatedTicket), { expirationTtl: 60 });
}

export async function deleteTicket(
  c: Context<ApiEnv>,
  ticketId: string,
): Promise<void> {
  const kv = c.env.KV;
  if (kv) {
    await kv.delete(`${TICKET_KV_PREFIX}${ticketId}`);
  }
}
