/**
 * Upload Ticket Service
 *
 * Generates and validates secure, time-limited upload tickets using JWT.
 * Uses the `jose` library for cryptographic operations (high popularity, Cloudflare Workers compatible).
 *
 * Design: Self-contained JWT tokens that don't require KV lookup for validation.
 * This handles Cloudflare KV's eventual consistency across edge locations.
 *
 * Security features:
 * - JWT with HS256 signature prevents ticket tampering
 * - Short expiration (5 minutes) limits attack window
 * - User binding ensures only the requesting user can use the ticket
 * - KV-based replay prevention (best-effort due to eventual consistency)
 *
 * Flow:
 * 1. Client requests upload ticket (authenticated)
 * 2. Server generates JWT containing all validation data
 * 3. Client uploads to ticket endpoint with JWT token
 * 4. Server validates JWT (no KV lookup needed for core validation)
 * 5. KV is checked for replay prevention (best-effort)
 */

import type { Context } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
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

/** JWT issuer for upload tickets */
const JWT_ISSUER = 'roundtable:upload-ticket';

/** JWT audience for upload tickets */
const JWT_AUDIENCE = 'roundtable:upload';

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

/**
 * JWT payload schema for upload tickets
 * All data needed for validation is embedded in the JWT
 */
const JwtPayloadSchema = z.object({
  tid: z.string(), // ticketId
  uid: z.string(), // userId
  fn: z.string(), // filename
  mt: z.string(), // mimeType
  ms: z.number(), // maxFileSize
  iat: z.number().optional(), // issued at (added by jose)
  exp: z.number().optional(), // expiration (added by jose)
  iss: z.string().optional(), // issuer (added by jose)
  aud: z.union([z.string(), z.array(z.string())]).optional(), // audience (added by jose)
});

type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ============================================================================
// TICKET MANAGEMENT
// ============================================================================

/**
 * Generate a unique ticket ID
 */
function generateTicketId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.getRandomValues(new Uint8Array(8));
  const randomStr = Array.from(random)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `tkt_${timestamp}_${randomStr}`;
}

/**
 * Get secret key as Uint8Array for jose
 */
function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Create an upload ticket
 *
 * Returns a self-contained JWT token that includes all validation data.
 * This design handles Cloudflare KV's eventual consistency - the token
 * can be validated without KV lookup. KV is only used for replay prevention.
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
  const actualExpiration = Math.min(expirationMs, MAX_TICKET_EXPIRATION_MS);
  const expiresAt = Date.now() + actualExpiration;

  // Create self-contained JWT with all validation data
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
    .setExpirationTime(Math.floor(expiresAt / 1000)) // jose uses seconds
    .sign(getSecretKey(secret));

  // Store ticket in KV for replay prevention (best-effort, not required for validation)
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
    // Fire-and-forget KV write - don't block on eventual consistency
    kv.put(
      `${TICKET_KV_PREFIX}${ticketId}`,
      JSON.stringify(ticket),
      { expirationTtl: Math.ceil(actualExpiration / 1000) + 60 },
    ).catch(() => {
      // KV write failed - replay prevention won't work but upload will still function
      // This is expected during KV eventual consistency propagation
    });
  } else {
    // Local dev fallback: store in memory
    cleanupExpiredLocalTickets();
    localTicketStore.set(`${TICKET_KV_PREFIX}${ticketId}`, {
      data: JSON.stringify(ticket),
      expiresAt,
    });
  }

  return { ticketId, token, expiresAt };
}

/**
 * Validate an upload ticket token
 *
 * Self-contained validation using JWT - no KV lookup required for primary validation.
 * This handles Cloudflare KV's eventual consistency across edge locations.
 *
 * Checks:
 * 1. JWT signature is valid
 * 2. JWT hasn't expired (built into jose)
 * 3. Issuer and audience match
 * 4. User matches the token owner
 * 5. (Best-effort) Check KV for replay prevention
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

  // Verify JWT - jose handles signature verification and expiration
  let payload: JwtPayload;
  try {
    const result = await jwtVerify(token, getSecretKey(secret), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Validate payload structure
    const parsed = JwtPayloadSchema.safeParse(result.payload);
    if (!parsed.success) {
      return { valid: false, error: 'Invalid token payload' };
    }
    payload = parsed.data;
  } catch (error) {
    // jose throws specific errors for different failure modes
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

  // Verify user matches (user ID is signed in the JWT)
  if (payload.uid !== userId) {
    return { valid: false, error: 'User mismatch' };
  }

  // Build ticket from self-contained JWT data
  const ticket: UploadTicket = {
    ticketId: payload.tid,
    userId: payload.uid,
    filename: payload.fn,
    mimeType: payload.mt,
    maxFileSize: payload.ms,
    expiresAt: (payload.exp ?? 0) * 1000, // Convert back to milliseconds
    used: false,
    createdAt: (payload.iat ?? 0) * 1000,
  };

  // Best-effort replay prevention check via KV
  // If KV is unavailable or data hasn't propagated, we still allow the upload
  // The short token expiration (5 min) limits the replay attack window
  const kv = c.env.KV;
  if (kv) {
    const ticketData = await kv.get(`${TICKET_KV_PREFIX}${payload.tid}`);
    if (ticketData) {
      const storedTicket = parseUploadTicket(JSON.parse(ticketData));
      if (storedTicket?.used) {
        return { valid: false, error: 'Ticket has already been used' };
      }
    }
    // If ticketData is null, KV hasn't propagated yet - continue with validation
  } else {
    // Local dev fallback: check memory store
    cleanupExpiredLocalTickets();
    const localEntry = localTicketStore.get(`${TICKET_KV_PREFIX}${payload.tid}`);
    if (localEntry) {
      const storedTicket = parseUploadTicket(JSON.parse(localEntry.data));
      if (storedTicket?.used) {
        return { valid: false, error: 'Ticket has already been used' };
      }
    }
  }

  return { valid: true, ticket };
}

/**
 * Mark a ticket as used
 *
 * Called after successful upload to prevent replay attacks.
 * Best-effort due to KV eventual consistency.
 */
export async function markTicketUsed(
  c: Context<ApiEnv>,
  ticketId: string,
): Promise<void> {
  const kv = c.env.KV;
  const kvKey = `${TICKET_KV_PREFIX}${ticketId}`;

  if (kv) {
    const ticketData = await kv.get(kvKey);
    if (ticketData) {
      const ticket = parseUploadTicket(JSON.parse(ticketData));
      if (ticket) {
        const updatedTicket: UploadTicket = { ...ticket, used: true };
        await kv.put(kvKey, JSON.stringify(updatedTicket), {
          expirationTtl: 60, // Keep for 1 minute for debugging
        });
      }
    }
  } else {
    // Local dev fallback: update in memory
    const localEntry = localTicketStore.get(kvKey);
    if (localEntry) {
      const ticket = parseUploadTicket(JSON.parse(localEntry.data));
      if (ticket) {
        const updatedTicket: UploadTicket = { ...ticket, used: true };
        localTicketStore.set(kvKey, {
          data: JSON.stringify(updatedTicket),
          expiresAt: Date.now() + 60 * 1000,
        });
      }
    }
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
    localTicketStore.delete(kvKey);
  }
}
