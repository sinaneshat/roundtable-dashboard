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
 *
 * DATE HANDLING:
 * - Database (Drizzle): Returns Date objects via integer({ mode: 'timestamp' })
 * - API Types: Use z.infer to match Drizzle's return types (Date objects)
 * - JSON Serialization: Hono automatically serializes Date → ISO string
 * - Frontend Types: Should expect strings since they receive JSON
 * - No custom SerializeDates utility needed - use Drizzle's built-in type inference
 */

import { z } from '@hono/zod-openapi';

import { API } from '@/constants/application';

import {
  AuthFailureReasonSchema,
  AuthModeSchema,
  DatabaseOperationSchema,
  ErrorContextTypes,
  HealthStatusSchema,
  HttpMethodSchema,
  ResourceUnavailableReasonSchema,
  SortDirectionSchema,
  StreamPhaseSchema,
} from './enums';

// ============================================================================
// VALIDATION ERROR SCHEMAS
// ============================================================================

/**
 * Single validation error structure
 * Used in error responses and validation logging
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
}).openapi('ValidationError');

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * Validation error details for error responses
 * Wraps array of validation errors
 */
export const ValidationErrorDetailsSchema = z.object({
  validationErrors: z.array(ValidationErrorSchema).optional(),
});

export type ValidationErrorDetails = z.infer<typeof ValidationErrorDetailsSchema>;

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

  // Numeric fields
  amount: () => z.number().nonnegative().openapi({
    example: 99.00,
    description: 'Amount in USD',
  }),

  positiveInt: () => z.number().int().positive().openapi({
    example: 1,
    description: 'Positive integer',
  }),

  // Temporal fields
  timestamp: () => z.string().datetime().openapi({
    example: new Date().toISOString(),
    description: 'ISO 8601 timestamp',
  }),

  // Pagination (using constants from single source of truth)
  page: () => z.coerce.number().int().min(1).default(1).openapi({
    example: 1,
    description: 'Page number (1-based)',
  }),

  limit: () => z.coerce.number().int().min(1).max(API.MAX_PAGE_SIZE).default(API.DEFAULT_PAGE_SIZE).openapi({
    example: API.DEFAULT_PAGE_SIZE,
    description: `Results per page (max ${API.MAX_PAGE_SIZE})`,
  }),

  // Common enums
  sortOrder: () => SortDirectionSchema.openapi({
    example: 'desc',
    description: 'Sort order',
  }),
  // String fields with common limits (Single Source of Truth)
  /**
   * Name field (1-100 chars)
   * Used for: role names, preset names, custom role names, model roles
   */
  name: (opts?: { min?: number; max?: number }) => z.string()
    .min(opts?.min ?? 1, 'Name is required')
    .max(opts?.max ?? 100, `Name must be at most ${opts?.max ?? 100} characters`)
    .openapi({
      description: 'Name field (1-100 chars)',
      example: 'My Name',
    }),

  /**
   * Title field (1-200 chars)
   * Used for: thread titles, project names, preset names
   */
  title: (opts?: { min?: number; max?: number }) => z.string()
    .min(opts?.min ?? 1, 'Title is required')
    .max(opts?.max ?? 200, `Title must be at most ${opts?.max ?? 200} characters`)
    .openapi({
      description: 'Title field (1-200 chars)',
      example: 'My Title',
    }),

  /**
   * Description field (max 500 chars)
   * Used for: project descriptions, role descriptions
   */
  description: (opts?: { max?: number }) => z.string()
    .max(opts?.max ?? 500, `Description must be at most ${opts?.max ?? 500} characters`)
    .openapi({
      description: 'Description field (max 500 chars)',
      example: 'A helpful description',
    }),

  /**
   * Long description field (max 1000 chars)
   * Used for: project descriptions, memory summaries
   */
  longDescription: (opts?: { max?: number }) => z.string()
    .max(opts?.max ?? 1000, `Description must be at most ${opts?.max ?? 1000} characters`)
    .openapi({
      description: 'Long description field (max 1000 chars)',
      example: 'A longer, more detailed description',
    }),

  /**
   * Content field (1-10000 chars)
   * Used for: system prompts, memory content, message content
   */
  content: (opts?: { min?: number; max?: number }) => z.string()
    .min(opts?.min ?? 1, 'Content is required')
    .max(opts?.max ?? 10000, `Content must be at most ${opts?.max ?? 10000} characters`)
    .openapi({
      description: 'Content field (1-10000 chars)',
      example: 'Content text',
    }),

  /**
   * Role field (nullable, 1-100 chars when present)
   * Used for: participant roles, custom roles
   */
  role: () => z.string()
    .min(1, 'Role is required when specified')
    .max(100, 'Role must be at most 100 characters')
    .nullish()
    .openapi({
      description: 'Role field (nullable, 1-100 chars)',
      example: 'The Ideator',
    }),

  /**
   * Filename field (1-255 chars)
   * Used for: upload filenames
   */
  filename: () => z.string()
    .min(1, 'Filename is required')
    .max(255, 'Filename must be at most 255 characters')
    .openapi({
      description: 'Filename (1-255 chars)',
      example: 'document.pdf',
    }),

  /**
   * Change summary field (1-500 chars)
   * Used for: changelog summaries
   */
  changeSummary: () => z.string()
    .min(1, 'Summary is required')
    .max(500, 'Summary must be at most 500 characters')
    .openapi({
      description: 'Change summary (1-500 chars)',
      example: 'Added new participant',
    }),
} as const;

