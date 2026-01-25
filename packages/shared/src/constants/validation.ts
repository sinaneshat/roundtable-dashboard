/**
 * Validation constants and patterns
 * Used across the application for consistent validation rules
 */

// =============================================================================
// REGEX PATTERNS
// =============================================================================

export const REGEX_PATTERNS = {
  // Alphanumeric with hyphens (for slugs)
  SLUG: /^[a-z0-9-]+$/,

  // Username with underscores and hyphens - matches drizzle-zod-factory pattern
  USERNAME: /^[a-z0-9_-]+$/,

  // Phone number (international format) - Fixed regex with dash at end
  PHONE: /^\+?[\d\s()-]+$/,
};

// =============================================================================
// NUMERIC LIMITS
// =============================================================================

export const NUMERIC_LIMITS = {
  // Pagination
  PAGE_MIN: 1,
  PAGE_SIZE_MIN: 1,
  PAGE_SIZE_MAX: 100,
  PAGE_SIZE_DEFAULT: 20,

  // General numeric constraints
  TIMEOUT_MIN: 1000,
  TIMEOUT_MAX: 30000,
  TIMEOUT_DEFAULT: 5000,

  // File size limits (in bytes)
  FILE_SIZE_MAX: 10 * 1024 * 1024, // 10MB
  AVATAR_SIZE_MAX: 2 * 1024 * 1024, // 2MB

  // Rate limiting
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX: 100,
};

// =============================================================================
// STRING LIMITS
// =============================================================================

export const STRING_LIMITS = {
  // Names and identifiers
  NAME_MIN: 1,
  NAME_MAX: 100,
  DISPLAY_NAME_MIN: 2,

  // Email
  EMAIL_MAX: 255,

  // Username
  USERNAME_MIN: 3,
  USERNAME_MAX: 50,

  // Organization slug
  SLUG_MIN: 3,
  SLUG_MAX: 50,

  // Descriptions and content
  DESCRIPTION_MAX: 1000,
  BIO_MAX: 500,

  // Chat message limits - MUST match backend MessageContentSchema
  // 100k chars (~25k tokens) - 4x more generous than ChatGPT's ~25k char limit
  // Supports large documents, code blocks, detailed prompts
  // Claude/GPT-4o context windows: 128k-200k tokens, so 100k chars is well within limits
  MESSAGE_MIN: 1,
  MESSAGE_MAX: 100_000,

  // URLs
  URL_MAX: 2048,

  // Thread/Project Title limits (unified)
  TITLE_MIN: 1,
  TITLE_MAX: 200,

  // Project-specific fields
  PROJECT_NAME_MIN: 1,
  PROJECT_NAME_MAX: 200,
  PROJECT_DESCRIPTION_MAX: 400,
  CUSTOM_INSTRUCTIONS_MAX: 4000,

  // Role names (custom-role-form.tsx)
  ROLE_NAME_MIN: 1,
  ROLE_NAME_MAX: 100,

  // Chat titles (chat-rename-form.tsx)
  CHAT_TITLE_MIN: 1,
  CHAT_TITLE_MAX: 255,

  // Feedback messages (feedback-modal.tsx)
  FEEDBACK_MESSAGE_MIN: 10,
};

// =============================================================================
// TIME LIMITS
// =============================================================================

export const TIME_LIMITS = {
  // Session timeouts
  SESSION_TIMEOUT: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Token expiration
  INVITATION_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
  RESET_TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours

  // API timeouts
  API_TIMEOUT: 30 * 1000, // 30 seconds
  DATABASE_TIMEOUT: 10 * 1000, // 10 seconds
};

// =============================================================================
// API LIMITS
// =============================================================================

export const API_LIMITS = {
  // Request size limits
  REQUEST_SIZE_MAX: 10 * 1024 * 1024, // 10MB
  JSON_BODY_MAX: 1024 * 1024, // 1MB

  // Batch operation limits
  BATCH_SIZE_MAX: 100,
  BULK_INVITE_MAX: 50,

  // Rate limiting per endpoint
  AUTH_RATE_LIMIT: 10,
  API_RATE_LIMIT: 100,
  UPLOAD_RATE_LIMIT: 5,
};
