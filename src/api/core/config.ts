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

import {
  ApiVersionSchema,
  DevLogLevelSchema,
  EmailProviderSchema,
  EnvironmentSchema,
  LOG_LEVELS,
  LogFormatSchema,
  LogLevels,
} from '@/api/core/enums';

import type { LogLevel } from './enums';

// ============================================================================
// ENVIRONMENT VALIDATION SCHEMAS
// ============================================================================

/**
 * Core application environment schema
 *
 * Note: NEXT_PUBLIC_APP_URL and NEXT_PUBLIC_API_URL are optional.
 * The application uses centralized URL config from @/lib/config/base-urls.ts
 * which provides static URLs based on NEXT_PUBLIC_WEBAPP_ENV.
 */
const coreEnvironmentSchema = z.object({
  NODE_ENV: EnvironmentSchema.default('development'),
  NEXT_PUBLIC_WEBAPP_ENV: EnvironmentSchema.default('development'),
  // Optional: URLs are derived from centralized config based on WEBAPP_ENV
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('Roundtable'),
  NEXT_PUBLIC_APP_VERSION: z.string().min(1).default('1.0.0'),
  API_BASE_PATH: z.string().min(1).default('/api'),
  API_VERSION: ApiVersionSchema.default('v1'),
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
  EMAIL_PROVIDER: EmailProviderSchema.default('resend'),
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
  LOG_LEVEL: DevLogLevelSchema.default('info'),
  LOG_FORMAT: LogFormatSchema.default('json'),
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
 *
 * In Cloudflare Workers: Use getCloudflareContext().env for runtime secrets
 * In local dev: Falls back to process.env
 *
 * Note: NEXT_PUBLIC_* vars are build-time inlined, so process.env is acceptable for those
 */
async function parseEnvironment() {
  let runtimeEnv: Record<string, string | undefined> = {};

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const cfContext = getCloudflareContext();
    // CloudflareEnv doesn't have index signature, cast to Record for uniform access
    runtimeEnv = (cfContext?.env as unknown as Record<string, string | undefined>) || {};
  } catch {
    // Local dev: getCloudflareContext() not available, use process.env
    runtimeEnv = process.env;
  }

  const env = {
    // Core environment variables (NEXT_PUBLIC_* are build-time inlined, process.env is acceptable)
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_WEBAPP_ENV: process.env.NEXT_PUBLIC_WEBAPP_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    API_BASE_PATH: runtimeEnv.API_BASE_PATH,
    API_VERSION: runtimeEnv.API_VERSION,

    // Database (runtime secrets)
    DATABASE_AUTH_TOKEN: runtimeEnv.DATABASE_AUTH_TOKEN,
    LOCAL_DATABASE_PATH: runtimeEnv.LOCAL_DATABASE_PATH,
    DATABASE_CONNECTION_LIMIT: runtimeEnv.DATABASE_CONNECTION_LIMIT,
    DATABASE_TIMEOUT: runtimeEnv.DATABASE_TIMEOUT,
    DATABASE_MIGRATION_DIR: runtimeEnv.DATABASE_MIGRATION_DIR,
    DATABASE_SEED_DATA: runtimeEnv.DATABASE_SEED_DATA === 'true',

    // Authentication (runtime secrets)
    BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
    SESSION_MAX_AGE: runtimeEnv.SESSION_MAX_AGE,
    SESSION_COOKIE_NAME: runtimeEnv.SESSION_COOKIE_NAME,
    CSRF_SECRET: runtimeEnv.CSRF_SECRET,
    RATE_LIMIT_MAX: runtimeEnv.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW: runtimeEnv.RATE_LIMIT_WINDOW,

    // Email (runtime secrets)
    EMAIL_PROVIDER: runtimeEnv.EMAIL_PROVIDER,
    RESEND_API_KEY: runtimeEnv.RESEND_API_KEY,
    RESEND_FROM_EMAIL: runtimeEnv.RESEND_FROM_EMAIL,
    SENDGRID_API_KEY: runtimeEnv.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: runtimeEnv.SENDGRID_FROM_EMAIL,
    SMTP_HOST: runtimeEnv.SMTP_HOST,
    SMTP_PORT: runtimeEnv.SMTP_PORT,
    SMTP_USER: runtimeEnv.SMTP_USER,
    SMTP_PASS: runtimeEnv.SMTP_PASS,
    SMTP_SECURE: runtimeEnv.SMTP_SECURE !== 'false',
    EMAIL_ENABLED: runtimeEnv.EMAIL_ENABLED !== 'false',
    EMAIL_QUEUE_ENABLED: runtimeEnv.EMAIL_QUEUE_ENABLED === 'true',

    // Storage (runtime secrets + NEXT_PUBLIC_*)
    R2_ACCOUNT_ID: runtimeEnv.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: runtimeEnv.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: runtimeEnv.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: runtimeEnv.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    MAX_FILE_SIZE: runtimeEnv.MAX_FILE_SIZE,
    MAX_IMAGE_SIZE: runtimeEnv.MAX_IMAGE_SIZE,
    ALLOWED_FILE_TYPES: runtimeEnv.ALLOWED_FILE_TYPES,
    USER_STORAGE_QUOTA: runtimeEnv.USER_STORAGE_QUOTA,

    // Monitoring (runtime secrets + NEXT_PUBLIC_*)
    LOG_LEVEL: runtimeEnv.LOG_LEVEL,
    LOG_FORMAT: runtimeEnv.LOG_FORMAT,
    LOG_SENSITIVE_DATA: runtimeEnv.LOG_SENSITIVE_DATA === 'true',
    ANALYTICS_ENABLED: runtimeEnv.ANALYTICS_ENABLED !== 'false',
    GOOGLE_ANALYTICS_ID: runtimeEnv.GOOGLE_ANALYTICS_ID,
    SENTRY_DSN: runtimeEnv.SENTRY_DSN,
    SENTRY_ENVIRONMENT: runtimeEnv.SENTRY_ENVIRONMENT,
    SENTRY_TRACES_SAMPLE_RATE: runtimeEnv.SENTRY_TRACES_SAMPLE_RATE,
    PERFORMANCE_MONITORING: runtimeEnv.PERFORMANCE_MONITORING === 'true',
    METRICS_ENDPOINT: runtimeEnv.METRICS_ENDPOINT,

    // Development (runtime config)
    ENABLE_QUERY_LOGGING: runtimeEnv.ENABLE_QUERY_LOGGING === 'true',
    ENABLE_DEBUG_MODE: runtimeEnv.ENABLE_DEBUG_MODE === 'true',
    STORYBOOK_ENABLED: runtimeEnv.STORYBOOK_ENABLED === 'true',
    DEVTOOLS_ENABLED: runtimeEnv.DEVTOOLS_ENABLED === 'true',
    FAST_REFRESH: runtimeEnv.FAST_REFRESH !== 'false',
    TURBO_MODE: runtimeEnv.TURBO_MODE !== 'false',
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
  NAME: 'Roundtable',
  VERSION: '1.0.0',
  DESCRIPTION: 'Chat with multiple AI models at once',

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
 * ✅ CLOUDFLARE WORKERS LIMITS (wrangler.jsonc):
 * - CPU time: 300,000ms (5 min) - paid plan maximum
 * - Wall-clock: UNLIMITED - as long as client stays connected
 * - Memory: 128MB - fixed, optimized via O(1) chunk storage
 * - IDLE timeout: 100 seconds - must send data or HTTP 524
 *
 * Timeout protection prevents orphaned streaming records when:
 * - User navigates away during stream
 * - Network connection drops
 * - Browser closes/refreshes during stream
 *
 * After timeout, STREAMING records are marked as FAILED to allow new streams
 *
 * @see AI_TIMEOUT_CONFIG in product-logic.service.ts for AI provider timeouts
 * @see stream-buffer.service.ts for O(1) memory-optimized chunk storage
 * @see https://developers.cloudflare.com/workers/platform/limits/
 */
export const STREAMING_CONFIG = {
  /**
   * Stream timeout in milliseconds (90 seconds)
   * Applied to: moderator analysis, pre-search execution
   *
   * Rationale: SSE connections can get interrupted without backend knowing.
   * Set just under Cloudflare's 100-second idle timeout to catch stale streams
   * before Cloudflare returns HTTP 524.
   *
   * Note: Active streams sending data are NOT affected by idle timeout.
   */
  STREAM_TIMEOUT_MS: 90_000,

  /**
   * Orphan cleanup timeout in milliseconds (5 minutes)
   * Applied to: cleanup operations in list endpoints
   *
   * Rationale: Grace period for legitimate long-running AI operations.
   * Matches Cloudflare's max CPU time (5 min) for consistency.
   * Used by getThreadAnalysesHandler, getThreadPreSearchesHandler.
   */
  ORPHAN_CLEANUP_TIMEOUT_MS: 5 * 60 * 1000,

  /**
   * Stale chunk timeout in milliseconds (90 seconds)
   * Applied to: stream resumption handlers
   *
   * Rationale: If no chunks received for 90s, consider stream stale.
   * Matches Cloudflare's ~100s idle timeout for consistent behavior.
   * Accounts for AI models that may "think" before streaming begins.
   */
  STALE_CHUNK_TIMEOUT_MS: 90_000,
} as const;

// ============================================================================
// PARSED CONFIGURATION
// ============================================================================

/**
 * Parsed and validated configuration
 */
let config: z.infer<typeof completeConfigurationSchema> | null = null;
let configPromise: Promise<z.infer<typeof completeConfigurationSchema>> | null = null;

/**
 * Get the application configuration (lazy async initialization)
 * Use this in async contexts (e.g., Hono handlers)
 */
export async function getConfig(): Promise<z.infer<typeof completeConfigurationSchema>> {
  if (!config) {
    if (!configPromise) {
      configPromise = parseEnvironment();
    }
    config = await configPromise;
  }
  return config;
}

/**
 * Get the application configuration synchronously (for non-async contexts)
 * WARNING: Only use this after getConfig() has been called at least once
 * Use getConfig() in async contexts instead
 */
export function getConfigSync(): z.infer<typeof completeConfigurationSchema> {
  if (!config) {
    throw new Error('Configuration not initialized. Call getConfig() first in async context.');
  }
  return config;
}

/**
 * Get a specific configuration value with type safety
 */
export async function getConfigValue<K extends keyof z.infer<typeof completeConfigurationSchema>>(
  key: K,
): Promise<z.infer<typeof completeConfigurationSchema>[K]> {
  const cfg = await getConfig();
  return cfg[key];
}

/**
 * Get a specific configuration value synchronously
 * WARNING: Only use after getConfig() has been called
 */
export function getConfigValueSync<K extends keyof z.infer<typeof completeConfigurationSchema>>(
  key: K,
): z.infer<typeof completeConfigurationSchema>[K] {
  return getConfigSync()[key];
}

/**
 * Check if we're in development environment
 */
export async function isDevelopment(): Promise<boolean> {
  return (await getConfigValue('NODE_ENV')) === 'development';
}

/**
 * Check if we're in production environment
 */
export async function isProduction(): Promise<boolean> {
  return (await getConfigValue('NODE_ENV')) === 'production';
}

/**
 * Check if we're in preview environment
 */
export async function isPreview(): Promise<boolean> {
  return (await getConfigValue('NEXT_PUBLIC_WEBAPP_ENV')) === 'preview';
}

/**
 * Get the current environment
 */
export async function getEnvironment() {
  return await getConfigValue('NEXT_PUBLIC_WEBAPP_ENV');
}

/**
 * Check if we're in a non-production environment (local or preview)
 */
export async function isNonProduction(): Promise<boolean> {
  const env = await getEnvironment();
  return env === 'development' || env === 'local' || env === 'preview';
}

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Logging configuration entry type
 * Ensures type-safe configuration across all environments
 */
type LoggingConfigEntry = {
  enabled: boolean;
  levels: readonly LogLevel[];
  prettyPrint: boolean;
  includeStack: boolean;
};

/**
 * Logging configuration by environment
 * Automatically adjusts verbosity based on deployment environment
 */
export const LOGGING_CONFIG: Record<z.infer<typeof EnvironmentSchema>, LoggingConfigEntry> = {
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
    levels: [],
    prettyPrint: false,
    includeStack: false,
  },
};

/**
 * Get current logging configuration based on environment
 */
export async function getLoggingConfig() {
  const env = await getEnvironment();
  return LOGGING_CONFIG[env];
}

/**
 * Get current logging configuration synchronously
 * WARNING: Only use after getConfig() has been called
 */
export function getLoggingConfigSync() {
  const env = getConfigValueSync('NEXT_PUBLIC_WEBAPP_ENV');
  return LOGGING_CONFIG[env];
}

/**
 * Check if a specific log level should be logged in current environment
 * Returns true if the log should be output, false otherwise
 */
export async function shouldLog(level: LogLevel): Promise<boolean> {
  const config = await getLoggingConfig();
  return config.enabled && config.levels.includes(level);
}

// ============================================================================
// CONFIGURATION UTILITIES
// ============================================================================

/**
 * Validate configuration on startup
 */
export async function validateConfiguration(): Promise<void> {
  try {
    await getConfig();
  } catch {
    process.exit(1);
  }
}

/**
 * Get database configuration
 */
export async function getDatabaseConfig() {
  const cfg = await getConfig();
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
export async function getAuthConfig() {
  const cfg = await getConfig();
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
export async function getEmailConfig() {
  const cfg = await getConfig();
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
export async function getStorageConfig() {
  const cfg = await getConfig();
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
