/**
 * Email constants and validation patterns
 * Centralized configuration for email validation and processing
 */

/**
 * RFC 5322 compliant email validation regex
 * Handles most real-world email formats
 */
export const EMAIL_REGEX = /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

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
  FROM_ADDRESS: 'noreply@roundtable.now',
  FROM_NAME: 'Roundtable',
  REPLY_TO: 'support@roundtable.now',
  AWS_REGION: 'eu-north-1',
} as const;

/**
 * Email expiration times for various purposes
 */
export const EMAIL_EXPIRATION_TIMES = {
  MAGIC_LINK: '10 minutes',
  EMAIL_VERIFICATION: '24 hours',
  ACCOUNT_DELETION: '24 hours',
  PASSWORD_RESET: '1 hour',
  INVITATION: '7 days',
} as const;
