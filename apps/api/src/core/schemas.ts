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
} from '@roundtable/shared/enums';

import { API } from '@/constants';
import { APP_VERSION } from '@/constants/version';

// ============================================================================
// VALIDATION ERROR SCHEMAS
// ============================================================================

/**
 * Single validation error structure
 * Used in error responses and validation logging
 */
export const ValidationErrorSchema = z.object({
  code: z.string().optional(),
  field: z.string(),
  message: z.string(),
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
  // Numeric fields
  amount: () => z.number().nonnegative().openapi({
    description: 'Amount in USD',
    example: 99.00,
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
   * Description field (max 500 chars)
   * Used for: project descriptions, role descriptions
   */
  description: (opts?: { max?: number }) => z.string()
    .max(opts?.max ?? 500, `Description must be at most ${opts?.max ?? 500} characters`)
    .openapi({
      description: 'Description field (max 500 chars)',
      example: 'A helpful description',
    }),

  // Text fields
  email: () => z.string().email().openapi({
    description: 'Valid email address',
    example: 'user@example.com',
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

  id: () => z.string().min(1).openapi({
    description: 'String identifier',
    example: 'id_123456789',
  }),

  limit: () => z.coerce.number().int().min(1).max(API.MAX_PAGE_SIZE).default(API.DEFAULT_PAGE_SIZE).openapi({
    description: `Results per page (max ${API.MAX_PAGE_SIZE})`,
    example: API.DEFAULT_PAGE_SIZE,
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
  // Pagination (using constants from single source of truth)
  page: () => z.coerce.number().int().min(1).default(1).openapi({
    description: 'Page number (1-based)',
    example: 1,
  }),

  positiveInt: () => z.number().int().positive().openapi({
    description: 'Positive integer',
    example: 1,
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

  // Common enums
  sortOrder: () => SortDirectionSchema.openapi({
    description: 'Sort order',
    example: 'desc',
  }),

  // Temporal fields
  timestamp: () => z.string().datetime().openapi({
    description: 'ISO 8601 timestamp',
    example: new Date().toISOString(),
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

  url: () => z.url().openapi({
    description: 'Valid URL',
    example: 'https://example.com',
  }),

  // Identifiers
  uuid: () => z.string().uuid().openapi({
    description: 'UUID identifier',
    example: 'abc123e4-5678-9012-3456-789012345678',
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
    duration: z.number().optional(),
    logType: z.literal('operation' as const),
    operationName: z.string(),
    requestId: z.string().optional(),
    resource: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    cacheHits: z.number().optional(),
    dbQueries: z.number().optional(),
    duration: z.number(),
    logType: z.literal('performance' as const),
    marks: z.record(z.string(), z.number()).optional(),
    memoryUsage: z.number().optional(),
  }),
  z.object({
    fieldCount: z.number().optional(),
    logType: z.literal('validation' as const),
    schemaName: z.string().optional(),
    validationErrors: z.array(ValidationErrorSchema).optional(),
  }),
  z.object({
    ipAddress: z.string().optional(),
    logType: z.literal('auth' as const),
    mode: AuthModeSchema,
    sessionId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    affected: z.number().optional(),
    logType: z.literal('database' as const),
    operation: DatabaseOperationSchema,
    table: z.string().optional(),
    transactionId: z.string().optional(),
  }),
  z.object({
    logType: z.literal('api' as const),
    method: HttpMethodSchema,
    path: z.string(),
    responseTime: z.number().optional(),
    statusCode: z.number().optional(),
    userAgent: z.string().optional(),
  }),
  z.object({
    action: z.string(),
    component: z.string(),
    // System logs can contain arbitrary diagnostic data - use record for JSON-serializable values
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    logType: z.literal('system' as const),
    result: z.string().optional(),
  }),
]).optional().openapi({
  description: 'Type-safe logger context data',
  example: {
    duration: 150,
    logType: 'operation',
    operationName: 'createSubscription',
    userId: 'user_123',
  },
});

/**
 * Response metadata discriminated union - replaces Record<string, unknown> in response builders
 * Maximum type safety for response metadata
 */
export const ResponseMetadataSchema = z.discriminatedUnion('metaType', [
  z.object({
    currentPage: z.number().int().positive(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
    metaType: z.literal('pagination'),
    totalPages: z.number().int().positive(),
  }),
  z.object({
    cacheHits: z.number().int().nonnegative().optional(),
    duration: z.number().positive(),
    memoryUsage: z.number().positive().optional(),
    metaType: z.literal('performance'),
    queries: z.number().int().nonnegative().optional(),
  }),
  z.object({
    metaType: z.literal('location'),
    resourceId: z.string(),
    resourceType: z.string(),
    resourceUrl: z.url(),
  }),
  z.object({
    deprecationNotice: z.string().optional(),
    endpoint: z.string(),
    metaType: z.literal('api'),
    version: z.string(),
  }),
  z.object({
    ipAddress: z.string().optional(),
    metaType: z.literal('security'),
    permissions: z.array(z.string()).optional(),
    tokenExpires: z.iso.datetime().optional(),
  }),
]).optional().openapi({
  description: 'Type-safe response metadata',
  example: {
    duration: 150,
    memoryUsage: 1024000,
    metaType: 'performance',
  },
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
      code: z.string().optional(),
      expected: z.string().optional(),
      field: z.string(),
      message: z.string(),
      received: z.string().optional(),
    })).optional(),
    schemaName: z.string().optional(),
  }),
  z.object({
    attemptedEmail: z.string().email().optional(),
    errorType: z.literal(ErrorContextTypes.AUTHENTICATION),
    failureReason: AuthFailureReasonSchema.optional(),
    // eslint-disable-next-line security/detect-unsafe-regex -- IP validation regex with bounded quantifiers, safe from ReDoS
    ipAddress: z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}$|^[\da-f]{1,4}(?::[\da-f]{0,4}){0,7}$/i, 'Invalid IP address').optional(),
    operation: z.string().optional(),
    service: z.string().optional(),
    userAgent: z.string().optional(),
  }),
  z.object({
    actualPermission: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.AUTHORIZATION),
    requiredPermission: z.string().optional(),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    constraint: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.DATABASE),
    operation: DatabaseOperationSchema,
    resourceId: z.string().optional(),
    sqlState: z.string().optional(),
    table: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    endpoint: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.EXTERNAL_SERVICE),
    httpStatus: z.number().optional(),
    operation: z.string().optional(),
    resourceId: z.string().optional(),
    responseTime: z.number().optional(),
    retryAttempt: z.number().int().optional(),
    service: z.string().optional(),
    serviceName: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.RESOURCE),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    service: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.RESOURCE_UNAVAILABLE),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    resourceStatus: z.string().optional(),
    unavailabilityReason: ResourceUnavailableReasonSchema.optional(),
    wasPublic: z.boolean().optional(),
  }),
  z.object({
    configKey: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.CONFIGURATION),
    operation: z.string().optional(),
    service: z.string().optional(),
  }),
  z.object({
    current: z.number().optional(),
    errorType: z.literal(ErrorContextTypes.QUOTA),
    limit: z.number().optional(),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    currentPlan: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.SUBSCRIPTION),
    requiredPlan: z.string().optional(),
    resource: z.string().optional(),
    userId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.MODERATOR_ERROR),
    operation: z.string().optional(),
    reason: z.string().optional(),
    roundNumber: z.number().optional(),
    threadId: z.string().optional(),
  }),
  z.object({
    errorType: z.literal(ErrorContextTypes.RETRY_EXHAUSTED),
    lastError: z.string().optional(),
    maxRetries: z.number().optional(),
    resource: z.string().optional(),
    resourceId: z.string().optional(),
  }),
  z.object({
    errorMessage: z.string().optional(),
    errorType: z.literal(ErrorContextTypes.QUEUE),
    executionId: z.string().optional(),
    messageId: z.string().optional(),
    operation: z.string().optional(),
    queueName: z.string().optional(),
    roundNumber: z.number().optional(),
    threadId: z.string().optional(),
  }),
]).optional().openapi({
  description: 'Type-safe error context information',
  example: {
    errorType: ErrorContextTypes.VALIDATION,
    fieldErrors: [{
      field: 'email',
      message: 'Invalid email format',
    }],
  },
});

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Success response envelope with type-safe metadata
 */
