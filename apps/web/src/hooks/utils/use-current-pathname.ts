import { useSyncExternalStore } from 'react';

/**
 * Custom hook that tracks the current pathname reactively, including changes
 * from `window.history.replaceState()` and `window.history.pushState()`.
 *
 * This hook reacts to URL changes made via the History API directly,
 * complementing TanStack Router's navigation hooks.
 *
 * @example
 * const pathname = useCurrentPathname();
 * // Updates when URL changes via history.replaceState/pushState
 */

// ============================================================================
// SINGLETON PATTERN - App-lifetime global state (intentional, not a memory leak)
// ============================================================================
// This module patches window.history methods once and persists for the app lifetime.
// The popstate listener is never removed because URL tracking must remain active
// as long as the application is running. Individual component subscriptions are
// properly cleaned up via the subscribe() return function.
// ============================================================================

const subscribers = new Set<() => void>();
let isPatched = false;

/**
 * Patch history methods once per app lifetime to notify subscribers on URL changes.
 * The patches and popstate listener persist intentionally - they're cleaned up
 * when the browser tab closes, not when individual components unmount.
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

  // Popstate listener persists for app lifetime (back/forward navigation)
  window.addEventListener('popstate', notifySubscribers);
  isPatched = true;
}

/**
 * Notify all subscribers that the URL has changed
 *
 * ✅ BUG FIX: Defer notification to next microtask to avoid triggering
 * React state updates during useInsertionEffect. Synchronous updates during
 * insertion effects cause the error: "useInsertionEffect must not schedule updates"
 */
function notifySubscribers() {
  queueMicrotask(() => {
    subscribers.forEach(callback => callback());
  });
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
 * Complements TanStack Router's useLocation() by also detecting
 * URL changes made via the History API directly.
 */
export function useCurrentPathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
