# Backend Patterns - Implementation Guide

> **Context Prime Document**: Essential reference for all backend development in roundtable.now. This document serves as the single source of truth for backend implementation standards.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Next.js vs Hono Routes](#nextjs-vs-hono-routes)
3. [Authentication Patterns](#authentication-patterns)
4. [API Route Patterns](#api-route-patterns)
5. [Service Layer Patterns](#service-layer-patterns)
6. [Middleware Patterns](#middleware-patterns)
7. [Database Patterns](#database-patterns)
8. [Error Handling](#error-handling)
9. [Implementation Guidelines](#implementation-guidelines)

---

## Architecture Overview

roundtable.now implements a modern, type-safe API architecture built on:
- **Hono.js** - Fast, lightweight web framework
- **Cloudflare Workers** - Edge runtime for global performance
- **Drizzle ORM** - Type-safe database operations
- **Better Auth** - Modern authentication
- **Zod** - Runtime type validation

### Core Principles

- **Factory Pattern Handlers** with integrated validation and authentication
- **Zero-Casting Type Safety** using Zod schemas and type guards
- **Batch-First Database Operations** for atomic consistency (Cloudflare D1)
- **Middleware-Based Security** with rate limiting and CSRF protection
- **OpenAPI Documentation** auto-generated from code

### Type Safety & Patterns Cross-Reference

**🚨 MANDATORY**: All type safety, enum, metadata, and validation patterns are defined in:
- **`/docs/type-inference-patterns.md`** - Single source of truth for:
  - Enum 5-part pattern (array constant → Zod schema → TypeScript type → constant object)
  - Metadata type safety chain (discriminated unions, extraction functions, builders)
  - Query keys pattern (hierarchical factory with `as const`)
  - Zod schema patterns (CoreSchemas, discriminated unions, composition)
  - Type inference chain (Database → Zod → TypeScript → OpenAPI)

**ALL backend code MUST follow patterns defined in type-inference-patterns.md**

### Directory Structure

```
src/api/
├── routes/{domain}/           # Domain-specific routes (3-4 file pattern)
│   ├── route.ts              # OpenAPI route definitions
│   ├── handler.ts            # Business logic implementation
│   ├── schema.ts             # Zod validation schemas
│   └── helpers.ts            # Domain-specific helpers (optional)
├── services/                 # Business logic services
├── middleware/               # Cross-cutting concerns
├── core/                     # Framework foundations
├── common/                   # Shared utilities
└── types/                    # Type definitions
```

---

## Next.js vs Hono Routes

### Single Source of Truth: ALL Business Logic in `src/api/`

**CRITICAL RULE**: 99% of API routes MUST be implemented in the Hono API (`src/api/routes/`), NOT as Next.js routes (`src/app/api/`).

### ✅ Allowed Next.js Routes (`src/app/api/`)

Only these specific routes are permitted as Next.js App Router routes:

**1. `/api/v1/[[...route]]/route.ts` - Hono API Proxy (REQUIRED)**
```typescript
// Proxies ALL requests to the Hono API
// This is the ONLY way to access Hono routes from Next.js
import api from '@/api';

export const GET = handler;
export const POST = handler;
// ... other HTTP methods
```

**2. `/api/auth/[...auth]/route.ts` - Better Auth Handler (REQUIRED)**
```typescript
// Better Auth REQUIRES its own Next.js route
// Cannot be implemented in Hono due to Better Auth architecture
import { auth } from '@/lib/auth/server';

export const { GET, POST } = auth.handler;
```

**3. `/api/og/route.tsx` - OG Image Generation (ACCEPTABLE)**
```typescript
// Next.js ImageResponse REQUIRES Next.js runtime
// Cannot be implemented in Hono as it uses React Server Components
export async function GET(request: NextRequest) {
  return generateOgImage({ title, description });
}
```

### ❌ ANTI-PATTERNS - Never Create These

**Standalone Next.js API Routes for Business Logic**:
```typescript
// ❌ WRONG - Don't create routes like this in src/app/api/
export async function POST(request: Request) {
  const body = await request.json();
  // Validation, business logic, database operations
  return NextResponse.json({ success: true });
}
```

**Why This is Wrong**:
- ❌ Bypasses Hono middleware (CSRF, rate limiting, session, logging)
- ❌ No Zod validation or type safety
- ❌ Not included in OpenAPI documentation
- ❌ Inconsistent error handling
- ❌ No structured logging
- ❌ Breaks RPC type inference for frontend
- ❌ Cannot use project's `createHandler` factory pattern

### ✅ CORRECT PATTERN - Hono API Route

**Instead, implement in `src/api/routes/{domain}/`**:

```typescript
// src/api/routes/system/route.ts
export const myRoute = createRoute({
  method: 'post',
  path: '/system/my-endpoint',
  tags: ['system'],
  request: {
    body: {
      content: {
        'application/json': { schema: MyRequestSchema },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Success',
      content: {
        'application/json': { schema: MyResponseSchema },
      },
    },
  },
});

// src/api/routes/system/handler.ts
export const myHandler = createHandler(
  {
    auth: 'session',
    validateBody: MyRequestSchema,
    operationName: 'myOperation',
  },
  async (c) => {
    const body = c.validated.body;
    const user = c.get('user');

    c.logger.info('Processing request', {
      logType: 'operation',
      operationName: 'myOperation',
      userId: user.id,
    });

    // Business logic here

    return Responses.ok(c, { success: true });
  },
);

// src/api/routes/system/schema.ts
export const MyRequestSchema = z.object({
  field: z.string().min(1),
}).openapi('MyRequest');

export const MyResponseSchema = z.object({
  success: z.boolean(),
}).openapi('MyResponse');
```

### When to Use Next.js Routes vs Hono Routes

| Use Case | Implementation | Location |
|----------|----------------|----------|
| REST API endpoints | ✅ Hono API | `src/api/routes/{domain}/` |
| GraphQL endpoints | ✅ Hono API | `src/api/routes/graphql/` |
| Webhook handlers | ✅ Hono API | `src/api/routes/{service}/` |
| Database operations | ✅ Hono API | `src/api/routes/{domain}/` |
| Business logic | ✅ Hono API | `src/api/routes/{domain}/` |
| Authentication (Better Auth) | ✅ Next.js Route | `src/app/api/auth/[...auth]/` |
| OG Image Generation | ✅ Next.js Route | `src/app/api/og/` |
| Hono API Proxy | ✅ Next.js Route | `src/app/api/v1/[[...route]]/` |
| Everything else | ✅ Hono API | `src/api/routes/{domain}/` |

### Next.js-Specific Features That Require Next.js Routes

**These are the ONLY exceptions**:
1. **`revalidatePath()` / `revalidateTag()`** - Next.js ISR revalidation
2. **`ImageResponse`** - OG image generation using React Server Components
3. **Better Auth handler** - Requires Next.js route due to library architecture
4. **`redirect()` / `notFound()`** - Next.js navigation (use inside Server Components instead)

**For everything else, use Hono API routes.**

### Migration Guide: Converting Next.js Routes to Hono

If you find a Next.js route that should be in Hono:

1. **Create route definition** in `src/api/routes/{domain}/route.ts`
2. **Create Zod schemas** in `src/api/routes/{domain}/schema.ts`
3. **Implement handler** in `src/api/routes/{domain}/handler.ts` using `createHandler`
4. **Register route** in `src/api/index.ts`
5. **Delete Next.js route** from `src/app/api/`
6. **Update frontend** to use new RPC client path

### Example: Moving a Revalidation Endpoint

**❌ Wrong (Next.js Route)**:
```typescript
// src/app/api/revalidate/route.ts
export async function POST(request: Request) {
  const body = await request.json() as { secret?: string; paths?: string[] };

  if (body.secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  for (const path of body.paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ success: true });
}
```

**✅ Correct (Hybrid Approach)**:

If you MUST use Next.js-specific features like `revalidatePath()`, use a thin Next.js wrapper:

```typescript
// src/app/api/system/revalidate/route.ts
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

import { createApiClient } from '@/api/client';

export async function POST(request: Request) {
  // Validate request using Hono API
  const client = await createApiClient();
  const validation = await client.system.revalidate.validate.$post({
    json: await request.json(),
  });

  if (!validation.ok) {
    return NextResponse.json(
      await validation.json(),
      { status: validation.status },
    );
  }

  const { paths } = await validation.json();

  // Use Next.js-specific feature
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ success: true });
}
```

```typescript
// src/api/routes/system/route.ts
export const revalidateValidationRoute = createRoute({
  method: 'post',
  path: '/system/revalidate/validate',
  tags: ['system'],
  request: {
    body: {
      content: {
        'application/json': { schema: RevalidateRequestSchema },
      },
    },
  },
  // ... response schemas
});
```

**However, in most cases, you don't need this complexity. Simply implement everything in Hono.**

---

## Authentication Patterns

### Better Auth Integration

**Reference**: `src/lib/auth/server/index.ts`

```typescript
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: createAuthAdapter(),

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },

  plugins: [
    nextCookies(),
    admin(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await emailService.sendMagicLink(email, url);
      },
    }),
  ],
});
```

### Session Middleware

**Reference**: `src/api/middleware/auth.ts`

The project uses two middleware patterns for session management:

**1. requireSession - For Protected Routes**
```typescript
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const { session, user } = await authenticateSession(c);

  if (!user || !session) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      res: new Response(JSON.stringify({
        code: HttpStatusCodes.UNAUTHORIZED,
        message: 'Authentication required',
        details: 'Valid session required to access this resource',
      }), {
        status: HttpStatusCodes.UNAUTHORIZED,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Session realm="api"',
        },
      }),
    });
  }

  return next();
});
```

**2. attachSession - For Optional Authentication**
```typescript
export const attachSession = createMiddleware<ApiEnv>(async (c, next) => {
  try {
    await authenticateSession(c);
  } catch (error) {
    // Log error but don't throw - allow unauthenticated requests to proceed
    apiLogger.apiError(c, 'Error retrieving Better Auth session', error);
    c.set('session', null);
    c.set('user', null);
  }
  return next();
});
```

**3. Handler Factory Authentication (Preferred)**
```typescript
// Modern approach - authentication integrated into handler
export const handler = createHandler(
  {
    auth: 'session', // or 'session-optional', 'public', 'api-key'
    operationName: 'getUser',
  },
  async (c) => {
    // Session and user automatically available in context
    const user = c.get('user');
    const session = c.get('session');
    // ... implementation
  }
);
```

---

## API Route Patterns

### Three-File Pattern

Every API domain follows this structure:

**1. route.ts** - OpenAPI Route Definitions
```typescript
export const secureMeRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  tags: ['users'],
  summary: 'Get current authenticated user',
  request: {
    params: z.object({
      id: CoreSchemas.id(),
    }),
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'User retrieved successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(SecureMePayloadSchema),
        },
      },
    },
  },
});
```

**2. handler.ts** - Business Logic
```typescript
export const secureMeHandler = createHandler(
  {
    auth: 'session',
    operationName: 'getUser',
  },
  async (c) => {
    const { id } = c.req.valid('param');
    const user = c.get('user');

    c.logger.info('Fetching user', {
      logType: 'operation',
      operationName: 'getUser',
      userId: user.id,
      targetId: id,
    });

    const targetUser = await db.query.user.findFirst({
      where: eq(tables.user.id, id),
    });

    if (!targetUser) {
      throw createError.notFound('User not found');
    }

    return Responses.ok(c, targetUser);
  },
);
```

**3. schema.ts** - Validation Schemas
```typescript
export const SecureMePayloadSchema = z.object({
  id: CoreSchemas.id().openapi({
    example: 'cm4abc123',
    description: 'User identifier',
  }),
  email: CoreSchemas.email().openapi({
    example: 'user@example.com',
  }),
  name: z.string().min(1).openapi({
    example: 'John Doe',
  }),
}).openapi('User');

export type User = z.infer<typeof SecureMePayloadSchema>;
```

### Cursor-Based Pagination Pattern

For list endpoints with infinite scroll support, use cursor-based pagination instead of offset pagination.

**Benefits**:
- Consistent results even when data changes
- Better performance for large datasets
- Supports infinite scroll UX patterns
- Type-safe cursors with Zod validation

**Implementation Pattern**:

**1. Request Schema (CursorPaginationQuerySchema)**:
```typescript
// From src/api/core/schemas.ts
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).default(20),
});
```

**2. Handler Implementation**:
```typescript
// Example: src/api/routes/chat/handler.ts:252-260
export const listThreadsHandler = createHandler(
  {
    auth: 'session',
    validateQuery: CursorPaginationQuerySchema,
    operationName: 'listThreads',
  },
  async (c) => {
    const { user } = c.auth();
    const query = c.validated.query;
    const db = await getDbAsync();

    // Build cursor-based where clause
    const threads = await db.query.chatThread.findMany({
      where: buildCursorWhereWithFilters(
        tables.chatThread.updatedAt,
        query.cursor,
        'desc',
        [eq(tables.chatThread.userId, user.id)],
      ),
      orderBy: getCursorOrderBy(tables.chatThread.updatedAt, 'desc'),
      limit: query.limit + 1, // Fetch one extra to check hasMore
    });

    // Apply cursor pagination and format response
    return Responses.ok(c, applyCursorPagination(
      threads,
      query.limit,
      (thread) => createTimestampCursor(thread.updatedAt),
    ));
  },
);
```

**3. Response Format**:
```typescript
{
  "data": [...items],
  "pagination": {
    "nextCursor": "2024-01-15T10:30:00.000Z",
    "hasMore": true,
    "count": 20
  }
}
```

**4. Pagination Utilities** (`src/api/common/pagination.ts`):
- `buildCursorWhereWithFilters()` - Builds WHERE clause with cursor and filters
- `getCursorOrderBy()` - Creates ORDER BY clause
- `createTimestampCursor()` - Generates cursor from timestamp
- `applyCursorPagination()` - Formats response with pagination metadata

**Frontend Integration** (React Query):
```typescript
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
  queryKey: ['threads'],
  queryFn: ({ pageParam }) => fetchThreads({ cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
});
```

### Server-Sent Events (SSE) Streaming Pattern

For real-time AI responses and token-by-token streaming, use Server-Sent Events with the Vercel AI SDK.

**Benefits**:
- Real-time token streaming for better UX
- Built-in error handling and recovery
- Type-safe streaming events
- Lifecycle callbacks for database operations

**Implementation Pattern**:

**1. Request Schema**:
```typescript
// From src/api/routes/chat/schema.ts
export const StreamChatRequestSchema = z.object({
  content: z.string().min(1),
  parentMessageId: z.string().optional(),
}).openapi('StreamChatRequest');
```

**2. Route Definition**:
```typescript
export const streamChatRoute = createRoute({
  method: 'post',
  path: '/chat/threads/:id/stream',
  tags: ['chat'],
  summary: 'Stream AI chat response',
  request: {
    params: ThreadIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: StreamChatRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Streaming response (Server-Sent Events)',
      content: {
        'text/event-stream': {
          schema: StreamingEventSchema, // Discriminated union
        },
      },
    },
  },
});
```

**3. Handler with Streaming**:
```typescript
// Example: src/api/routes/chat/handler.ts:907-1006
export const streamChatHandler = createHandler(
  {
    auth: 'session',
    validateParams: ThreadIdParamSchema,
    validateBody: StreamChatRequestSchema,
    operationName: 'streamChat',
  },
  async (c) => {
    const { user } = c.auth();
    const { id } = c.validated.params;
    const body = c.validated.body;

    // Setup OpenRouter provider
    const openrouter = createOpenRouterProvider({
      apiKey: c.env.OPENROUTER_API_KEY,
      appName: 'roundtable',
      siteUrl: c.env.NEXT_PUBLIC_APP_URL,
    });

    const model = openrouter(participant.modelId);

    // Stream with lifecycle callbacks
    return streamAIResponse(c, {
      threadId: id,
      userMessage: body.content,
      systemPrompt: participant.settings?.systemPrompt,
      previousMessages: modelMessages,
      model,
      temperature: 0.7,
      callbacks: {
        onStart: async (threadId) => {
          // Create user message in database
          await db.insert(tables.chatMessage).values({
            id: ulid(),
            threadId,
            role: 'user',
            content: body.content,
            createdAt: new Date(),
          });
        },
        onComplete: async (fullText, messageId) => {
          // Save assistant message
          await db.insert(tables.chatMessage).values({
            id: messageId,
            threadId: id,
            role: 'assistant',
            content: fullText,
            createdAt: new Date(),
          });
        },
        onError: async (error) => {
          apiLogger.error('Streaming error', { threadId: id, error });
        },
      },
    });
  },
);
```

**4. Streaming Event Types** (Zod discriminated union):
```typescript
// From src/api/core/schemas.ts
export const StreamingEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), threadId: z.string(), timestamp: z.number() }),
  z.object({ type: z.literal('chunk'), content: z.string(), messageId: z.string().nullable(), timestamp: z.number() }),
  z.object({ type: z.literal('complete'), messageId: z.string(), timestamp: z.number() }),
  z.object({ type: z.literal('error'), error: z.string(), code: z.string(), timestamp: z.number() }),
]);
```

**5. Streaming Utilities** (`src/api/common/streaming.ts`):
- `createOpenRouterProvider()` - Initialize OpenRouter with AI SDK
- `streamAIResponse()` - Main SSE streaming function with callbacks
- `buildModelMessages()` - Convert DB messages to AI SDK format (async in v6)
- `parseSSEEvent()` - Zod-based event parsing (client-side)

**Frontend Integration** (EventSource):
```typescript
const eventSource = new EventSource('/api/v1/chat/threads/123/stream');

eventSource.onmessage = (event) => {
  const streamEvent = parseSSEEvent(event.data);

  switch (streamEvent.type) {
    case 'chunk':
      appendToUI(streamEvent.content);
      break;
    case 'complete':
      finalize(streamEvent.messageId);
      break;
    case 'error':
      handleError(streamEvent.error);
      break;
  }
};
```

---

## Service Layer Patterns

### Service Organization

The `/src/api/services/` directory is currently empty. Services will be implemented as needed to handle business logic and external integrations following these patterns:

**When implementing services, follow this structure:**

```typescript
class ExampleService {
  constructor(private config: ServiceConfig) {}

  async performOperation(params: OperationParams): Promise<OperationResult> {
    // Implementation with proper error handling and logging
  }

  private async internalHelper(data: HelperData): Promise<HelperResult> {
    // Implementation
  }
}

export const exampleService = new ExampleService(getServiceConfig());
```

### Service Best Practices (for future implementations)

1. **Dependency Injection**: Pass configuration through constructor
2. **Error Handling**: Wrap external calls in try-catch with proper error types
3. **Logging**: Use structured logging for all operations
4. **Type Safety**: Return typed results, never `any`

**Note**: Currently, business logic is implemented directly in route handlers. The service layer will be introduced when needed for:
- Complex business logic that spans multiple routes
- External API integrations
- Reusable operations across different domains

---

## Middleware Patterns

### Available Middleware Files

Located in `/src/api/middleware/`:

- **auth.ts** - Session authentication (`attachSession`, `requireSession`)
- **rate-limiter-factory.ts** - Rate limiting with preset configurations
- **size-limits.ts** - Request/response size validation
- **hono-logger.ts** - Structured logging for API requests
- **environment-validation.ts** - Environment variable validation
- **index.ts** - Middleware exports

**Note**: CORS and CSRF middleware are configured inline in `/src/api/index.ts` (lines 79-139), not as separate middleware files.

### Authentication Middleware

**Reference**: `src/api/middleware/auth.ts`

The project provides a shared authentication helper and two middleware patterns:

**Internal Helper Function**:
```typescript
// authenticateSession - Shared authentication helper
// Extracts session from request headers and sets context variables
// Used internally by attachSession and requireSession middleware
async function authenticateSession(c: Context<ApiEnv>): Promise<{
  session: SelectSession | null;
  user: SelectUser | null;
}> {
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  // Normalize undefined fields to null for proper type safety
  const session = sessionData?.session ? {
    ...sessionData.session,
    ipAddress: sessionData.session.ipAddress ?? null,
    userAgent: sessionData.session.userAgent ?? null,
    impersonatedBy: sessionData.session.impersonatedBy ?? null,
  } as SelectSession : null;

  const user = sessionData?.user ? {
    ...sessionData.user,
    image: sessionData.user.image ?? null,
    role: sessionData.user.role ?? null,
    banned: sessionData.user.banned ?? null,
    banReason: sessionData.user.banReason ?? null,
    banExpires: sessionData.user.banExpires ?? null,
  } as SelectUser : null;

  c.set('session', session);
  c.set('user', user);
  c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());

  return { session, user };
}
```

**Public Middleware - attachSession**:
```typescript
// Attach session if present; does not enforce authentication
// Allows unauthenticated requests to proceed
export const attachSession = createMiddleware<ApiEnv>(async (c, next) => {
  try {
    await authenticateSession(c);
  } catch (error) {
    // Log error but don't throw
    apiLogger.apiError(c, 'Error retrieving Better Auth session', error);
    c.set('session', null);
    c.set('user', null);
  }
  return next();
});
```

**Public Middleware - requireSession**:
```typescript
// Require an authenticated session using Better Auth
// Throws 401 Unauthorized if session is missing or invalid
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  const { session, user } = await authenticateSession(c);

  if (!user || !session) {
    throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
      res: new Response(JSON.stringify({
        code: HttpStatusCodes.UNAUTHORIZED,
        message: 'Authentication required',
        details: 'Valid session required to access this resource',
      }), {
        status: HttpStatusCodes.UNAUTHORIZED,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Session realm="api"',
        },
      }),
    });
  }

  return next();
});
```

### Rate Limiting Middleware

**Reference**: `src/api/middleware/rate-limiter-factory.ts`

```typescript
import { RateLimiterFactory } from '@/api/middleware/rate-limiter-factory';

// Use preset configurations
app.use('*', RateLimiterFactory.create('api')); // General API rate limiting
app.use('/auth/*', RateLimiterFactory.create('auth')); // Auth-specific limits
app.use('/upload/*', RateLimiterFactory.create('upload')); // Upload limits

// Custom rate limiter
const customLimiter = RateLimiterFactory.createCustom({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  message: 'Too many requests',
});
```

### Size Limits Middleware

**Reference**: `src/api/middleware/size-limits.ts`

```typescript
import {
  createRequestSizeLimitMiddleware,
  createFileUploadSizeLimitMiddleware,
  DEFAULT_SIZE_LIMITS,
} from '@/api/middleware/size-limits';

// Request size validation
app.use('*', createRequestSizeLimitMiddleware({
  requestBody: 10 * 1024 * 1024, // 10MB
}));

// File upload size validation
app.use('/upload/*', createFileUploadSizeLimitMiddleware({
  fileUpload: 50 * 1024 * 1024, // 50MB
}));
```

### Logging Middleware

**Reference**: `src/api/middleware/hono-logger.ts`

```typescript
import { honoLoggerMiddleware, errorLoggerMiddleware } from '@/api/middleware/hono-logger';

// Request/response logging
app.use('*', honoLoggerMiddleware);

// Error logging
app.use('*', errorLoggerMiddleware);
```

### Environment Validation Middleware

**Reference**: `src/api/middleware/environment-validation.ts`

```typescript
import { createEnvironmentValidationMiddleware } from '@/api/middleware/environment-validation';

// Validate required environment variables on startup
app.use('*', createEnvironmentValidationMiddleware());
```

### CORS and CSRF Configuration

**Reference**: `src/api/index.ts` (lines 79-139)

CORS and CSRF are configured inline in the main API file, not as separate middleware:

```typescript
// CORS configuration (inline in index.ts)
app.use('*', (c, next) => {
  const appUrl = c.env.NEXT_PUBLIC_APP_URL;
  const webappEnv = c.env.NEXT_PUBLIC_WEBAPP_ENV || 'local';
  const isDevelopment = webappEnv === 'local' || c.env.NODE_ENV === 'development';

  const allowedOrigins: string[] = [];
  if (isDevelopment) {
    allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }
  if (appUrl && !appUrl.includes('localhost')) {
    allowedOrigins.push(appUrl);
  }

  const middleware = cors({
    origin: (origin) => {
      if (!origin) return origin;
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });
  return middleware(c, next);
});

// CSRF protection (inline in index.ts)
function csrfMiddleware(c: Context<ApiEnv>, next: Next) {
  const appUrl = c.env.NEXT_PUBLIC_APP_URL;
  // ... similar origin configuration
  const middleware = csrf({ origin: allowedOrigins });
  return middleware(c, next);
}

// Applied selectively to protected routes
app.use('/auth/me', csrfMiddleware, requireSession);
```

---

## Database Patterns

### Drizzle ORM Usage

```typescript
// Query pattern
const users = await db.query.user.findMany({
  where: eq(tables.user.emailVerified, true),
  orderBy: desc(tables.user.createdAt),
  limit: 10,
});

// Insert pattern
const newUser = await db.insert(tables.user).values({
  email: 'user@example.com',
  name: 'John Doe',
}).returning();

// Update pattern
await db.update(tables.user)
  .set({ emailVerified: true })
  .where(eq(tables.user.id, userId));

// Delete pattern
await db.delete(tables.user)
  .where(eq(tables.user.id, userId));
```

### 🚨 Batch Operations - Cloudflare D1 Pattern (REQUIRED)

**⚠️ CRITICAL**: Traditional `db.transaction()` is **PROHIBITED** with Cloudflare D1. Use `db.batch()` instead.

**Why Batch Operations?**
- Cloudflare D1 is optimized for batch operations, not transactions
- Batches provide atomic execution with better performance in serverless
- Transactions have limitations and performance issues in D1
- ESLint rules enforce batch-first architecture

#### Pattern 1: Manual Batch Operations

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
```

#### Pattern 2: createHandlerWithBatch (RECOMMENDED)

The `createHandlerWithBatch` factory provides automatic batch accumulation:

```typescript
// ✅ RECOMMENDED: Automatic batching in handlers
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

**How it works:**
1. All `batch.db.*` operations are collected during handler execution
2. At handler completion, all operations execute in single atomic batch
3. If any operation fails, all operations rollback automatically
4. Zero boilerplate - just use `batch.db` instead of `db`

#### Pattern 3: Conditional Batch Operations

```typescript
export const syncStripeHandler = createHandlerWithBatch(
  { auth: 'session' },
  async (c, batch) => {
    // Conditional operations still batched atomically
    await batch.db.insert(tables.stripeCustomer).values(customer);

    if (hasSubscription) {
      await batch.db.insert(tables.stripeSubscription).values(subscription);
    }

    if (hasInvoices) {
      await batch.db.insert(tables.stripeInvoice).values(invoice);
    }

    // All operations execute atomically together
  }
);
```

#### Pattern 4: Upsert in Batches

```typescript
await db.batch([
  db.insert(tables.stripeCustomer).values(customer).onConflictDoUpdate({
    target: tables.stripeCustomer.id,
    set: { email: customer.email, updatedAt: new Date() }
  }),
  db.insert(tables.stripeSubscription).values(subscription)
]);
```

#### ❌ PROHIBITED Pattern: db.transaction()

```typescript
// ❌ WRONG: This will trigger ESLint error and TypeScript error
await db.transaction(async (tx) => {
  await tx.insert(tables.user).values(newUser);
  await tx.update(tables.user).set({ verified: true });
});

// Error: local/no-db-transactions
// Error: Property 'transaction' does not exist on type 'D1BatchDatabase'
```

#### Migration from Transactions to Batches

**Before (Transaction):**
```typescript
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.update(users).set({ verified: true }).where(eq(users.id, userId));
  await tx.delete(users).where(eq(users.inactive, true));
});
```

**After (Batch):**
```typescript
await db.batch([
  db.insert(users).values(newUser),
  db.update(users).set({ verified: true }).where(eq(users.id, userId)),
  db.delete(users).where(eq(users.inactive, true))
]);
```

**After (Batch Handler - Recommended):**
```typescript
export const handler = createHandlerWithBatch({ auth: 'session' }, async (c, batch) => {
  await batch.db.insert(users).values(newUser);
  await batch.db.update(users).set({ verified: true }).where(eq(users.id, userId));
  await batch.db.delete(users).where(eq(users.inactive, true));
});
```

#### Type Safety

The project enforces batch-first architecture through:

**TypeScript Types:**
```typescript
import type { D1BatchDatabase } from '@/db/d1-types';

const db = await getDbAsync(); // Returns D1BatchDatabase<Schema>
// db.transaction() -> TypeScript error: Property 'transaction' does not exist
// db.batch() -> ✅ Correct
```

**ESLint Rules:**
- `local/no-db-transactions`: Blocks db.transaction() usage (ERROR)
- `local/prefer-batch-handler`: Suggests createHandlerWithBatch (WARNING)
- `local/batch-context-awareness`: Prefer batch.db over getDbAsync() (WARNING)

**Reference Implementation:**
- `src/api/routes/billing/handler.ts:171-283` - Stripe checkout with batch operations
- `src/api/services/stripe-sync.service.ts:131-165` - Subscription upsert in batch
- `src/api/core/handlers.ts:490-605` - createHandlerWithBatch implementation
- `src/db/d1-types.ts` - Type definitions and patterns
- `eslint-local-rules.js` - ESLint enforcement

**Further Reading:**
- [Cloudflare D1 Batch API](https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#batch-statements)
- [Drizzle ORM Batch Operations](https://orm.drizzle.team/docs/batch-api)

### Foreign Key Cascade Policy

**Reference**: All table definitions in `src/db/tables/`

This project follows a strict foreign key cascade policy to ensure data integrity and consistency. All foreign key relationships must follow these rules:

#### Policy Overview

| Parent Table | Child Table | ON DELETE Behavior | Rationale |
|--------------|-------------|-------------------|-----------|
| `user` | ALL tables | CASCADE | User owns all data - complete removal |
| `chat_thread` | `chat_message`, `chat_participant`, `chat_thread_changelog`, `chat_moderator_summary` | CASCADE | Thread-scoped data - remove with thread |
| `chat_participant` | `chat_message` | SET NULL | Preserve historical messages even if participant removed |
| `chat_custom_role` | `chat_participant` | SET NULL | Participants have inline role fallback (`settings.systemPrompt`) |
| `stripe_subscription` | `stripe_invoice` | SET NULL | Preserve historical invoices for accounting/audit |
| `stripe_customer` | `stripe_subscription`, `stripe_payment_method`, `stripe_invoice` | CASCADE | Customer-scoped Stripe data |
| `stripe_product` | `stripe_price` | CASCADE | Prices belong to products |
| `stripe_price` | `stripe_subscription` | CASCADE | Subscriptions tied to specific pricing |

#### Detailed Rules

**1. User Deletion → CASCADE Everything**

When a user is deleted, ALL associated data must be removed:

```typescript
// Example: user table foreign key
userId: text('user_id')
  .notNull()
  .references(() => user.id, { onDelete: 'cascade' })
```

**Cascaded Tables:**
- `user_chat_usage` - Usage tracking
- `user_chat_usage_history` - Historical usage records
- `chat_thread` - All threads (which cascades to messages, participants, etc.)
- `chat_custom_role` - User's custom role templates
- `stripe_customer` - Stripe customer record (which cascades to subscriptions, invoices, etc.)
- `api_key` - API keys (auth tables)
- `session` - Active sessions (auth tables)
- `account` - OAuth accounts (auth tables)

**2. Thread Deletion → CASCADE Thread-Scoped Data**

When a thread is deleted, all thread-specific data is removed:

```typescript
threadId: text('thread_id')
  .notNull()
  .references(() => chatThread.id, { onDelete: 'cascade' })
```

**Cascaded Tables:**
- `chat_message` - All messages in thread
- `chat_participant` - All AI participants
- `chat_thread_changelog` - Thread history
- `chat_moderator_summary` - AI summary rounds

**3. Participant Deletion → SET NULL for Messages**

When a participant is removed, messages are preserved for historical context:

```typescript
participantId: text('participant_id')
  .references(() => chatParticipant.id, { onDelete: 'set null' })
```

**Why SET NULL?**
- User messages (`role: 'user'`) have `participantId = null` by default
- AI messages preserve content even if participant configuration removed
- Allows users to read conversation history after model removal

**4. Custom Role Deletion → SET NULL for Participants**

When a custom role is deleted, participants preserve their inline role:

```typescript
customRoleId: text('custom_role_id')
  .references(() => chatCustomRole.id, { onDelete: 'set null' })
```

**Why SET NULL?**
- Participants have fallback: `settings.systemPrompt` (inline role)
- Custom roles are templates - deletion doesn't break active participants
- Historical participants preserve their behavior

**5. Subscription Deletion → SET NULL for Invoices**

When a subscription is canceled/deleted, invoices are preserved:

```typescript
subscriptionId: text('subscription_id')
  .references(() => stripeSubscription.id, { onDelete: 'set null' })
```

**Why SET NULL?**
- Invoices are financial records - must be preserved for accounting
- Historical billing data required for compliance and refunds
- Subscription status stored on invoice itself

**6. Customer/Product Deletion → CASCADE Stripe Data**

Stripe catalog and customer data cascades:

```typescript
// Customer deletion cascades all customer-scoped data
customerId: text('customer_id')
  .notNull()
  .references(() => stripeCustomer.id, { onDelete: 'cascade' })

// Product deletion cascades prices
productId: text('product_id')
  .notNull()
  .references(() => stripeProduct.id, { onDelete: 'cascade' })
```

**Cascaded by Customer:**
- `stripe_subscription` - Customer's subscriptions
- `stripe_payment_method` - Customer's payment methods
- `stripe_invoice` - Customer's invoices (via customer_id foreign key)

**Cascaded by Product:**
- `stripe_price` - Product's pricing options

#### Implementation Pattern

```typescript
// ✅ CORRECT: Explicit foreign key with cascade policy
export const chatMessage = sqliteTable('chat_message', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }), // Thread deletion removes messages
  participantId: text('participant_id')
    .references(() => chatParticipant.id, { onDelete: 'set null' }), // Preserve historical messages
  // ... other fields
});
```

#### Testing Foreign Key Behavior

When making foreign key changes:

1. **Test CASCADE Behavior:**
```sql
-- Delete a user and verify all related data removed
DELETE FROM user WHERE id = 'test-user-id';
-- Check: SELECT COUNT(*) FROM chat_thread WHERE user_id = 'test-user-id'; → 0
```

2. **Test SET NULL Behavior:**
```sql
-- Delete a participant and verify messages preserved with NULL participant_id
DELETE FROM chat_participant WHERE id = 'test-participant-id';
-- Check: SELECT * FROM chat_message WHERE participant_id IS NULL; → Shows orphaned messages
```

3. **Verify No Orphaned Records:**
```sql
-- Find messages with invalid thread_id (should be 0 due to CASCADE)
SELECT COUNT(*) FROM chat_message m
LEFT JOIN chat_thread t ON m.thread_id = t.id
WHERE t.id IS NULL;
```

#### ❌ PROHIBITED Patterns

```typescript
// ❌ WRONG: No onDelete specified
userId: text('user_id')
  .references(() => user.id) // Missing: { onDelete: 'cascade' }

// ❌ WRONG: Inconsistent behavior (should cascade)
threadId: text('thread_id')
  .references(() => chatThread.id, { onDelete: 'restrict' }) // WRONG: Should be CASCADE

// ❌ WRONG: Cascading financial records (should preserve)
subscriptionId: text('subscription_id')
  .references(() => stripeSubscription.id, { onDelete: 'cascade' }) // WRONG: Should be SET NULL
```

#### Migration Safety

When changing foreign key cascade behavior:

1. Create migration with `ALTER TABLE ... DROP CONSTRAINT` then `ADD CONSTRAINT`
2. Test cascade behavior in preview environment first
3. Verify no data loss or orphaned records
4. Document reasoning in migration file comments

**Example Migration:**
```sql
-- Migration: Update invoice foreign key to preserve historical records
-- Previous: ON DELETE CASCADE (❌ Wrong - deletes financial records)
-- New: ON DELETE SET NULL (✅ Correct - preserves invoices for accounting)

-- Note: SQLite doesn't support ALTER CONSTRAINT, must recreate table
-- This is handled automatically by Drizzle migrations
```

---

## Error Handling

### Structured Errors with Type-Safe Context

All errors should include type-safe `ErrorContext` using discriminated unions:

```typescript
import { AppError, createError, normalizeError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';

// Database errors
const context: ErrorContext = {
  errorType: 'database',
  operation: 'select',
  table: 'stripeProduct',
  userId: user.id,          // optional
  resourceId: productId,    // optional
};
throw createError.internal('Failed to retrieve product', context);

// Resource errors
const context: ErrorContext = {
  errorType: 'resource',
  resource: 'subscription',
  resourceId: id,
  userId: user.id,
};
throw createError.notFound(`Subscription ${id} not found`, context);

// Authentication errors
const context: ErrorContext = {
  errorType: 'authentication',
  operation: 'session_required',
};
throw createError.unauthenticated('Valid session required', context);

// Authorization errors
const context: ErrorContext = {
  errorType: 'authorization',
  resource: 'subscription',
  resourceId: id,
  userId: user.id,
};
throw createError.unauthorized('You do not have access to this subscription', context);

// External service errors
const context: ErrorContext = {
  errorType: 'external_service',
  service: 'stripe',
  operation: 'create_checkout_session',
  userId: user.id,
};
throw createError.internal('Failed to create checkout session', context);

// Validation errors
const context: ErrorContext = {
  errorType: 'validation',
  field: 'stripe-signature',
};
throw createError.badRequest('Missing stripe-signature header', context);
```

### Error Normalization Helper

Use `normalizeError()` to convert unknown errors to Error instances:

```typescript
try {
  await someOperation();
} catch (error) {
  // Re-throw AppError instances without modification
  if (error instanceof AppError) {
    throw error;
  }

  // Log normalized error
  c.logger.error('Operation failed', normalizeError(error));

  // Create new structured error
  const context: ErrorContext = {
    errorType: 'database',
    operation: 'select',
    table: 'users',
  };
  throw createError.internal('Failed to retrieve user', context);
}
```

### Response Helpers

```typescript
// Success responses
return Responses.ok(c, data);
return Responses.created(c, newResource);

// Error responses
return Responses.error(c, 'Error message', HttpStatusCodes.BAD_REQUEST);
return Responses.notFound(c, 'Resource not found');
```

### Response Mapping Helpers

For consistent API responses, use domain-specific mapping helpers:

```typescript
import { mapSubscriptionToResponse, mapProductToResponse } from './helpers';

// Single subscription mapping
const subscription = mapSubscriptionToResponse(dbSubscription);
return Responses.ok(c, { subscription });

// Multiple subscriptions
const subscriptions = dbSubscriptions.map(mapSubscriptionToResponse);
return Responses.ok(c, { subscriptions, count: subscriptions.length });

// Product mapping with prices
const product = mapProductToResponse(dbProduct);
return Responses.ok(c, { product });
```

---

## Implementation Guidelines

### 1. Route Creation Checklist

- [ ] Create route definition in `route.ts`
- [ ] Add Zod schema in `schema.ts`
- [ ] Implement handler in `handler.ts` using `createHandler`
- [ ] Add OpenAPI documentation with examples
- [ ] Include proper error responses
- [ ] Add structured logging
- [ ] Test with authentication

### 2. Database Operation Guidelines

- [ ] Use transactions for multi-table operations
- [ ] Include proper error handling
- [ ] Log all database operations
- [ ] Use type-safe queries with Drizzle
- [ ] Validate input with Zod schemas

### 3. Security Checklist

- [ ] Authenticate requests with session middleware
- [ ] Validate all input with Zod
- [ ] Sanitize user input
- [ ] Use CSRF protection for mutations
- [ ] Implement rate limiting
- [ ] Log security-relevant events

### 4. Code Quality Standards

- [ ] Zero TypeScript `any` types
- [ ] No type casting unless absolutely necessary
- [ ] Comprehensive error handling
- [ ] Structured logging for all operations
- [ ] OpenAPI documentation complete
- [ ] Follow established patterns

---

## Conclusion

These patterns ensure consistency, type safety, and maintainability across the roundtable.now backend. Always reference existing implementations when adding new features, and maintain these established patterns for optimal developer experience.
