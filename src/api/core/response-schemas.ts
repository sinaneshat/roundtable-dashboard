/**
 * Standard OpenAPI Response Schemas
 *
 * ✅ SINGLE SOURCE OF TRUTH: Eliminates 45+ duplicated response schemas
 *
 * This file provides reusable OpenAPI response definitions for common HTTP status codes.
 * Used across all route files to maintain consistency and reduce duplication.
 *
 * @see /REFACTORING_PLAN.md - Phase 1, Task 1.1
 *
 * @example Basic usage in route files
 * ```typescript
 * import { StandardApiResponses } from '@/api/core/response-schemas';
 *
 * export const myRoute = createRoute({
 *   // ... route config
 *   responses: {
 *     [HttpStatusCodes.OK]: {
 *       description: 'Success message',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(MyDataSchema),
 *         },
 *       },
 *     },
 *     ...StandardApiResponses.UNAUTHORIZED,
 *     ...StandardApiResponses.NOT_FOUND,
 *     ...StandardApiResponses.INTERNAL_SERVER_ERROR,
 *   },
 * });
 * ```
 *
 * @example Using helper functions
 * ```typescript
 * import { createProtectedRouteResponses } from '@/api/core/response-schemas';
 *
 * export const myProtectedRoute = createRoute({
 *   // ... route config
 *   responses: {
 *     [HttpStatusCodes.OK]: {
 *       description: 'Success message',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(MyDataSchema),
 *         },
 *       },
 *     },
 *     ...createProtectedRouteResponses(),
 *   },
 * });
 * ```
 */

import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as HttpStatusPhrases from 'stoker/http-status-phrases';

import { ApiErrorResponseSchema } from './schemas';

// ============================================================================
// STANDARD API RESPONSE DEFINITIONS
// ============================================================================

/**
 * Standard OpenAPI response schemas for common HTTP status codes.
 * Each response follows the same structure with appropriate status code and phrase.
 *
 * These eliminate the need to repeatedly define the same error response structures
 * across all route files.
 */
