# Type Inference and Schema Validation Patterns

**Single Source of Truth for Type Safety Architecture**

This document details the complete type inference chain from database schema to API client, ensuring end-to-end type safety without manual type casting.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Enum-Based Pattern System](#enum-based-pattern-system)
3. [Metadata Type Safety Chain](#metadata-type-safety-chain)
4. [Query Keys Pattern](#query-keys-pattern)
5. [Type Inference Chain](#type-inference-chain)
6. [Zod Schema Patterns](#zod-schema-patterns)
7. [Drizzle ORM Integration](#drizzle-orm-integration)
8. [OpenAPI Type Generation](#openapi-type-generation)
9. [Handler Factory Type Safety](#handler-factory-type-safety)
10. [Schema Composition Patterns](#schema-composition-patterns)
11. [AI SDK Integration Patterns](#ai-sdk-integration-patterns)
12. [Best Practices](#best-practices)
13. [Anti-Patterns](#anti-patterns)

---

## Architecture Overview

### Type Safety Principles

1. **Zero Type Casting** - All types inferred automatically from schemas
2. **Single Source of Truth** - Database schema drives all type definitions
3. **Runtime Validation** - Zod validates at runtime, TypeScript validates at compile time
4. **End-to-End Safety** - Types flow from database → API → client
5. **OpenAPI Synchronization** - Documentation and types always in sync

### Technology Stack

```typescript
Database (Drizzle ORM)
    ↓ createSelectSchema / createInsertSchema
Zod Schemas (Runtime Validation)
    ↓ z.infer<typeof Schema>
TypeScript Types (Compile Time)
    ↓ OpenAPI Schema Generation
API Documentation
    ↓ RPC Client Type Inference
Frontend Type Safety
```

---

## Enum-Based Pattern System

### The 5-Part Enum Pattern

**Single Source**: `/src/api/core/enums.ts`

Every enum in the codebase MUST follow this exact 5-part pattern:

```typescript
// ============================================================================
// EXAMPLE: CHAT MODE ENUM
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const CHAT_MODES = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

// 2️⃣ DEFAULT VALUE (if applicable)
export const DEFAULT_CHAT_MODE: ChatMode = 'debating';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const ChatModeSchema = z.enum(CHAT_MODES).openapi({
  description: 'Conversation mode for roundtable discussions',
  example: 'brainstorming',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type ChatMode = z.infer<typeof ChatModeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const ChatModes = {
  ANALYZING: 'analyzing' as const,
  BRAINSTORMING: 'brainstorming' as const,
  DEBATING: 'debating' as const,
  SOLVING: 'solving' as const,
} as const;
```

### Usage Pattern

**✅ CORRECT - Use constant object:**
```typescript
import { ChatModes } from '@/api/core/enums';

if (mode === ChatModes.ANALYZING) {
  // Type-safe, autocomplete works, no typos possible
}
```

**❌ INCORRECT - Hardcoded strings:**
```typescript
if (mode === 'analyzing') {
  // Fragile, no autocomplete, typo-prone
}
```

### Critical Enums

| Enum | Constant Object | Use Cases |
|------|----------------|-----------|
| `MessageRoles` | `USER`, `ASSISTANT`, `TOOL` | Message role discrimination |
| `ChatModes` | `ANALYZING`, `BRAINSTORMING`, `DEBATING`, `SOLVING` | Thread mode selection |
| `MessageStatuses` | `PENDING`, `STREAMING`, `COMPLETE`, `FAILED` | Message lifecycle (summaries, pre-searches) |
| `PreSearchStatuses` | `IDLE`, `STREAMING`, `ACTIVE`, `COMPLETE`, `FAILED` | Pre-search lifecycle |
| `AiSdkStatuses` | `READY`, `SUBMITTED`, `STREAMING`, `ERROR` | AI SDK hook status |

**Reference**: `/src/api/core/enums.ts:1-694`

---

## Metadata Type Safety Chain

### Single Source of Truth for Metadata

**Location**: `/src/db/schemas/chat-metadata.ts`

All message metadata uses discriminated unions by `role` field:

```typescript
// Discriminated union - TypeScript narrows based on 'role'
export const DbMessageMetadataSchema = z.discriminatedUnion('role', [
  DbUserMessageMetadataSchema,           // role: 'user'
  DbAssistantMessageMetadataSchema,      // role: 'assistant'
  DbPreSearchMessageMetadataSchema,      // role: 'system'
]);

export type DbMessageMetadata = z.infer<typeof DbMessageMetadataSchema>;
```

### User Message Metadata

```typescript
// From: /src/db/schemas/chat-metadata.ts:87-95
export const DbUserMessageMetadataSchema = z.object({
  role: z.literal('user'),                    // ✅ Discriminator
  roundNumber: RoundNumberSchema,             // ✅ 0-based (required)
  createdAt: z.string().datetime().optional(),
  isParticipantTrigger: z.boolean().optional(), // Frontend-only flag
});

export type DbUserMessageMetadata = z.infer<typeof DbUserMessageMetadataSchema>;
```

### Assistant Message Metadata

```typescript
// From: /src/db/schemas/chat-metadata.ts:109-148
export const DbAssistantMessageMetadataSchema = z.object({
  role: z.literal('assistant'),              // ✅ Discriminator

  // ✅ REQUIRED: Round tracking (0-based)
  roundNumber: RoundNumberSchema,

  // ✅ REQUIRED: Participant identification
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable(),

  // ✅ REQUIRED: Model tracking
  model: z.string().min(1),
  finishReason: FinishReasonSchema,

  // ✅ REQUIRED: Usage tracking
  usage: UsageSchema,

  // ✅ REQUIRED: Error state (with defaults)
  hasError: z.boolean().default(false),
  isTransient: z.boolean().default(false),
  isPartialResponse: z.boolean().default(false),

  // Optional error details
  errorType: ErrorTypeSchema.optional(),
  errorMessage: z.string().optional(),
  // ... additional backend debugging fields
});

export type DbAssistantMessageMetadata = z.infer<typeof DbAssistantMessageMetadataSchema>;
```

### Metadata Extraction Functions

**Single Source**: `/src/lib/utils/metadata.ts`

**Type-safe extraction with Zod validation:**

```typescript
// Role-specific extractors (return null if invalid)
export function getUserMetadata(metadata: unknown): DbUserMessageMetadata | null;
export function getAssistantMetadata(metadata: unknown): DbAssistantMessageMetadata | null;
export function getParticipantMetadata(metadata: unknown): DbAssistantMessageMetadata | null;
export function getPreSearchMetadata(metadata: unknown): DbPreSearchMessageMetadata | null;

// Field-specific extractors (null-safe)
export function getRoundNumber(metadata: unknown): number | null;
export function getParticipantId(metadata: unknown): string | null;
export function getParticipantIndex(metadata: unknown): number | null;
export function getParticipantRole(metadata: unknown): string | null;
export function getModel(metadata: unknown): string | null;
export function hasError(metadata: unknown): boolean;
export function isPreSearch(metadata: unknown): boolean;

// Throwing variants (for backend - critical errors)
export function requireUserMetadata(metadata: unknown): DbUserMessageMetadata;
export function requireAssistantMetadata(metadata: unknown): DbAssistantMessageMetadata;
export function requireParticipantMetadata(metadata: unknown): DbAssistantMessageMetadata;
```

**Usage Pattern:**

```typescript
// ✅ CORRECT - Type-safe extraction
import { getRoundNumber, getParticipantId } from '@/lib/utils/metadata';

const roundNumber = getRoundNumber(message.metadata);  // number | null
const participantId = getParticipantId(message.metadata);  // string | null

if (roundNumber !== null && participantId) {
  // Both values are guaranteed types here
}
```

```typescript
// ❌ INCORRECT - Unsafe casting
const roundNumber = (message.metadata as Record<string, unknown>)?.roundNumber;
const participantId = (message.metadata as any).participantId;
```

### Metadata Builder Functions

**Single Source**: `/src/lib/utils/metadata-builder.ts`

```typescript
// Type-safe metadata construction with compile-time enforcement
import { createParticipantMetadata } from '@/lib/utils/metadata-builder';

const metadata = createParticipantMetadata({
  // TypeScript enforces ALL required fields
  roundNumber: 1,
  participantId: '01ABC123',
  participantIndex: 0,
  participantRole: null,
  model: 'gpt-4',
  finishReason: 'stop',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  hasError: false,
  isTransient: false,
  isPartialResponse: false,
});
```

### Metadata Anti-Patterns

**❌ FORBIDDEN:**
- `.passthrough()` on metadata schemas - Only explicitly defined fields allowed
- `.nullable()` on root schemas - Use explicit `z.string().nullable()` instead
- `[key: string]: unknown` - No loose index signatures
- `as Record<string, unknown>` - Use type-safe extraction functions

**✅ ENFORCED:**
- All metadata must pass Zod validation
- Required fields MUST be present
- Types inferred from Zod schemas (single source of truth)
- Use extraction functions from `/src/lib/utils/metadata.ts`

---

## Query Keys Pattern

### Factory System

**Single Source**: `/src/lib/data/query-keys.ts`

Hierarchical, type-safe query key generation with `as const`:

```typescript
const QueryKeyFactory = {
  base: (resource: string) => [resource] as const,
  list: (resource: string) => [resource, 'list'] as const,
  detail: (resource: string, id: string) => [resource, 'detail', id] as const,
  current: (resource: string) => [resource, 'current'] as const,
  all: (resource: string) => [resource, 'all'] as const,
  action: (resource: string, action: string, ...params: string[]) =>
    [resource, action, ...params] as const,
} as const;
```

### Domain-Specific Query Keys

```typescript
export const queryKeys = {
  threads: {
    all: QueryKeyFactory.base('threads'),          // ['threads']
    lists: (search?: string) =>
      search
        ? [...queryKeys.threads.all, 'list', 'search', search] as const
        : [...queryKeys.threads.all, 'list'] as const,
    detail: (id: string) => QueryKeyFactory.detail('threads', id),
    messages: (id: string) => QueryKeyFactory.action('threads', 'messages', id),
    changelog: (id: string) => QueryKeyFactory.action('threads', 'changelog', id),
    analyses: (id: string) => QueryKeyFactory.action('threads', 'analyses', id),
    preSearches: (id: string) => QueryKeyFactory.action('threads', 'pre-searches', id),
  },
} as const;
```

### Invalidation Patterns

```typescript
export const invalidationPatterns = {
  // After chat operations - invalidate usage stats and unified quota
  afterChatOperation: [
    queryKeys.usage.stats(),
    queryKeys.usage.unifiedQuota(),
  ],

  threadDetail: (threadId: string) => [
    queryKeys.threads.detail(threadId),
    queryKeys.threads.lists(),
    queryKeys.threads.changelog(threadId),
    // ❌ Don't invalidate analyses - they're tied to specific rounds
  ],
} as const;
```

---

## Type Inference Chain

### Level 1: Database Schema → Drizzle Types

**Pattern**: Drizzle table definitions provide base types

**Reference**: `/src/db/tables/auth.ts:3-22`, `/src/db/tables/billing.ts:10-27`

```typescript
// Database table definition (source of truth)
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Drizzle automatically infers the table type
type UserTable = typeof user;
// Result: Complete type with all column definitions
```

### Level 2: Drizzle Schema → Zod Validation

**Pattern**: `drizzle-zod` bridges Drizzle and Zod

**Reference**: `/src/db/validation/auth.ts:1-54`

```typescript
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

// SELECT schema - for reading from database
export const userSelectSchema = createSelectSchema(user);
// Type: z.ZodObject<{
//   id: z.ZodString,
//   name: z.ZodString,
//   email: z.ZodString,
//   emailVerified: z.ZodBoolean,
//   image: z.ZodNullable<z.ZodString>,
//   createdAt: z.ZodDate,
//   updatedAt: z.ZodDate,
// }>

// INSERT schema - for creating new records (with custom refinements)
export const userInsertSchema = createInsertSchema(user, {
  email: schema => schema.email(), // Add email validation
  image: () => z.string().url().optional(), // Add URL validation
});

// UPDATE schema - for modifying existing records
export const userUpdateSchema = createUpdateSchema(user, {
  email: schema => schema.email().optional(),
  image: () => z.string().url().optional(),
});
```

**Key Benefits**:
- Automatic field validation based on database constraints
- Type-safe refinements for business logic
- Consistent validation across insert/select/update operations

### Level 3: Zod Schema → TypeScript Types

**Pattern**: `z.infer<typeof Schema>` extracts TypeScript types

**Reference**: `/src/api/routes/auth/schema.ts:38`, `/src/api/routes/billing/schema.ts:300-309`

```typescript
// API response schema with OpenAPI metadata
export const SecureMePayloadSchema = z.object({
  userId: CoreSchemas.id().openapi({
    example: 'cm4abc123def456ghi',
    description: 'Better Auth user identifier',
  }),
  email: CoreSchemas.email().openapi({
    example: 'user@example.com',
    description: 'User email address',
  }),
  name: z.string().openapi({
    example: 'John Doe',
    description: 'User display name',
  }),
  emailVerified: z.boolean().openapi({
    example: true,
    description: 'Whether the user email has been verified',
  }),
  image: z.string().nullable().openapi({
    example: 'https://example.com/avatar.jpg',
    description: 'User profile image URL',
  }),
  createdAt: z.string().datetime().openapi({
    example: '2024-01-01T00:00:00.000Z',
    description: 'User account creation timestamp',
  }),
  updatedAt: z.string().datetime().openapi({
    example: '2024-01-01T00:00:00.000Z',
    description: 'User account last update timestamp',
  }),
}).openapi('SecureMePayload');

// TypeScript type inferred automatically
export type SecureMePayload = z.infer<typeof SecureMePayloadSchema>;
// Result: {
//   userId: string;
//   email: string;
//   name: string;
//   emailVerified: boolean;
//   image: string | null;
//   createdAt: string;
//   updatedAt: string;
// }
```

**Pattern**: Complex schema composition with discriminated unions

**Reference**: `/src/api/routes/billing/schema.ts:161-211`

```typescript
// Subscription schema matching Stripe SDK types
const SubscriptionSchema = z.object({
  id: z.string().openapi({
    description: 'Stripe subscription ID',
    example: 'sub_ABC123',
  }),
  status: z.enum([
    'active',
    'past_due',
    'unpaid',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'paused',
  ] as const).openapi({
    description: 'Subscription status (matches Stripe.Subscription.Status)',
    example: 'active',
  }),
  priceId: z.string(),
  productId: z.string(),
  currentPeriodStart: CoreSchemas.timestamp(),
  currentPeriodEnd: CoreSchemas.timestamp(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: CoreSchemas.timestamp().nullable(),
  trialStart: CoreSchemas.timestamp().nullable(),
  trialEnd: CoreSchemas.timestamp().nullable(),
}).openapi('Subscription');

// Inferred TypeScript type
export type Subscription = z.infer<typeof SubscriptionSchema>;

// Use official Stripe SDK type for status field (maximum compatibility)
export type SubscriptionStatus = Stripe.Subscription.Status;
```

### Level 4: Schema → OpenAPI Documentation

**Pattern**: `.openapi()` method generates OpenAPI metadata

**Reference**: `/src/api/core/schemas.ts:384-396`

```typescript
// Response wrapper factory for consistent API responses
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

// Usage in route schema
export const ProductListResponseSchema = createApiResponseSchema(
  z.object({
    products: z.array(ProductSchema),
    count: z.number().int().nonnegative(),
  })
).openapi('ProductListResponse');
```

**OpenAPI Output**:
```json
{
  "components": {
    "schemas": {
      "ProductListResponse": {
        "type": "object",
        "properties": {
          "success": { "type": "boolean", "enum": [true] },
          "data": {
            "type": "object",
            "properties": {
              "products": {
                "type": "array",
                "items": { "$ref": "#/components/schemas/Product" }
              },
              "count": { "type": "integer", "minimum": 0 }
            }
          },
          "meta": {
            "type": "object",
            "properties": {
              "requestId": { "type": "string", "format": "uuid" },
              "timestamp": { "type": "string", "format": "date-time" },
              "version": { "type": "string" }
            }
          }
        },
        "required": ["success", "data"]
      }
    }
  }
}
```

### Level 5: Handler Factory Type Inference

**Pattern**: Generic handler factory with validated context

**Reference**: `/src/api/core/handlers.ts:72-113`

```typescript
// Handler configuration with schema types
export type HandlerConfig<
  _TRoute extends RouteConfig,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = {
  // Authentication mode
  auth?: 'session' | 'session-optional' | 'public' | 'api-key';

  // Validation schemas
  validateBody?: TBody;
  validateQuery?: TQuery;
  validateParams?: TParams;

  // Database and logging
  useTransaction?: boolean;
  operationName?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
};

// Enhanced context with fully typed validated data
export type HandlerContext<
  TEnv extends Env = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = Context<TEnv> & {
  validated: {
    // Conditional types - undefined if schema not provided
    body: [TBody] extends [never] ? undefined : z.infer<TBody>;
    query: [TQuery] extends [never] ? undefined : z.infer<TQuery>;
    params: [TParams] extends [never] ? undefined : z.infer<TParams>;
  };
  logger: {
    debug: (message: string, data?: LoggerData) => void;
    info: (message: string, data?: LoggerData) => void;
    warn: (message: string, data?: LoggerData) => void;
    error: (message: string, error?: Error, data?: LoggerData) => void;
  };
};

// Handler function type with full type inference
export type RegularHandler<
  _TRoute extends RouteConfig,
  TEnv extends Env = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = (
  c: HandlerContext<TEnv, TBody, TQuery, TParams>
) => Promise<Response>;
```

**Usage Example**:

**Reference**: `/src/api/routes/billing/handler.ts:171-190`

```typescript
// Handler automatically infers types from schemas
export const createCheckoutSessionHandler = createHandler(
  {
    auth: 'session', // User context automatically available
    validateBody: CheckoutRequestSchema, // Body type inferred
    operationName: 'createCheckoutSession',
  },
  async (c) => {
    // c.validated.body is fully typed as CheckoutRequest
    const { priceId, successUrl, cancelUrl } = c.validated.body;

    // c.get('user') is typed as SelectUser (from Better Auth)
    const user = c.get('user');

    // Full type safety - no type casting needed
    c.logger.info('Creating checkout session', {
      logType: 'operation',
      operationName: 'createCheckoutSession',
      userId: user.id,
    });

    // ... implementation
  }
);
```

---

## Zod Schema Patterns

### Core Schema Utilities

**Reference**: `/src/api/core/schemas.ts:18-102`

```typescript
/**
 * Reusable schema building blocks with OpenAPI metadata
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
};
```

### Discriminated Union Patterns

**Critical Pattern**: Use discriminated unions instead of `Record<string, unknown>` for maximum type safety

**Reference**: `/src/api/core/schemas.ts:271-344`

```typescript
/**
 * Error context discriminated union - replaces Record<string, unknown>
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
    failureReason: z.enum([
      'invalid_credentials',
      'account_locked',
      'token_expired',
      'missing_token',
      'session_required',
      'session_expired'
    ]).optional(),
    operation: z.string().optional(),
    ipAddress: z.string().regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d{1,2})$/).optional(),
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
    errorType: z.literal('configuration'),
    service: z.string().optional(),
    configKey: z.string().optional(),
    operation: z.string().optional(),
  }),
]).optional();

// Type inference with discriminated union
export type ErrorContext = z.infer<typeof ErrorContextSchema>;

// TypeScript now provides intelligent autocomplete:
const context: ErrorContext = {
  errorType: 'validation', // TypeScript narrows to validation fields
  fieldErrors: [{ field: 'email', message: 'Invalid format' }],
};
```

**Benefits**:
- TypeScript discriminates based on `errorType` field
- Autocomplete shows only relevant fields for each error type
- Compile-time validation of field combinations
- Runtime validation ensures data matches expected shape

### Schema Composition

**Reference**: `/src/api/core/schemas.ts:444-458`

```typescript
/**
 * Paginated response schema factory
 * Composes pagination metadata with any data type
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

// Usage - automatically infers item type
const UserListResponseSchema = createPaginatedResponseSchema(UserSchema);
// Type: ApiResponse<{
//   items: User[];
//   pagination: {
//     page: number;
//     limit: number;
//     total: number;
//     pages: number;
//     hasNext: boolean;
//     hasPrev: boolean;
//   };
// }>
```

---

## Drizzle ORM Integration

### Type-Safe Database Operations

**Pattern**: Drizzle queries maintain full type safety

**Reference**: `/docs/backend-patterns.md:720-743`

```typescript
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// Query pattern - fully typed results
const users = await db.query.user.findMany({
  where: eq(tables.user.emailVerified, true),
  orderBy: desc(tables.user.createdAt),
  limit: 10,
});
// Type: Array<{
//   id: string;
//   name: string;
//   email: string;
//   emailVerified: boolean;
//   image: string | null;
//   createdAt: Date;
//   updatedAt: Date;
// }>

// Insert pattern with returning
const [newUser] = await db.insert(tables.user).values({
  email: 'user@example.com',
  name: 'John Doe',
}).returning();
// Type: Same as query result

// Update pattern
await db.update(tables.user)
  .set({ emailVerified: true })
  .where(eq(tables.user.id, userId));

// Delete pattern
await db.delete(tables.user)
  .where(eq(tables.user.id, userId));
```

### Batch Operations (Cloudflare D1)

**CRITICAL**: Use `db.batch()` instead of `db.transaction()` for Cloudflare D1

**Reference**: `/docs/backend-patterns.md:747-884`

```typescript
// ✅ CORRECT: Using db.batch() for atomic operations
const [insertResult, updateResult] = await db.batch([
  db.insert(tables.user).values({ email, name }).returning(),
  db.insert(tables.profile).values({ userId: newUserId, bio: '' })
]);

// Multiple operations in single atomic batch
await db.batch([
  db.insert(tables.stripeCustomer).values(customer),
  db.update(tables.user).set({ hasCustomer: true }).where(eq(tables.user.id, userId)),
  db.insert(tables.webhookEvent).values(eventLog)
]);

// ❌ PROHIBITED: db.transaction() not supported in D1
// This will trigger ESLint error and TypeScript error
await db.transaction(async (tx) => {
  await tx.insert(tables.user).values(newUser);
  await tx.update(tables.user).set({ verified: true });
});
// Error: local/no-db-transactions
// Error: Property 'transaction' does not exist on type 'D1BatchDatabase'
```

### createHandlerWithBatch Pattern (RECOMMENDED)

**Reference**: `/docs/backend-patterns.md:774-829`

```typescript
// Automatic batching in handlers
export const createUserHandler = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: CreateUserSchema,
  },
  async (c, batch) => {
    const body = c.validated.body;

    // Operations are automatically accumulated in batch
    const [newUser] = await batch.db.insert(tables.user).values({
      email: body.email,
      name: body.name,
    }).returning();

    // This operation is added to the same batch
    await batch.db.insert(tables.profile).values({
      userId: newUser.id,
      bio: body.bio || '',
    });

    // Batch executes atomically when handler completes
    return Responses.ok(c, { user: newUser });
  }
);
```

**How it works**:
1. All `batch.db.*` operations are collected during handler execution
2. At handler completion, all operations execute in single atomic batch
3. If any operation fails, all operations rollback automatically
4. Zero boilerplate - just use `batch.db` instead of `db`

---

## OpenAPI Type Generation

### Route Definition Pattern

**Reference**: `/src/api/routes/billing/route.ts` (example)

```typescript
import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

export const listProductsRoute = createRoute({
  method: 'get',
  path: '/billing/products',
  tags: ['billing'],
  summary: 'List all available products with pricing',
  description: 'Retrieves all active products from Stripe with their associated prices',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Products retrieved successfully',
      content: {
        'application/json': {
          schema: ProductListResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: 'Failed to retrieve products',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});

export const createCheckoutSessionRoute = createRoute({
  method: 'post',
  path: '/billing/checkout',
  tags: ['billing'],
  summary: 'Create Stripe checkout session',
  description: 'Initiates a Stripe Checkout session for subscription purchase',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CheckoutRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Checkout session created successfully',
      content: {
        'application/json': {
          schema: CheckoutResponseSchema,
        },
      },
    },
    [HttpStatusCodes.BAD_REQUEST]: {
      description: 'Invalid request data',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});
```

### OpenAPI Documentation Generation

**Reference**: `/src/api/index.ts:192-220`

```typescript
// OpenAPI specification endpoint
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Roundtable API',
    description: 'Collaborative AI brainstorming platform API',
  },
  servers: [
    {
      url: 'http://localhost:3000/api/v1',
      description: 'Local development server',
    },
    {
      url: 'https://your-domain.com/api/v1',
      description: 'Production server',
    },
  ],
});

// Scalar API documentation UI
app.get('/scalar', Scalar({
  spec: { url: '/api/v1/openapi.json' },
  theme: 'purple',
}));
```

**Accessing Documentation**:
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi.json`
- Interactive UI: `http://localhost:3000/api/v1/scalar`

---

## Handler Factory Type Safety

### Validation Integration

**Reference**: `/src/api/core/handlers.ts:280-349`

```typescript
// Internal validation logic (simplified)
async function performValidation<
  TBody extends z.ZodSchema,
  TQuery extends z.ZodSchema,
  TParams extends z.ZodSchema
>(
  c: Context,
  config: HandlerConfig<any, TBody, TQuery, TParams>
): Promise<{
  body: [TBody] extends [never] ? undefined : z.infer<TBody>;
  query: [TQuery] extends [never] ? undefined : z.infer<TQuery>;
  params: [TParams] extends [never] ? undefined : z.infer<TParams>;
}> {
  const validated = {
    body: undefined as any,
    query: undefined as any,
    params: undefined as any,
  };

  // Validate body
  if (config.validateBody) {
    const body = await c.req.json();
    const result = validateWithSchema(config.validateBody, body);

    if (!result.success) {
      throw HTTPExceptionFactory.badRequest(
        'Request validation failed',
        formatValidationErrorContext(result.errors)
      );
    }

    validated.body = result.data as [TBody] extends [never] ? undefined : z.infer<TBody>;
  }

  // Validate query
  if (config.validateQuery) {
    const query = c.req.query();
    const result = validateWithSchema(config.validateQuery, query);

    if (!result.success) {
      throw HTTPExceptionFactory.badRequest(
        'Query validation failed',
        formatValidationErrorContext(result.errors)
      );
    }

    validated.query = result.data as [TQuery] extends [never] ? undefined : z.infer<TQuery>;
  }

  // Validate params
  if (config.validateParams) {
    const params = c.req.param();
    const result = validateWithSchema(config.validateParams, params);

    if (!result.success) {
      throw HTTPExceptionFactory.badRequest(
        'Path parameter validation failed',
        formatValidationErrorContext(result.errors)
      );
    }

    validated.params = result.data as [TParams] extends [never] ? undefined : z.infer<TParams>;
  }

  return {
    body: validated.body,
    query: validated.query,
    params: validated.params,
  };
}
```

### Complete Handler Example

**Reference**: `/src/api/routes/billing/handler.ts:420-470`

```typescript
export const getSubscriptionHandler = createHandler(
  {
    auth: 'session',
    validateParams: SubscriptionIdParamSchema,
    operationName: 'getSubscription',
  },
  async (c) => {
    // Types automatically inferred:
    const { id } = c.validated.params; // Type: { id: string }
    const user = c.get('user'); // Type: SelectUser
    const db = await getDbAsync();

    c.logger.info('Fetching subscription', {
      logType: 'operation',
      operationName: 'getSubscription',
      userId: user.id,
      resourceId: id,
    });

    try {
      // Drizzle query with full type safety
      const subscription = await db.query.stripeSubscription.findFirst({
        where: eq(tables.stripeSubscription.id, id),
        with: {
          price: {
            with: {
              product: true,
            },
          },
        },
      });

      if (!subscription) {
        throw createError.notFound(
          `Subscription ${id} not found`,
          createResourceNotFoundContext('subscription', id, user.id)
        );
      }

      // Authorization check
      if (subscription.userId !== user.id) {
        throw createError.unauthorized(
          'You do not have access to this subscription',
          createAuthorizationErrorContext('subscription', id, user.id)
        );
      }

      // Type-safe response mapping
      return Responses.ok(c, {
        subscription: mapSubscriptionToResponse(subscription),
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      c.logger.error('Failed to fetch subscription', normalizeError(error), {
        logType: 'database',
        operation: 'select',
        table: 'stripeSubscription',
      });

      throw createError.internal(
        'Failed to retrieve subscription',
        createDatabaseErrorContext('select', 'stripeSubscription')
      );
    }
  }
);
```

---

## Schema Composition Patterns

### Nested Schema Composition

**Reference**: `/src/api/routes/billing/schema.ts:59-83`

```typescript
// Price schema - reusable component
const PriceSchema = z.object({
  id: z.string().openapi({
    example: 'price_1ABC123',
    description: 'Stripe price ID',
  }),
  productId: z.string().openapi({
    example: 'prod_ABC123',
    description: 'Stripe product ID',
  }),
  unitAmount: z.number().int().nonnegative().openapi({
    example: 999,
    description: 'Price in cents',
  }),
  currency: z.string().openapi({
    example: 'usd',
    description: 'Currency code',
  }),
  interval: z.enum(['month', 'year']).openapi({
    example: 'month',
    description: 'Billing interval',
  }),
  trialPeriodDays: z.number().int().nonnegative().nullable().openapi({
    example: 14,
    description: 'Trial days',
  }),
  active: z.boolean().openapi({
    example: true,
    description: 'Active status',
  }),
}).openapi('Price');

// Product schema - composes Price schema
const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  features: z.array(z.string()).nullable(),
  active: z.boolean(),
  // Nested array of prices
  prices: z.array(PriceSchema).optional().openapi({
    description: 'Available prices',
  }),
}).openapi('Product');
```

### Request/Response Pairing

**Reference**: `/src/api/routes/billing/schema.ts:266-290`

```typescript
// Request schema
export const SwitchSubscriptionRequestSchema = z.object({
  newPriceId: z.string().min(1).openapi({
    description: 'New Stripe price ID to switch to (handles both upgrades and downgrades)',
    example: 'price_1ABC456',
  }),
}).openapi('SwitchSubscriptionRequest');

// Response payload schema
const SubscriptionChangePayloadSchema = z.object({
  subscription: SubscriptionSchema.openapi({
    description: 'Updated subscription details',
  }),
  message: z.string().openapi({
    description: 'Success message describing the change',
    example: 'Subscription upgraded successfully',
  }),
}).openapi('SubscriptionChangePayload');

// Response schema with wrapper
export const SubscriptionChangeResponseSchema = createApiResponseSchema(
  SubscriptionChangePayloadSchema
).openapi('SubscriptionChangeResponse');

// Type exports
export type SwitchSubscriptionRequest = z.infer<typeof SwitchSubscriptionRequestSchema>;
export type SubscriptionChangePayload = z.infer<typeof SubscriptionChangePayloadSchema>;
```

---

## AI SDK Integration Patterns

### Streaming Response Types

When integrating AI SDK features with existing type patterns, follow these guidelines:

**Pattern 1: Zod Schema for AI Input/Output**

```typescript
// Define AI prompt schema with validation
export const AiPromptSchema = z.object({
  prompt: z.string().min(1).max(4000).openapi({
    description: 'User prompt for AI completion',
    example: 'Explain quantum computing',
  }),
  model: z.enum(['gpt-4', 'gpt-3.5-turbo']).default('gpt-4').openapi({
    description: 'AI model to use',
    example: 'gpt-4',
  }),
  temperature: z.number().min(0).max(2).default(0.7).optional().openapi({
    description: 'Response randomness (0-2)',
    example: 0.7,
  }),
  maxTokens: z.number().int().positive().max(8000).default(2000).optional().openapi({
    description: 'Maximum tokens in response',
    example: 2000,
  }),
}).openapi('AiPromptRequest');

export type AiPromptRequest = z.infer<typeof AiPromptSchema>;
```

**Pattern 2: Streaming Response Schema**

```typescript
// AI completion chunk schema
export const AiCompletionChunkSchema = z.object({
  id: z.string().openapi({
    description: 'Completion chunk ID',
    example: 'chunk_abc123',
  }),
  content: z.string().openapi({
    description: 'Partial completion text',
    example: 'Quantum computing is...',
  }),
  finishReason: z.enum(['stop', 'length', 'content_filter', null]).nullable().openapi({
    description: 'Reason completion stopped',
    example: null,
  }),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }).optional(),
}).openapi('AiCompletionChunk');

export type AiCompletionChunk = z.infer<typeof AiCompletionChunkSchema>;
```

**Pattern 3: Handler with AI SDK Integration**

```typescript
import { createHandler, Responses } from '@/api/core';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const generateAiCompletionHandler = createHandler(
  {
    auth: 'session',
    validateBody: AiPromptSchema,
    operationName: 'generateAiCompletion',
  },
  async (c) => {
    const { prompt, model, temperature, maxTokens } = c.validated.body;
    const user = c.get('user');

    c.logger.info('Generating AI completion', {
      logType: 'operation',
      operationName: 'generateAiCompletion',
      userId: user.id,
    });

    try {
      // AI SDK streaming with type safety
      const result = await streamText({
        model: openai(model),
        prompt,
        temperature,
        maxTokens,
      });

      // Convert AI SDK stream to Response
      return result.toTextStreamResponse();
    } catch (error) {
      c.logger.error('AI completion failed', normalizeError(error), {
        logType: 'external_service',
        service: 'openai',
        operation: 'streamText',
      });

      throw createError.internal(
        'Failed to generate AI completion',
        createStripeErrorContext('streamText')
      );
    }
  }
);
```

**Pattern 4: Type-Safe AI Context**

```typescript
// AI conversation context schema
export const AiConversationContextSchema = z.object({
  conversationId: CoreSchemas.uuid(),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
    timestamp: CoreSchemas.timestamp(),
  })),
  metadata: z.object({
    userId: CoreSchemas.uuid(),
    model: z.string(),
    totalTokens: z.number().int().nonnegative(),
  }),
}).openapi('AiConversationContext');

export type AiConversationContext = z.infer<typeof AiConversationContextSchema>;
```

**Pattern 5: Database Schema for AI Data**

```typescript
// Store AI completions in database
export const aiCompletion = sqliteTable('ai_completion', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  prompt: text('prompt').notNull(),
  completion: text('completion').notNull(),
  model: text('model').notNull(),
  temperature: real('temperature'),
  maxTokens: integer('max_tokens'),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  finishReason: text('finish_reason'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
});

// Drizzle-Zod schemas
export const aiCompletionSelectSchema = createSelectSchema(aiCompletion);
export const aiCompletionInsertSchema = createInsertSchema(aiCompletion);

export type AiCompletionSelect = z.infer<typeof aiCompletionSelectSchema>;
export type AiCompletionInsert = z.infer<typeof aiCompletionInsertSchema>;
```

---

## Best Practices

### 1. Always Export Type Alongside Schema

**✅ CORRECT**:
```typescript
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
}).openapi('User');

export type User = z.infer<typeof UserSchema>;
```

**❌ WRONG**:
```typescript
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
}).openapi('User');

// Missing type export - consumers must infer manually
```

### 2. Use CoreSchemas for Common Fields

**✅ CORRECT**:
```typescript
export const ProductSchema = z.object({
  id: CoreSchemas.id(),
  name: z.string(),
  price: CoreSchemas.amount(),
  createdAt: CoreSchemas.timestamp(),
}).openapi('Product');
```

**❌ WRONG**:
```typescript
export const ProductSchema = z.object({
  id: z.string(), // No validation or OpenAPI metadata
  name: z.string(),
  price: z.number(), // Missing nonnegative constraint
  createdAt: z.string(), // Missing datetime format
}).openapi('Product');
```

### 3. Always Add OpenAPI Metadata

**✅ CORRECT**:
```typescript
export const CheckoutRequestSchema = z.object({
  priceId: z.string().min(1).openapi({
    description: 'Stripe price ID for the subscription',
    example: 'price_1ABC123',
  }),
  successUrl: CoreSchemas.url().optional().openapi({
    description: 'URL to redirect to after successful checkout',
    example: 'https://app.example.com/chat/billing/success',
  }),
}).openapi('CheckoutRequest');
```

**❌ WRONG**:
```typescript
export const CheckoutRequestSchema = z.object({
  priceId: z.string().min(1), // Missing description and example
  successUrl: z.string().url().optional(), // Missing OpenAPI metadata
});
// Missing .openapi() call on schema itself
```

### 4. Use Discriminated Unions for Context Data

**✅ CORRECT**:
```typescript
export const ErrorContextSchema = z.discriminatedUnion('errorType', [
  z.object({
    errorType: z.literal('validation'),
    fieldErrors: z.array(z.object({
      field: z.string(),
      message: z.string(),
    })),
  }),
  z.object({
    errorType: z.literal('database'),
    operation: z.enum(['select', 'insert', 'update', 'delete']),
    table: z.string(),
  }),
]);
```

**❌ WRONG**:
```typescript
// Using Record<string, unknown> - no type safety
export const ErrorContextSchema = z.record(z.string(), z.unknown());
```

### 5. Compose Schemas for Reusability

**✅ CORRECT**:
```typescript
// Reusable base schema
const BaseEntitySchema = z.object({
  id: CoreSchemas.id(),
  createdAt: CoreSchemas.timestamp(),
  updatedAt: CoreSchemas.timestamp(),
});

// Extend for specific entity
export const UserSchema = BaseEntitySchema.extend({
  email: CoreSchemas.email(),
  name: z.string(),
}).openapi('User');
```

**❌ WRONG**:
```typescript
// Duplicate fields across schemas
export const UserSchema = z.object({
  id: CoreSchemas.id(),
  createdAt: CoreSchemas.timestamp(),
  updatedAt: CoreSchemas.timestamp(),
  email: CoreSchemas.email(),
  name: z.string(),
});

export const ProductSchema = z.object({
  id: CoreSchemas.id(),
  createdAt: CoreSchemas.timestamp(),
  updatedAt: CoreSchemas.timestamp(),
  name: z.string(),
  price: CoreSchemas.amount(),
});
```

### 6. Use createHandlerWithBatch for Database Operations

**✅ CORRECT**:
```typescript
export const createResourceHandler = createHandlerWithBatch(
  {
    auth: 'session',
    validateBody: CreateResourceSchema,
  },
  async (c, batch) => {
    // All operations batched atomically
    const [resource] = await batch.db.insert(tables.resource).values(data).returning();
    await batch.db.insert(tables.auditLog).values(auditEntry);

    return Responses.ok(c, { resource });
  }
);
```

**❌ WRONG**:
```typescript
export const createResourceHandler = createHandler(
  {
    auth: 'session',
    validateBody: CreateResourceSchema,
  },
  async (c) => {
    const db = await getDbAsync();

    // Separate operations - not atomic
    const [resource] = await db.insert(tables.resource).values(data).returning();
    await db.insert(tables.auditLog).values(auditEntry);

    return Responses.ok(c, { resource });
  }
);
```

---

## Anti-Patterns

### ❌ Hardcoded String Literals (Enums)

**WRONG**:
```typescript
if (mode === 'analyzing') {  // ❌ Typo-prone, no autocomplete
  // ...
}
```

**CORRECT**:
```typescript
import { ChatModes } from '@/api/core/enums';

if (mode === ChatModes.ANALYZING) {  // ✅ Type-safe, autocomplete works
  // ...
}
```

### ❌ Unsafe Metadata Extraction

**WRONG**:
```typescript
const roundNumber = (metadata as Record<string, unknown>)?.roundNumber;  // ❌ No validation
const participantId = (metadata as any).participantId;  // ❌ No type safety
```

**CORRECT**:
```typescript
import { getRoundNumber, getParticipantId } from '@/lib/utils/metadata';

const roundNumber = getRoundNumber(metadata);  // ✅ Zod validated, returns number | null
const participantId = getParticipantId(metadata);  // ✅ Zod validated, returns string | null
```

### ❌ Inline Metadata Construction

**WRONG**:
```typescript
const metadata = {  // ❌ No type safety, easy to miss required fields
  role: 'assistant',
  roundNumber: 1,
  // Missing participantId, participantIndex, model, etc.
};
```

**CORRECT**:
```typescript
import { createParticipantMetadata } from '@/lib/utils/metadata-builder';

const metadata = createParticipantMetadata({  // ✅ TypeScript enforces all required fields
  roundNumber: 1,
  participantId: '01ABC123',
  participantIndex: 0,
  participantRole: null,
  model: 'gpt-4',
  finishReason: 'stop',
  usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  hasError: false,
  isTransient: false,
  isPartialResponse: false,
});
```

### ❌ Type Casting

**WRONG**:
```typescript
const user = await db.query.user.findFirst() as User;
const data = await c.req.json() as RequestBody;
```

**CORRECT**:
```typescript
// Use Zod validation - automatic type inference
const result = validateWithSchema(RequestBodySchema, await c.req.json());
if (!result.success) {
  throw HTTPExceptionFactory.badRequest('Invalid request');
}
const data = result.data; // Fully typed
```

### ❌ Using `any` or `unknown`

**WRONG**:
```typescript
export const MetadataSchema = z.record(z.string(), z.any());
export const ContextSchema = z.unknown();
```

**CORRECT**:
```typescript
// Use discriminated unions for structured data
export const MetadataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user'), userId: z.string() }),
  z.object({ type: z.literal('api'), apiKey: z.string() }),
]);
```

### ❌ Manual Type Definitions

**WRONG**:
```typescript
export type User = {
  id: string;
  email: string;
  name: string;
};

// Schema defined separately - can diverge from type
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});
```

**CORRECT**:
```typescript
// Single source of truth
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
}).openapi('User');

export type User = z.infer<typeof UserSchema>;
```

### ❌ Missing OpenAPI Metadata

**WRONG**:
```typescript
export const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
});
```

**CORRECT**:
```typescript
export const ProductSchema = z.object({
  id: CoreSchemas.id().openapi({
    example: 'prod_ABC123',
  }),
  name: z.string().openapi({
    example: 'Professional Plan',
  }),
  price: CoreSchemas.amount().openapi({
    example: 99.00,
  }),
}).openapi('Product');
```

### ❌ Using db.transaction() in Cloudflare D1

**WRONG**:
```typescript
await db.transaction(async (tx) => {
  await tx.insert(tables.user).values(newUser);
  await tx.update(tables.user).set({ verified: true });
});
// Error: Property 'transaction' does not exist on type 'D1BatchDatabase'
```

**CORRECT**:
```typescript
await db.batch([
  db.insert(tables.user).values(newUser),
  db.update(tables.user).set({ verified: true }).where(eq(tables.user.id, userId)),
]);
```

### ❌ Untyped AI Prompt Templates

**WRONG**:
```typescript
// Plain object with no type connection to schema
export const MY_JSON_STRUCTURE = {
  field1: '<COMPUTE: something>',
  field2: '<FROM_CONTEXT: data>',
  nestedObject: {
    child: '<EXTRACT: value>',
  },
};

// Used in prompt without validation - can silently drift from schema
const prompt = `Output JSON:\n${JSON.stringify(MY_JSON_STRUCTURE)}`;
```

**CORRECT**:
```typescript
import type { MyPayload } from '@/api/routes/my-route/schema';
import { type ValidatePromptTemplate, p } from '@/api/utils/prompt-template';

// Type-safe template - TypeScript errors if structure doesn't match schema
export const MY_JSON_STRUCTURE = {
  field1: p.compute('description of what to compute'),
  field2: p.context('description of context data'),
  nestedObject: {
    child: p.extract('what to extract from responses'),
  },
} satisfies ValidatePromptTemplate<MyPayload>;

// Now if MyPayload schema changes, this will cause a compile error
// until the template is updated to match - no silent drift
```

**Pattern Details**:
- Use `satisfies ValidatePromptTemplate<SchemaType>` to ensure template matches schema
- Import `p.compute`, `p.context`, `p.extract`, `p.optional` helpers for consistent placeholders
- Location: `/src/api/utils/prompt-template.ts` provides the type utilities
- Example: See `MODERATOR_SUMMARY_JSON_STRUCTURE` in `/src/api/services/prompts.service.ts`

### ❌ Hardcoded Mock Data Without Type Validation

**WRONG**:
```typescript
// Mock data can drift from schema without warning
const mockSummary = {
  article: { headline: 'Test', narrative: 'Content' },
  // Missing required fields? No error until runtime
};
```

**CORRECT**:
```typescript
import type { ModeratorSummaryPayload } from '@/api/routes/chat/schema';

// Type-safe mock factory - compile error if schema changes
const createTypeSafeMockData = (
  overrides?: Partial<ModeratorSummaryPayload>
): ModeratorSummaryPayload => ({
  article: { headline: 'Test', narrative: 'Content', keyTakeaway: 'Action' },
  // All required fields enforced by TypeScript
  ...overrides,
});
```

---

## Conclusion

This type inference and schema validation system ensures:

1. **Zero Type Casting** - All types inferred from schemas
2. **Runtime + Compile Time Safety** - Zod validates at runtime, TypeScript at compile time
3. **Single Source of Truth** - Database schema drives all type definitions
4. **OpenAPI Synchronization** - Documentation always matches implementation
5. **End-to-End Type Safety** - Types flow from database to frontend client

When adding AI SDK features, maintain these patterns by:
- Defining Zod schemas for AI input/output
- Using discriminated unions for AI context data
- Integrating AI SDK streams with type-safe response patterns
- Storing AI data in Drizzle-managed tables with proper schemas
- Following the established handler factory patterns for AI endpoints

**Key Principle**: Let TypeScript infer types from runtime validation schemas. Never define types manually when they can be inferred from Zod schemas.
