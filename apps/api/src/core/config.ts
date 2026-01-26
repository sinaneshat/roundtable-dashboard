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

import type { LogLevel } from '@roundtable/shared/enums';
import {
  ApiVersionSchema,
  DevLogLevelSchema,
  EmailProviderSchema,
  EnvironmentSchema,
  LOG_LEVELS,
  LogFormatSchema,
  LogLevels,
} from '@roundtable/shared/enums';
import * as z from 'zod';

import { APP_VERSION } from '@/constants/version';

// ============================================================================
// Safe Property Access Helper
// ============================================================================

/**
 * Safely get a property from process.env using bracket notation
 * This satisfies TS4111 noPropertyAccessFromIndexSignature
 */
function getEnvVar(key: string): string | undefined {
  return process.env[key];
}

// ============================================================================
// ENVIRONMENT VALIDATION SCHEMAS
// ============================================================================

/**
 * Core application environment schema
 *
 * Note: APP_URL and API_URL are optional.
 * The application uses centralized URL config from @/lib/config/base-urls.ts
 * which provides static URLs based on WEBAPP_ENV.
 */
const coreEnvironmentSchema = z.object({
  API_BASE_PATH: z.string().min(1).default('/api'),
  API_URL: z.string().url().optional(),
  API_VERSION: ApiVersionSchema.default('v1'),
  APP_NAME: z.string().min(1).default('Roundtable'),
  // Optional: URLs are derived from centralized config based on WEBAPP_ENV
  APP_URL: z.string().url().optional(),
  APP_VERSION: z.string().min(1).default(APP_VERSION),
  NODE_ENV: EnvironmentSchema.default('development'),
  WEBAPP_ENV: EnvironmentSchema.default('development'),
}).openapi('CoreEnvironmentConfig');

export type CoreEnvironmentConfig = z.infer<typeof coreEnvironmentSchema>;

/**
 * Database configuration schema
 */
const databaseEnvironmentSchema = z.object({
  DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  DATABASE_MIGRATION_DIR: z.string().min(1).default('./src/db/migrations'),
  DATABASE_SEED_DATA: z.boolean().default(false),
  DATABASE_TIMEOUT: z.coerce.number().int().positive().default(30000),
  LOCAL_DATABASE_PATH: z.string().min(1).default('./local.db'),
}).openapi('DatabaseEnvironmentConfig');

export type DatabaseEnvironmentConfig = z.infer<typeof databaseEnvironmentSchema>;

/**
 * Authentication configuration schema
 */
const authEnvironmentSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  CSRF_SECRET: z.string().min(1).optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(15 * 60 * 1000),
  SESSION_COOKIE_NAME: z.string().min(1).default('roundtable-session'),
  SESSION_MAX_AGE: z.coerce.number().int().positive().default(30 * 24 * 60 * 60),
}).openapi('AuthEnvironmentConfig');

export type AuthEnvironmentConfig = z.infer<typeof authEnvironmentSchema>;

/**
 * Email configuration schema
 */
const emailEnvironmentSchema = z.object({
  EMAIL_ENABLED: z.boolean().default(true),
  EMAIL_PROVIDER: EmailProviderSchema.default('resend'),
  EMAIL_QUEUE_ENABLED: z.boolean().default(false),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SENDGRID_API_KEY: z.string().min(1).optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.boolean().default(true),
  SMTP_USER: z.string().min(1).optional(),
}).openapi('EmailEnvironmentConfig');

export type EmailEnvironmentConfig = z.infer<typeof emailEnvironmentSchema>;

/**
 * Storage configuration schema
 */
const storageEnvironmentSchema = z.object({
  ALLOWED_FILE_TYPES: z.string().default('image/*,application/pdf'),
  MAX_FILE_SIZE: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_IMAGE_SIZE: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_BUCKET_NAME: z.string().min(1).optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  USER_STORAGE_QUOTA: z.coerce.number().int().positive().default(100 * 1024 * 1024),
}).openapi('StorageEnvironmentConfig');

export type StorageEnvironmentConfig = z.infer<typeof storageEnvironmentSchema>;

/**
 * Monitoring and logging configuration schema
 */
