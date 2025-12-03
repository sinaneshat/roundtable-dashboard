/**
 * Upload Ticket Service
 *
 * Generates and validates secure, time-limited upload tickets.
 * This follows the S3 presigned URL pattern but is implemented using HMAC signing
 * since R2 Worker bindings don't directly support presigned PUT URLs.
 *
 * Security features:
 * - HMAC-SHA256 signature prevents ticket tampering
 * - Short expiration (5 minutes) limits attack window
 * - User binding ensures only the requesting user can use the ticket
 * - One-time use prevents replay attacks
 *
 * Flow:
 * 1. Client requests upload ticket (authenticated)
 * 2. Server generates ticket with signed token
 * 3. Client uploads to ticket endpoint with token
 * 4. Server validates token before accepting upload
 */

import type { Context } from 'hono';
import { z } from 'zod';

import type { ApiEnv } from '@/api/types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default ticket expiration (5 minutes) */
export const DEFAULT_TICKET_EXPIRATION_MS = 5 * 60 * 1000;

/** Maximum ticket expiration (15 minutes) */
export const MAX_TICKET_EXPIRATION_MS = 15 * 60 * 1000;

/** KV key prefix for upload tickets */
const TICKET_KV_PREFIX = 'upload-ticket:';

/**
 * In-memory ticket store for local development when KV is not available
 * This is a fallback for local dev mode only - production uses KV
 */
const localTicketStore = new Map<string, { data: string; expiresAt: number }>();

/**
 * Clean up expired tickets from local store
 * Exported for testing and manual cleanup in local development
 */
export function cleanupExpiredLocalTickets(): void {
  const now = Date.now();
  for (const [key, value] of localTicketStore.entries()) {
    if (value.expiresAt < now) {
      localTicketStore.delete(key);
    }
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Upload ticket schema with Zod validation
 * ✅ FOLLOWS: 5-part enum pattern from /docs/type-inference-patterns.md
 */
export const UploadTicketSchema = z.object({
  /** Unique ticket ID */
  ticketId: z.string(),
  /** User who requested the ticket */
  userId: z.string(),
  /** Expected filename */
  filename: z.string(),
  /** Expected MIME type */
  mimeType: z.string(),
  /** Maximum allowed file size */
  maxFileSize: z.number(),
  /** Expiration timestamp (Unix ms) */
  expiresAt: z.number(),
  /** Whether ticket has been used */
  used: z.boolean(),
  /** Created timestamp */
  createdAt: z.number(),
});

/** Upload ticket type inferred from schema */
export type UploadTicket = z.infer<typeof UploadTicketSchema>;

/**
 * Type guard: Check if value is a valid UploadTicket
 */
export function isUploadTicket(value: unknown): value is UploadTicket {
  return UploadTicketSchema.safeParse(value).success;
}

/**
 * Safely parse upload ticket from unknown data
 * @returns Parsed ticket or null if invalid
 */
function parseUploadTicket(data: unknown): UploadTicket | null {
  const result = UploadTicketSchema.safeParse(data);
  return result.success ? result.data : null;
}

export const CreateTicketOptionsSchema = z.object({
  userId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  maxFileSize: z.number(),
  expirationMs: z.number().optional(),
});

export type CreateTicketOptions = z.infer<typeof CreateTicketOptionsSchema>;

/**
 * Validate ticket result - discriminated union
 */
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

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

/**
 * Generate HMAC-SHA256 signature for ticket
 */
async function generateTicketSignature(
  secret: string,
  ticketId: string,
  userId: string,
  expiresAt: number,
): Promise<string> {
  const payload = [ticketId, userId, expiresAt.toString()].join(':');

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const payloadData = encoder.encode(payload);
  const signature = await crypto.subtle.sign('HMAC', key, payloadData);

  // Convert to URL-safe base64
  const signatureArray = new Uint8Array(signature);
  const base64 = btoa(String.fromCharCode(...signatureArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify ticket signature
 */
async function verifyTicketSignature(
  secret: string,
  ticketId: string,
  userId: string,
  expiresAt: number,
  providedSignature: string,
): Promise<boolean> {
  const expectedSignature = await generateTicketSignature(secret, ticketId, userId, expiresAt);
  return expectedSignature === providedSignature;
}

// ============================================================================
// TICKET MANAGEMENT
// ============================================================================

/**
 * Generate a unique ticket ID
 */
function generateTicketId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(16));
  const randomStr = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `tkt_${timestamp}_${randomStr}`;
}

/**
 * Create an upload ticket
 *
 * Returns a ticket token that the client must include in the upload request.
 * The ticket is stored in KV for validation.
 */
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

  // Get signing secret
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('BETTER_AUTH_SECRET not configured');
  }

  // Generate ticket
  const ticketId = generateTicketId();
  const expiresAt = Date.now() + Math.min(expirationMs, MAX_TICKET_EXPIRATION_MS);

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

  // Store ticket in KV with TTL (or local fallback for dev)
  const kv = c.env.KV;
  if (kv) {
    await kv.put(
      `${TICKET_KV_PREFIX}${ticketId}`,
      JSON.stringify(ticket),
      { expirationTtl: Math.ceil(expirationMs / 1000) + 60 }, // Add 60s buffer
    );
  } else {
    // Local dev fallback: store in memory
    cleanupExpiredLocalTickets();
    localTicketStore.set(`${TICKET_KV_PREFIX}${ticketId}`, {
      data: JSON.stringify(ticket),
      expiresAt,
    });
  }

  // Generate signed token
  const signature = await generateTicketSignature(secret, ticketId, userId, expiresAt);
  const token = `${ticketId}.${expiresAt}.${signature}`;

  return { ticketId, token, expiresAt };
}

/**
 * Validate an upload ticket token
 *
 * Checks:
 * 1. Token format is valid
 * 2. Signature is valid
 * 3. Token hasn't expired
 * 4. Ticket exists in KV and hasn't been used
 * 5. User matches the ticket owner
 */
export async function validateUploadTicket(
  c: Context<ApiEnv>,
  token: string,
  userId: string,
): Promise<ValidateTicketResult> {
  // Get signing secret
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) {
    return { valid: false, error: 'Server configuration error' };
  }

  // Parse token (format: ticketId.expiresAt.signature)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' };
  }

  // Extract parts with explicit validation (TypeScript needs this after split)
  const ticketId = parts[0];
  const expiresAtStr = parts[1];
  const signature = parts[2];

  if (!ticketId || !expiresAtStr || !signature) {
    return { valid: false, error: 'Invalid token format' };
  }

  const expiresAt = Number.parseInt(expiresAtStr, 10);

  if (Number.isNaN(expiresAt)) {
    return { valid: false, error: 'Invalid expiration format' };
  }

  // Check expiration
  if (Date.now() > expiresAt) {
    return { valid: false, error: 'Ticket has expired' };
  }

  // Verify signature
  const isValid = await verifyTicketSignature(secret, ticketId, userId, expiresAt, signature);
  if (!isValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Get ticket from KV (or local fallback for dev)
  const kv = c.env.KV;
  let ticketData: string | null = null;

  if (kv) {
    ticketData = await kv.get(`${TICKET_KV_PREFIX}${ticketId}`);
  } else {
    // Local dev fallback: read from memory
    cleanupExpiredLocalTickets();
    const localEntry = localTicketStore.get(`${TICKET_KV_PREFIX}${ticketId}`);
    ticketData = localEntry?.data ?? null;
  }

  if (!ticketData) {
    return { valid: false, error: 'Ticket not found or expired' };
  }

  // ✅ TYPE-SAFE: Use Zod validation instead of force casting
  const ticket = parseUploadTicket(JSON.parse(ticketData));
  if (!ticket) {
    return { valid: false, error: 'Invalid ticket data format' };
  }

  // Check if already used
  if (ticket.used) {
    return { valid: false, error: 'Ticket has already been used' };
  }

  // Verify user matches
  if (ticket.userId !== userId) {
    return { valid: false, error: 'User mismatch' };
  }

  return { valid: true, ticket };
}

