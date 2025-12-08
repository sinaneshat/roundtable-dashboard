import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useState } from 'react';

export type UseCountdownRedirectOptions = {
  /** Whether to start the countdown (e.g., !isLoading, isReady) */
  enabled: boolean;
  /** Initial countdown value in seconds */
  initialCount?: number;
  /** Path to redirect to when countdown reaches 0 */
  redirectPath?: string;
  /** Optional callback before redirect */
  onComplete?: () => void;
};

export type UseCountdownRedirectReturn = {
  /** Current countdown value */
  countdown: number;
  /** Manually set countdown (e.g., to reset) */
  setCountdown: React.Dispatch<React.SetStateAction<number>>;
};

/**
 * Hook for countdown timer with automatic redirect
 * ✅ REACT 19: Uses useEffectEvent for stable redirect handler
 *
 * @example
 * ```tsx
 * const { countdown } = useCountdownRedirect({
 *   enabled: isReady,
 *   redirectPath: '/chat',
 * });
 *
 * return <p>Redirecting in {countdown} seconds...</p>;
 * ```
 */
export function useCountdownRedirect({
  enabled,
  initialCount = 10,
  redirectPath = '/chat',
  onComplete,
}: UseCountdownRedirectOptions): UseCountdownRedirectReturn {
  const router = useRouter();
  const [countdown, setCountdown] = useState(initialCount);

  // ✅ REACT 19: useEffectEvent automatically captures latest onComplete and redirectPath
  // without causing the timer effect to re-run when these values change
  const handleRedirect = useEffectEvent(() => {
    onComplete?.();
    router.replace(redirectPath);
  });

  // ✅ REACT 19: Timer effect only depends on `enabled`
  // handleRedirect from useEffectEvent is stable and non-reactive
  useEffect(() => {
    if (!enabled)
      return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Schedule redirect after state update
          queueMicrotask(handleRedirect);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled]);

  return { countdown, setCountdown };
}
