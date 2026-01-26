/**
 * Email constants and validation patterns
 * Centralized configuration for email validation and processing
 */

/**
 * Email validation regex - simplified to avoid ReDoS vulnerability
 * Uses a practical pattern that catches most invalid emails without exponential backtracking
 * For full RFC 5322 compliance, use a library like email-validator
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

/**
 * Maximum allowed email length per RFC 5321
 */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Maximum allowed local part length (before @)
 */
export const MAX_EMAIL_LOCAL_LENGTH = 64;

/**
 * Common disposable email domains to block for billing
 * These are temporary email services that should not be used for accounts
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com',
  'throwaway.email',
  'guerrillamail.com',
  'mailinator.com',
  '10minutemail.com',
  'trashmail.com',
  'yopmail.com',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
  'guerrillamailblock.com',
]);

/**
 * Free email providers that may require additional verification
 */
export const FREE_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'protonmail.com',
  'yandex.com',
  'zoho.com',
];

/**
 * Problematic characters for payment processors
 */
export const PROBLEMATIC_EMAIL_CHARS = ['<', '>', '"', '\\', '|'];

/**
 * Email service configuration constants
 */
export const EMAIL_SERVICE_CONFIG = {
  AWS_REGION: 'eu-north-1',
  FROM_ADDRESS: 'noreply@roundtable.now',
  FROM_NAME: 'Roundtable',
  REPLY_TO: 'support@roundtable.now',
} as const;

/**
 * Email expiration times for various purposes
 */
export const EMAIL_EXPIRATION_TIMES = {
  ACCOUNT_DELETION: '24 hours',
  EMAIL_VERIFICATION: '24 hours',
  INVITATION: '7 days',
  MAGIC_LINK: '10 minutes',
  PASSWORD_RESET: '1 hour',
} as const;
