/**
 * Common API Utilities - Exports
 *
 * Centralized exports for shared utilities used across the API layer.
 * Following the established pattern from src/api/core/index.ts.
 */

// ============================================================================
// PAGINATION UTILITIES
// ============================================================================

export {
  executeBatch,
  validateBatchSize,
} from './batch-operations';

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

export {
  ErrorContextBuilders,
} from './error-contexts';
export {
  AppError,
  createError,
  type ErrorCode,
  normalizeError,
} from './error-handling';
export {
  type AISdkError,
  extractAISdkError,
  extractErrorInfo,
  extractGenericError,
  extractNetworkError,
  type GenericError,
  getErrorCause,
  getErrorMessage,
  getErrorName,
  getErrorStack,
  getErrorStatusCode,
  hasErrorName,
  hasErrorStatusCode,
  isError,
  type NetworkError,
} from './error-types';

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export {
  createHTTPExceptionFromFetchResult,
  type FetchConfig,
  type FetchResult,
  type ParsedResponse,
  type RetryableError,
  type UnvalidatedParseResult,
  validateEnvironmentVariables,
} from './fetch-utilities';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export {
  extractFile,
  extractOptionalString,
} from './form-utils';

// ============================================================================
// METADATA UTILITIES
// ============================================================================

export {
  createProductMetadata,
  createSeoMetadata,
  createSubscriptionMetadata,
  extractProductMetadata,
  extractSeoMetadata,
  parseMetadata,
  type TypedMetadata,
} from './metadata-utils';
export {
  type StoragePurpose,
  storagePurposeSchema,
} from './storage-keys';
export {
  getNumberFromMetadata,
  parseErrorObject,
} from './type-utils';

// ============================================================================
// RE-EXPORTS FROM CORE (for convenience)
// ============================================================================

// Pagination utilities from @/api/core/pagination
export {
  applyCursorPagination,
  applyPagePagination,
  buildCursorWhere,
  buildCursorWhereWithFilters,
  calculatePageMetadata,
  createTimestampCursor,
  type CursorDirection,
  type CursorFieldConfig,
  type CursorPaginationMetadata,
  getCursorOrderBy,
  type PagePaginationMetadata,
  type PagePaginationParams,
  validatePageParams,
  withPagination,
} from '@/api/core/pagination';
