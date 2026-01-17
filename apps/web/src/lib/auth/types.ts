/**
 * Auth Types - Single Source of Truth
 *
 * Following Better Auth official documentation patterns.
 * All authentication-related types are defined here to avoid duplication
 * across the codebase.
 *
 * Note: These types mirror the API's Better Auth types. Since auth is
 * handled by the API server, we define the types manually here to avoid
 * cross-package dependencies.
 */

// Core Better Auth types - matches API's auth schema
export type User = {
  id: string;
  email?: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Full session data returned by Better Auth's getSession()
 * Contains both session metadata and user information
 */
export type SessionData = {
  session: Session;
  user: User;
};
