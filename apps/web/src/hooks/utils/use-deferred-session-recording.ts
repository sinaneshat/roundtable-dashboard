import { usePostHog } from 'posthog-js/react';
import { useCallback, useRef } from 'react';

/**
 * Hook for deferred PostHog session recording and heavy feature activation
 *
 * Heavy features are disabled on initial load for performance:
 * - Session recording
 * - Heatmaps
 * - Dead click detection
 *
 * Use this hook to enable these features after meaningful user interaction.
 *
 * Integration points:
 * - First chat message submission
 * - First form interaction
 * - User scrolls past fold
 * - After sign-in flow completes
 *
 * @example
 * ```tsx
 * function ChatInput() {
 *   const { enableSessionRecording } = useDeferredSessionRecording();
 *
 *   const handleSubmit = () => {
 *     enableSessionRecording(); // Start recording on first interaction
 *     // ... submit logic
 *   };
 * }
 * ```
 */
export function useDeferredSessionRecording() {
  const posthog = usePostHog();
  const hasEnabled = useRef(false);

  const enableSessionRecording = useCallback(() => {
    if (!posthog || hasEnabled.current)
      return;
    hasEnabled.current = true;

    // Start session recording
    posthog.startSessionRecording();

    // Enable additional heavy features that were disabled on load
    // These are now safe to enable since user is actively engaged
    posthog.set_config({
      capture_heatmaps: true,
      capture_dead_clicks: true,
    });
  }, [posthog]);

  return { enableSessionRecording };
}
