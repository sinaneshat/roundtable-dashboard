'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

/**
 * PostHog Pageview Tracker
 *
 * Tracks page navigation events in Next.js App Router.
 * Should be included in the root layout alongside PostHogProvider.
 *
 * Official PostHog pattern for manual pageview tracking:
 * - Captures pageviews on route changes
 * - Uses Next.js navigation hooks (usePathname, useSearchParams)
 * - Works with Next.js App Router
 *
 * Reference: https://posthog.com/docs/libraries/next-js
 * Pattern: src/components/providers/posthog-pageview.tsx
 */
export function PostHogPageview(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    // Track pageview when pathname or search params change
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams && searchParams.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }

      // Capture pageview with the full URL
      posthog.capture('$pageview', {
        $current_url: url,
      });
    }
  }, [pathname, searchParams, posthog]);

  return null;
}
