import type { RouteConfig, RouteHandler } from '@hono/zod-openapi';
import type { BatchItem } from 'drizzle-orm/batch';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import type { z } from 'zod';

import { executeBatch, validateBatchSize } from '@/api/common/batch-operations';
import { AppError } from '@/api/common/error-handling';
import { getErrorMessage } from '@/api/common/error-types';
import type { ErrorCode } from '@/api/core/enums';
import { ErrorCodes } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import { auth } from '@/lib/auth/server';
import type { Session, User } from '@/lib/auth/types';

import type { AuthMode } from './enums';
import { HTTPExceptionFactory } from './http-exceptions';
import { Responses } from './responses';
import { ValidationErrorDetailsSchema } from './schemas';
import { validateWithSchema } from './validation';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AuthenticatedContext = {
  user: User;
  session: Session;
  requestId: string;
};

// ============================================================================
// CENTRALIZED ERROR HANDLING
// ============================================================================

function appErrorToResponse(c: Context, error: AppError): Response {
  switch (error.code) {
    // Authentication & Authorization (401, 403)
    case ErrorCodes.UNAUTHENTICATED:
    case ErrorCodes.TOKEN_EXPIRED:
    case ErrorCodes.TOKEN_INVALID:
      return Responses.authenticationError(c, error.message);
    case ErrorCodes.UNAUTHORIZED:
    case ErrorCodes.INSUFFICIENT_PERMISSIONS:
      return Responses.authorizationError(c, error.message);

    // Validation & Input (400)
    case ErrorCodes.VALIDATION_ERROR:
    case ErrorCodes.INVALID_INPUT:
    case ErrorCodes.MISSING_REQUIRED_FIELD:
    case ErrorCodes.INVALID_FORMAT:
    case ErrorCodes.INVALID_ENUM_VALUE:
    case ErrorCodes.BUSINESS_RULE_VIOLATION:
      return Responses.badRequest(c, error.message, error.details);

    // Resource Management (404, 409, 410)
    case ErrorCodes.RESOURCE_NOT_FOUND:
      return Responses.notFound(c, 'Resource');
    case ErrorCodes.RESOURCE_CONFLICT:
    case ErrorCodes.RESOURCE_ALREADY_EXISTS:
    case ErrorCodes.RESOURCE_LOCKED:
      return Responses.conflict(c, error.message);
    case ErrorCodes.RESOURCE_EXPIRED:
      return Responses.badRequest(c, error.message, error.details);

    // External Services (502)
    case ErrorCodes.EXTERNAL_SERVICE_ERROR:
    case ErrorCodes.EMAIL_SERVICE_ERROR:
    case ErrorCodes.STORAGE_SERVICE_ERROR:
    case ErrorCodes.NETWORK_ERROR:
    case ErrorCodes.TIMEOUT_ERROR:
      return Responses.externalServiceError(c, 'External Service', error.message);

    // Rate Limiting (429)
    case ErrorCodes.RATE_LIMIT_EXCEEDED:
      return Responses.rateLimitExceeded(c, 0, 0);

    // Service Availability (503)
    case ErrorCodes.SERVICE_UNAVAILABLE:
    case ErrorCodes.MAINTENANCE_MODE:
      return Responses.serviceUnavailable(c, error.message);

    // Database (500)
    case ErrorCodes.DATABASE_ERROR:
    case ErrorCodes.BATCH_FAILED:
    case ErrorCodes.BATCH_SIZE_EXCEEDED:
      return Responses.databaseError(c, 'batch', error.message);

    // System (500) - default fallback
    case ErrorCodes.INTERNAL_SERVER_ERROR:
    default:
      return Responses.internalServerError(c, error.message);
  }
}

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

type PerformanceMark = {
  label: string;
  time: number;
};

type PerformanceMarks = Map<string, number>;

type PerformanceTracker = {
  startTime: number;
  getElapsed: () => number;
  getDuration: () => number;
  mark: (label: string) => PerformanceMark;
  getMarks: () => Map<string, number>;
  now: () => number;
};

