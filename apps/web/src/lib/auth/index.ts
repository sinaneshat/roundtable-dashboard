/**
 * Auth module re-exports for convenience
 * Provides a unified interface for auth functionality
 *
 * Note: Server-side auth is handled by the API. The web app uses:
 * - authClient for client-side auth operations
 * - server/auth.ts server functions for SSR session validation
 */

// Client exports
export { authClient } from './client';

// Session cache exports
export { clearCachedSession } from './session-cache';

// Centralized types - single source of truth
export type {
  Session,
  SessionData,
  User,
} from './types';

// Utility exports
export { clearAllAuthCaches, extractSessionToken } from './utils';
