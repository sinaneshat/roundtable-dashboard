/**
 * PostHog Hooks Re-export
 *
 * Convenient re-export of PostHog hooks for consistent imports.
 * This provides a single import path for all PostHog functionality.
 *
 * Location: /src/hooks/utils/use-posthog.ts
 *
 * @example
 * ```typescript
 * import { usePostHog, useFeatureFlagEnabled } from '@/hooks';
 *
 * function MyComponent() {
 *   const posthog = usePostHog();
 *   const isNewFeatureEnabled = useFeatureFlagEnabled('new-feature');
 *   // ...
 * }
 * ```
 */

export {
  useActiveFeatureFlags,
  useFeatureFlagEnabled,
  useFeatureFlagPayload,
  useFeatureFlagVariantKey,
  usePostHog,
} from 'posthog-js/react';