// ============================================================================
// DISCRIMINATED UNION METADATA SCHEMAS (Context7 Pattern)
// ============================================================================

/**
 * Logger data discriminated union - replaces Record<string, unknown> in logger methods
 * Maximum type safety for logging context data
 */
export const LoggerDataSchema = z.discriminatedUnion('logType', [
  z.object({
    logType: z.literal('operation' as const),
    operationName: z.string(),
    duration: z.number().optional(),
    requestId: z.string().optional(),
    userId: z.string().optional(),
    resource: z.string().optional(),
  }),
  z.object({
    logType: z.literal('performance' as const),
    marks: z.record(z.string(), z.number()).optional(),
    duration: z.number(),
    memoryUsage: z.number().optional(),
    dbQueries: z.number().optional(),
    cacheHits: z.number().optional(),
  }),
  z.object({
    logType: z.literal('validation' as const),
    fieldCount: z.number().optional(),
    schemaName: z.string().optional(),
    validationErrors: z.array(ValidationErrorSchema).optional(),
  }),
  z.object({
    logType: z.literal('auth' as const),
    mode: AuthModeSchema,
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    ipAddress: z.string().optional(),
  }),
  z.object({
    logType: z.literal('database' as const),
    operation: DatabaseOperationSchema,
    table: z.string().optional(),
    affected: z.number().optional(),
    transactionId: z.string().optional(),
  }),
  z.object({
    logType: z.literal('api' as const),
    method: HttpMethodSchema,
    path: z.string(),
    statusCode: z.number().optional(),
    responseTime: z.number().optional(),
    userAgent: z.string().optional(),
  }),
  z.object({
    logType: z.literal('system' as const),
    component: z.string(),
    action: z.string(),
    result: z.string().optional(),
    details: z.unknown().optional(),
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
    errorType: z.literal(ErrorContextTypes.VALIDATION),
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
    errorType: z.literal(ErrorContextTypes.AUTHENTICATION),
    attemptedEmail: z.string().email().optional(),
    failureReason: AuthFailureReasonSchema.optional(),
    operation: z.string().optional(),
    ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$|^(?:[\da-f]{1,4}:){7}[\da-f]{1,4}$/i, 'Invalid IP address').optional(),
    userAgent: z.string().optional(),
    service: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.AUTHORIZATION),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
    requiredPermission: z.string().optional(),
    actualPermission: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.DATABASE),
    operation: DatabaseOperationSchema,
    table: z.string().optional(),
    constraint: z.string().optional(),
    sqlState: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.EXTERNAL_SERVICE),
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
    errorType: z.literal(ErrorContextTypes.RESOURCE),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
    service: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.RESOURCE_UNAVAILABLE),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    resourceStatus: z.string().optional(),
    wasPublic: z.boolean().optional(),
    unavailabilityReason: ResourceUnavailableReasonSchema.optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.CONFIGURATION),
    service: z.string().optional(),
    configKey: z.string().optional(),
    operation: z.string().optional(),
  }),
]).optional().openapi({
  example: {
    errorType: ErrorContextTypes.VALIDATION,
    fieldErrors: [{
      field: 'email',
      message: 'Invalid email format',
    }],
  },
  description: 'Type-safe error context information',
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
// COMMON FIELD SCHEMAS (Reusable Building Blocks)
// ============================================================================

/**
 * Common field schemas used across multiple domains
 * ✅ CONSOLIDATED: Single source of truth for common validation patterns
 * ✅ REUSABLE: Use these instead of duplicating field definitions
 */
export const CommonFieldSchemas = {
  /**
   * Standard boolean field
   */
  boolean: () => z.boolean().openapi({
    description: 'Boolean flag',
    example: true,
  }),

  /**
   * Nullable string field (common for optional text)
   */
  nullableString: () => z.string().nullable().optional().openapi({
    description: 'Optional text field',
  }),

  /**
   * JSON metadata field - use specific schemas when possible
   * Only use for truly dynamic data that cannot be typed
   */
  metadata: () => z.unknown().nullable().optional().openapi({
    description: 'Custom metadata (prefer specific schemas)',
    example: { key: 'value' },
  }),

  /**
   * Array of strings (tags, features, etc.)
   */
  stringArray: () => z.array(z.string()).openapi({
    description: 'Array of strings',
    example: ['tag1', 'tag2'],
  }),

  /**
   * Positive integer field
   */
  count: () => z.number().int().nonnegative().openapi({
    description: 'Non-negative integer count',
    example: 0,
  }),

  /**
   * Priority/order field (0-indexed)
   */
  priority: () => z.number().int().min(0).openapi({
    description: 'Priority/order (0-indexed)',
    example: 0,
  }),
} as const;

// ============================================================================
// COMMON PATH PARAMETER SCHEMAS (Consolidated)
// ============================================================================

/**
 * Thread ID path parameter
 * ✅ REUSABLE: Used across all chat thread endpoints
 * ✅ MATCHES route paths: /chat/threads/:threadId/...
 */
export const ThreadIdParamSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    param: { name: 'threadId', in: 'path' },
    description: 'Thread identifier',
    example: 'thread_abc123',
  }),
}).openapi('ThreadIdParam');

