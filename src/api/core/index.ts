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
// AI MODELS
// ============================================================================

export { AIModels } from './ai-models';

// ============================================================================
// APP FACTORY
// ============================================================================

export { createOpenApiApp } from './app';

// ============================================================================
// CONFIGURATION
// ============================================================================

export { APP_CONFIG, FEATURE_FLAGS, STREAMING_CONFIG } from './config';

// ============================================================================
// ENUMS
// ============================================================================

export {
  AUTH_MODES,
  AUTH_STEPS,
  // Auth Mode
  type AuthMode,
  AuthModes,
  AuthModeSchema,
  // Auth Step
  type AuthStep,
  AuthSteps,
  AuthStepSchema,
  BORDER_GRADIENT_DIRECTIONS,
  // Border Gradient Direction (was HoverDirection)
  type BorderGradientDirection,
  BorderGradientDirections,
  BorderGradientDirectionSchema,
  CONFIRMATION_DIALOG_VARIANTS,
  // Confirmation Dialog Variant (was ConfirmationVariant)
  type ConfirmationDialogVariant,
  ConfirmationDialogVariants,
  ConfirmationDialogVariantSchema,
  CURSOR_DIRECTIONS,
  // Cursor Direction
  type CursorDirection,
  CursorDirections,
  CursorDirectionSchema,
  DEFAULT_AUTH_MODE,
  DEFAULT_AUTH_STEP,
  DEFAULT_CONFIRMATION_DIALOG_VARIANT,
  DEFAULT_CURSOR_DIRECTION,
  DEFAULT_DEV_LOG_LEVEL,
  DEFAULT_ERROR_BOUNDARY_CONTEXT,
  DEFAULT_ICON_TYPE,
  DEFAULT_IMAGE_STATE,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MARKDOWN_PRESET,
  DEFAULT_SORT_DIRECTION,
  DEV_LOG_LEVELS,
  // Dev Log Level
  type DevLogLevel,
  DevLogLevels,
  DevLogLevelSchema,
  ERROR_BOUNDARY_CONTEXTS,
  // Error Boundary Context (UI component, distinct from ErrorContext in schemas.ts)
  type ErrorBoundaryContext,
  ErrorBoundaryContexts,
  ErrorBoundaryContextSchema,
  ICON_TYPES,
  // Icon Type (was AttachmentIconType)
  type IconType,
  IconTypes,
  IconTypeSchema,
  IMAGE_STATES,
  // Image State
  type ImageState,
  ImageStates,
  ImageStateSchema,
  LOG_LEVELS,
  // Log Level
  type LogLevel,
  LogLevels,
  LogLevelSchema,
  MARKDOWN_PRESETS,
  // Markdown Preset
  type MarkdownPreset,
  MarkdownPresets,
  MarkdownPresetSchema,
  SORT_DIRECTIONS,
  // Sort Direction
  type SortDirection,
  SortDirections,
  SortDirectionSchema,
} from './enums';

// ============================================================================
// ERRORS (API layer only - import @/api/common/* utilities directly)
// ============================================================================

export {
  // ✅ Consolidated API error factory (defined in errors.ts)
  ApiErrors,
  // ✅ Error utilities (defined in errors.ts)
  formatErrorResponse,
  isAppError,
} from './errors';

// ❌ DO NOT re-export from @/api/common/* here
// Import these directly from their canonical source:
// - createError, AppError, ERROR_CODES → from '@/api/common/error-handling'
// - ErrorContextBuilders → from '@/api/common/error-contexts'
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
  createMutationRouteResponses,
  createProtectedRouteResponses,
  createPublicRouteResponses,
  type MutationRouteResponses,
  type ProtectedRouteResponses,
  type PublicRouteResponses,
  StandardApiResponses,
  type StandardApiResponseType,
} from './response-schemas';

// ============================================================================
// HANDLERS
// ============================================================================

// ============================================================================
// ERROR HANDLING
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
// RESPONSE SCHEMAS
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
  // Error context schema (API error handling, distinct from ErrorBoundaryContext in enums)
  type ErrorContext,
  ErrorContextSchema,
  // Health check schemas (ZOD-FIRST)
  type HealthDependency,
  HealthDependencySchema,
  type HealthSummary,
  HealthSummarySchema,
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
  // SSE/Streaming metadata schemas (ZOD-FIRST)
  type SSEStreamMetadata,
  SSEStreamMetadataSchema,
  type TextStreamMetadata,
  TextStreamMetadataSchema,
  // Thread-specific path parameters
  ThreadIdParamSchema,
  ThreadRoundParamSchema,
  ThreadSlugParamSchema,
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