/**
 * Mark a ticket as used
 *
 * Called after successful upload to prevent replay attacks.
 */
export async function markTicketUsed(
  c: Context<ApiEnv>,
  ticketId: string,
): Promise<void> {
  const kv = c.env.KV;
  const kvKey = `${TICKET_KV_PREFIX}${ticketId}`;
  let ticketData: string | null = null;

  if (kv) {
    ticketData = await kv.get(kvKey);
  } else {
    // Local dev fallback
    const localEntry = localTicketStore.get(kvKey);
    ticketData = localEntry?.data ?? null;
  }

  if (!ticketData) {
    return;
  }

  // ✅ TYPE-SAFE: Use Zod validation instead of force casting
  const ticket = parseUploadTicket(JSON.parse(ticketData));
  if (!ticket) {
    return;
  }

  const updatedTicket: UploadTicket = {
    ...ticket,
    used: true,
  };

  if (kv) {
    // Update with short TTL (cleanup)
    await kv.put(kvKey, JSON.stringify(updatedTicket), {
      expirationTtl: 60, // Keep for 1 minute for debugging
    });
  } else {
    // Local dev fallback: update in memory with short expiry
    localTicketStore.set(kvKey, {
      data: JSON.stringify(updatedTicket),
      expiresAt: Date.now() + 60 * 1000,
    });
  }
}

/**
 * Delete a ticket (cleanup on failure)
 */
export async function deleteTicket(
  c: Context<ApiEnv>,
  ticketId: string,
): Promise<void> {
  const kv = c.env.KV;
  const kvKey = `${TICKET_KV_PREFIX}${ticketId}`;

  if (kv) {
    await kv.delete(kvKey);
  } else {
    // Local dev fallback
    localTicketStore.delete(kvKey);
  }
}
