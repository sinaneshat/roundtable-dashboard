'use client';

import { useSyncExternalStore } from 'react';

/**
 * Custom hook that tracks the current pathname reactively, including changes
 * from `window.history.replaceState()` and `window.history.pushState()`.
 *
 * Unlike Next.js's `usePathname()`, this hook reacts to URL changes made via
 * the History API directly (not just Next.js navigation).
 *
 * @example
 * const pathname = useCurrentPathname();
 * // Updates when URL changes via history.replaceState/pushState
 */

// Store subscribers for URL changes
const subscribers = new Set<() => void>();

// Track if we've already patched the history methods
let isPatched = false;

/**
 * Patch history methods to notify subscribers on URL changes.
 * This runs once on first subscription and persists for the app lifetime.
 */
function patchHistoryMethods() {
  if (typeof window === 'undefined' || isPatched)
    return;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function (...args: Parameters<typeof originalPushState>) {
    const result = originalPushState(...args);
    notifySubscribers();
    return result;
  };

  window.history.replaceState = function (...args: Parameters<typeof originalReplaceState>) {
    const result = originalReplaceState(...args);
    notifySubscribers();
    return result;
  };

  // Also listen for popstate (back/forward navigation)
  window.addEventListener('popstate', notifySubscribers);

  isPatched = true;
}

/**
 * Notify all subscribers that the URL has changed
 */
function notifySubscribers() {
  subscribers.forEach(callback => callback());
}

/**
 * Subscribe to URL changes
 */
function subscribe(callback: () => void): () => void {
  // Patch history methods on first subscription
  patchHistoryMethods();

  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Get the current pathname (client-side)
 */
function getSnapshot(): string {
  if (typeof window === 'undefined')
    return '';
  return window.location.pathname;
}

/**
 * Get the pathname for server-side rendering
 */
function getServerSnapshot(): string {
  return '';
}

/**
 * Hook that returns the current pathname and reacts to all URL changes,
 * including those made via history.replaceState() and history.pushState().
 *
 * This solves the issue where Next.js's usePathname() doesn't update when
 * the URL is changed via the History API directly.
 */
export function useCurrentPathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
