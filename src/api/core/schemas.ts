/**
 * Unified Schema System - Context7 ZOD Best Practices
 *
 * This replaces multiple validation files with a single, comprehensive,
 * type-safe schema system following official ZOD and HONO patterns.
 *
 * Features:
 * - Discriminated unions instead of Record<string, unknown>
 * - Maximum type safety and inference
 * - Reusable schema components
 * - Consistent OpenAPI documentation
 * - Single source of truth for all validations
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// CORE PRIMITIVE SCHEMAS (Context7 Pattern)
// ============================================================================

/**
 * Core field schemas with OpenAPI metadata
 * Following Context7 best practices for maximum reusability
 */
export const CoreSchemas = {
  // Identifiers
  uuid: () => z.string().uuid().openapi({
    example: 'abc123e4-5678-9012-3456-789012345678',
    description: 'UUID identifier',
  }),

  id: () => z.string().min(1).openapi({
    example: 'id_123456789',
    description: 'String identifier',
  }),

  // Text fields
  email: () => z.string().email().openapi({
    example: 'user@example.com',
    description: 'Valid email address',
  }),

  url: () => z.url().openapi({
    example: 'https://example.com',
    description: 'Valid URL',
  }),

  description: () => z.string().min(1).max(500).openapi({
    example: 'Product description',
    description: 'Text description (1-500 characters)',
  }),

  // Numeric fields
  amount: () => z.number().nonnegative().openapi({
    example: 99.00,
    description: 'Amount in USD',
  }),

  positiveInt: () => z.number().int().positive().openapi({
    example: 1,
    description: 'Positive integer',
  }),

  percentage: () => z.number().min(0).max(100).openapi({
    example: 15.5,
    description: 'Percentage value (0-100)',
  }),

  // Temporal fields
  timestamp: () => z.iso.datetime().openapi({
    example: new Date().toISOString(),
    description: 'ISO 8601 timestamp',
  }),

  // Pagination
  page: () => z.coerce.number().int().min(1).default(1).openapi({
    example: 1,
    description: 'Page number (1-based)',
  }),

  limit: () => z.coerce.number().int().min(1).max(100).default(20).openapi({
    example: 20,
    description: 'Results per page (max 100)',
  }),

  // Common enums
  currency: () => z.enum(['USD']).default('USD').openapi({
    example: 'USD',
    description: 'Currency code (USD only)',
  }),

  sortOrder: () => z.enum(['asc', 'desc']).default('desc').openapi({
    example: 'desc',
    description: 'Sort order',
  }),

  // Status fields
  entityStatus: () => z.enum(['active', 'inactive', 'suspended', 'deleted']).openapi({
    example: 'active',
    description: 'Entity status',
  }),
} as const;

// ============================================================================
// DISCRIMINATED UNION METADATA SCHEMAS (Context7 Pattern)
// ============================================================================

/**
 * Request metadata discriminated union - replaces Record<string, unknown>
 * Maximum type safety with comprehensive validation
 */
export const RequestMetadataSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('api_request'),
    endpoint: z.string().min(1),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    version: z.string().regex(/^v\d+(\.\d+)?$/),
    requestId: z.string().uuid(),
    clientVersion: z.string().optional(),
    features: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('auth_context'),
    sessionId: z.string().uuid(),
    userId: z.string().uuid(),
    role: z.enum(['user']),
    permissions: z.array(z.string()),
    lastActivity: z.iso.datetime(),
    ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$|^(?:[\da-f]{1,4}:){7}[\da-f]{1,4}$/i, 'Invalid IP address').optional(),
  }),
  z.object({
    type: z.literal('performance'),
    startTime: z.number(),
    duration: z.number().positive(),
    memoryUsage: z.number().positive(),
    dbQueries: z.number().int().nonnegative(),
    cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(),
  }),
]).optional().openapi({
  example: {
    type: 'api_request',
    endpoint: '/api/v1/subscriptions',
    method: 'GET',
    version: 'v1',
    requestId: 'req_123456789',
  },
  description: 'Type-safe request metadata context',
});