export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    meta: z.object({
      requestId: z.string().uuid().optional(),
      timestamp: z.iso.datetime().optional(),
      version: z.string().optional(),
    }).optional(),
    success: z.literal(true),
  }).openapi({
    description: 'Successful API response with type-safe data',
  });
}

/**
 * Error response schema with discriminated union context
 */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    context: ErrorContextSchema,
    // Error details - JSON-serializable values for additional context
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])).optional(),
    message: z.string(),
    validation: z.array(z.object({
      code: z.string().optional(),
      field: z.string(),
      message: z.string(),
    })).optional(),
  }),
  meta: z.object({
    correlationId: z.string().optional(),
    requestId: z.string().uuid().optional(),
    timestamp: z.iso.datetime().optional(),
  }).optional(),
  success: z.literal(false),
}).openapi({
  description: 'Error response with type-safe context',
  example: {
    error: {
      code: 'VALIDATION_ERROR',
      context: {
        errorType: 'validation',
        fieldErrors: [{
          field: 'email',
          message: 'Invalid email format',
        }],
      },
      message: 'Request validation failed',
    },
    meta: {
      requestId: 'req_123456789',
      timestamp: new Date().toISOString(),
    },
    success: false,
  },
});

/**
 * Paginated response schema (page-based)
 */