function createPerformanceTracker(): PerformanceTracker {
  const startTime = Date.now();
  const marks: PerformanceMarks = new Map();

  return {
    startTime,
    getElapsed: () => Date.now() - startTime,
    getDuration: () => Date.now() - startTime,
    mark: (label: string) => {
      const time = Date.now() - startTime;
      marks.set(label, time);
      return { label, time };
    },
    getMarks: () => new Map(marks),
    now: () => Date.now(),
  };
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type HandlerConfig<
  _TRoute extends RouteConfig,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = {
  // Authentication
  auth?: AuthMode;

  // Validation schemas
  validateBody?: TBody;
  validateQuery?: TQuery;
  validateParams?: TParams;

  // Database
  useTransaction?: boolean;

  // Observability
  operationName?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
};

export type HandlerContext<
  TEnv extends ApiEnv = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = Context<TEnv> & {
  validated: {
    body: [TBody] extends [never] ? undefined : z.infer<TBody>;
    query: [TQuery] extends [never] ? undefined : z.infer<TQuery>;
    params: [TParams] extends [never] ? undefined : z.infer<TParams>;
  };
  auth: () => AuthenticatedContext;
};
export type RegularHandler<
  _TRoute extends RouteConfig,
  TEnv extends ApiEnv = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = (
  c: HandlerContext<TEnv, TBody, TQuery, TParams>,
) => Promise<Response>;

export type BatchContext = {
  add: (statement: BatchItem<'sqlite'>) => void;
  execute: () => Promise<unknown[]>;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

export type BatchHandler<
  _TRoute extends RouteConfig,
  TEnv extends ApiEnv = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
> = (
  c: HandlerContext<TEnv, TBody, TQuery, TParams>,
  batch: BatchContext,
) => Promise<Response>;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Apply authentication check based on mode
 * Better Auth cookie cache (session_data cookie) handles caching natively
 */
async function applyAuthentication<TEnv extends ApiEnv>(c: Context<TEnv>, authMode: AuthMode): Promise<void> {
  switch (authMode) {
    case 'session': {
      // Better Auth reads session_data cookie first (no DB lookup if valid)
      const sessionData = await auth.api.getSession({
        headers: c.req.raw.headers,
      });

      if (!sessionData?.user || !sessionData?.session) {
        throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
          message: 'Authentication required',
        });
      }

      c.set('session', sessionData.session);
      c.set('user', sessionData.user);
      c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());
      break;
    }
    case 'session-optional': {
      try {
        const sessionData = await auth.api.getSession({
          headers: c.req.raw.headers,
        });

        if (sessionData?.user && sessionData?.session) {
          c.set('session', sessionData.session);
          c.set('user', sessionData.user);
        } else {
          c.set('session', null);
          c.set('user', null);
        }
        c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());
      } catch {
        c.set('session', null);
        c.set('user', null);
      }
      break;
    }
    case 'api-key': {
      // API key authentication for cron jobs and external services
      const apiKey = c.req.header('x-api-key') || c.req.header('authorization')?.replace('Bearer ', '');

      // In Cloudflare Workers: c.env contains bindings and secrets from wrangler
      // In local dev: c.env contains process.env values via Hono dev server
      // Type assertion for optional secrets not in CloudflareEnv definition
      const envApiKey = c.env as unknown as Record<string, string | undefined>;
      const expectedApiKey = envApiKey.CRON_SECRET || envApiKey.API_SECRET_KEY;

      if (!apiKey || !expectedApiKey || apiKey !== expectedApiKey) {
        throw new HTTPException(HttpStatusCodes.UNAUTHORIZED, {
          message: 'Invalid or missing API key',
        });
      }

      // Set system context for API key authenticated requests
      c.set('session', null);
      c.set('user', null);
      c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());
      break;
    }
    case 'public':
      // No authentication required
      c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());
      break;
    default:
      throw new Error(`Unknown auth mode: ${authMode}`);
  }
}

/**
 * Validated request data structure
 */
type ValidatedData<
  TBody extends z.ZodSchema,
  TQuery extends z.ZodSchema,
  TParams extends z.ZodSchema,
