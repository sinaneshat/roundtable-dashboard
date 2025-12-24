/**
 * Centralized Configuration Management with Validation
 *
 * This module provides type-safe configuration management with comprehensive
 * validation using Zod. It centralizes all configuration values, validates
 * environment variables, and provides a single source of truth for all
 * application configuration.
 *
 * Features:
 * - Environment variable validation and parsing
 * - Type-safe configuration access
 * - Runtime configuration validation
 * - Default values with fallbacks
 * - Configuration validation on startup
 */

import { z } from 'zod';

import { EnvironmentSchema, LOG_LEVELS, LogLevels } from '@/api/core/enums';

import type { LogLevel } from './enums';

// ============================================================================
// ENVIRONMENT VALIDATION SCHEMAS
// ============================================================================

/**
 * Core application environment schema
 */
const coreEnvironmentSchema = z.object({
  NODE_ENV: EnvironmentSchema.default('development'),
  NEXT_PUBLIC_WEBAPP_ENV: EnvironmentSchema.default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Roundtable Dashboard'),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1).default('1.0.0'),
  API_BASE_PATH: z.string().min(1).default('/api'),
  API_VERSION: z.enum(['v1', 'v2']).default('v1'),
}).openapi('CoreEnvironmentConfig');

export type CoreEnvironmentConfig = z.infer<typeof coreEnvironmentSchema>;

/**
 * Database configuration schema
 */
const databaseEnvironmentSchema = z.object({
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  LOCAL_DATABASE_PATH: z.string().min(1).default('./local.db'),
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  DATABASE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DATABASE_MIGRATION_DIR: z.string().min(1).default('./src/db/migrations'),
  DATABASE_SEED_DATA: z.boolean().default(false),
}).openapi('DatabaseEnvironmentConfig');

export type DatabaseEnvironmentConfig = z.infer<typeof databaseEnvironmentSchema>;

/**
 * Authentication configuration schema
 */
const authEnvironmentSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
  SESSION_COOKIE_NAME: z.string().min(1).default('roundtable-session'),
  CSRF_SECRET: z.string().min(1).optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(15 * 60 * 1000),
}).openapi('AuthEnvironmentConfig');

export type AuthEnvironmentConfig = z.infer<typeof authEnvironmentSchema>;

/**
 * Email configuration schema
 */
const emailEnvironmentSchema = z.object({
  EMAIL_PROVIDER: z.enum(['resend', 'sendgrid', 'ses', 'smtp']).default('resend'),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_API_KEY: z.string().min(1).optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_SECURE: z.boolean().default(true),
  EMAIL_ENABLED: z.boolean().default(true),
  EMAIL_QUEUE_ENABLED: z.boolean().default(false),
}).openapi('EmailEnvironmentConfig');

export type EmailEnvironmentConfig = z.infer<typeof emailEnvironmentSchema>;

/**
 * Storage configuration schema
 */
const storageEnvironmentSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  MAX_FILE_SIZE: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_IMAGE_SIZE: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  ALLOWED_FILE_TYPES: z.string().default('image/*,application/pdf'),
  USER_STORAGE_QUOTA: z.coerce.number().int().positive().default(100 * 1024 * 1024),
}).openapi('StorageEnvironmentConfig');

export type StorageEnvironmentConfig = z.infer<typeof storageEnvironmentSchema>;

/**
 * Monitoring and logging configuration schema
 */
const monitoringEnvironmentSchema = z.object({
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'text']).default('json'),
  LOG_SENSITIVE_DATA: z.boolean().default(false),
  ANALYTICS_ENABLED: z.boolean().default(true),
  GOOGLE_ANALYTICS_ID: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: EnvironmentSchema.optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.number().min(0).max(100).default(10),
  PERFORMANCE_MONITORING: z.boolean().default(false),
  METRICS_ENDPOINT: z.string().url().optional(),
}).openapi('MonitoringEnvironmentConfig');

export type MonitoringEnvironmentConfig = z.infer<typeof monitoringEnvironmentSchema>;

/**
 * Development and debugging configuration schema
 */