const monitoringEnvironmentSchema = z.object({
  ANALYTICS_ENABLED: z.boolean().default(true),
  GOOGLE_ANALYTICS_ID: z.string().min(1).optional(),
  LOG_FORMAT: LogFormatSchema.default('json'),
  LOG_LEVEL: DevLogLevelSchema.default('info'),
  LOG_SENSITIVE_DATA: z.boolean().default(false),
  METRICS_ENDPOINT: z.string().url().optional(),
  PERFORMANCE_MONITORING: z.boolean().default(false),
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: EnvironmentSchema.optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.number().min(0).max(100).default(10),
}).openapi('MonitoringEnvironmentConfig');

export type MonitoringEnvironmentConfig = z.infer<typeof monitoringEnvironmentSchema>;

/**
 * Development and debugging configuration schema
 */
const developmentEnvironmentSchema = z.object({
  DEVTOOLS_ENABLED: z.boolean().default(false),
  ENABLE_DEBUG_MODE: z.boolean().default(false),

  // Development features
  ENABLE_QUERY_LOGGING: z.boolean().default(false),
  // Hot reload and development server
  FAST_REFRESH: z.boolean().default(true),

  // Development tools
  STORYBOOK_ENABLED: z.boolean().default(false),
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
 * In Cloudflare Workers: Use cloudflare:workers env for runtime secrets
 * In local dev: Falls back to process.env
 */

/**
 * Get environment variable from CloudflareEnv or process.env
 * Uses a getter function to avoid type mismatch between typed CloudflareEnv and Record-based process.env
 */
function createEnvGetter(cfEnv: CloudflareEnv | null): (key: string) => string | undefined {
  return (key: string): string | undefined => {
    if (cfEnv !== null && key in cfEnv) {
      const value = cfEnv[key as keyof CloudflareEnv];
      return typeof value === 'string' ? value : undefined;
    }
    return process.env[key];
  };
}

async function parseEnvironment() {
  // Try to import Cloudflare Workers env
  let cfEnv: CloudflareEnv | null = null;
  try {
    const { env: workersEnv } = await import('cloudflare:workers');
    cfEnv = workersEnv;
  } catch {
    // Local dev: cloudflare:workers not available
  }

  const getEnv = createEnvGetter(cfEnv);

  const env = {
    ALLOWED_FILE_TYPES: getEnv('ALLOWED_FILE_TYPES'),
    ANALYTICS_ENABLED: getEnv('ANALYTICS_ENABLED') !== 'false',
    API_BASE_PATH: getEnv('API_BASE_PATH'),
    API_URL: getEnv('API_URL') || getEnvVar('API_URL'),
    API_VERSION: getEnv('API_VERSION'),
    APP_NAME: getEnv('APP_NAME') || getEnvVar('APP_NAME'),
    APP_URL: getEnv('APP_URL') || getEnvVar('APP_URL'),
    APP_VERSION: getEnv('APP_VERSION') || getEnvVar('APP_VERSION'),

    // Authentication (runtime secrets)
    BETTER_AUTH_SECRET: getEnv('BETTER_AUTH_SECRET'),
    BETTER_AUTH_URL: getEnv('BETTER_AUTH_URL'),
    CSRF_SECRET: getEnv('CSRF_SECRET'),
    // Database (runtime secrets)
    DATABASE_AUTH_TOKEN: getEnv('DATABASE_AUTH_TOKEN'),
    DATABASE_CONNECTION_LIMIT: getEnv('DATABASE_CONNECTION_LIMIT'),
    DATABASE_MIGRATION_DIR: getEnv('DATABASE_MIGRATION_DIR'),

    DATABASE_SEED_DATA: getEnv('DATABASE_SEED_DATA') === 'true',
    DATABASE_TIMEOUT: getEnv('DATABASE_TIMEOUT'),
    DEVTOOLS_ENABLED: getEnv('DEVTOOLS_ENABLED') === 'true',
    EMAIL_ENABLED: getEnv('EMAIL_ENABLED') !== 'false',
    // Email (runtime secrets)
    EMAIL_PROVIDER: getEnv('EMAIL_PROVIDER'),
    EMAIL_QUEUE_ENABLED: getEnv('EMAIL_QUEUE_ENABLED') === 'true',
    ENABLE_DEBUG_MODE: getEnv('ENABLE_DEBUG_MODE') === 'true',

    // Development (runtime config)
    ENABLE_QUERY_LOGGING: getEnv('ENABLE_QUERY_LOGGING') === 'true',
    FAST_REFRESH: getEnv('FAST_REFRESH') !== 'false',
    GOOGLE_ANALYTICS_ID: getEnv('GOOGLE_ANALYTICS_ID'),
    LOCAL_DATABASE_PATH: getEnv('LOCAL_DATABASE_PATH'),
    LOG_FORMAT: getEnv('LOG_FORMAT'),
    // Monitoring (runtime secrets + *)
    LOG_LEVEL: getEnv('LOG_LEVEL'),
    LOG_SENSITIVE_DATA: getEnv('LOG_SENSITIVE_DATA') === 'true',
    MAX_FILE_SIZE: getEnv('MAX_FILE_SIZE'),
    MAX_IMAGE_SIZE: getEnv('MAX_IMAGE_SIZE'),
    METRICS_ENDPOINT: getEnv('METRICS_ENDPOINT'),
    // Core environment variables
    // Priority: Cloudflare Workers env > process.env
    NODE_ENV: getEnv('NODE_ENV') || process.env.NODE_ENV,
    PERFORMANCE_MONITORING: getEnv('PERFORMANCE_MONITORING') === 'true',

    R2_ACCESS_KEY_ID: getEnv('R2_ACCESS_KEY_ID'),
    // Storage (runtime secrets + *)
    R2_ACCOUNT_ID: getEnv('R2_ACCOUNT_ID'),
    R2_BUCKET_NAME: getEnv('R2_BUCKET_NAME'),
    R2_PUBLIC_URL: getEnv('R2_PUBLIC_URL') || process.env.R2_PUBLIC_URL,
    R2_SECRET_ACCESS_KEY: getEnv('R2_SECRET_ACCESS_KEY'),
    RATE_LIMIT_MAX: getEnv('RATE_LIMIT_MAX'),
    RATE_LIMIT_WINDOW: getEnv('RATE_LIMIT_WINDOW'),
    RESEND_API_KEY: getEnv('RESEND_API_KEY'),
    RESEND_FROM_EMAIL: getEnv('RESEND_FROM_EMAIL'),

    SENDGRID_API_KEY: getEnv('SENDGRID_API_KEY'),
    SENDGRID_FROM_EMAIL: getEnv('SENDGRID_FROM_EMAIL'),
    SENTRY_DSN: getEnv('SENTRY_DSN'),
    SENTRY_ENVIRONMENT: getEnv('SENTRY_ENVIRONMENT'),
    SENTRY_TRACES_SAMPLE_RATE: getEnv('SENTRY_TRACES_SAMPLE_RATE'),
    SESSION_COOKIE_NAME: getEnv('SESSION_COOKIE_NAME'),
    SESSION_MAX_AGE: getEnv('SESSION_MAX_AGE'),
    SMTP_HOST: getEnv('SMTP_HOST'),
    SMTP_PASS: getEnv('SMTP_PASS'),
    SMTP_PORT: getEnv('SMTP_PORT'),

    SMTP_SECURE: getEnv('SMTP_SECURE') !== 'false',
    SMTP_USER: getEnv('SMTP_USER'),
    STORYBOOK_ENABLED: getEnv('STORYBOOK_ENABLED') === 'true',
    TURBO_MODE: getEnv('TURBO_MODE') !== 'false',
    USER_STORAGE_QUOTA: getEnv('USER_STORAGE_QUOTA'),
    WEBAPP_ENV: getEnv('WEBAPP_ENV') || process.env.WEBAPP_ENV,
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
  // API configuration
  API_BASE_PATH: '/api',
  API_VERSION: 'v1',
  // File upload limits
  DEFAULT_FILE_SIZE_LIMIT: 10 * 1024 * 1024, // 10MB

  DEFAULT_IMAGE_SIZE_LIMIT: 5 * 1024 * 1024, // 5MB
  // Rate limiting
  DEFAULT_RATE_LIMIT: 100,

  DESCRIPTION: 'Chat with multiple AI models at once',
  // Localization
  LOCALE: 'en-US' as const,

  // Application metadata
  NAME: 'Roundtable',
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes

  // Session configuration
  SESSION_COOKIE_NAME: 'roundtable-session',
  SESSION_MAX_AGE: 30 * 24 * 60 * 60, // 30 days

  TIMEZONE: 'UTC' as const,
  VERSION: APP_VERSION,
} as const;

/**
 * Feature flags configuration
 */
export const FEATURE_FLAGS = {
  // Development features
  ENABLE_DEBUG_LOGS: false,
  ENABLE_EMAIL_VERIFICATION: true,
  ENABLE_PASSWORD_RESET: true,
  ENABLE_PERFORMANCE_MONITORING: false,

  ENABLE_PROFILE_PICTURES: true,
  // User features
  ENABLE_USER_REGISTRATION: true,
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
   * Orphan cleanup timeout in milliseconds (30 minutes)
   * Applied to: cleanup operations in list endpoints
   *
   * Rationale: Grace period for legitimate long-running AI operations.
   * Extended to match AI_TIMEOUT_CONFIG.totalMs for consistency.
   * Cloudflare has NO wall-clock limit - only constraint is 100s idle timeout.
   * Used by getThreadAnalysesHandler, getThreadPreSearchesHandler.
   */
  ORPHAN_CLEANUP_TIMEOUT_MS: 30 * 60 * 1000,

  /**
   * Stale chunk timeout in milliseconds (90 seconds)
   * Applied to: stream resumption handlers
   *
   * Rationale: If no chunks received for 90s, consider stream stale.
   * Set under Cloudflare's 100s idle timeout to detect stale streams
   * before HTTP 524. Accounts for AI models that may "think" before streaming.
   */
  STALE_CHUNK_TIMEOUT_MS: 90_000,

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
  return (await getConfigValue('WEBAPP_ENV')) === 'preview';
}

/**
 * Get the current environment
 */
export async function getEnvironment() {
  return await getConfigValue('WEBAPP_ENV');
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
  development: {
    enabled: true,
    includeStack: true,
    levels: [...LOG_LEVELS],
    prettyPrint: true,
  },
  local: {
    enabled: true,
    includeStack: true,
    levels: [...LOG_LEVELS],
    prettyPrint: true,
  },
  preview: {
    enabled: true,
    includeStack: true,
    levels: [LogLevels.INFO, LogLevels.WARN, LogLevels.ERROR],
    prettyPrint: false,
  },
  production: {
    enabled: true,
    includeStack: false,
    levels: [LogLevels.ERROR],
    prettyPrint: false,
  },
  test: {
    enabled: false,
    includeStack: false,
    levels: [],
    prettyPrint: false,
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
  const env = getConfigValueSync('WEBAPP_ENV');
  return LOGGING_CONFIG[env];
}

/**
 * Check if a specific log level should be logged in current environment
 * Returns true if the log should be output, false otherwise
 */
export async function shouldLog(level: LogLevel): Promise<boolean> {
  const config = await getLoggingConfig();
  if (!config) {
    return false;
  }
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
    connectionLimit: cfg.DATABASE_CONNECTION_LIMIT,
    localPath: cfg.LOCAL_DATABASE_PATH,
    migrationDir: cfg.DATABASE_MIGRATION_DIR,
    seedData: cfg.DATABASE_SEED_DATA,
    timeout: cfg.DATABASE_TIMEOUT,
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
    cookieName: cfg.SESSION_COOKIE_NAME,
    csrfSecret: cfg.CSRF_SECRET,
    rateLimitMax: cfg.RATE_LIMIT_MAX,
    rateLimitWindow: cfg.RATE_LIMIT_WINDOW,
    sessionMaxAge: cfg.SESSION_MAX_AGE,
  };
}

/**
 * Get email configuration
 */
export async function getEmailConfig() {
  const cfg = await getConfig();
  return {
    enabled: cfg.EMAIL_ENABLED,
    provider: cfg.EMAIL_PROVIDER,
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
      pass: cfg.SMTP_PASS,
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      user: cfg.SMTP_USER,
    },
  };
}

/**
 * Get storage configuration
 */
export async function getStorageConfig() {
  const cfg = await getConfig();
  return {
    limits: {
      allowedTypes: cfg.ALLOWED_FILE_TYPES,
      maxFileSize: cfg.MAX_FILE_SIZE,
      maxImageSize: cfg.MAX_IMAGE_SIZE,
      userQuota: cfg.USER_STORAGE_QUOTA,
    },
    r2: {
      accessKeyId: cfg.R2_ACCESS_KEY_ID,
      accountId: cfg.R2_ACCOUNT_ID,
      bucketName: cfg.R2_BUCKET_NAME,
      publicUrl: cfg.R2_PUBLIC_URL,
      secretAccessKey: cfg.R2_SECRET_ACCESS_KEY,
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
  getAuthConfig,
  getConfig,
  getConfigValue,
  getDatabaseConfig,
  getEmailConfig,
  getEnvironment,
  getStorageConfig,
  isDevelopment,
  isPreview,
  isProduction,
  validateConfiguration,
};
