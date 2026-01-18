import * as fs from 'node:fs';
import * as path from 'node:path';

import Database from 'better-sqlite3';
import { env as workersEnv } from 'cloudflare:workers';
import { drizzle as drizzleBetter } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleD1 } from 'drizzle-orm/d1';

import { CloudflareKVCache } from './cache/cloudflare-kv-cache';
// Import all tables directly (single source of truth)
import * as auth from './tables/auth';
import * as billing from './tables/billing';
import * as chat from './tables/chat';
import * as credits from './tables/credits';
import * as project from './tables/project';
import * as upload from './tables/upload';
import * as usage from './tables/usage';

// Combine all schemas for Drizzle
const schema = {
  ...auth,
  ...billing,
  ...chat,
  ...credits,
  ...project,
  ...upload,
  ...usage,
};

// Database configuration
const LOCAL_DB_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const LOCAL_DB_PATH = path.join(process.cwd(), LOCAL_DB_DIR);

/**
 * Gets the path to the local SQLite database file
 * Creates the directory if it doesn't exist and returns the path to the database file
 */
function getLocalDbPath(): string {
  // Create directory if it doesn't exist
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    fs.mkdirSync(LOCAL_DB_PATH, { recursive: true });
  }

  // Look for existing SQLite file (prioritize wrangler-generated files)
  try {
    const files = fs.readdirSync(LOCAL_DB_PATH);
    const dbFile = files.find(file => file.endsWith('.sqlite'));
    if (dbFile) {
      const fullPath = path.join(LOCAL_DB_PATH, dbFile);
      return fullPath;
    }
  } catch {
  }

  // Return default path
  const defaultPath = path.join(LOCAL_DB_PATH, 'database.sqlite');
  return defaultPath;
}

/**
 * Initialize local SQLite database connection for development with performance optimizations
 */
