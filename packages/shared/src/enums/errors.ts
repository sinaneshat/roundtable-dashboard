/**
 * Error Classification Enums
 *
 * Enums for categorizing errors in AI operations and streaming.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// ERROR TYPE (AI Operation Error Classification)
// ============================================================================

export const ERROR_TYPES = [
  'rate_limit',
  'context_length',
  'api_error',
  'network',
  'timeout',
  'model_unavailable',
  'empty_response',
  'unknown',
] as const;

export const DEFAULT_ERROR_TYPE: ErrorType = 'unknown';

export const ErrorTypeSchema = z.enum(ERROR_TYPES).openapi({
  description: 'Type of error that occurred during AI operations',
  example: 'api_error',
});

export type ErrorType = z.infer<typeof ErrorTypeSchema>;

export const ErrorTypes = {
  API_ERROR: 'api_error' as const,
  CONTEXT_LENGTH: 'context_length' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  MODEL_UNAVAILABLE: 'model_unavailable' as const,
  NETWORK: 'network' as const,
  RATE_LIMIT: 'rate_limit' as const,
  TIMEOUT: 'timeout' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// STREAM ERROR TYPES (AI SDK v6 Error Handling)
// ============================================================================

export const STREAM_ERROR_TYPES = [
  'abort',
  'validation',
  'conflict',
  'network',
  'empty_response',
  'unknown',
] as const;

export const DEFAULT_STREAM_ERROR_TYPE: StreamErrorType = 'unknown';

export const StreamErrorTypeSchema = z.enum(STREAM_ERROR_TYPES).openapi({
  description: 'Type of error that occurred during AI streaming',
  example: 'validation',
});

export type StreamErrorType = z.infer<typeof StreamErrorTypeSchema>;

export const StreamErrorTypes = {
  ABORT: 'abort' as const,
  CONFLICT: 'conflict' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  NETWORK: 'network' as const,
  UNKNOWN: 'unknown' as const,
  VALIDATION: 'validation' as const,
} as const;

// ============================================================================
// AUTHENTICATION FAILURE REASON
// ============================================================================

export const AUTH_FAILURE_REASONS = [
  'invalid_credentials',
  'account_locked',
  'token_expired',
  'missing_token',
  'session_required',
  'session_expired',
] as const;

export const DEFAULT_AUTH_FAILURE_REASON: AuthFailureReason = 'invalid_credentials';

export const AuthFailureReasonSchema = z.enum(AUTH_FAILURE_REASONS).openapi({
  description: 'Reason for authentication failure',
  example: 'session_expired',
});

export type AuthFailureReason = z.infer<typeof AuthFailureReasonSchema>;

export const AuthFailureReasons = {
  ACCOUNT_LOCKED: 'account_locked' as const,
  INVALID_CREDENTIALS: 'invalid_credentials' as const,
  MISSING_TOKEN: 'missing_token' as const,
  SESSION_EXPIRED: 'session_expired' as const,
  SESSION_REQUIRED: 'session_required' as const,
  TOKEN_EXPIRED: 'token_expired' as const,
} as const;

// ============================================================================
// RESOURCE UNAVAILABILITY REASON
// ============================================================================

export const RESOURCE_UNAVAILABLE_REASONS = ['deleted', 'archived', 'private', 'expired'] as const;

export const ResourceUnavailableReasonSchema = z.enum(RESOURCE_UNAVAILABLE_REASONS).openapi({
  description: 'Reason why a resource is unavailable',
  example: 'deleted',
});

export type ResourceUnavailableReason = z.infer<typeof ResourceUnavailableReasonSchema>;

export const DEFAULT_RESOURCE_UNAVAILABLE_REASON: ResourceUnavailableReason = 'deleted';

export const ResourceUnavailableReasons = {
  ARCHIVED: 'archived' as const,
  DELETED: 'deleted' as const,
  EXPIRED: 'expired' as const,
  PRIVATE: 'private' as const,
} as const;

// ============================================================================
// AUTH ACTION
// ============================================================================

export const AUTH_ACTIONS = ['login', 'logout', 'token_refresh', 'permission_check', 'registration'] as const;

export const DEFAULT_AUTH_ACTION: AuthAction = 'login';

export const AuthActionSchema = z.enum(AUTH_ACTIONS).openapi({
  description: 'Authentication action type',
  example: 'login',
});

export type AuthAction = z.infer<typeof AuthActionSchema>;

export const AuthActions = {
  LOGIN: 'login' as const,
  LOGOUT: 'logout' as const,
  PERMISSION_CHECK: 'permission_check' as const,
  REGISTRATION: 'registration' as const,
  TOKEN_REFRESH: 'token_refresh' as const,
} as const;

// ============================================================================
// VALIDATION TYPE
// ============================================================================

export const VALIDATION_TYPES = ['body', 'query', 'params', 'headers'] as const;

export const DEFAULT_VALIDATION_TYPE: ValidationType = 'body';

export const ValidationTypeSchema = z.enum(VALIDATION_TYPES).openapi({
  description: 'Request validation context type',
  example: 'body',
});

export type ValidationType = z.infer<typeof ValidationTypeSchema>;

export const ValidationTypes = {
  BODY: 'body' as const,
  HEADERS: 'headers' as const,
  PARAMS: 'params' as const,
  QUERY: 'query' as const,
} as const;

// ============================================================================
// ERROR CATEGORY (UI Error Classification)
// ============================================================================

export const ERROR_CATEGORIES = [
  'model_not_found',
  'content_filter',
  'rate_limit',
  'network',
  'provider_error',
  'validation',
  'authentication',
  'silent_failure',
  'empty_response',
  'unknown',
  'provider_rate_limit',
  'provider_network',
  'model_content_filter',
] as const;

export const DEFAULT_ERROR_CATEGORY: ErrorCategory = 'unknown';

export const ErrorCategorySchema = z.enum(ERROR_CATEGORIES).openapi({
  description: 'Error category for UI display and handling',
  example: 'provider_error',
});

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCategories = {
  AUTHENTICATION: 'authentication' as const,
  CONTENT_FILTER: 'content_filter' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  MODEL_CONTENT_FILTER: 'model_content_filter' as const,
  MODEL_NOT_FOUND: 'model_not_found' as const,
  NETWORK: 'network' as const,
  PROVIDER_ERROR: 'provider_error' as const,
  PROVIDER_NETWORK: 'provider_network' as const,
  PROVIDER_RATE_LIMIT: 'provider_rate_limit' as const,
  RATE_LIMIT: 'rate_limit' as const,
  SILENT_FAILURE: 'silent_failure' as const,
  UNKNOWN: 'unknown' as const,
  VALIDATION: 'validation' as const,
} as const;

// ============================================================================
// UI MESSAGE ERROR TYPE
// ============================================================================

export const UI_MESSAGE_ERROR_TYPES = [
  'provider_rate_limit',
  'provider_network',
  'model_not_found',
  'model_content_filter',
  'authentication',
  'validation',
  'silent_failure',
  'empty_response',
  'backend_inconsistency',
  'failed',
  'unknown',
] as const;

export const DEFAULT_UI_MESSAGE_ERROR_TYPE: UIMessageErrorType = 'unknown';

export const UIMessageErrorTypeSchema = z.enum(UI_MESSAGE_ERROR_TYPES).openapi({
  description: 'Error type for UI message display',
  example: 'failed',
});

export type UIMessageErrorType = z.infer<typeof UIMessageErrorTypeSchema>;

export const UIMessageErrorTypes = {
  AUTHENTICATION: 'authentication' as const,
  BACKEND_INCONSISTENCY: 'backend_inconsistency' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  FAILED: 'failed' as const,
  MODEL_CONTENT_FILTER: 'model_content_filter' as const,
  MODEL_NOT_FOUND: 'model_not_found' as const,
  PROVIDER_NETWORK: 'provider_network' as const,
  PROVIDER_RATE_LIMIT: 'provider_rate_limit' as const,
  SILENT_FAILURE: 'silent_failure' as const,
  UNKNOWN: 'unknown' as const,
  VALIDATION: 'validation' as const,
} as const;

// ============================================================================
// AI HISTORY STATUS (Operation Result Status)
// ============================================================================

export const AI_HISTORY_STATUSES = ['aborted', 'success', 'failed'] as const;

export const DEFAULT_AI_HISTORY_STATUS: AIHistoryStatus = 'failed';

export const AIHistoryStatusSchema = z.enum(AI_HISTORY_STATUSES).openapi({
  description: 'AI operation result status',
  example: 'success',
});

export type AIHistoryStatus = z.infer<typeof AIHistoryStatusSchema>;

export const AIHistoryStatuses = {
  ABORTED: 'aborted' as const,
  FAILED: 'failed' as const,
  SUCCESS: 'success' as const,
} as const;

// ============================================================================
// ERROR CODE (Standard API Error Codes)
// ============================================================================

export const ERROR_CODES = [
  // Authentication & Authorization
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'INSUFFICIENT_PERMISSIONS',

  // Validation & Input
  'VALIDATION_ERROR',
  'INVALID_INPUT',
  'MISSING_REQUIRED_FIELD',
  'INVALID_FORMAT',
  'INVALID_ENUM_VALUE',

  // Resource Management
  'RESOURCE_NOT_FOUND',
  'RESOURCE_ALREADY_EXISTS',
  'RESOURCE_CONFLICT',
  'RESOURCE_LOCKED',
  'RESOURCE_EXPIRED',

  // Business Logic
  'BUSINESS_RULE_VIOLATION',

  // External Services
  'EXTERNAL_SERVICE_ERROR',
  'EMAIL_SERVICE_ERROR',
  'STORAGE_SERVICE_ERROR',

  // System & Infrastructure
  'INTERNAL_SERVER_ERROR',
  'DATABASE_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'SERVICE_UNAVAILABLE',
  'MAINTENANCE_MODE',
  'BATCH_FAILED',
  'BATCH_SIZE_EXCEEDED',
] as const;

export const DEFAULT_ERROR_CODE: ErrorCode = 'INTERNAL_SERVER_ERROR';

export const ErrorCodeSchema = z.enum(ERROR_CODES).openapi({
  description: 'Standard API error code',
  example: 'VALIDATION_ERROR',
});

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorCodes = {
  BATCH_FAILED: 'BATCH_FAILED' as const,
  BATCH_SIZE_EXCEEDED: 'BATCH_SIZE_EXCEEDED' as const,
  // Business Logic
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION' as const,
  DATABASE_ERROR: 'DATABASE_ERROR' as const,
  EMAIL_SERVICE_ERROR: 'EMAIL_SERVICE_ERROR' as const,

  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR' as const,
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS' as const,
  // System & Infrastructure
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' as const,
  INVALID_ENUM_VALUE: 'INVALID_ENUM_VALUE' as const,
  INVALID_FORMAT: 'INVALID_FORMAT' as const,

  INVALID_INPUT: 'INVALID_INPUT' as const,
  MAINTENANCE_MODE: 'MAINTENANCE_MODE' as const,
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD' as const,
  NETWORK_ERROR: 'NETWORK_ERROR' as const,
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED' as const,

  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS' as const,

  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT' as const,
  RESOURCE_EXPIRED: 'RESOURCE_EXPIRED' as const,
  RESOURCE_LOCKED: 'RESOURCE_LOCKED' as const,

  // Resource Management
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND' as const,
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE' as const,
  STORAGE_SERVICE_ERROR: 'STORAGE_SERVICE_ERROR' as const,
  TIMEOUT_ERROR: 'TIMEOUT_ERROR' as const,
  TOKEN_EXPIRED: 'TOKEN_EXPIRED' as const,
  TOKEN_INVALID: 'TOKEN_INVALID' as const,
  // Authentication & Authorization
  UNAUTHENTICATED: 'UNAUTHENTICATED' as const,
  UNAUTHORIZED: 'UNAUTHORIZED' as const,
  // Validation & Input
  VALIDATION_ERROR: 'VALIDATION_ERROR' as const,
} as const;

// ============================================================================
// ERROR CONTEXT TYPE (Discriminated Union Error Context)
// ============================================================================

export const ERROR_CONTEXT_TYPES = [
  'validation',
  'authentication',
  'authorization',
  'database',
  'external_service',
  'resource',
  'resource_unavailable',
  'configuration',
  'quota',
  'subscription',
  'moderator_error',
  'retry_exhausted',
  'queue',
] as const;

export const DEFAULT_ERROR_CONTEXT_TYPE: ErrorContextType = 'validation';

export const ErrorContextTypeSchema = z.enum(ERROR_CONTEXT_TYPES).openapi({
  description: 'Error context type for discriminated union',
  example: 'validation',
});

export type ErrorContextType = z.infer<typeof ErrorContextTypeSchema>;

export const ErrorContextTypes = {
  AUTHENTICATION: 'authentication' as const,
  AUTHORIZATION: 'authorization' as const,
  CONFIGURATION: 'configuration' as const,
  DATABASE: 'database' as const,
  EXTERNAL_SERVICE: 'external_service' as const,
  MODERATOR_ERROR: 'moderator_error' as const,
  QUEUE: 'queue' as const,
  QUOTA: 'quota' as const,
  RESOURCE: 'resource' as const,
  RESOURCE_UNAVAILABLE: 'resource_unavailable' as const,
  RETRY_EXHAUSTED: 'retry_exhausted' as const,
  SUBSCRIPTION: 'subscription' as const,
  VALIDATION: 'validation' as const,
} as const;
