/**
 * Auth Types - Single Source of Truth
 *
 * Following Better Auth official documentation patterns.
 * All authentication-related types are defined here to avoid duplication
 * across the codebase. Import from this file rather than inferring types
 * directly from the auth instance.
 */

import type { auth } from './server';

// Core Better Auth inferred types - following official docs
export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;

/**
 * Full session data returned by Better Auth's getSession()
 * Contains both session metadata and user information
 */
export type SessionData = {
  session: Session;
  user: User;
};
