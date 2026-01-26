/**
 * Validation constants and patterns
 * Used across the application for consistent validation rules
 */

// =============================================================================
// REGEX PATTERNS
// =============================================================================

export const REGEX_PATTERNS = {
  // Phone number (international format) - Fixed regex with dash at end
  PHONE: /^\+?[\d\s()-]+$/,

  // Alphanumeric with hyphens (for slugs)
  SLUG: /^[a-z0-9-]+$/,

  // Username with underscores and hyphens - matches drizzle-zod-factory pattern
  USERNAME: /^[a-z0-9_-]+$/,
};

// =============================================================================
// NUMERIC LIMITS
// =============================================================================

export const NUMERIC_LIMITS = {
  AVATAR_SIZE_MAX: 2 * 1024 * 1024, // 2MB
  // File size limits (in bytes)
  FILE_SIZE_MAX: 10 * 1024 * 1024, // 10MB
  // Pagination
  PAGE_MIN: 1,
  PAGE_SIZE_DEFAULT: 20,

  PAGE_SIZE_MAX: 100,
  PAGE_SIZE_MIN: 1,
  RATE_LIMIT_MAX: 100,

  // Rate limiting
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute
  TIMEOUT_DEFAULT: 5000,

  TIMEOUT_MAX: 30000,
  // General numeric constraints
  TIMEOUT_MIN: 1000,
};

// =============================================================================
// STRING LIMITS
// =============================================================================

export const STRING_LIMITS = {
  BIO_MAX: 500,
  CHAT_TITLE_MAX: 255,
  // Chat titles (chat-rename-form.tsx)
  CHAT_TITLE_MIN: 1,

  CUSTOM_INSTRUCTIONS_MAX: 4000,

  // Descriptions and content
  DESCRIPTION_MAX: 1000,
  DISPLAY_NAME_MIN: 2,

  // Email
  EMAIL_MAX: 255,
  // Feedback messages (feedback-modal.tsx)
  FEEDBACK_MESSAGE_MIN: 10,

  MESSAGE_MAX: 100_000,
  // Chat message limits - MUST match backend MessageContentSchema
  // 100k chars (~25k tokens) - 4x more generous than ChatGPT's ~25k char limit
  // Supports large documents, code blocks, detailed prompts
  // Claude/GPT-4o context windows: 128k-200k tokens, so 100k chars is well within limits
  MESSAGE_MIN: 1,

  NAME_MAX: 100,
  // Names and identifiers
  NAME_MIN: 1,

  PROJECT_DESCRIPTION_MAX: 400,

  PROJECT_NAME_MAX: 200,
  // Project-specific fields
  PROJECT_NAME_MIN: 1,

  ROLE_NAME_MAX: 100,
  // Role names (custom-role-form.tsx)
  ROLE_NAME_MIN: 1,
  SLUG_MAX: 50,
  // Organization slug
  SLUG_MIN: 3,

  TITLE_MAX: 200,
  // Thread/Project Title limits (unified)
  TITLE_MIN: 1,

  // URLs
  URL_MAX: 2048,
  USERNAME_MAX: 50,

  // Username
  USERNAME_MIN: 3,
};

// =============================================================================
// TIME LIMITS
// =============================================================================

export const TIME_LIMITS = {
  // API timeouts
  API_TIMEOUT: 30 * 1000, // 30 seconds

  DATABASE_TIMEOUT: 10 * 1000, // 10 seconds
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  // Token expiration
  INVITATION_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days

  RESET_TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  // Session timeouts
  SESSION_TIMEOUT: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// =============================================================================
// API LIMITS
// =============================================================================

export const API_LIMITS = {
  API_RATE_LIMIT: 100,
  // Rate limiting per endpoint
  AUTH_RATE_LIMIT: 10,

  // Batch operation limits
  BATCH_SIZE_MAX: 100,
  BULK_INVITE_MAX: 50,

  JSON_BODY_MAX: 1024 * 1024, // 1MB
  // Request size limits
  REQUEST_SIZE_MAX: 10 * 1024 * 1024, // 10MB
  UPLOAD_RATE_LIMIT: 5,
};
