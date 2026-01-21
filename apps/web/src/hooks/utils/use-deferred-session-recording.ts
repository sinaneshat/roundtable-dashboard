import { usePostHog } from 'posthog-js/react';
import { useCallback, useRef } from 'react';

/**
 * Hook for deferred PostHog session recording
 *
 * Session recording is disabled on initial load for performance.
 * Use this hook to enable recording after meaningful user interaction.
 *
 * Integration points:
 * - First chat message submission
 * - First form interaction
 * - User scrolls past fold
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
    posthog.startSessionRecording();
  }, [posthog]);

  return { enableSessionRecording };
}