> = {
  body: [TBody] extends [never] ? undefined : z.infer<TBody>;
  query: [TQuery] extends [never] ? undefined : z.infer<TQuery>;
  params: [TParams] extends [never] ? undefined : z.infer<TParams>;
};

/**
 * Validate request data using our unified validation system
 */
async function validateRequest<
  TBody extends z.ZodSchema,
  TQuery extends z.ZodSchema,
  TParams extends z.ZodSchema,
>(
  c: Context,
  config: Pick<HandlerConfig<RouteConfig, TBody, TQuery, TParams>, 'validateBody' | 'validateQuery' | 'validateParams'>,
): Promise<ValidatedData<TBody, TQuery, TParams>> {
  type ValidatedBody = [TBody] extends [never] ? undefined : z.infer<TBody>;
  type ValidatedQuery = [TQuery] extends [never] ? undefined : z.infer<TQuery>;
  type ValidatedParams = [TParams] extends [never] ? undefined : z.infer<TParams>;

  const validated: {
    body?: ValidatedBody;
    query?: ValidatedQuery;
    params?: ValidatedParams;
  } = {};

  // Validate body for POST/PUT/PATCH requests
  if (config.validateBody && ['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    try {
      const body = await c.req.json();

      const result = validateWithSchema(config.validateBody, body);

      if (!result.success) {
        // 🔍 DEBUG: Log validation errors
        console.error('[HANDLER-VALIDATE] Validation failed:', result.errors.slice(0, 5));
        throw HTTPExceptionFactory.unprocessableEntity({
          message: 'Request body validation failed',
          details: { detailType: 'validation', validationErrors: result.errors },
        });
      }

      validated.body = result.data as ValidatedBody;
    } catch (error) {
      if (error instanceof HTTPException)
        throw error;

      throw HTTPExceptionFactory.unprocessableEntity({
        message: 'Invalid request body format',
        details: { detailType: 'validation', validationErrors: [{ field: 'body', message: 'Unable to parse request body' }] },
      });
    }
  }

  // Validate query parameters
  if (config.validateQuery) {
    const url = new URL(c.req.url);
    const query = Object.fromEntries(url.searchParams.entries());
    const result = validateWithSchema(config.validateQuery, query);

    if (!result.success) {
      throw HTTPExceptionFactory.unprocessableEntity({
        message: 'Query parameter validation failed',
        details: { detailType: 'validation', validationErrors: result.errors },
      });
    }

    validated.query = result.data as ValidatedQuery;
  }

  // Validate path parameters
  if (config.validateParams) {
    const params = c.req.param();
    const result = validateWithSchema(config.validateParams, params);

    if (!result.success) {
      throw HTTPExceptionFactory.unprocessableEntity({
        message: 'Path parameter validation failed',
        details: { detailType: 'validation', validationErrors: result.errors },
      });
    }

    validated.params = result.data as ValidatedParams;
  }

  return validated as ValidatedData<TBody, TQuery, TParams>;
}

// ============================================================================
// HANDLER FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a route handler without database transactions
 *
 * @example
 * ```typescript
 * // With session authentication
 * export const handler = createHandler(
 *   { auth: 'session' },
 *   async (c) => {
 *     const { user, session } = c.auth(); // Type-safe: guaranteed non-null
 *     return Responses.ok(c, { userId: user.id });
 *   }
 * );
 * ```
 */
export function createHandler<
  TRoute extends RouteConfig,
  TEnv extends ApiEnv = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