const developmentEnvironmentSchema = z.object({
  // Development features
  ENABLE_QUERY_LOGGING: z.boolean().default(false),
  ENABLE_DEBUG_MODE: z.boolean().default(false),

  // Development tools
  STORYBOOK_ENABLED: z.boolean().default(false),
  DEVTOOLS_ENABLED: z.boolean().default(false),

  // Hot reload and development server
  FAST_REFRESH: z.boolean().default(true),
  TURBO_MODE: z.boolean().default(true),
}).openapi('DevelopmentEnvironmentConfig');

export type DevelopmentEnvironmentConfig = z.infer<typeof developmentEnvironmentSchema>;

// ============================================================================
// COMPLETE CONFIGURATION SCHEMA
// ============================================================================

/**
 * Complete application configuration schema
 */
const completeConfigurationSchema = coreEnvironmentSchema
  .merge(databaseEnvironmentSchema)
  .merge(authEnvironmentSchema)
  .merge(emailEnvironmentSchema)
  .merge(storageEnvironmentSchema)
  .merge(monitoringEnvironmentSchema)
  .merge(developmentEnvironmentSchema)
  .openapi('CompleteConfigurationSchema');

// ============================================================================
// CONFIGURATION PARSING AND VALIDATION
// ============================================================================

/**
 * Parse and validate environment variables
 */