/**
 * Logger data discriminated union - replaces Record<string, unknown> in logger methods
 * Maximum type safety for logging context data
 */
export const LoggerDataSchema = z.discriminatedUnion('logType', [
  z.object({
    logType: z.literal('operation'),
    operationName: z.string(),
    duration: z.number().optional(),
    requestId: z.string().optional(),
    userId: z.string().optional(),
    resource: z.string().optional(),
  }),
  z.object({
    logType: z.literal('performance'),
    marks: z.record(z.string(), z.number()).optional(),
    duration: z.number(),
    memoryUsage: z.number().optional(),
    dbQueries: z.number().optional(),
    cacheHits: z.number().optional(),
  }),
  z.object({
    logType: z.literal('validation'),
    fieldCount: z.number().optional(),
    schemaName: z.string().optional(),
    validationErrors: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string().optional(),
    })).optional(),
  }),
  z.object({
    logType: z.literal('auth'),
    mode: z.enum(['session', 'api-key', 'session-optional', 'public']),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    ipAddress: z.string().optional(),
  }),
  z.object({
    logType: z.literal('database'),
    operation: z.enum(['select', 'insert', 'update', 'delete', 'batch']),
    table: z.string().optional(),
    affected: z.number().optional(),
    transactionId: z.string().optional(),
  }),
  z.object({
    logType: z.literal('api'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    path: z.string(),
    statusCode: z.number().optional(),
    responseTime: z.number().optional(),
    userAgent: z.string().optional(),
  }),
  z.object({
    logType: z.literal('system'),
    component: z.string(),
    action: z.string(),
    result: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
]).optional().openapi({
  example: {
    logType: 'operation',
    operationName: 'createSubscription',
    duration: 150,
    userId: 'user_123',
  },
  description: 'Type-safe logger context data',
});

/**
 * Response metadata discriminated union - replaces Record<string, unknown> in response builders
 * Maximum type safety for response metadata
 */
export const ResponseMetadataSchema = z.discriminatedUnion('metaType', [
  z.object({
    metaType: z.literal('pagination'),
    currentPage: z.number().int().positive(),
    totalPages: z.number().int().positive(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  z.object({
    metaType: z.literal('performance'),
    duration: z.number().positive(),
    memoryUsage: z.number().positive().optional(),
    queries: z.number().int().nonnegative().optional(),
    cacheHits: z.number().int().nonnegative().optional(),
  }),
  z.object({
    metaType: z.literal('location'),
    resourceUrl: z.url(),
    resourceId: z.string(),
    resourceType: z.string(),
  }),
  z.object({
    metaType: z.literal('api'),
    version: z.string(),
    endpoint: z.string(),
    deprecationNotice: z.string().optional(),
  }),
  z.object({
    metaType: z.literal('security'),
    tokenExpires: z.iso.datetime().optional(),
    permissions: z.array(z.string()).optional(),
    ipAddress: z.string().optional(),
  }),
]).optional().openapi({
  example: {
    metaType: 'performance',
    duration: 150,
    memoryUsage: 1024000,
  },
  description: 'Type-safe response metadata',
});

/**
 * Error context discriminated union - replaces Record<string, unknown> in errors
 * Maximum type safety for error handling
 */
export const ErrorContextSchema = z.discriminatedUnion('errorType', [
  z.object({
    errorType: z.literal('validation'),
    field: z.string().optional(),
    fieldErrors: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string().optional(),
      expected: z.string().optional(),
      received: z.string().optional(),
    })).optional(),
    schemaName: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('authentication'),
    attemptedEmail: z.string().email().optional(),
    failureReason: z.enum(['invalid_credentials', 'account_locked', 'token_expired', 'missing_token', 'session_required', 'session_expired']).optional(),
    operation: z.string().optional(),
    ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$|^(?:[\da-f]{1,4}:){7}[\da-f]{1,4}$/i, 'Invalid IP address').optional(),
    userAgent: z.string().optional(),
    service: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('authorization'),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
    requiredPermission: z.string().optional(),
    actualPermission: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('database'),
    operation: z.enum(['select', 'insert', 'update', 'delete', 'batch']),
    table: z.string().optional(),
    constraint: z.string().optional(),
    sqlState: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('external_service'),
    serviceName: z.string().optional(),
    service: z.string().optional(),
    operation: z.string().optional(),
    endpoint: z.string().optional(),
    httpStatus: z.number().optional(),
    responseTime: z.number().optional(),
    retryAttempt: z.number().int().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('resource'),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
    service: z.string().optional(),
  }),
  z.object({
    errorType: z.literal('resource_unavailable'),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    resourceStatus: z.string().optional(),
    wasPublic: z.boolean().optional(),
    unavailabilityReason: z.enum(['deleted', 'archived', 'private', 'expired']).optional(),
  }),
  z.object({
    errorType: z.literal('configuration'),
    service: z.string().optional(),
    configKey: z.string().optional(),
    operation: z.string().optional(),
  }),
]).optional().openapi({
  example: {
    errorType: 'validation',
    fieldErrors: [{
      field: 'email',
      message: 'Invalid email format',
    }],
  },
  description: 'Type-safe error context information',
});