>(
  config: HandlerConfig<TRoute, TBody, TQuery, TParams>,
  implementation: RegularHandler<TRoute, TEnv, TBody, TQuery, TParams>,
): RouteHandler<TRoute, TEnv> {
  const handler = async (c: Context<TEnv>) => {
    const performance = createPerformanceTracker();

    /**
     * Set start time in context for response metadata
     * Using Object.assign to add custom property outside ContextVariableMap
     * This avoids type casting while maintaining compatibility with response metadata
     */
    Object.assign(c, { startTime: performance.startTime });

    try {
      // Apply authentication (including 'public' mode for requestId setup)
      if (config.auth) {
        await applyAuthentication(c, config.auth);
      }

      // Validate request
      const validated = await validateRequest<TBody, TQuery, TParams>(c, config);

      // Create authenticated context helper
      const authFn = () => {
        const user = c.var.user;
        const session = c.var.session;
        const requestId = c.var.requestId;

        if (!user || !session) {
          throw new Error('Authentication required - call c.auth() only when auth: "session"');
        }

        return {
          user,
          session,
          requestId: requestId || '',
        } as AuthenticatedContext;
      };

      // Create enhanced context
      const enhancedContext = Object.assign(c, {
        validated,
        auth: authFn,
      }) as HandlerContext<TEnv, TBody, TQuery, TParams>;

      // Execute handler implementation
      const result = await implementation(enhancedContext);

      return result;
    } catch (error) {
      if (error instanceof HTTPException) {
        // Handle validation errors with our unified system
        if (error.status === HttpStatusCodes.UNPROCESSABLE_ENTITY) {
          // Check for EnhancedHTTPException with details
          if ('details' in error && error.details && typeof error.details === 'object') {
            const detailsResult = ValidationErrorDetailsSchema.safeParse(error.details);
            if (detailsResult.success && detailsResult.data.validationErrors) {
              return Responses.validationError(c, detailsResult.data.validationErrors, error.message);
            }
          } else if (error.cause && typeof error.cause === 'object') {
            const causeResult = ValidationErrorDetailsSchema.safeParse(error.cause);
            if (causeResult.success && causeResult.data.validationErrors) {
              return Responses.validationError(c, causeResult.data.validationErrors, error.message);
            }
          }
        }
        throw error;
      }

      if (error instanceof AppError) {
        // ✅ CENTRALIZED: Use single source of truth for error → response mapping
        return appErrorToResponse(c, error);
      }

      // Convert other errors to internal server error
      return Responses.internalServerError(c, error instanceof Error ? error.message : 'Handler execution failed');
    }
  };

  /**
   * Type assertion: Handler factory return type
   *
   * STRUCTURAL TYPE MISMATCH (Expected):
   * - RouteHandler = Handler<E, P, I, ComplexReturnType> with derived Input generic
   * - Our handler = (c: Context<TEnv>) => Promise<Response>
   * - TypeScript correctly identifies these don't structurally overlap
   *
   * WHY THIS IS RUNTIME-SAFE:
   * 1. Hono's router calls handler(context) - Input generic is compile-time only
   * 2. Context<TEnv> contains ALL data from Input generic at runtime
   * 3. Our validation layer extracts and validates Input before handler execution
   * 4. HandlerContext.validated provides type-safe access to all validated inputs
   * 5. Response type Promise<Response> is compatible with all RouteHandler return types
   *
   * WHY DOUBLE CAST IS REQUIRED:
   * - Single cast (as RouteHandler) fails: TS2352 "types don't sufficiently overlap"
   * - TypeScript's structural checking can't verify generic type compatibility
   * - Double cast (as unknown as RouteHandler) acknowledges we're bridging incompatible structures
   * - This is the standard pattern for factory functions that abstract framework types
   *
   * ALTERNATIVE REJECTED:
   * - Duplicating Hono's Input derivation logic: maintenance burden, breaks abstraction
   * - Using Handler directly: loses type safety in route definitions
   * - Removing type check: loses compile-time validation of route configs
   *
   * PATTERN: Standard handler factory with type abstraction
   * REFERENCE: Hono factory pattern for route handler generators
   */
  return handler as unknown as RouteHandler<TRoute, TEnv>;
}

/**
 * Create a route handler with D1 batch operations
 *
 * CRITICAL: This is the ONLY recommended handler pattern for D1 databases.
 * D1 requires batch operations instead of transactions for optimal performance.
 *
 * Features:
 * - Atomic execution: All operations succeed or all fail
 * - Automatic rollback: No partial state on failure
 * - Single network round-trip: Optimized for edge environments
 * - Implicit transactions: No explicit BEGIN/COMMIT needed
 *
 * @example
 * ```typescript
 * export const handler = createHandlerWithBatch(
 *   { auth: 'session' },
 *   async (c, batch) => {
 *     const { user } = c.auth(); // Type-safe: guaranteed non-null
 *     batch.add(db.insert(...).prepare());
 *     await batch.execute();
 *     return Responses.created(c, { userId: user.id });
 *   }
 * );
 * ```
 *
 * @see /docs/d1-batch-operations.md for comprehensive patterns
 */