function parseEnvironment() {
  const env = {
    // Core environment variables
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_WEBAPP_ENV: process.env.NEXT_PUBLIC_WEBAPP_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    API_BASE_PATH: process.env.API_BASE_PATH,
    API_VERSION: process.env.API_VERSION,

    // Database
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    LOCAL_DATABASE_PATH: process.env.LOCAL_DATABASE_PATH,
    DATABASE_CONNECTION_LIMIT: process.env.DATABASE_CONNECTION_LIMIT,
    DATABASE_TIMEOUT: process.env.DATABASE_TIMEOUT,
    DATABASE_MIGRATION_DIR: process.env.DATABASE_MIGRATION_DIR,
    DATABASE_SEED_DATA: process.env.DATABASE_SEED_DATA === 'true',

    // Authentication
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    SESSION_MAX_AGE: process.env.SESSION_MAX_AGE,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    CSRF_SECRET: process.env.CSRF_SECRET,
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW,

    // Email
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_SECURE: process.env.SMTP_SECURE !== 'false',
    EMAIL_ENABLED: process.env.EMAIL_ENABLED !== 'false',
    EMAIL_QUEUE_ENABLED: process.env.EMAIL_QUEUE_ENABLED === 'true',

    // Storage
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE,
    MAX_IMAGE_SIZE: process.env.MAX_IMAGE_SIZE,
    ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES,
    USER_STORAGE_QUOTA: process.env.USER_STORAGE_QUOTA,

    // Monitoring
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_FORMAT: process.env.LOG_FORMAT,
    LOG_SENSITIVE_DATA: process.env.LOG_SENSITIVE_DATA === 'true',
    ANALYTICS_ENABLED: process.env.ANALYTICS_ENABLED !== 'false',
    GOOGLE_ANALYTICS_ID: process.env.GOOGLE_ANALYTICS_ID,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE,
    PERFORMANCE_MONITORING: process.env.PERFORMANCE_MONITORING === 'true',
    METRICS_ENDPOINT: process.env.METRICS_ENDPOINT,

    // Development
    ENABLE_QUERY_LOGGING: process.env.ENABLE_QUERY_LOGGING === 'true',
    ENABLE_DEBUG_MODE: process.env.ENABLE_DEBUG_MODE === 'true',
    STORYBOOK_ENABLED: process.env.STORYBOOK_ENABLED === 'true',
    DEVTOOLS_ENABLED: process.env.DEVTOOLS_ENABLED === 'true',
    FAST_REFRESH: process.env.FAST_REFRESH !== 'false',
    TURBO_MODE: process.env.TURBO_MODE !== 'false',
  };

  const result = completeConfigurationSchema.safeParse(env);

  if (!result.success) {
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================

/**
 * Application configuration constants
 */
export const APP_CONFIG = {
  // Application metadata
  NAME: 'Roundtable Dashboard',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI collaboration platform where multiple minds meet',

  // API configuration
  API_BASE_PATH: '/api',
  API_VERSION: 'v1',

  // File upload limits
  DEFAULT_FILE_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB
  DEFAULT_IMAGE_SIZE_LIMIT: 5 * 1024 * 1024, // 5MB

  // Session configuration
  SESSION_COOKIE_NAME: 'roundtable-session',
  SESSION_MAX_AGE: 30 * 24 * 60 * 60, // 30 days

  // Rate limiting
  DEFAULT_RATE_LIMIT: 100,
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes

  // Localization
  LOCALE: 'en-US' as const,
  TIMEZONE: 'UTC' as const,
} as const;

/**
 * Feature flags configuration
 */
export const FEATURE_FLAGS = {
  // User features
  ENABLE_USER_REGISTRATION: true,
  ENABLE_EMAIL_VERIFICATION: true,
  ENABLE_PASSWORD_RESET: true,
  ENABLE_PROFILE_PICTURES: true,

  // Development features
  ENABLE_DEBUG_LOGS: false,
  ENABLE_PERFORMANCE_MONITORING: false,
} as const;

/**
 * SSE Streaming configuration
 *
 * Timeout protection prevents orphaned streaming records when:
 * - User navigates away during stream
 * - Network connection drops
 * - Browser closes/refreshes during stream
 *
 * After timeout, STREAMING records are marked as FAILED to allow new streams
 */
export const STREAMING_CONFIG = {
  /**
   * Stream timeout in milliseconds (20 seconds)
   * Applied to: moderator analysis, pre-search execution
   *
   * Rationale: SSE connections can get interrupted without backend knowing
   * After 20s, assume connection lost and mark as failed for recovery
   */
  STREAM_TIMEOUT_MS: 20_000,

  /**
   * Orphan cleanup timeout in milliseconds (2 minutes)
   * Applied to: cleanup operations in list endpoints
   *
   * Rationale: Grace period for legitimate long-running operations
   * Used by getThreadAnalysesHandler, getThreadPreSearchesHandler
   */
  ORPHAN_CLEANUP_TIMEOUT_MS: 2 * 60 * 1000,
} as const;

// ============================================================================
// PARSED CONFIGURATION
// ============================================================================

/**
 * Parsed and validated configuration
 */
let config: z.infer<typeof completeConfigurationSchema> | null = null;

/**
 * Get the application configuration (lazy initialization)
 */
export function getConfig(): z.infer<typeof completeConfigurationSchema> {
  if (!config) {
    config = parseEnvironment();
  }
  return config;
}

/**
 * Get a specific configuration value with type safety
 */
export function getConfigValue<K extends keyof z.infer<typeof completeConfigurationSchema>>(
  key: K,
): z.infer<typeof completeConfigurationSchema>[K] {
  return getConfig()[key];
}

/**
 * Check if we're in development environment
 */
export function isDevelopment(): boolean {
  return getConfigValue('NODE_ENV') === 'development';
}

/**
 * Check if we're in production environment
 */
export function isProduction(): boolean {
  return getConfigValue('NODE_ENV') === 'production';
}

/**
 * Check if we're in preview environment
 */
export function isPreview(): boolean {
  return getConfigValue('NEXT_PUBLIC_WEBAPP_ENV') === 'preview';
}

/**
 * Get the current environment
 */
export function getEnvironment() {
  return getConfigValue('NEXT_PUBLIC_WEBAPP_ENV');
}

/**
 * Check if we're in a non-production environment (local or preview)
 */
export function isNonProduction(): boolean {
  const env = getEnvironment();
  return env === 'development' || env === 'local' || env === 'preview';
}

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Logging configuration by environment
 * Automatically adjusts verbosity based on deployment environment
 */
export const LOGGING_CONFIG = {
  local: {
    enabled: true,
    levels: [...LOG_LEVELS],
    prettyPrint: true,
    includeStack: true,
  },
  development: {
    enabled: true,
    levels: [...LOG_LEVELS],
    prettyPrint: true,
    includeStack: true,
  },
  preview: {
    enabled: true,
    levels: [LogLevels.INFO, LogLevels.WARN, LogLevels.ERROR],
    prettyPrint: false,
    includeStack: true,
  },
  production: {
    enabled: true,
    levels: [LogLevels.ERROR],
    prettyPrint: false,
    includeStack: false,
  },
  test: {
    enabled: false,
    levels: [] as LogLevel[],
    prettyPrint: false,
    includeStack: false,
  },
} as const;

/**
 * Get current logging configuration based on environment
 */
export function getLoggingConfig() {
  const env = getEnvironment();
  return LOGGING_CONFIG[env];
}

/**
 * Check if a specific log level should be logged in current environment
 * Returns true if the log should be output, false otherwise
 */
export function shouldLog(level: LogLevel): boolean {
  const config = getLoggingConfig();
  return config.enabled && (config.levels as readonly LogLevel[]).includes(level);
}

// ============================================================================
// CONFIGURATION UTILITIES
// ============================================================================

/**
 * Validate configuration on startup
 */
export function validateConfiguration(): void {
  try {
    getConfig();
  } catch {
    process.exit(1);
  }
}

/**
 * Get database configuration
 */
export function getDatabaseConfig() {
  const cfg = getConfig();
  return {
    authToken: cfg.DATABASE_AUTH_TOKEN,
    localPath: cfg.LOCAL_DATABASE_PATH,
    connectionLimit: cfg.DATABASE_CONNECTION_LIMIT,
    timeout: cfg.DATABASE_TIMEOUT,
    migrationDir: cfg.DATABASE_MIGRATION_DIR,
    seedData: cfg.DATABASE_SEED_DATA,
  };
}

/**
 * Get authentication configuration
 */
export function getAuthConfig() {
  const cfg = getConfig();
  return {
    betterAuthSecret: cfg.BETTER_AUTH_SECRET,
    betterAuthUrl: cfg.BETTER_AUTH_URL,
    sessionMaxAge: cfg.SESSION_MAX_AGE,
    cookieName: cfg.SESSION_COOKIE_NAME,
    csrfSecret: cfg.CSRF_SECRET,
    rateLimitMax: cfg.RATE_LIMIT_MAX,
    rateLimitWindow: cfg.RATE_LIMIT_WINDOW,
  };
}

/**
 * Get email configuration
 */
export function getEmailConfig() {
  const cfg = getConfig();
  return {
    provider: cfg.EMAIL_PROVIDER,
    enabled: cfg.EMAIL_ENABLED,
    queueEnabled: cfg.EMAIL_QUEUE_ENABLED,
    resend: {
      apiKey: cfg.RESEND_API_KEY,
      fromEmail: cfg.RESEND_FROM_EMAIL,
    },
    sendgrid: {
      apiKey: cfg.SENDGRID_API_KEY,
      fromEmail: cfg.SENDGRID_FROM_EMAIL,
    },
    smtp: {
      host: cfg.SMTP_HOST,
      port: cfg.SMTP_PORT,
      user: cfg.SMTP_USER,
      pass: cfg.SMTP_PASS,
      secure: cfg.SMTP_SECURE,
    },
  };
}

/**
 * Get storage configuration
 */
export function getStorageConfig() {
  const cfg = getConfig();
  return {
    r2: {
      accountId: cfg.R2_ACCOUNT_ID,
      accessKeyId: cfg.R2_ACCESS_KEY_ID,
      secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
      bucketName: cfg.R2_BUCKET_NAME,
      publicUrl: cfg.R2_PUBLIC_URL,
    },
    limits: {
      maxFileSize: cfg.MAX_FILE_SIZE,
      maxImageSize: cfg.MAX_IMAGE_SIZE,
      allowedTypes: cfg.ALLOWED_FILE_TYPES,
      userQuota: cfg.USER_STORAGE_QUOTA,
    },
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ApplicationConfiguration = z.infer<typeof completeConfigurationSchema>;
export type ConfigurationKey = keyof ApplicationConfiguration;

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  APP_CONFIG,
  FEATURE_FLAGS,
  getConfig,
  getConfigValue,
  isDevelopment,
  isProduction,
  isPreview,
  getEnvironment,
  validateConfiguration,
  getDatabaseConfig,
  getAuthConfig,
  getEmailConfig,
  getStorageConfig,
};
