/**
 * API Test Mock Factories
 *
 * Properly typed mock factories for API-related types to eliminate
 * `as unknown as Type` double-casts in test files.
 *
 * Pattern: Create minimal but properly typed mocks for API boundaries.
 */

// Cloudflare runtime types
import type { D1Database, KVNamespace, R2Bucket } from '@cloudflare/workers-types';
import { vi } from 'vitest';

// ============================================================================
// LOCAL TYPE DEFINITIONS (Simplified for frontend testing)
// ============================================================================

/**
 * Simplified TypedLogger for testing
 * The full version is in @roundtable/api but we only need the interface
 */
export type TypedLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, contextOrError?: Error | Record<string, unknown>, context?: Record<string, unknown>) => void;
};

/**
 * Simplified ApiEnv for testing
 * The full version is in @roundtable/api but we only need bindings shape
 */
export type ApiEnv = {
  Bindings: {
    KV?: KVNamespace;
    DB?: D1Database;
    UPLOADS_R2_BUCKET?: R2Bucket;
    NEXT_INC_CACHE_R2_BUCKET?: R2Bucket;
    [key: string]: unknown;
  };
  Variables: Record<string, unknown>;
};

/**
 * Mock TypedLogger Factory
 *
 * REPLACES: `as unknown as TypedLogger`
 *
 * Creates a properly typed mock logger with Jest/Vitest spy functions.
 * Use this instead of casting to ensure type safety.
 *
 * @example
 * const logger = createMockLogger();
 * await someFunction(logger);
 * expect(logger.info).toHaveBeenCalledWith('message', context);
 */
export function createMockLogger(): TypedLogger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

/**
 * Mock KV Namespace Factory
 *
 * Creates a minimal mock of Cloudflare KV with common operations.
 * Use this for testing KV-dependent code without double-casts.
 */
export type MockKVNamespace = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

export function createMockKV(): MockKVNamespace {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    put: vi.fn(),
  };
}

/**
 * Mock D1 Database Factory
 *
 * Creates a minimal mock of Cloudflare D1 database.
 * Use this for testing database-dependent code.
 */
export type MockD1Database = {
  prepare: ReturnType<typeof vi.fn>;
  dump: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
};

export function createMockD1(): MockD1Database {
  return {
    batch: vi.fn(),
    dump: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn(),
  };
}

/**
 * Mock R2 Bucket Factory
 *
 * Creates a minimal mock of Cloudflare R2 bucket.
 * Use this for testing file storage operations.
 */
export type MockR2Bucket = {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  head: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

export function createMockR2Bucket(): MockR2Bucket {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    head: vi.fn(),
    list: vi.fn(),
    put: vi.fn(),
  };
}

/**
 * Mock API Environment Factory (Partial)
 *
 * REPLACES: `as ApiEnv['Bindings']`
 *
 * Creates a partial mock of ApiEnv['Bindings'] with only the bindings you need.
 * Allows tests to specify only relevant bindings without casting.
 *
 * @example
 * const env = createMockApiEnv({ KV: mockKV, DB: mockDB });
 * await someFunction(env);
 */
export type MockApiEnvOptions = {
  KV?: MockKVNamespace | KVNamespace;
  DB?: MockD1Database | D1Database;
  UPLOADS_R2_BUCKET?: MockR2Bucket | R2Bucket;
  NEXT_INC_CACHE_R2_BUCKET?: MockR2Bucket | R2Bucket;
};

export function createMockApiEnv(options: MockApiEnvOptions = {}): ApiEnv['Bindings'] {
  return {
    DB: options.DB,
    KV: options.KV,
    NEXT_INC_CACHE_R2_BUCKET: options.NEXT_INC_CACHE_R2_BUCKET,
    UPLOADS_R2_BUCKET: options.UPLOADS_R2_BUCKET,
  } as ApiEnv['Bindings'];
}

/**
 * Mock Drizzle Database Factory
 *
 * REPLACES: `mockDb as unknown as Awaited<ReturnType<typeof import('@/db').getDbAsync>>`
 *
 * Creates a properly typed mock for Drizzle database instance.
 * Use this for testing service functions that accept a Drizzle database.
 *
 * @example
 * const db = createMockDrizzleDb({
 *   chatParticipant: {
 *     findMany: vi.fn().mockResolvedValue([...]),
 *   },
 * });
 * const result = await computeRoundStatus({ db, ... });
 */
export type MockDrizzleQuery = {
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
};

export type MockDrizzleDb = {
  query: {
    chatParticipant: MockDrizzleQuery;
    chatMessage: MockDrizzleQuery;
    chatThread: MockDrizzleQuery;
    user: MockDrizzleQuery;
    [key: string]: MockDrizzleQuery;
  };
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

export function createMockDrizzleDb(
  queries?: Partial<MockDrizzleDb['query']>,
): MockDrizzleDb {
  return {
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    query: {
      chatMessage: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      chatParticipant: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      chatThread: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      ...queries,
    },
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
}
