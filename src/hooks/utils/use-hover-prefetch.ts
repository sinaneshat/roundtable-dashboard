'use client';

import { useState } from 'react';

/**
 * useHoverPrefetch - Official Next.js hover-based prefetching pattern
 *
 * EXACT implementation from Next.js official documentation:
 * Source: https://nextjs.org/docs/app/guides/prefetching
 * Pattern: "Defer Link Prefetching Until Hover in Next.js"
 *
 * Official recommendation from Next.js docs:
 * "Use prefetch={false} for large link lists to avoid unnecessary usage of resources"
 *
 * This hook follows the EXACT pattern from official Next.js documentation with ZERO customizations.
 *
 * @param href - The route to prefetch (unused, kept for API compatibility)
 * @param options - Configuration options
 * @param options.enabled - Whether prefetching is enabled (default: true)
 * @returns Prefetch state and event handler for hover-based prefetching
 *
 * @example Official Next.js pattern
 * ```tsx
 * const { prefetch, onMouseEnter } = useHoverPrefetch('/chat/thread-123', {
 *   enabled: !isActive
 * });
 *
 * <Link href="/chat/thread-123" prefetch={prefetch} onMouseEnter={onMouseEnter}>
 *   Thread Title
 * </Link>
 * ```
 */
export function useHoverPrefetch(
  _href: string,
  options: {
    enabled?: boolean;
  } = {},
) {
  const { enabled = true } = options;

  // Official Next.js pattern: State to control prefetch prop
  // From docs: prefetch={active ? null : false}
  // - false: explicitly disabled
  // - null: default prefetch behavior (enabled)
  const [active, setActive] = useState(false);

  // Simple event handler - no debouncing, no refs, no complex logic
  // Exact pattern from official Next.js documentation
  const onMouseEnter = () => {
    if (enabled) {
      setActive(true);
    }
  };

  // Official docs pattern: prefetch={active ? null : false}
  // When active=true, use null (default behavior = prefetch enabled)
  // When active=false, use false (prefetch disabled)
  const prefetch = active ? null : false;

  return {
    prefetch,
    onMouseEnter,
  };
}
