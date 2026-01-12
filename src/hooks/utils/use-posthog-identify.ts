/**
 * PostHog User Identification Hook
 *
 * Automatically identifies users to PostHog when they authenticate.
 * Resets identification when users sign out.
 *
 * CRITICAL: Required for `person_profiles: 'identified_only'` mode.
 * Without this, all user events are lost (not associated with any person).
 *
 * Location: /src/hooks/utils/use-posthog-identify.ts
 */

'use client';

import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

import { useSession } from '@/lib/auth/client';

/**
 * Hook that automatically identifies users to PostHog based on session state
 *
 * Behavior:
 * - On authentication: Calls posthog.identify(userId, properties)
 * - On sign-out: Calls posthog.reset()
 * - Idempotent: Won't re-identify if user hasn't changed
 *
 * @example
 * ```typescript
 * // In PostHogProvider or root component:
 * function App() {
 *   usePostHogIdentify();
 *   return <YourApp />;
 * }
 * ```
 */
export function usePostHogIdentify() {
  const posthog = usePostHog();
  const { data: session } = useSession();
  const lastIdentifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Skip if PostHog is not initialized
    if (!posthog)
      return;

    const userId = session?.user?.id;

    // Case 1: User is authenticated and hasn't been identified yet
    // @see https://posthog.com/docs/product-analytics/identify
    if (userId && lastIdentifiedUserId.current !== userId) {
      posthog.identify(userId, {
        // $set: Properties that update on every identify call
        $set: {
          email: session.user.email,
          name: session.user.name,
        },
        // $set_once: Properties that should only be set on first identification
        ...(session.user.createdAt && {
          $set_once: {
            created_at: new Date(session.user.createdAt).toISOString(),
          },
        }),
      });
      lastIdentifiedUserId.current = userId;
      return;
    }

    // Case 2: User signed out (was identified, now no userId)
    if (!userId && lastIdentifiedUserId.current !== null) {
      posthog.reset();
      lastIdentifiedUserId.current = null;
    }
  }, [posthog, session]);
}
