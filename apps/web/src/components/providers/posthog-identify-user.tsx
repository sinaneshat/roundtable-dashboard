/**
 * PostHog User Identifier Component
 *
 * Wrapper component that calls usePostHogIdentify hook.
 * Must be inside PostHogProvider to access PostHog instance.
 *
 * Location: /src/components/providers/posthog-identify-user.tsx
 */

import { usePostHogIdentify } from '@/hooks/utils/use-posthog-identify';

/**
 * Component that identifies users to PostHog when they authenticate
 */
export function PostHogIdentifyUser() {
  usePostHogIdentify();
  return null;
}