/**
 * Thread slug path parameter (for public access)
 * ✅ REUSABLE: Used for public thread sharing
 */
export const ThreadSlugParamSchema = z.object({
  slug: z.string().openapi({
    param: { name: 'slug', in: 'path' },
    description: 'Thread slug for public access',
    example: 'product-strategy-brainstorm-abc123',
  }),
}).openapi('ThreadSlugParam');

/**
 * Participant ID path parameter
 * ✅ REUSABLE: Used across participant endpoints
 */
export const ParticipantIdParamSchema = z.object({
  participantId: CoreSchemas.id().openapi({
    param: { name: 'participantId', in: 'path' },
    description: 'Participant identifier',
    example: 'participant_abc123',
  }),
}).openapi('ParticipantIdParam');

/**
 * Custom role ID path parameter
 * ✅ REUSABLE: Used across custom role endpoints
 */
export const CustomRoleIdParamSchema = z.object({
  roleId: CoreSchemas.id().openapi({
    param: { name: 'roleId', in: 'path' },
    description: 'Custom role identifier',
    example: 'role_abc123',
  }),
}).openapi('CustomRoleIdParam');

/**
 * Round number path parameter
 * ✅ REUSABLE: Used for round-specific operations
 */
export const RoundNumberParamSchema = z.object({
  roundNumber: z.string().openapi({
    param: { name: 'roundNumber', in: 'path' },
    description: 'Round number (✅ 0-BASED: first round is 0)',
    example: '0',
  }),
}).openapi('RoundNumberParam');

/**
 * Thread + Round path parameters (combined)
 * ✅ REUSABLE: Used for round moderator endpoints
 */
export const ThreadRoundParamSchema = z.object({
  threadId: CoreSchemas.id().openapi({
    param: { name: 'threadId', in: 'path' },
    description: 'Thread identifier',
    example: 'thread_abc123',
  }),
  roundNumber: z.string().openapi({
    param: { name: 'roundNumber', in: 'path' },
    description: 'Round number (✅ 0-BASED: first round is 0)',
    example: '0',
  }),
}).openapi('ThreadRoundParam');

// ============================================================================
// SSE/STREAMING METADATA SCHEMAS
// ============================================================================

/**
 * SSE stream metadata for multi-participant rounds
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema
 */
