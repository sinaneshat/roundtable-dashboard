/**
 * Error Classification Enums
 *
 * Enums for categorizing errors in AI operations and streaming.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// ERROR TYPE (AI Operation Error Classification)
// ============================================================================

export const ErrorTypeSchema = z.enum([
  'rate_limit',
  'context_length',
  'api_error',
  'network',
  'timeout',
  'model_unavailable',
  'empty_response',
  'unknown',
]).openapi({
  description: 'Type of error that occurred during AI operations',
  example: 'api_error',
});

export type ErrorType = z.infer<typeof ErrorTypeSchema>;

export const ErrorTypes = {
  RATE_LIMIT: 'rate_limit' as const,
  CONTEXT_LENGTH: 'context_length' as const,
  API_ERROR: 'api_error' as const,
  NETWORK: 'network' as const,
  TIMEOUT: 'timeout' as const,
  MODEL_UNAVAILABLE: 'model_unavailable' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// STREAM ERROR TYPES (AI SDK v5 Error Handling)
// ============================================================================

export const STREAM_ERROR_TYPES = [
  'abort',
  'validation',
  'conflict',
  'network',
  'empty_response',
  'unknown',
] as const;

export const StreamErrorTypeSchema = z.enum(STREAM_ERROR_TYPES).openapi({
  description: 'Type of error that occurred during AI streaming',
  example: 'validation',
});

export type StreamErrorType = z.infer<typeof StreamErrorTypeSchema>;

export const StreamErrorTypes = {
  ABORT: 'abort' as const,
  VALIDATION: 'validation' as const,
  CONFLICT: 'conflict' as const,
  NETWORK: 'network' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// AUTHENTICATION FAILURE REASON
// ============================================================================

export const AuthFailureReasonSchema = z.enum([
  'invalid_credentials',
  'account_locked',
  'token_expired',
  'missing_token',
  'session_required',
  'session_expired',
]);

export type AuthFailureReason = z.infer<typeof AuthFailureReasonSchema>;

// ============================================================================
// RESOURCE UNAVAILABILITY REASON
// ============================================================================

export const ResourceUnavailableReasonSchema = z.enum(['deleted', 'archived', 'private', 'expired']);

export type ResourceUnavailableReason = z.infer<typeof ResourceUnavailableReasonSchema>;

// ============================================================================
// AUTH ACTION
// ============================================================================

export const AuthActionSchema = z.enum(['login', 'logout', 'token_refresh', 'permission_check', 'registration']).openapi({
  description: 'Authentication action type',
  example: 'login',
});

export type AuthAction = z.infer<typeof AuthActionSchema>;

export const AuthActions = {
  LOGIN: 'login' as const,
  LOGOUT: 'logout' as const,
  TOKEN_REFRESH: 'token_refresh' as const,
  PERMISSION_CHECK: 'permission_check' as const,
  REGISTRATION: 'registration' as const,
} as const;

// ============================================================================
// VALIDATION TYPE
// ============================================================================

export const ValidationTypeSchema = z.enum(['body', 'query', 'params', 'headers']).openapi({
  description: 'Request validation context type',
  example: 'body',
});

export type ValidationType = z.infer<typeof ValidationTypeSchema>;

export const ValidationTypes = {
  BODY: 'body' as const,
  QUERY: 'query' as const,
  PARAMS: 'params' as const,
  HEADERS: 'headers' as const,
} as const;

// ============================================================================
// ERROR CATEGORY (UI Error Classification)
// ============================================================================

export const ErrorCategorySchema = z.enum([
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
]).openapi({
  description: 'Error category for UI display and handling',
  example: 'provider_error',
});

export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const ErrorCategories = {
  MODEL_NOT_FOUND: 'model_not_found' as const,
  CONTENT_FILTER: 'content_filter' as const,
  RATE_LIMIT: 'rate_limit' as const,
  NETWORK: 'network' as const,
  PROVIDER_ERROR: 'provider_error' as const,
  VALIDATION: 'validation' as const,
  AUTHENTICATION: 'authentication' as const,
  SILENT_FAILURE: 'silent_failure' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  UNKNOWN: 'unknown' as const,
  PROVIDER_RATE_LIMIT: 'provider_rate_limit' as const,
  PROVIDER_NETWORK: 'provider_network' as const,
  MODEL_CONTENT_FILTER: 'model_content_filter' as const,
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

export const UIMessageErrorTypeSchema = z.enum(UI_MESSAGE_ERROR_TYPES).openapi({
  description: 'Error type for UI message display',
  example: 'failed',
});

export type UIMessageErrorType = z.infer<typeof UIMessageErrorTypeSchema>;

export const UIMessageErrorTypes = {
  PROVIDER_RATE_LIMIT: 'provider_rate_limit' as const,
  PROVIDER_NETWORK: 'provider_network' as const,
  MODEL_NOT_FOUND: 'model_not_found' as const,
  MODEL_CONTENT_FILTER: 'model_content_filter' as const,
  AUTHENTICATION: 'authentication' as const,
  VALIDATION: 'validation' as const,
  SILENT_FAILURE: 'silent_failure' as const,
  EMPTY_RESPONSE: 'empty_response' as const,
  BACKEND_INCONSISTENCY: 'backend_inconsistency' as const,
  FAILED: 'failed' as const,
  UNKNOWN: 'unknown' as const,
} as const;

// ============================================================================
// AI HISTORY STATUS (Operation Result Status)
// ============================================================================

export const AIHistoryStatusSchema = z.enum(['aborted', 'success', 'failed']).openapi({
  description: 'AI operation result status',
  example: 'success',
});

export type AIHistoryStatus = z.infer<typeof AIHistoryStatusSchema>;

export const AIHistoryStatuses = {
  ABORTED: 'aborted' as const,
  SUCCESS: 'success' as const,
  FAILED: 'failed' as const,
} as const;