export function createHandlerWithBatch<
  TRoute extends RouteConfig,
  TEnv extends ApiEnv = ApiEnv,
  TBody extends z.ZodSchema = never,
  TQuery extends z.ZodSchema = never,
  TParams extends z.ZodSchema = never,
>(
  config: HandlerConfig<TRoute, TBody, TQuery, TParams>,
  implementation: BatchHandler<TRoute, TEnv, TBody, TQuery, TParams>,
): RouteHandler<TRoute, TEnv> {
  const handler = async (c: Context<TEnv>) => {
    const performance = createPerformanceTracker();

    /**
     * Set start time in context for response metadata
     * Using Object.assign to add custom property outside ContextVariableMap
     * This avoids type casting while maintaining compatibility with response metadata
     */
    Object.assign(c, { startTime: performance.startTime });

    try {
      // Apply authentication (including 'public' mode for requestId setup)
      if (config.auth) {
        await applyAuthentication(c, config.auth);
      }

      // Validate request
      const validated = await validateRequest<TBody, TQuery, TParams>(c, config);

      // Create authenticated context helper
      const authFn = () => {
        const user = c.var.user;
        const session = c.var.session;
        const requestId = c.var.requestId;

        if (!user || !session) {
          throw new Error('Authentication required - call c.auth() only when auth: "session"');
        }

        return {
          user,
          session,
          requestId: requestId || '',
        } as AuthenticatedContext;
      };

      // Create enhanced context
      const enhancedContext = Object.assign(c, {
        validated,
        auth: authFn,
      }) as HandlerContext<TEnv, TBody, TQuery, TParams>;

      // Execute implementation with D1 batch operations
      const db = await getDbAsync();

      // D1 batch operations collector - follows D1 best practices
      // ✅ DRIZZLE BEST PRACTICE: Use BatchItem type for full type safety
      // Drizzle's BatchItem type supports all query builders (insert/update/delete/select)
      const statements: BatchItem<'sqlite'>[] = [];
      const batchMetrics = {
        addedCount: 0,
        maxBatchSize: 100, // D1 recommended limit
        startTime: performance.now(),
      };

      const batchContext: BatchContext = {
        add: (statement: BatchItem<'sqlite'>) => {
          // Validate batch size limit
          if (statements.length >= batchMetrics.maxBatchSize) {
            throw new AppError({
              message: `Batch size limit exceeded. Maximum ${batchMetrics.maxBatchSize} operations allowed per batch.`,
              code: 'BATCH_SIZE_EXCEEDED' as ErrorCode,
              statusCode: HttpStatusCodes.BAD_REQUEST,
              details: { detailType: 'batch', currentSize: statements.length },
            });
          }

          statements.push(statement);
          batchMetrics.addedCount++;
        },
        execute: async (): Promise<unknown[]> => {
          if (statements.length === 0) {
            return [];
          }

          // Validate batch size using shared utility
          try {
            validateBatchSize(statements.length, batchMetrics.maxBatchSize);
          } catch (error) {
            throw new AppError({
              message: getErrorMessage(error),
              code: 'BATCH_SIZE_EXCEEDED' as ErrorCode,
              statusCode: HttpStatusCodes.BAD_REQUEST,
            });
          }

          try {
            // ✅ ATOMIC BATCH: Using shared executeBatch helper
            // Following Drizzle ORM best practices with automatic D1/SQLite fallback
            // No type assertion needed - statements is already typed as BatchItem<'sqlite'>[]
            const results = await executeBatch(db, statements);

            // Clear statements after successful execution
            statements.length = 0;

            return results;
          } catch (error) {
            // All operations automatically rolled back by D1

            // Enhance error with batch context
            if (error instanceof Error) {
              throw new AppError({
                message: `D1 batch operation failed: ${error.message}`,
                code: 'BATCH_FAILED' as ErrorCode,
                statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
                details: {
                  detailType: 'batch',
                  statementCount: statements.length,
                  originalError: error.message,
                },
              });
            }

            throw error;
          }
        },
        db,
      };

      // Execute the handler implementation
      const result = await implementation(enhancedContext, batchContext);

      return result;
    } catch (error) {
      // Handle validation errors
      if (error instanceof HTTPException) {
        if (error.status === HttpStatusCodes.UNPROCESSABLE_ENTITY) {
          if ('details' in error && error.details && typeof error.details === 'object') {
            const detailsResult = ValidationErrorDetailsSchema.safeParse(error.details);
            if (detailsResult.success && detailsResult.data.validationErrors) {
              return Responses.validationError(c, detailsResult.data.validationErrors, error.message);
            }
          }
        }
        throw error;
      }

      // Handle application errors
      if (error instanceof AppError) {
        // ✅ CENTRALIZED: Use single source of truth for error → response mapping
        return appErrorToResponse(c, error);
      }

      // Handle D1-specific database errors
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();

        // D1 constraint violations
        if (errorMessage.includes('unique constraint') || errorMessage.includes('unique_constraint')) {
          return Responses.conflict(c, 'Resource already exists (unique constraint violation)');
        }

        if (errorMessage.includes('foreign key') || errorMessage.includes('foreign_key')) {
          return Responses.badRequest(c, 'Invalid reference to related resource (foreign key constraint)');
        }

        // D1 batch-specific errors
        if (errorMessage.includes('batch')) {
          if (errorMessage.includes('timeout')) {
            return Responses.databaseError(c, 'batch', 'Batch operation timed out (30 second limit exceeded)');
          }
          if (errorMessage.includes('size') || errorMessage.includes('limit')) {
            return Responses.databaseError(c, 'batch', 'Batch size limit exceeded');
          }
          return Responses.databaseError(c, 'batch', 'Batch operation failed - all changes rolled back');
        }

        // D1 connection errors
        if (errorMessage.includes('d1') || errorMessage.includes('database')) {
          return Responses.databaseError(c, 'batch', 'Database operation failed');
        }
      }

      // Generic error fallback
      return Responses.internalServerError(c, error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  };

  /**
   * Type assertion: Batch handler factory return type
   *
   * STRUCTURAL TYPE MISMATCH (Expected):
   * - RouteHandler = Handler<E, P, I, ComplexReturnType> with derived Input generic
   * - Our handler = (c: Context<TEnv>) => Promise<Response>
   * - TypeScript correctly identifies these don't structurally overlap
   *
   * WHY THIS IS RUNTIME-SAFE:
   * 1. Hono's router calls handler(context) - Input generic is compile-time only
   * 2. Context<TEnv> contains ALL data from Input generic at runtime
   * 3. Our validation layer extracts and validates Input before handler execution
   * 4. HandlerContext.validated provides type-safe access to all validated inputs
   * 5. Response type Promise<Response> is compatible with all RouteHandler return types
   * 6. Batch operations provide atomic D1 transaction semantics
   *
   * WHY DOUBLE CAST IS REQUIRED:
   * - Single cast (as RouteHandler) fails: TS2352 "types don't sufficiently overlap"
   * - TypeScript's structural checking can't verify generic type compatibility
   * - Double cast (as unknown as RouteHandler) acknowledges we're bridging incompatible structures
   * - This is the standard pattern for factory functions that abstract framework types
   *
   * ALTERNATIVE REJECTED:
   * - Duplicating Hono's Input derivation logic: maintenance burden, breaks abstraction
   * - Using Handler directly: loses type safety in route definitions
   * - Removing type check: loses compile-time validation of route configs
   *
   * PATTERN: Standard handler factory with type abstraction
   * REFERENCE: Hono factory pattern for route handler generators
   */
  return handler as unknown as RouteHandler<TRoute, TEnv>;
}
