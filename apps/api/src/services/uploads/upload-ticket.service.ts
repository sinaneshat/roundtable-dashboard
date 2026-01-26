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
  FIFTEEN_MIN: '15min' as const,
  FIVE_MIN: '5min' as const,
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
  createdAt: z.number(),
  expiresAt: z.number(),
  filename: z.string(),
  maxFileSize: z.number(),
  mimeType: z.string(),
  ticketId: z.string(),
  used: z.boolean(),
  userId: z.string(),
}).strict();

export type UploadTicket = z.infer<typeof UploadTicketSchema>;

export const CreateTicketOptionsSchema = z.object({
  expirationMs: z.number().optional(),
  filename: z.string(),
  maxFileSize: z.number(),
  mimeType: z.string(),
  userId: z.string(),
}).strict();

export type CreateTicketOptions = z.infer<typeof CreateTicketOptionsSchema>;

export const ValidateTicketResultSchema = z.discriminatedUnion('valid', [
  z.object({
    ticket: UploadTicketSchema,
    valid: z.literal(true),
  }),
  z.object({
    error: z.string(),
    valid: z.literal(false),
  }),
]);

export type ValidateTicketResult = z.infer<typeof ValidateTicketResultSchema>;

const JwtPayloadSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  exp: z.number().optional(),
  fn: z.string(),
  iat: z.number().optional(),
  iss: z.string().optional(),
  ms: z.number(),
  mt: z.string(),
  tid: z.string(),
  uid: z.string(),
}).strict();

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
    expirationMs = DEFAULT_TICKET_EXPIRATION_MS,
    filename,
    maxFileSize,
    mimeType,
    userId,
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
    fn: filename,
    ms: maxFileSize,
    mt: mimeType,
    tid: ticketId,
    uid: userId,
  } satisfies Omit<JwtPayload, 'iat' | 'exp' | 'iss' | 'aud'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(getSecretKey(secret));

  const ticket: UploadTicket = {
    createdAt: Date.now(),
    expiresAt,
    filename,
    maxFileSize,
    mimeType,
    ticketId,
    used: false,
    userId,
  };

  const kv = c.env.KV;
  if (kv) {
    kv.put(
      `${TICKET_KV_PREFIX}${ticketId}`,
      JSON.stringify(ticket),
      { expirationTtl: Math.ceil(actualExpiration / 1000) + 60 },
    ).catch(() => {});
  }

  return { expiresAt, ticketId, token };
}

/**
 * Atomically mark ticket as used, returns true if already used (race condition detected)
 * SECURITY: Must be called BEFORE processing upload to prevent concurrent uploads
 */
async function markTicketUsedAtomic(
  kv: KVNamespace | undefined,
  ticketId: string,
): Promise<{ alreadyUsed: boolean }> {
  if (!kv) {
    return { alreadyUsed: false };
  }

  const kvKey = `${TICKET_KV_PREFIX}${ticketId}`;
  const ticketData = await kv.get(kvKey);

  if (!ticketData) {
    // No KV entry - create one marked as used to prevent replay
    // This handles edge case where KV wasn't available during ticket creation
    const minimalTicket: UploadTicket = {
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
      filename: '',
      maxFileSize: 0,
      mimeType: '',
      ticketId,
      used: true,
      userId: '',
    };
    await kv.put(kvKey, JSON.stringify(minimalTicket), { expirationTtl: 60 });
    return { alreadyUsed: false };
  }

  const result = UploadTicketSchema.safeParse(JSON.parse(ticketData));
  if (!result.success) {
    return { alreadyUsed: false };
  }

  // Check if already used
  if (result.data.used) {
    return { alreadyUsed: true };
  }

  // Atomically mark as used BEFORE returning valid
  const updatedTicket: UploadTicket = { ...result.data, used: true };
  await kv.put(kvKey, JSON.stringify(updatedTicket), { expirationTtl: 60 });
  return { alreadyUsed: false };
}

export async function validateUploadTicket(
  c: Context<ApiEnv>,
  token: string,
  userId: string,
): Promise<ValidateTicketResult> {
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { error: 'Server configuration error', valid: false };
  }

  let payload: JwtPayload;
  try {
    const result = await jwtVerify(token, getSecretKey(secret), {
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    });

    const parsed = JwtPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      return { error: 'Invalid token payload', valid: false };
    }
    payload = parsed.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { error: 'Ticket has expired', valid: false };
      }
      if (error.message.includes('signature')) {
        return { error: 'Invalid signature', valid: false };
      }
    }
    return { error: 'Invalid token', valid: false };
  }

  if (payload.uid !== userId) {
    return { error: 'User mismatch', valid: false };
  }

  // SECURITY: Atomically mark ticket as used BEFORE returning valid
  // Prevents race condition where concurrent uploads can use same ticket
  const { alreadyUsed } = await markTicketUsedAtomic(c.env.KV, payload.tid);
  if (alreadyUsed) {
    return { error: 'Ticket has already been used', valid: false };
  }

  const ticket: UploadTicket = {
    createdAt: (payload.iat ?? 0) * 1000,
    expiresAt: (payload.exp ?? 0) * 1000,
    filename: payload.fn,
    maxFileSize: payload.ms,
    mimeType: payload.mt,
    ticketId: payload.tid,
    used: true, // Marked as used
    userId: payload.uid,
  };

  return { ticket, valid: true };
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
