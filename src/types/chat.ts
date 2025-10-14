/**
 * Chat Types - RPC-Inferred Types
 *
 * ✅ INFERRED FROM RPC: All types extracted from Hono RPC client responses
 * ✅ RUNTIME-CORRECT: Dates are ISO strings (after JSON serialization)
 *
 * These types represent the actual runtime shape of data from API responses,
 * not the database schema. Use these in frontend components.
 */

import type { ListCustomRolesResponse } from '@/services/api/chat-roles';
import type {
  GetPublicThreadResponse,
  GetThreadResponse,
} from '@/services/api/chat-threads';

// ============================================================================
// THREAD TYPES (Protected)
// ============================================================================

/**
 * Extract thread data from GetThread response
 * Dates are ISO strings after JSON serialization
 */
type ThreadResponseData = NonNullable<
  Extract<GetThreadResponse, { success: true }>['data']
>;

export type Thread = ThreadResponseData['thread'];
export type Participant = ThreadResponseData['participants'][number];
export type ChatMessage = ThreadResponseData['messages'][number];
export type Changelog = ThreadResponseData['changelog'][number];

// ============================================================================
// PUBLIC THREAD TYPES
// ============================================================================

/**
 * Extract public thread data from GetPublicThread response
 * Dates are ISO strings after JSON serialization
 */
type PublicThreadResponseData = NonNullable<
  Extract<GetPublicThreadResponse, { success: true }>['data']
>;

export type PublicThread = PublicThreadResponseData['thread'];
export type PublicParticipant = PublicThreadResponseData['participants'][number];
export type PublicChatMessage = PublicThreadResponseData['messages'][number];
export type PublicChangelog = PublicThreadResponseData['changelog'][number];

// ============================================================================
// CUSTOM ROLE TYPES
// ============================================================================

/**
 * Extract custom role data from ListCustomRoles response
 * Dates are ISO strings after JSON serialization
 */
type CustomRolesResponseData = NonNullable<
  Extract<ListCustomRolesResponse, { success: true }>['data']
>;

export type CustomRole = CustomRolesResponseData['items'][number];
