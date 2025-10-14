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
  getCursorOrderBy,
  type PagePaginationMetadata,
  type PagePaginationParams,
  validatePageParams,
  // Drizzle ORM official patterns
  withPagination,
} from './pagination';
export {
  type StoragePurpose,
  storagePurposeSchema,
} from './storage-keys';
export {
  getNumberFromMetadata,
  parseErrorObject,
} from './type-utils';
