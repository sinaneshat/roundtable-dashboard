/**
 * Unified API Core System - Context7 Best Practices
 *
 * Single entry point for the new type-safe, unified API system.
 * Replaces scattered validation files and inconsistent patterns.
 *
 * Usage:
 * ```typescript
 * import { Schemas, Validators, Responses, createHandler } from '@/api/core';
 *
 * // Create type-safe handler
 * const handler = createHandler({
 *   auth: 'session',
 *   validateBody: Schemas.CoreSchemas.email(),
 *   operationName: 'CreateUser'
 * }, async (c) => {
 *   const email = c.validated.body;
 *   return Responses.created(c, { userId: 'user_123' });
 * });
 * ```
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { created, cursorPaginated, internalServerError, notFound, ok, paginated, validationError } from './responses';
import {
  CoreSchemas,
  IdParamSchema,
  ListQuerySchema,
  PaginationQuerySchema,
  SearchQuerySchema,
  SortingQuerySchema,
} from './schemas';
import {
  documentUploadValidator,
} from './validation';

// ============================================================================
// APP FACTORY
// ============================================================================

export { createOpenApiApp } from './app';

// ============================================================================
// SCHEMAS AND VALIDATION
// ============================================================================

export {
  type AIProviderErrorCategory,
  type AIProviderErrorMetadata,
  // Consolidated API error factory
  ApiErrors,
  // Re-exported from common/error-handling.ts
  AppError,
  type AppErrorConfig,
  createError,
  ERROR_CODES,
  ERROR_SEVERITY,
  type ErrorCode,
  ErrorCodeSchema,
  ErrorContextBuilders,
  // Error context shortcuts
  ErrorContexts,
  type ErrorSeverity,
  ErrorSeveritySchema,
  ExternalServiceError,
  formatErrorResponse,
  isAppError,
  normalizeError,
  structureAIProviderError,
} from './errors';
export {
  // Type exports
  type BatchContext,
  type BatchHandler,
  // Handler factories
  createHandler,
  createHandlerWithBatch,
  type HandlerConfig,
  type HandlerContext,
  type RegularHandler,
} from './handlers';
export {
  // Migration utilities for existing code
  createHTTPException,
  // Enhanced HTTP Exception System
  EnhancedHTTPException,
  HTTPExceptionFactory,
  type HTTPExceptionFactoryOptions,
  HttpExceptions,
  // Type-safe mapping utilities
  isContentfulStatusCode,
  isValidContentfulStatusCode,
  mapStatusCode,
  STOKER_TO_HONO_STATUS_MAP,
} from './http-exceptions';
export {
  // Cursor-based pagination
  applyCursorPagination,
  // Page-based pagination
  applyPagePagination,
  buildCursorWhere,
  buildCursorWhereWithFilters,
  calculatePageMetadata,
  createTimestampCursor,
  type CursorDirection,
  type CursorFieldConfig,
  type CursorPaginationMetadata,
  type CursorPaginationQuery,
  CursorPaginationQuerySchema,
  DEFAULT_PAGE_SIZE,
  getCursorOrderBy,
  MAX_PAGE_SIZE,
  type OffsetPaginationQuery,
  OffsetPaginationQuerySchema,
  type PagePaginationMetadata,
  type PagePaginationParams,
  validatePageParams,
  // Drizzle ORM official patterns
  withPagination,
} from './pagination';

// ============================================================================
// RESPONSES
// ============================================================================

export {
  accepted,
  authenticationError,
  authorizationError,
  badRequest,
  conflict,
  created,
  cursorPaginated,
  // Utilities
  customResponse,
  databaseError,
  externalServiceError,
  internalServerError,
  noContent,
  notFound,
  // Success responses
  ok,
  paginated,
  rateLimitExceeded,
  redirect,
  // Type exports
  type ResponseBuilders,
  // Consolidated responses object
  Responses,
  validateErrorResponse,
  validatePaginatedResponse,
  // Validators
  validateSuccessResponse,
  // Error responses
  validationError,
} from './responses';

// ============================================================================
// HANDLERS
// ============================================================================

// ============================================================================
// ERROR HANDLING
// ============================================================================

export {
  type ApiErrorResponse,
  ApiErrorResponseSchema,
  type ApiResponse,
  // Core schema building blocks
  CoreSchemas,
  // Response schemas
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  createPaginatedResponseSchema,
  type CursorPaginatedResponse,
  type ErrorContext,
  ErrorContextSchema,
  type IdParam,
  IdParamSchema,
  type ListQuery,
  ListQuerySchema,
  type PaginatedResponse,
  type PaginationQuery,
  // Common request schemas
  PaginationQuerySchema,
  type SearchQuery,
  SearchQuerySchema,
  type SortingQuery,
  SortingQuerySchema,
} from './schemas';

// ============================================================================
// CONVENIENCE BUNDLES
// ============================================================================

/**
 * Bundle of most commonly used schemas for quick import
 */
export const CommonSchemas = {
  // Core fields
  uuid: CoreSchemas.uuid,
  id: CoreSchemas.id,
  email: CoreSchemas.email,
  url: CoreSchemas.url,
  amount: CoreSchemas.amount,
  timestamp: CoreSchemas.timestamp,

  // Request patterns
  pagination: PaginationQuerySchema,
  sorting: SortingQuerySchema,
  search: SearchQuerySchema,
  listQuery: ListQuerySchema,
  idParam: IdParamSchema,
} as const;

/**
 * Bundle of most commonly used validators for quick import
 */
export const CommonValidators = {
  // Files
  document: documentUploadValidator,
} as const;

/**
 * Bundle of most commonly used response builders for quick import
 */
export const CommonResponses = {
  success: ok,
  created,
  paginated,
  cursorPaginated,
  validationError,
  notFound,
  internalError: internalServerError,
} as const;

// ============================================================================
// PAGINATION UTILITIES
// ============================================================================

export {
  // Conditional validators
  createConditionalValidator,
  // File upload validators
  createFileUploadValidator,
  createMultiFormatValidator,
  // Schema composition
  createPartialSchema,
  createPickSchema,
  createSearchSchema,
  createUpdateSchema,
  createValidationErrorContext,
  createValidator,
  // Validation hook (for createOpenApiApp)
  customValidationHook,
  documentUploadValidator,
  formatValidationErrors,
  validateErrorContext,
  validatePathParams,
  validateQueryParams,
  // Request validation helpers
  validateRequestBody,
  // Validation utilities
  validateWithSchema,
  type ValidationError,
  type ValidationFailure,
  type ValidationResult,
  // Type exports
  type ValidationSuccess,
  ValidationUtils,
  // Specialized validators
  Validators,
} from './validation';

// Export auth types from types module
export type { AuthenticatedContext, AuthMode } from '@/api/types';
