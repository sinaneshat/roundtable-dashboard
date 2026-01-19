import { env as workersEnv } from 'cloudflare:workers';
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

// Database configuration - path is computed lazily in getLocalDbPath()
const LOCAL_DB_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

/**
 * Gets the path to the local SQLite database file (async to lazy load Node.js modules)
 * Creates the directory if it doesn't exist and returns the path to the database file
 */
async function getLocalDbPath(): Promise<string> {
  // Lazy load Node.js modules - only used in local development
  const fs = await import('node:fs');
  const path = await import('node:path');

  const LOCAL_DB_PATH = path.join(process.cwd(), LOCAL_DB_DIR);

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
 * Async to lazy load Node.js-only modules (better-sqlite3, drizzle-orm/better-sqlite3)
 */
async function initLocalDb() {
  // Lazy load Node.js modules - only used in local development
  const fs = await import('node:fs');
  const { default: Database } = await import('better-sqlite3');
  const { drizzle: drizzleBetter } = await import('drizzle-orm/better-sqlite3');

  const dbPath = await getLocalDbPath();

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
 * Async version of getDb - uses async initialization for local SQLite
 */
export async function getDbAsync() {
  return createDbInstanceAsync();
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

// Type for local SQLite database instance (used for type inference)
type LocalDbInstance = Awaited<ReturnType<typeof initLocalDb>>;
type D1DbInstance = ReturnType<typeof drizzleD1<typeof schema>>;
type DbInstance = D1DbInstance | LocalDbInstance;

/**
 * Create D1 database instance for Cloudflare Workers (synchronous)
 * This is the fast path used in production/preview deployments
 */
function createD1Instance(): D1DbInstance {
  const d1Database = getD1Binding();
  if (!d1Database) {
    throw new Error(
      'D1 database binding not available in Cloudflare Workers. '
      + 'Ensure DB binding is configured in wrangler.jsonc',
    );
  }

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

/**
 * Create database instance for the global db Proxy
 *
 * Environment Detection Priority:
 * 1. Cloudflare Workers → D1 with batch operations (sync)
 * 2. Local development → Local SQLite with transactions (async, lazy-loaded)
 */
function createDbInstance(): DbInstance {
  // In Cloudflare Workers, we MUST use D1 - fast synchronous path
  if (isCloudflareWorkersRuntime()) {
    return createD1Instance();
  }

  // Node.js environment (local development) - try D1 first
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

  // Local SQLite - this path is only reached in local dev without D1
  // We throw here and handle async initialization separately
  throw new Error('Local SQLite requires async initialization. Use getDbAsync() instead.');
}

/**
 * Create database instance asynchronously (for local development)
 */
async function createDbInstanceAsync(): Promise<DbInstance> {
  // In Cloudflare Workers, use sync D1 path
  if (isCloudflareWorkersRuntime()) {
    return createD1Instance();
  }

  // Try D1 first
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

  // Local SQLite for development
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
