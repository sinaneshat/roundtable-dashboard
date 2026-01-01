/**
 * API Type Definitions
 *
 * Hono context environment types for the API layer.
 * These types define the shape of context bindings and variables.
 *
 * NOTE: User and Session types are inferred from Better Auth's type system.
 * StoragePurpose is derived from Zod schema in @/api/core/enums.
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import type { z } from 'zod';

import type { StoragePurposeSchema as storagePurposeSchema } from '@/api/core/enums';
import type { Session, User } from '@/lib/auth/types';

// ============================================================================
// INFERRED TYPES
// ============================================================================

/**
 * Storage purpose - inferred from Zod schema
 * Single source of truth: @/api/core/enums
 */
export type StoragePurpose = z.infer<typeof storagePurposeSchema>;

// ============================================================================
// HONO CONTEXT ENVIRONMENT
// ============================================================================

/**
 * Hono API environment type
 * Defines bindings (CloudflareEnv) and context variables
 *
 * CloudflareEnv is globally available from cloudflare-env.d.ts
 */
export type ApiEnv = {
  Bindings: CloudflareEnv;
  Variables: {
    session?: Session | null;
    user?: User | null;
    apiKey?: string | undefined;
    requestId?: string;
    storageKey?: string;
    storagePurpose?: StoragePurpose | null;
    storageMethod?: string;
    fileContentType?: string;
    fileSize?: number;
  };
};

/**
 * Authenticated context with guaranteed user and session
 *
 * Use this type when you know auth middleware has run and user exists.
 * Returned by HandlerContext.auth() helper in createHandler factory.
 *
 * @example
 * ```typescript
 * export const handler = createHandler(
 *   { auth: 'session' },
 *   async (c) => {
 *     const { user, session } = c.auth(); // Type: AuthenticatedContext
 *     // user and session guaranteed non-null
 *   }
 * );
 * ```
 */
export type AuthenticatedContext = {
  user: User;
  session: Session;
  requestId: string;
};