// ============================================================================
// BUSINESS DOMAIN SCHEMAS
// ============================================================================

/**
 * Feature metadata discriminated union
 */
export const FeatureMetadataSchema = z.discriminatedUnion('featureType', [
  z.object({
    featureType: z.literal('user_setting'),
    preferenceKey: z.string(),
    preferenceValue: z.union([z.string(), z.number(), z.boolean()]),
    updatedAt: z.iso.datetime(),
  }),
  z.object({
    featureType: z.literal('collaboration_session'),
    sessionId: z.string().uuid(),
    participants: z.array(z.string()),
    startedAt: z.iso.datetime(),
    status: z.enum(['active', 'paused', 'completed']),
  }),
]).openapi({
  example: {
    featureType: 'user_setting',
    preferenceKey: 'notification',
    preferenceValue: true,
    updatedAt: new Date().toISOString(),
  },
  description: 'Feature-specific metadata',
});

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Success response envelope with type-safe metadata
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string().uuid().optional(),
      timestamp: z.iso.datetime().optional(),
      version: z.string().optional(),
    }).optional(),
  }).openapi({
    description: 'Successful API response with type-safe data',
  });
}

/**
 * Error response schema with discriminated union context
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    context: ErrorContextSchema,
    validation: z.array(z.object({
      field: z.string(),
      message: z.string(),
      code: z.string().optional(),
    })).optional(),
  }),
  meta: z.object({
    requestId: z.string().uuid().optional(),
    timestamp: z.iso.datetime().optional(),
    correlationId: z.string().optional(),
  }).optional(),
}).openapi({
  example: {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      context: {
        errorType: 'validation',
        fieldErrors: [{
          field: 'email',
          message: 'Invalid email format',
        }],
      },
    },
    meta: {
      requestId: 'req_123456789',
      timestamp: new Date().toISOString(),
    },
  },
  description: 'Error response with type-safe context',
});

/**
 * Paginated response schema (page-based)
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return createApiResponseSchema(z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: CoreSchemas.positiveInt(),
      limit: CoreSchemas.positiveInt(),
      total: z.number().int().nonnegative(),
      pages: CoreSchemas.positiveInt(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  })).openapi({
    description: 'Paginated response with items and pagination metadata',
  });
}

/**
 * Cursor-based paginated response schema
 * Optimized for infinite scroll and React Query
 */
export function createCursorPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return createApiResponseSchema(z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      nextCursor: z.string().nullable().openapi({
        description: 'Cursor for next page (null if no more items)',
        example: '2024-01-15T10:30:00Z',
      }),
      hasMore: z.boolean().openapi({
        description: 'Whether more items exist',
        example: true,
      }),
      count: z.number().int().nonnegative().openapi({
        description: 'Number of items in current response',
        example: 20,
      }),
    }),
  })).openapi({
    description: 'Cursor-based paginated response optimized for infinite scroll',
  });
}

