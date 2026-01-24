/**
 * Account Abuse Prevention Configuration
 *
 * ✅ SINGLE SOURCE OF TRUTH: Limits for account deletion/recreation abuse
 * ✅ CLIENT-SAFE: No server-only dependencies
 */

export const ACCOUNT_ABUSE_CONFIG = {
  MAX_DELETION_COUNT: 3,
  ERROR_MESSAGE: 'You have been deleting and creating new accounts too many times. Use a different email or contact support@roundtable.chat',
} as const;
