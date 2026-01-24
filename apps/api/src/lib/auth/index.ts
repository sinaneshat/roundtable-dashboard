/**
 * Auth module re-exports for convenience
 * Provides a unified interface for auth functionality
 */

// Client exports
export { authClient } from './client';

// Server exports (for server-side only)
export { auth } from './server';

// Centralized types - single source of truth
export type {
  Session,
  SessionData,
  User,
} from './types';

// Utility exports
export type { AdminUser } from './utils';
export { extractSessionToken, requireAdmin } from './utils';