// ============================================================================
// COMMON REQUEST SCHEMAS
// ============================================================================

/**
 * Pagination query parameters (page-based)
 */
export const PaginationQuerySchema = z.object({
  page: CoreSchemas.page(),
  limit: CoreSchemas.limit(),
}).openapi('PaginationQuery');

/**
 * Cursor-based pagination query parameters
 * Optimized for infinite scroll and React Query
 */
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Cursor for pagination (ISO timestamp or ID)',
    example: '2024-01-15T10:30:00Z',
  }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({
    description: 'Maximum number of items to return',
    example: 20,
  }),
}).openapi('CursorPaginationQuery');

/**
 * Sorting parameters
 */
export const SortingQuerySchema = z.object({
  sortBy: z.string().min(1).optional().openapi({
    example: 'createdAt',
    description: 'Field to sort by',
  }),
  sortOrder: CoreSchemas.sortOrder(),
}).openapi('SortingQuery');

/**
 * Search parameters
 */
export const SearchQuerySchema = z.object({
  search: z.string().min(1).optional().openapi({
    example: 'search term',
    description: 'Search query string',
  }),
}).openapi('SearchQuery');

/**
 * Combined query schema for list endpoints
 */
export const ListQuerySchema = PaginationQuerySchema
  .merge(SortingQuerySchema)
  .merge(SearchQuerySchema)
  .openapi('ListQuery');

/**
 * Standard ID path parameter
 */
export const IdParamSchema = z.object({
  id: CoreSchemas.id().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Resource identifier',
  }),
}).openapi('IdParam');

/**
 * UUID path parameter
 */
export const UuidParamSchema = z.object({
  id: CoreSchemas.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'UUID resource identifier',
  }),
}).openapi('UuidParam');

// ============================================================================
// TYPE INFERENCE AND EXPORTS
// ============================================================================

// ============================================================================
// STREAMING SCHEMAS
// ============================================================================

/**
 * SSE streaming event schema
 * For Server-Sent Events (EventSource) responses
 */
export const StreamingEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    threadId: z.string().openapi({
      description: 'Thread ID for the conversation',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
  }),
  z.object({
    type: z.literal('chunk'),
    content: z.string().openapi({
      description: 'Partial content chunk',
    }),
    messageId: z.string().nullable().openapi({
      description: 'Message ID (null until saved)',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
  }),
  z.object({
    type: z.literal('complete'),
    messageId: z.string().openapi({
      description: 'Final message ID',
    }),
    usage: z.object({
      messagesCreated: z.number().int(),
      messagesLimit: z.number().int(),
    }).optional(),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string().openapi({
      description: 'Error message',
    }),
    code: z.string().optional().openapi({
      description: 'Error code',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
  }),
]).openapi({
  description: 'Server-Sent Event for streaming AI responses',
  example: {
    type: 'chunk',
    content: 'This is a partial response...',
    messageId: null,
    timestamp: Date.now(),
  },
});

// Export all inferred types
export type RequestMetadata = z.infer<typeof RequestMetadataSchema>;
export type LoggerData = z.infer<typeof LoggerDataSchema>;
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;
export type ErrorContext = z.infer<typeof ErrorContextSchema>;
export type FeatureMetadata = z.infer<typeof FeatureMetadataSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;
export type SortingQuery = z.infer<typeof SortingQuerySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
export type IdParam = z.infer<typeof IdParamSchema>;
export type UuidParam = z.infer<typeof UuidParamSchema>;
export type StreamingEvent = z.infer<typeof StreamingEventSchema>;

// Export utility types
export type ApiResponse<T> = {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
  };
} | {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    context?: ErrorContext;
    validation?: Array<{ field: string; message: string; code?: string }>;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    correlationId?: string;
  };
};

export type PaginatedResponse<T> = {
  success: true;
  data: {
    items: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
  };
};

export type CursorPaginatedResponse<T> = {
  success: true;
  data: {
    items: T[];
    pagination: {
      nextCursor: string | null;
      hasMore: boolean;
      count: number;
    };
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
    version?: string;
  };
};
