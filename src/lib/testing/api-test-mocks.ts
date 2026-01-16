/**
 * API Test Mock Factories
 *
 * Properly typed mock factories for API-related types to eliminate
 * `as unknown as Type` double-casts in test files.
 *
 * Pattern: Create minimal but properly typed mocks for API boundaries.
 */

import { vi } from 'vitest';

import type { ApiEnv } from '@/api/types';
import type { TypedLogger } from '@/api/types/logger';

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
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
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
    prepare: vi.fn(),
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
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
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(),
    list: vi.fn(),
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
    KV: options.KV,
    DB: options.DB,
    UPLOADS_R2_BUCKET: options.UPLOADS_R2_BUCKET,
    NEXT_INC_CACHE_R2_BUCKET: options.NEXT_INC_CACHE_R2_BUCKET,
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
    query: {
      chatParticipant: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      chatMessage: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      chatThread: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      ...queries,
    },
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
}
