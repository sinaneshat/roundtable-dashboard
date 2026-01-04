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

export { AIModels } from './ai-models';
export { createOpenApiApp } from './app';
export { APP_CONFIG, FEATURE_FLAGS, STREAMING_CONFIG } from './config';
export {
  ApiErrors,
  formatErrorResponse,
  isAppError,
} from './errors';
export {
  type BatchContext,
  type BatchHandler,
  createHandler,
  createHandlerWithBatch,
  type HandlerConfig,
  type HandlerContext,
  type RegularHandler,
} from './handlers';
export {
  EnhancedHTTPException,
  HTTPExceptionFactory,
  type HTTPExceptionFactoryOptions,
  isContentfulStatusCode,
  isValidContentfulStatusCode,
  mapStatusCode,
  STOKER_TO_HONO_STATUS_MAP,
} from './http-exceptions';
export {
  applyCursorPagination,
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
  withPagination,
} from './pagination';
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
export {
  accepted,
  authenticationError,
  authorizationError,
  badRequest,
  conflict,
  created,
  cursorPaginated,
  customResponse,
  databaseError,
  externalServiceError,
  internalServerError,
  noContent,
  notFound,
  ok,
  paginated,
  rateLimitExceeded,
  redirect,
  type ResponseBuilders,
  Responses,
  validateErrorResponse,
  validatePaginatedResponse,
  validateSuccessResponse,
  validationError,
} from './responses';
export type { ValidationError } from './schemas';
export {
  type ApiErrorResponse,
  ApiErrorResponseSchema,
  type ApiResponse,
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  createPaginatedResponseSchema,
  type CursorPaginatedResponse,
  type ErrorContext,
  ErrorContextSchema,
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
  PaginationQuerySchema,
  type SearchQuery,
  SearchQuerySchema,
  type SortingQuery,
  SortingQuerySchema,
  type SSEStreamMetadata,
  SSEStreamMetadataSchema,
  type TextStreamMetadata,
  TextStreamMetadataSchema,
  ThreadIdParamSchema,
  ThreadRoundParamSchema,
  ThreadSlugParamSchema,
} from './schemas';
export {
  type ConditionalData,
  ConditionalDataSchema,
  type ConditionalValue,
  createConditionalValidator,
  createFileUploadValidator,
  createMultiFormatValidator,
  createPartialSchema,
  createPickSchema,
  createSearchSchema,
  createUpdateSchema,
  createValidationErrorContext,
  createValidator,
  customValidationHook,
  documentUploadValidator,
  type FilterValue,
  FilterValueSchema,
  formatValidationErrorContext,
  type PathParams,
  PathParamsSchema,
  type UnknownInput,
  UnknownInputSchema,
  validateErrorContext,
  validatePathParams,
  validateQueryParams,
  validateRequestBody,
  validateWithSchema,
  type ValidationFailure,
  type ValidationResult,
  type ValidationSuccess,
} from './validation';
