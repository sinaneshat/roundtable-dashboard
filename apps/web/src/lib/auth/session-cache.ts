/**
 * Session Caching - Single source of truth for auth state
 *
 * Cached session on client to avoid server roundtrips during navigation.
 * Session is validated once on initial page load; subsequent navigations reuse cache.
 * Cookie validity is still enforced by the browser/Better Auth.
 */

import type { SessionData } from './index';

let cachedClientSession: SessionData | null = null;

export function getCachedSession(): SessionData | null {
  return cachedClientSession;
}

export function setCachedSession(session: SessionData | null): void {
  cachedClientSession = session;
}

export function clearCachedSession(): void {
  cachedClientSession = null;
}
