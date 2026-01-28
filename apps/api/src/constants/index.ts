/**
 * API Constants Index
 *
 * Re-exports shared constants from @roundtable/shared.
 * Platform-specific constants (version, brand) are defined locally.
 */

// Shared constants from @roundtable/shared
export type { Limits, ProjectLimits } from '@roundtable/shared';
export { API, LIMITS, PROJECT_LIMITS } from '@roundtable/shared';
export {
  DISPOSABLE_EMAIL_DOMAINS,
  EMAIL_EXPIRATION_TIMES,
  EMAIL_REGEX,
  EMAIL_SERVICE_CONFIG,
  FREE_EMAIL_PROVIDERS,
  MAX_EMAIL_LENGTH,
  MAX_EMAIL_LOCAL_LENGTH,
  PROBLEMATIC_EMAIL_CHARS,
} from '@roundtable/shared';

// Platform-specific exports
export * from './brand';
export * from './version';