export const SSEStreamMetadataSchema = z.object({
  /** Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex}) */
  streamId: z.string().optional().openapi({
    description: 'Stream ID for resumption',
    example: 'thread_123_r0_p0',
  }),
  /** Current stream phase (presearch, participant, moderator) */
  phase: StreamPhaseSchema.optional().openapi({
    description: 'Current stream phase',
    example: 'participant',
  }),
  /** 0-based round number */
  roundNumber: z.number().int().nonnegative().optional().openapi({
    description: '0-based round number',
    example: 0,
  }),
  /** Current participant index */
  participantIndex: z.number().int().nonnegative().optional().openapi({
    description: 'Current participant index',
    example: 0,
  }),
  /** Total participants in this round */
  totalParticipants: z.number().int().positive().optional().openapi({
    description: 'Total participants in this round',
    example: 3,
  }),
  /** Whether stream is actively streaming */
  isActive: z.boolean().optional().openapi({
    description: 'Whether stream is actively streaming',
    example: true,
  }),
  /** Status of each participant in the round */
  participantStatuses: z.record(z.string(), z.string()).optional().openapi({
    description: 'Status of each participant in the round',
    example: { 0: 'completed', 1: 'streaming', 2: 'pending' },
  }),
  /** Index of next participant to stream (if any) */
  nextParticipantIndex: z.number().int().nonnegative().optional().openapi({
    description: 'Index of next participant to stream',
    example: 1,
  }),
  /** Whether round is complete */
  roundComplete: z.boolean().optional().openapi({
    description: 'Whether round is complete',
    example: false,
  }),
  /** Whether stream was resumed from buffer */
  resumedFromBuffer: z.boolean().optional().openapi({
    description: 'Whether stream was resumed from buffer',
    example: true,
  }),
  /** Moderator message ID (for moderator phase) */
  moderatorMessageId: z.string().optional().openapi({
    description: 'Moderator message ID for moderator phase',
    example: 'moderator_abc123',
  }),
}).openapi('SSEStreamMetadata');

export type SSEStreamMetadata = z.infer<typeof SSEStreamMetadataSchema>;

/**
 * Text stream metadata for moderator/object streaming
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema
 */
export const TextStreamMetadataSchema = z.object({
  /** Stream ID for resumption */
  streamId: z.string().optional().openapi({
    description: 'Stream ID for resumption',
    example: 'moderator_123',
  }),
  /** Whether stream was resumed from buffer */
  resumedFromBuffer: z.boolean().optional().openapi({
    description: 'Whether stream was resumed from buffer',
    example: true,
  }),
  /** Resource ID (e.g., moderator message ID) */
  resourceId: z.string().optional().openapi({
    description: 'Resource ID (e.g., moderator message ID)',
    example: 'moderator_abc123',
  }),
  /** Round number for round moderator streams */
  roundNumber: z.number().int().nonnegative().optional().openapi({
    description: 'Round number for round moderator streams',
    example: 0,
  }),
  /** Moderator message ID for round moderator streams */
  moderatorMessageId: z.string().optional().openapi({
    description: 'Moderator message ID for round moderator streams',
    example: 'moderator_123',
  }),
  /** Stream status (e.g., 'completed', 'streaming') */
  streamStatus: z.string().optional().openapi({
    description: 'Stream status',
    example: 'streaming',
  }),
}).openapi('TextStreamMetadata');

export type TextStreamMetadata = z.infer<typeof TextStreamMetadataSchema>;

// ============================================================================
// HEALTH CHECK SCHEMAS
// ============================================================================

/**
 * Health check dependency status
 * ✅ ZOD-FIRST PATTERN: Uses HealthStatusSchema from enums
 */
export const HealthDependencySchema = z.object({
  status: HealthStatusSchema.openapi({
    description: 'Health status of the dependency',
    example: 'healthy',
  }),
  message: z.string().openapi({
    description: 'Status message',
    example: 'Connected',
  }),
  duration: z.number().nonnegative().optional().openapi({
    description: 'Response time in milliseconds',
    example: 45,
  }),
  details: z.unknown().optional().openapi({
    description: 'Additional health details',
    example: { version: '1.0.0' },
  }),
}).openapi('HealthDependency');

export type HealthDependency = z.infer<typeof HealthDependencySchema>;

/**
 * Health check summary counts
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema
 */
export const HealthSummarySchema = z.object({
  total: z.number().int().nonnegative().openapi({
    description: 'Total number of dependencies',
    example: 4,
  }),
  healthy: z.number().int().nonnegative().openapi({
    description: 'Number of healthy dependencies',
    example: 3,
  }),
  degraded: z.number().int().nonnegative().openapi({
    description: 'Number of degraded dependencies',
    example: 1,
  }),
  unhealthy: z.number().int().nonnegative().openapi({
    description: 'Number of unhealthy dependencies',
    example: 0,
  }),
}).openapi('HealthSummary');

export type HealthSummary = z.infer<typeof HealthSummarySchema>;

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
    type: z.literal('failed'),
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
export type LoggerData = z.infer<typeof LoggerDataSchema>;
export type ResponseMetadata = z.infer<typeof ResponseMetadataSchema>;
export type ErrorContext = z.infer<typeof ErrorContextSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
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
    validation?: ValidationError[];
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
