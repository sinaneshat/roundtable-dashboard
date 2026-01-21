/**
 * Common/Shared Enums
 *
 * Generic enums used across multiple domains.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// HTTP METHOD
// ============================================================================

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export const DEFAULT_HTTP_METHOD: HttpMethod = 'GET';

export const HttpMethodSchema = z.enum(HTTP_METHODS).openapi({
  description: 'HTTP request method',
  example: 'POST',
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;

export const HttpMethods = {
  GET: 'GET' as const,
  POST: 'POST' as const,
  PUT: 'PUT' as const,
  DELETE: 'DELETE' as const,
  PATCH: 'PATCH' as const,
  HEAD: 'HEAD' as const,
  OPTIONS: 'OPTIONS' as const,
} as const;

// ============================================================================
// DATABASE OPERATION
// ============================================================================

export const DATABASE_OPERATIONS = ['select', 'insert', 'update', 'delete', 'batch'] as const;

export const DEFAULT_DATABASE_OPERATION: DatabaseOperation = 'select';

export const DatabaseOperationSchema = z.enum(DATABASE_OPERATIONS).openapi({
  description: 'Database operation type',
  example: 'insert',
});

export type DatabaseOperation = z.infer<typeof DatabaseOperationSchema>;

export const DatabaseOperations = {
  SELECT: 'select' as const,
  INSERT: 'insert' as const,
  UPDATE: 'update' as const,
  DELETE: 'delete' as const,
  BATCH: 'batch' as const,
} as const;

// ============================================================================
// HEALTH STATUS
// ============================================================================

export const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'] as const;

export const DEFAULT_HEALTH_STATUS: HealthStatus = 'healthy';

export const HealthStatusSchema = z.enum(HEALTH_STATUSES).openapi({
  description: 'System health status',
  example: 'healthy',
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthStatuses = {
  HEALTHY: 'healthy' as const,
  DEGRADED: 'degraded' as const,
  UNHEALTHY: 'unhealthy' as const,
} as const;

// ============================================================================
// HEALTH CHECK DETAIL TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const HEALTH_CHECK_DETAIL_TYPES = ['health_check'] as const;

// 2. ZOD SCHEMA
export const HealthCheckDetailTypeSchema = z.enum(HEALTH_CHECK_DETAIL_TYPES).openapi({
  description: 'Type discriminator for health check details',
  example: 'health_check',
});

// 3. TYPESCRIPT TYPE
export type HealthCheckDetailType = z.infer<typeof HealthCheckDetailTypeSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_HEALTH_CHECK_DETAIL_TYPE: HealthCheckDetailType = 'health_check';

// 5. CONSTANT OBJECT
export const HealthCheckDetailTypes = {
  HEALTH_CHECK: 'health_check' as const,
} as const;

// ============================================================================
// ENVIRONMENT
// ============================================================================

export const ENVIRONMENTS = ['development', 'preview', 'production', 'test', 'local'] as const;

export const DEFAULT_ENVIRONMENT: Environment = 'development';

export const EnvironmentSchema = z.enum(ENVIRONMENTS).openapi({
  description: 'Application runtime environment',
  example: 'production',
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export const Environments = {
  DEVELOPMENT: 'development' as const,
  PREVIEW: 'preview' as const,
  PRODUCTION: 'production' as const,
  TEST: 'test' as const,
  LOCAL: 'local' as const,
} as const;

// ============================================================================
// WEBAPP_ENV (Application Environment)
// ============================================================================

// 1. ARRAY CONSTANT - Source of truth for values
export const WEBAPP_ENVS = ['local', 'preview', 'prod'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEBAPP_ENV: WebAppEnv = 'local';

// 3. ZOD SCHEMA - Runtime validation + OpenAPI docs
export const WebAppEnvSchema = z.enum(WEBAPP_ENVS).openapi({
  description: 'Web application deployment environment (from wrangler.jsonc)',
  example: 'preview',
});

// 4. TYPESCRIPT TYPE - Inferred from Zod schema
export type WebAppEnv = z.infer<typeof WebAppEnvSchema>;

// 5. CONSTANT OBJECT - For usage in code (prevents typos)
export const WebAppEnvs = {
  LOCAL: 'local' as const,
  PREVIEW: 'preview' as const,
  PROD: 'prod' as const,
} as const;

export function isWebAppEnv(value: unknown): value is WebAppEnv {
  return WebAppEnvSchema.safeParse(value).success;
}

// ============================================================================
// NODE_ENV (Node.js Runtime Environment)
// ============================================================================

// 1. ARRAY CONSTANT - Source of truth for values
export const NODE_ENVS = ['test', 'production', 'development'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_NODE_ENV: NodeEnv = 'development';

// 3. ZOD SCHEMA - Runtime validation + OpenAPI docs
export const NodeEnvSchema = z.enum(NODE_ENVS).openapi({
  description: 'Node.js runtime environment (NODE_ENV)',
  example: 'production',
});

// 4. TYPESCRIPT TYPE - Inferred from Zod schema
export type NodeEnv = z.infer<typeof NodeEnvSchema>;

// 5. CONSTANT OBJECT - For usage in code (prevents typos)
export const NodeEnvs = {
  TEST: 'test' as const,
  PRODUCTION: 'production' as const,
  DEVELOPMENT: 'development' as const,
} as const;

export function isNodeEnv(value: unknown): value is NodeEnv {
  return NodeEnvSchema.safeParse(value).success;
}

// ============================================================================
// SORT DIRECTION
// ============================================================================

// 1. ARRAY CONSTANT
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

// 2. ZOD SCHEMA
export const SortDirectionSchema = z.enum(SORT_DIRECTIONS).openapi({
  description: 'Sort order direction',
  example: 'desc',
});

// 3. TYPESCRIPT TYPE
export type SortDirection = z.infer<typeof SortDirectionSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc';

// 5. CONSTANT OBJECT
export const SortDirections = {
  ASC: 'asc' as const,
  DESC: 'desc' as const,
} as const;

// ============================================================================
// SORT DIRECTION LABELS (UI Display)
// ============================================================================

export const SORT_DIRECTION_LABELS: Record<SortDirection, string> = {
  [SortDirections.ASC]: 'Ascending',
  [SortDirections.DESC]: 'Descending',
} as const;

// ============================================================================
// BOOLEAN STRING (Query param boolean values)
// ============================================================================

export const BOOLEAN_STRINGS = ['true', 'false'] as const;

export const DEFAULT_BOOLEAN_STRING: BooleanString = 'false';

export const BooleanStringSchema = z.enum(BOOLEAN_STRINGS).openapi({
  description: 'Boolean value as string (for query parameters)',
  example: 'true',
});

export type BooleanString = z.infer<typeof BooleanStringSchema>;

export const BooleanStrings = {
  TRUE: 'true' as const,
  FALSE: 'false' as const,
} as const;

// ============================================================================
// DATABASE CONNECTION STATUS
// ============================================================================

export const DATABASE_CONNECTION_STATUSES = ['connected', 'disconnected', 'pending'] as const;

export const DatabaseConnectionStatusSchema = z.enum(DATABASE_CONNECTION_STATUSES).openapi({
  description: 'Database connection status for health checks',
  example: 'connected',
});

export type DatabaseConnectionStatus = z.infer<typeof DatabaseConnectionStatusSchema>;

export const DEFAULT_DATABASE_CONNECTION_STATUS: DatabaseConnectionStatus = 'pending';

export const DatabaseConnectionStatuses = {
  CONNECTED: 'connected' as const,
  DISCONNECTED: 'disconnected' as const,
  PENDING: 'pending' as const,
} as const;

// ============================================================================
// OAUTH STATUS
// ============================================================================

export const OAUTH_STATUSES = ['configured', 'missing', 'invalid'] as const;

export const OAuthStatusSchema = z.enum(OAUTH_STATUSES).openapi({
  description: 'OAuth configuration status for environment validation',
  example: 'configured',
});

export type OAuthStatus = z.infer<typeof OAuthStatusSchema>;

export const DEFAULT_OAUTH_STATUS: OAuthStatus = 'missing';

export const OAuthStatuses = {
  CONFIGURED: 'configured' as const,
  MISSING: 'missing' as const,
  INVALID: 'invalid' as const,
} as const;

// ============================================================================
// OG TYPE (Open Graph content type for SEO)
// ============================================================================

export const OG_TYPES = ['website', 'article', 'product'] as const;

export const OgTypeSchema = z.enum(OG_TYPES).openapi({
  description: 'Open Graph content type for SEO metadata',
  example: 'website',
});

export type OgType = z.infer<typeof OgTypeSchema>;

export const DEFAULT_OG_TYPE: OgType = 'website';

export const OgTypes = {
  WEBSITE: 'website' as const,
  ARTICLE: 'article' as const,
  PRODUCT: 'product' as const,
} as const;

export function isValidOgType(value: unknown): value is OgType {
  return OgTypeSchema.safeParse(value).success;
}

// ============================================================================
// API VERSION
// ============================================================================

export const API_VERSIONS = ['v1', 'v2'] as const;

export const ApiVersionSchema = z.enum(API_VERSIONS).openapi({
  description: 'API version identifier',
  example: 'v1',
});

export type ApiVersion = z.infer<typeof ApiVersionSchema>;

export const DEFAULT_API_VERSION: ApiVersion = 'v1';

export const ApiVersions = {
  V1: 'v1' as const,
  V2: 'v2' as const,
} as const;

// ============================================================================
// EMAIL PROVIDER
// ============================================================================

export const EMAIL_PROVIDERS = ['resend', 'sendgrid', 'ses', 'smtp'] as const;

export const EmailProviderSchema = z.enum(EMAIL_PROVIDERS).openapi({
  description: 'Email service provider',
  example: 'resend',
});

export type EmailProvider = z.infer<typeof EmailProviderSchema>;

export const DEFAULT_EMAIL_PROVIDER: EmailProvider = 'resend';

export const EmailProviders = {
  RESEND: 'resend' as const,
  SENDGRID: 'sendgrid' as const,
  SES: 'ses' as const,
  SMTP: 'smtp' as const,
} as const;

// ============================================================================
// LOG FORMAT
// ============================================================================

export const LOG_FORMATS = ['json', 'text'] as const;

export const LogFormatSchema = z.enum(LOG_FORMATS).openapi({
  description: 'Log output format',
  example: 'json',
});

export type LogFormat = z.infer<typeof LogFormatSchema>;

export const DEFAULT_LOG_FORMAT: LogFormat = 'json';

export const LogFormats = {
  JSON: 'json' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// API ERROR SEVERITY
// ============================================================================

export const API_ERROR_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export const ApiErrorSeveritySchema = z.enum(API_ERROR_SEVERITIES).openapi({
  description: 'API error severity level',
  example: 'medium',
});

export type ApiErrorSeverity = z.infer<typeof ApiErrorSeveritySchema>;

export const DEFAULT_API_ERROR_SEVERITY: ApiErrorSeverity = 'medium';

export const ApiErrorSeverities = {
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const,
  CRITICAL: 'critical' as const,
} as const;

// ============================================================================
// STORAGE PURPOSE
// ============================================================================

export const STORAGE_PURPOSES = ['user_avatar', 'company_logo', 'company_banner', 'document', 'temp'] as const;

export const StoragePurposeSchema = z.enum(STORAGE_PURPOSES).openapi({
  description: 'Storage purpose classification',
  example: 'user_avatar',
});

export type StoragePurpose = z.infer<typeof StoragePurposeSchema>;

export const DEFAULT_STORAGE_PURPOSE: StoragePurpose = 'temp';

export const StoragePurposes = {
  USER_AVATAR: 'user_avatar' as const,
  COMPANY_LOGO: 'company_logo' as const,
  COMPANY_BANNER: 'company_banner' as const,
  DOCUMENT: 'document' as const,
  TEMP: 'temp' as const,
} as const;

// ============================================================================
// TEXT INPUT VARIANT (Form component variant)
// ============================================================================

export const TEXT_INPUT_VARIANTS = ['text', 'checkbox', 'date', 'switch', 'number', 'url', 'email', 'textarea'] as const;

export const TextInputVariantSchema = z.enum(TEXT_INPUT_VARIANTS).openapi({
  description: 'Text input form component variant',
  example: 'text',
});

export type TextInputVariant = z.infer<typeof TextInputVariantSchema>;

export const DEFAULT_TEXT_INPUT_VARIANT: TextInputVariant = 'text';

export const TextInputVariants = {
  TEXT: 'text' as const,
  CHECKBOX: 'checkbox' as const,
  DATE: 'date' as const,
  SWITCH: 'switch' as const,
  NUMBER: 'number' as const,
  URL: 'url' as const,
  EMAIL: 'email' as const,
  TEXTAREA: 'textarea' as const,
} as const;

// ============================================================================
// WITH OPTIONS VARIANT (Form component variant with options)
// ============================================================================

export const WITH_OPTIONS_VARIANTS = ['radio', 'select', 'combobox', 'trigger_schedule'] as const;

export const WithOptionsVariantSchema = z.enum(WITH_OPTIONS_VARIANTS).openapi({
  description: 'Form component variant with selectable options',
  example: 'select',
});

export type WithOptionsVariant = z.infer<typeof WithOptionsVariantSchema>;

export const DEFAULT_WITH_OPTIONS_VARIANT: WithOptionsVariant = 'select';

export const WithOptionsVariants = {
  RADIO: 'radio' as const,
  SELECT: 'select' as const,
  COMBOBOX: 'combobox' as const,
  TRIGGER_SCHEDULE: 'trigger_schedule' as const,
} as const;

// ============================================================================
// CACHE OPTION (Next.js cache configuration)
// ============================================================================

// 1. ARRAY CONSTANT
export const CACHE_OPTIONS = ['default', 'no-store', 'reload', 'force-cache', 'only-if-cached'] as const;

// 2. ZOD SCHEMA
export const CacheOptionSchema = z.enum(CACHE_OPTIONS).openapi({
  description: 'Next.js fetch cache option',
  example: 'no-store',
});

// 3. TYPESCRIPT TYPE
export type CacheOption = z.infer<typeof CacheOptionSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CACHE_OPTION: CacheOption = 'default';

// 5. CONSTANT OBJECT
export const CacheOptions = {
  DEFAULT: 'default' as const,
  NO_STORE: 'no-store' as const,
  RELOAD: 'reload' as const,
  FORCE_CACHE: 'force-cache' as const,
  ONLY_IF_CACHED: 'only-if-cached' as const,
} as const;

// ============================================================================
// CIRCUIT BREAKER STATE (Fetch Resilience Pattern)
// ============================================================================

// 1. ARRAY CONSTANT
export const CIRCUIT_BREAKER_STATES = ['closed', 'open', 'half-open'] as const;

// 2. ZOD SCHEMA
export const CircuitBreakerStateSchema = z.enum(CIRCUIT_BREAKER_STATES).openapi({
  description: 'Circuit breaker state for external API resilience',
  example: 'closed',
});

// 3. TYPESCRIPT TYPE
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CIRCUIT_BREAKER_STATE: CircuitBreakerState = 'closed';

// 5. CONSTANT OBJECT
export const CircuitBreakerStates = {
  CLOSED: 'closed' as const,
  OPEN: 'open' as const,
  HALF_OPEN: 'half-open' as const,
} as const;

export function isCircuitBreakerState(value: unknown): value is CircuitBreakerState {
  return CircuitBreakerStateSchema.safeParse(value).success;
}

// ============================================================================
// DATE FORMAT VARIANT (Date display formatting variants)
// ============================================================================

// 1. ARRAY CONSTANT
export const DATE_FORMAT_VARIANTS = ['short', 'medium', 'long'] as const;

// 2. ZOD SCHEMA
export const DateFormatVariantSchema = z.enum(DATE_FORMAT_VARIANTS).openapi({
  description: 'Date formatting variant for display',
  example: 'medium',
});

// 3. TYPESCRIPT TYPE
export type DateFormatVariant = z.infer<typeof DateFormatVariantSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_DATE_FORMAT_VARIANT: DateFormatVariant = 'medium';

// 5. CONSTANT OBJECT
export const DateFormatVariants = {
  SHORT: 'short' as const,
  MEDIUM: 'medium' as const,
  LONG: 'long' as const,
} as const;

// Labels for UI display
export const DATE_FORMAT_VARIANT_LABELS: Record<DateFormatVariant, string> = {
  [DateFormatVariants.SHORT]: 'Short',
  [DateFormatVariants.MEDIUM]: 'Medium',
  [DateFormatVariants.LONG]: 'Long',
} as const;

// Intl.DateTimeFormatOptions mapping
export const DATE_FORMAT_VARIANT_OPTIONS: Record<DateFormatVariant, Intl.DateTimeFormatOptions> = {
  [DateFormatVariants.SHORT]: { year: 'numeric', month: 'short', day: 'numeric' },
  [DateFormatVariants.MEDIUM]: { year: 'numeric', month: 'long', day: 'numeric' },
  [DateFormatVariants.LONG]: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
} as const;

// ============================================================================
// TASK PRIORITY
// ============================================================================

// 1. ARRAY CONSTANT
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_TASK_PRIORITY: TaskPriority = 'medium';

// 3. ZOD SCHEMA
export const TaskPrioritySchema = z.enum(TASK_PRIORITIES).openapi({
  description: 'Task priority level',
  example: 'medium',
});

// 4. TYPESCRIPT TYPE
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// 5. CONSTANT OBJECT
export const TaskPriorities = {
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const,
  URGENT: 'urgent' as const,
} as const;