function initLocalDb() {
  const dbPath = getLocalDbPath();

  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Local database not found at ${dbPath}. Run 'pnpm db:migrate:local' to create it.`,
    );
  }

  const sqlite = new Database(dbPath);

  // Performance optimizations for SQLite
  sqlite.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
  sqlite.pragma('synchronous = NORMAL'); // Balance between safety and performance
  sqlite.pragma('cache_size = -2000'); // 2MB cache size (negative = pages)
  sqlite.pragma('foreign_keys = ON'); // Enable foreign key constraints
  sqlite.pragma('temp_store = MEMORY'); // Store temporary tables in memory
  sqlite.pragma('mmap_size = 268435456'); // 256MB memory-mapped I/O

  const db = drizzleBetter(sqlite, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  });

  return db;
}

/**
 * Get D1 database binding from Cloudflare Workers env
 */
function getD1Binding(): D1Database | null {
  try {
    return workersEnv.DB || null;
  } catch {
    return null;
  }
}

/**
 * Get KV namespace binding from Cloudflare Workers env
 */
function getKVBinding(): KVNamespace | null {
  try {
    return workersEnv.KV || null;
  } catch {
    return null;
  }
}

/**
 * Get database instance for Cloudflare Workers
 *
 * ✅ CACHING: Automatically enabled for D1 in production/preview using Cloudflare KV
 * - Opt-in caching strategy (use .$withCache() on queries)
 * - Automatic cache invalidation on mutations
 * - 5-minute default TTL
 *
 * ⚠️ CLOUDFLARE D1 NOTE: Use batch operations, not transactions.
 * For Cloudflare D1 environments, db.transaction() should NOT be used.
 * Use db.batch() for atomic operations.
 */
export function getDb() {
  return createDbInstance();
}

/**
 * Async version of getDb - same implementation for Workers
 */
export async function getDbAsync() {
  return createDbInstance();
}

/**
 * Type guard for checking if caches object has default property
 */
function hasCachesDefault(obj: unknown): obj is { default: unknown } {
  return typeof obj === 'object' && obj !== null && 'default' in obj;
}

/**
 * Detect if running in Cloudflare Workers environment (not Node.js)
 */
function isCloudflareWorkersRuntime(): boolean {
  // Check for Cloudflare Workers runtime indicators
  if (typeof navigator !== 'undefined' && navigator.userAgent?.includes('Cloudflare-Workers')) {
    return true;
  }
  // The presence of caches global with default property is a Workers indicator
  if (typeof caches !== 'undefined' && hasCachesDefault(caches)) {
    return true;
  }
  return false;
}

/**
 * Create database instance for the global db Proxy
 *
 * Environment Detection Priority:
 * 1. Cloudflare Workers → D1 with batch operations
 * 2. Local development → Local SQLite with transactions
 */
function createDbInstance(): ReturnType<typeof drizzleD1<typeof schema>> | ReturnType<typeof drizzleBetter<typeof schema>> {
  // In Cloudflare Workers, we MUST use D1 - no fallback to local SQLite
  // because fs module is not available in Workers runtime
  if (isCloudflareWorkersRuntime()) {
    const d1Database = getD1Binding();
    if (d1Database) {
      const kvBinding = getKVBinding();
      const kvCache = kvBinding
        ? new CloudflareKVCache({
            kv: kvBinding,
            global: false,
            defaultTtl: 300,
          })
        : undefined;

      return drizzleD1(d1Database, {
        schema,
        logger: false, // Disable logging in Workers
        cache: kvCache,
      });
    }

    // In Workers without D1, throw error - cannot fallback to local SQLite
    throw new Error(
      'D1 database binding not available in Cloudflare Workers. '
      + 'Ensure DB binding is configured in wrangler.jsonc',
    );
  }

  // Node.js environment (local development)
  const isDev = process.env.NODE_ENV === 'development';
  const isLocal = process.env.WEBAPP_ENV === 'local';

  // Use local SQLite for development (supports transactions)
  if (isDev || isLocal) {
    return initLocalDb();
  }

  // Try to get D1 binding
  const d1Database = getD1Binding();
  if (d1Database) {
    const kvBinding = getKVBinding();
    const kvCache = kvBinding
      ? new CloudflareKVCache({
          kv: kvBinding,
          global: false,
          defaultTtl: 300,
        })
      : undefined;

    return drizzleD1(d1Database, {
      schema,
      logger: process.env.NODE_ENV !== 'production',
      cache: kvCache,
    });
  }

  // Final fallback to local SQLite
  return initLocalDb();
}

/**
 * Cached database instance for the current request context.
 */
let _cachedLocalDbInstance: ReturnType<typeof createDbInstance> | null = null;

/**
 * Get or create a cached database instance
 */
function getCachedDbInstance(): ReturnType<typeof createDbInstance> {
  // In Cloudflare Workers, create fresh instance per call (stateless)
  if (isCloudflareWorkersRuntime()) {
    return createDbInstance();
  }

  // Local development: use module-level singleton
  if (!_cachedLocalDbInstance) {
    _cachedLocalDbInstance = createDbInstance();
  }
  return _cachedLocalDbInstance;
}

/**
 * Global database Proxy for Better Auth compatibility
 *
 * ⚠️ IMPORTANT: This global export is ONLY for Better Auth initialization.
 * For all other use cases, use getDb() or getDbAsync().
 *
 * Why this pattern exists:
 * - Better Auth is initialized at module load time (before requests exist)
 * - Proxy creates a new database instance on each property access
 * - Works with Cloudflare Workers execution model
 */
export const db = new Proxy({} as ReturnType<typeof createDbInstance>, {
  get(_, prop) {
    // Use cached instance instead of creating new one on every access
    const dbInstance = getCachedDbInstance();
    const value = dbInstance[prop as keyof typeof dbInstance];

    // Bind methods to the correct context
    if (typeof value === 'function') {
      return value.bind(dbInstance);
    }

    return value;
  },
});

// Database type for prepared queries
export type DbType = typeof db;

// Export schema for Better Auth CLI compatibility
export { schema };

// Export KV binding getter for services that need direct KV access
export { getKVBinding };

// Export batch operations utilities
export { executeBatch, prepareStatement } from './batch-operations';

// Export batch-related types for TypeScript enforcement
export type { BatchableOperation, BatchResults, D1BatchDatabase } from './d1-types';
// Re-export all table definitions (barrel pattern)
export * from './tables/auth';
export * from './tables/billing';
export * from './tables/chat';
export * from './tables/credits';
export * from './tables/project';
export * from './tables/upload';
export * from './tables/usage';
