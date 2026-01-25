/**
 * System Runtime Constants
 * Retry limits, timeouts, and other system-level constants
 */
export const RETRY_LIMITS = {
  /** Max 202 polling retries for moderator trigger */
  MAX_202_RETRIES: 5,
  /** Max handoff resets before force clearing stuck state */
  MAX_HANDOFF_RESETS: 3,
  /** Max renders before detecting infinite loop */
  MAX_RENDERS_BEFORE_LOOP: 50,
} as const;
