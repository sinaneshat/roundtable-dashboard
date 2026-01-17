/**
 * Navigation Hooks
 *
 * TanStack Router-based navigation utilities.
 */

import { useLocation, useNavigate, useSearch } from '@tanstack/react-router';

/**
 * Router hook with push, replace, back, forward, refresh methods
 */
export function useRouter() {
  const navigate = useNavigate();

  return {
    push: (href: string) => navigate({ to: href }),
    replace: (href: string) => navigate({ to: href, replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: (_href: string) => {
      // TanStack Router handles prefetching automatically with preload
    },
  };
}

/**
 * Get current pathname
 */
export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

/**
 * Search params hook with get, getAll, has, toString methods
 */
export function useSearchParams() {
  const search = useSearch({ strict: false });

  return {
    get: (key: string) => {
      const value = (search as Record<string, unknown>)?.[key];
      return value !== undefined ? String(value) : null;
    },
    getAll: (key: string) => {
      const value = (search as Record<string, unknown>)?.[key];
      if (Array.isArray(value)) {
        return value.map(String);
      }
      return value !== undefined ? [String(value)] : [];
    },
    has: (key: string) => {
      return key in (search as Record<string, unknown> || {});
    },
    toString: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(search as Record<string, unknown> || {})) {
        if (value !== undefined) {
          params.set(key, String(value));
        }
      }
      return params.toString();
    },
  };
}

/**
 * Client-side redirect for external URLs (event handlers only)
 * For internal route navigation, use useNavigate() hook instead.
 * For route-level redirects, use TanStack Router's redirect() in beforeLoad.
 */
export function redirect(url: string): never {
  // Intentional use of window.location.href for external redirects
  window.location.href = url;
  throw new Error('Redirect');
}