export const StandardApiResponses = {
  /**
   * 401 Unauthorized - Authentication required or failed
   * Used when: User is not authenticated or session/token is invalid
   */
  UNAUTHORIZED: {
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 403 Forbidden - Authenticated but insufficient permissions
   * Used when: User is authenticated but doesn't have permission for this resource
   */
  FORBIDDEN: {
    [HttpStatusCodes.FORBIDDEN]: {
      description: HttpStatusPhrases.FORBIDDEN,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 404 Not Found - Resource does not exist
   * Used when: Requested resource ID doesn't exist in database
   */
  NOT_FOUND: {
    [HttpStatusCodes.NOT_FOUND]: {
      description: HttpStatusPhrases.NOT_FOUND,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 400 Bad Request - Invalid request data
   * Used when: Request validation fails (invalid parameters, malformed data)
   */
  BAD_REQUEST: {
    [HttpStatusCodes.BAD_REQUEST]: {
      description: HttpStatusPhrases.BAD_REQUEST,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 500 Internal Server Error - Unexpected server error
   * Used when: Unhandled exceptions, database errors, or other internal failures
   */
  INTERNAL_SERVER_ERROR: {
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 409 Conflict - Resource conflict
   * Used when: Duplicate resource, concurrent modification, or business rule violation
   */
  CONFLICT: {
    [HttpStatusCodes.CONFLICT]: {
      description: HttpStatusPhrases.CONFLICT,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },

  /**
   * 503 Service Unavailable - External service or dependency failure
   * Used when: External API down, database unavailable, or maintenance mode
   */
  SERVICE_UNAVAILABLE: {
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: {
      description: HttpStatusPhrases.SERVICE_UNAVAILABLE,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS FOR COMMON ROUTE PATTERNS
// ============================================================================

/**
 * Returns standard error responses for protected routes (require authentication).
 *
 * Includes:
 * - 401 UNAUTHORIZED: User not authenticated or session invalid
 * - 404 NOT_FOUND: Resource doesn't exist
 * - 500 INTERNAL_SERVER_ERROR: Unexpected server error
 *
 * @example
 * ```typescript
 * export const getThreadRoute = createRoute({
 *   method: 'get',
 *   path: '/threads/:id',
 *   responses: {
 *     [HttpStatusCodes.OK]: {
 *       description: 'Thread retrieved successfully',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(ThreadSchema),
 *         },
 *       },
 *     },
 *     ...createProtectedRouteResponses(),
 *   },
 * });
 * ```
 *
 * @returns Object containing UNAUTHORIZED, NOT_FOUND, and INTERNAL_SERVER_ERROR responses
 */
export function createProtectedRouteResponses() {
  return {
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  };
}

/**
 * Returns standard error responses for mutation routes (POST, PUT, DELETE).
 *
 * Includes:
 * - 401 UNAUTHORIZED: User not authenticated or session invalid
 * - 400 BAD_REQUEST: Invalid request data or validation failure
 * - 404 NOT_FOUND: Resource doesn't exist (for updates/deletes)
 * - 500 INTERNAL_SERVER_ERROR: Unexpected server error
 *
 * @example
 * ```typescript
 * export const createThreadRoute = createRoute({
 *   method: 'post',
 *   path: '/threads',
 *   request: {
 *     body: {
 *       content: {
 *         'application/json': {
 *           schema: CreateThreadSchema,
 *         },
 *       },
 *     },
 *   },
 *   responses: {
 *     [HttpStatusCodes.CREATED]: {
 *       description: 'Thread created successfully',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(ThreadSchema),
 *         },
 *       },
 *     },
 *     ...createMutationRouteResponses(),
 *   },
 * });
 * ```
 *
 * @returns Object containing UNAUTHORIZED, BAD_REQUEST, NOT_FOUND, and INTERNAL_SERVER_ERROR responses
 */
export function createMutationRouteResponses() {
  return {
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  };
}

/**
 * Returns standard error responses for public routes (no authentication required).
 *
 * Includes:
 * - 404 NOT_FOUND: Resource doesn't exist
 * - 500 INTERNAL_SERVER_ERROR: Unexpected server error
 *
 * @example
 * ```typescript
 * export const getPublicThreadRoute = createRoute({
 *   method: 'get',
 *   path: '/public/threads/:id',
 *   responses: {
 *     [HttpStatusCodes.OK]: {
 *       description: 'Public thread retrieved successfully',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(PublicThreadSchema),
 *         },
 *       },
 *     },
 *     ...createPublicRouteResponses(),
 *   },
 * });
 * ```
 *
 * @returns Object containing NOT_FOUND and INTERNAL_SERVER_ERROR responses
 */
export function createPublicRouteResponses() {
  return {
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  };
}

/**
 * Returns standard error responses for admin-only routes (require elevated permissions).
 *
 * Includes:
 * - 401 UNAUTHORIZED: User not authenticated or session invalid
 * - 403 FORBIDDEN: User authenticated but lacks admin permissions
 * - 404 NOT_FOUND: Resource doesn't exist
 * - 500 INTERNAL_SERVER_ERROR: Unexpected server error
 *
 * @example
 * ```typescript
 * export const deleteUserRoute = createRoute({
 *   method: 'delete',
 *   path: '/admin/users/:id',
 *   responses: {
 *     [HttpStatusCodes.OK]: {
 *       description: 'User deleted successfully',
 *       content: {
 *         'application/json': {
 *           schema: createApiResponseSchema(z.object({ success: z.literal(true) })),
 *         },
 *       },
 *     },
 *     ...createAdminRouteResponses(),
 *   },
 * });
 * ```
 *
 * @returns Object containing UNAUTHORIZED, FORBIDDEN, NOT_FOUND, and INTERNAL_SERVER_ERROR responses
 */
export function createAdminRouteResponses() {
  return {
    ...StandardApiResponses.UNAUTHORIZED,
    ...StandardApiResponses.FORBIDDEN,
    ...StandardApiResponses.NOT_FOUND,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

/**
 * Type definitions for standard API responses
 * Useful for type-safe route response definitions
 */
export type StandardApiResponseType = typeof StandardApiResponses;
export type ProtectedRouteResponses = ReturnType<typeof createProtectedRouteResponses>;
export type MutationRouteResponses = ReturnType<typeof createMutationRouteResponses>;
export type PublicRouteResponses = ReturnType<typeof createPublicRouteResponses>;
export type AdminRouteResponses = ReturnType<typeof createAdminRouteResponses>;
