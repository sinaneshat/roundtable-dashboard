import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

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
 * React 19: Valid effect for timer (external system)
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

  useEffect(() => {
    if (!enabled)
      return;

    if (countdown <= 0) {
      onComplete?.();
      router.replace(redirectPath);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, enabled, router, redirectPath, onComplete]);

  return { countdown, setCountdown };
}