export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return createApiResponseSchema(z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
      limit: CoreSchemas.positiveInt(),
      page: CoreSchemas.positiveInt(),
      pages: CoreSchemas.positiveInt(),
      total: z.number().int().nonnegative(),
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
      count: z.number().int().nonnegative().openapi({
        description: 'Number of items in current response',
        example: 20,
      }),
      hasMore: z.boolean().openapi({
        description: 'Whether more items exist',
        example: true,
      }),
      nextCursor: z.string().nullable().openapi({
        description: 'Cursor for next page (null if no more items)',
        example: '2024-01-15T10:30:00Z',
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
  limit: CoreSchemas.limit(),
  page: CoreSchemas.page(),
}).openapi('PaginationQuery');

/**
 * Sorting parameters
 */
export const SortingQuerySchema = z.object({
  sortBy: z.string().min(1).optional().openapi({
    description: 'Field to sort by',
    example: 'createdAt',
  }),
  sortOrder: CoreSchemas.sortOrder(),
}).openapi('SortingQuery');

/**
 * Search parameters
 */
export const SearchQuerySchema = z.object({
  search: z.string().min(1).optional().openapi({
    description: 'Search query string',
    example: 'search term',
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
    description: 'Resource identifier',
    param: { in: 'path', name: 'id' },
  }),
}).openapi('IdParam');

/**
 * UUID path parameter
 */
export const UuidParamSchema = z.object({
  id: CoreSchemas.uuid().openapi({
    description: 'UUID resource identifier',
    param: { in: 'path', name: 'id' },
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
   * Positive integer field
   */
  count: () => z.number().int().nonnegative().openapi({
    description: 'Non-negative integer count',
    example: 0,
  }),

  /**
   * JSON metadata field - use specific schemas when possible
   * Only use for truly dynamic data that cannot be typed
   * Accepts JSON-serializable values (strings, numbers, booleans, null, nested objects)
   */
  metadata: () => z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ])).nullable().optional().openapi({
    description: 'Custom metadata (prefer specific schemas)',
    example: { key: 'value' },
  }),

  /**
   * Nullable string field (common for optional text)
   */
  nullableString: () => z.string().nullable().optional().openapi({
    description: 'Optional text field',
  }),

  /**
   * Priority/order field (0-indexed)
   */
  priority: () => z.number().int().min(0).openapi({
    description: 'Priority/order (0-indexed)',
    example: 0,
  }),

  /**
   * Array of strings (tags, features, etc.)
   */
  stringArray: () => z.array(z.string()).openapi({
    description: 'Array of strings',
    example: ['tag1', 'tag2'],
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
    description: 'Thread identifier',
    example: 'thread_abc123',
    param: { in: 'path', name: 'threadId' },
  }),
}).openapi('ThreadIdParam');

/**
 * Thread slug path parameter (for public access)
 * ✅ REUSABLE: Used for public thread sharing
 */
export const ThreadSlugParamSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread slug for public access',
    example: 'product-strategy-brainstorm-abc123',
    param: { in: 'path', name: 'slug' },
  }),
}).openapi('ThreadSlugParam');

/**
 * Participant ID path parameter
 * ✅ REUSABLE: Used across participant endpoints
 */
export const ParticipantIdParamSchema = z.object({
  participantId: CoreSchemas.id().openapi({
    description: 'Participant identifier',
    example: 'participant_abc123',
    param: { in: 'path', name: 'participantId' },
  }),
}).openapi('ParticipantIdParam');

/**
 * Custom role ID path parameter
 * ✅ REUSABLE: Used across custom role endpoints
 */
export const CustomRoleIdParamSchema = z.object({
  roleId: CoreSchemas.id().openapi({
    description: 'Custom role identifier',
    example: 'role_abc123',
    param: { in: 'path', name: 'roleId' },
  }),
}).openapi('CustomRoleIdParam');

/**
 * Round number path parameter
 * ✅ REUSABLE: Used for round-specific operations
 */
export const RoundNumberParamSchema = z.object({
  roundNumber: z.string().openapi({
    description: 'Round number (✅ 0-BASED: first round is 0)',
    example: '0',
    param: { in: 'path', name: 'roundNumber' },
  }),
}).openapi('RoundNumberParam');

/**
 * Thread + Round path parameters (combined)
 * ✅ REUSABLE: Used for round moderator endpoints
 */
export const ThreadRoundParamSchema = z.object({
  roundNumber: z.string().openapi({
    description: 'Round number (✅ 0-BASED: first round is 0)',
    example: '0',
    param: { in: 'path', name: 'roundNumber' },
  }),
  threadId: CoreSchemas.id().openapi({
    description: 'Thread identifier',
    example: 'thread_abc123',
    param: { in: 'path', name: 'threadId' },
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
  /** Whether auto-trigger was queued for round recovery */
  autoTriggerQueued: z.boolean().optional().openapi({
    description: 'Whether auto-trigger was queued for round recovery',
    example: true,
  }),
  /** Whether stream is actively streaming */
  isActive: z.boolean().optional().openapi({
    description: 'Whether stream is actively streaming',
    example: true,
  }),
  /** Moderator message ID (for moderator phase) */
  moderatorMessageId: z.string().optional().openapi({
    description: 'Moderator message ID for moderator phase',
    example: 'moderator_abc123',
  }),
  /** Index of next participant to stream (if any) */
  nextParticipantIndex: z.number().int().nonnegative().optional().openapi({
    description: 'Index of next participant to stream',
    example: 1,
  }),
  /** Current participant index */
  participantIndex: z.number().int().nonnegative().optional().openapi({
    description: 'Current participant index',
    example: 0,
  }),
  /** Status of each participant in the round */
  participantStatuses: z.record(z.string(), z.string()).optional().openapi({
    description: 'Status of each participant in the round',
    example: { 0: 'completed', 1: 'streaming', 2: 'pending' },
  }),
  /** Current stream phase (presearch, participant, moderator) */
  phase: StreamPhaseSchema.optional().openapi({
    description: 'Current stream phase',
    example: 'participant',
  }),
  /** Whether stream was resumed from buffer */
  resumedFromBuffer: z.boolean().optional().openapi({
    description: 'Whether stream was resumed from buffer',
    example: true,
  }),
  /** Whether round is complete */
  roundComplete: z.boolean().optional().openapi({
    description: 'Whether round is complete',
    example: false,
  }),
  /** 0-based round number */
  roundNumber: z.number().int().nonnegative().optional().openapi({
    description: '0-based round number',
    example: 0,
  }),
  /** Stream ID (format: {threadId}_r{roundNumber}_p{participantIndex}) */
  streamId: z.string().optional().openapi({
    description: 'Stream ID for resumption',
    example: 'thread_123_r0_p0',
  }),
  /** Total participants in this round */
  totalParticipants: z.number().int().positive().optional().openapi({
    description: 'Total participants in this round',
    example: 3,
  }),
}).openapi('SSEStreamMetadata');

export type SSEStreamMetadata = z.infer<typeof SSEStreamMetadataSchema>;

/**
 * Text stream metadata for moderator/object streaming
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema
 */
export const TextStreamMetadataSchema = z.object({
  /** Moderator message ID for round moderator streams */
  moderatorMessageId: z.string().optional().openapi({
    description: 'Moderator message ID for round moderator streams',
    example: 'moderator_123',
  }),
  /** Resource ID (e.g., moderator message ID) */
  resourceId: z.string().optional().openapi({
    description: 'Resource ID (e.g., moderator message ID)',
    example: 'moderator_abc123',
  }),
  /** Whether stream was resumed from buffer */
  resumedFromBuffer: z.boolean().optional().openapi({
    description: 'Whether stream was resumed from buffer',
    example: true,
  }),
  /** Round number for round moderator streams */
  roundNumber: z.number().int().nonnegative().optional().openapi({
    description: 'Round number for round moderator streams',
    example: 0,
  }),
  /** Stream ID for resumption */
  streamId: z.string().optional().openapi({
    description: 'Stream ID for resumption',
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
  // Health details - JSON-serializable diagnostic data
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().openapi({
    description: 'Additional health details',
    example: { version: APP_VERSION },
  }),
  duration: z.number().nonnegative().optional().openapi({
    description: 'Response time in milliseconds',
    example: 45,
  }),
  message: z.string().openapi({
    description: 'Status message',
    example: 'Connected',
  }),
  status: HealthStatusSchema.openapi({
    description: 'Health status of the dependency',
    example: 'healthy',
  }),
}).openapi('HealthDependency');

export type HealthDependency = z.infer<typeof HealthDependencySchema>;

/**
 * Health check summary counts
 * ✅ ZOD-FIRST PATTERN: Type inferred from schema
 */
export const HealthSummarySchema = z.object({
  degraded: z.number().int().nonnegative().openapi({
    description: 'Number of degraded dependencies',
    example: 1,
  }),
  healthy: z.number().int().nonnegative().openapi({
    description: 'Number of healthy dependencies',
    example: 3,
  }),
  total: z.number().int().nonnegative().openapi({
    description: 'Total number of dependencies',
    example: 4,
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
    threadId: z.string().openapi({
      description: 'Thread ID for the conversation',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
    type: z.literal('start'),
  }),
  z.object({
    content: z.string().openapi({
      description: 'Partial content chunk',
    }),
    messageId: z.string().nullable().openapi({
      description: 'Message ID (null until saved)',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
    type: z.literal('chunk'),
  }),
  z.object({
    messageId: z.string().openapi({
      description: 'Final message ID',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
    type: z.literal('complete'),
    usage: z.object({
      messagesCreated: z.number().int(),
      messagesLimit: z.number().int(),
    }).optional(),
  }),
  z.object({
    code: z.string().optional().openapi({
      description: 'Error code',
    }),
    error: z.string().openapi({
      description: 'Error message',
    }),
    timestamp: z.number().openapi({
      description: 'Unix timestamp in milliseconds',
    }),
    type: z.literal('failed'),
  }),
]).openapi({
  description: 'Server-Sent Event for streaming AI responses',
  example: {
    content: 'This is a partial response...',
    messageId: null,
    timestamp: Date.now(),
    type: 'chunk',
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
    // Error details - JSON-serializable values for additional context
    details?: Record<string, string | number | boolean | null | string[]>;
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
