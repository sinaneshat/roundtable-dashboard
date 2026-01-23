/**
 * Cloudflare KV Cache for Drizzle ORM
 * Automatic invalidation on mutations, configurable TTL, table-based cache keys
 * @see https://orm.drizzle.team/docs/cache
 *
 * DEPLOYMENT ISOLATION:
 * Each worker deployment gets a unique cache namespace via DEPLOYMENT_ID.
 * This prevents stale cache data from causing 500 errors after deployments.
 * The tableToKeys mapping is in-memory and lost on restart, but with deployment
 * isolation, old cache entries are simply orphaned and expire via TTL.
 */

import type { Table as TableType } from 'drizzle-orm';
import { getTableName, is, Table } from 'drizzle-orm';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';

/**
 * Unique deployment ID generated at module load time.
 * Each worker deployment gets a new ID, isolating cache namespaces.
 * Old cache entries become orphaned but expire naturally via TTL.
 */
const DEPLOYMENT_ID = crypto.randomUUID().slice(0, 8);

export type CloudflareKVCacheOptions = {
  kv: KVNamespace;
  global?: boolean;
  defaultTtl?: number;
  keyPrefix?: string;
};

export class CloudflareKVCache extends Cache {
  private kv: KVNamespace;
  private defaultTtl: number;
  private globalCache: boolean;
  private keyPrefix: string;
  private tableToKeys: Record<string, Set<string>> = {};

  constructor(options: CloudflareKVCacheOptions) {
    super();
    this.kv = options.kv;
    this.defaultTtl = options.defaultTtl ?? 300;
    this.globalCache = options.global ?? false;
    // Include deployment ID in prefix to isolate cache per deployment
    // This prevents stale cache data from causing 500 errors after deployments
    const basePrefix = options.keyPrefix ?? 'drizzle:';
    this.keyPrefix = `${basePrefix}${DEPLOYMENT_ID}:`;
  }

  override strategy(): 'explicit' | 'all' {
    return this.globalCache ? 'all' : 'explicit';
  }

  override async get(key: string): Promise<unknown[] | undefined> {
    try {
      const prefixedKey = this.getPrefixedKey(key);
      const cached = await this.kv.get<unknown[]>(prefixedKey, 'json');

      if (cached !== null) {
        return cached;
      }

      return undefined;
    } catch (error) {
      console.error('[Cache] Error retrieving from KV:', error);
      return undefined;
    }
  }

  override async put(
    hashedQuery: string,
    response: unknown,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig,
  ): Promise<void> {
    try {
      const prefixedKey = this.getPrefixedKey(hashedQuery);

      // Calculate expiration
      const ttl = this.calculateTtl(config);

      // Store in KV with expiration
      await this.kv.put(prefixedKey, JSON.stringify(response), {
        expirationTtl: ttl,
      });

      if (!isTag) {
        for (const table of tables) {
          if (!this.tableToKeys[table]) {
            this.tableToKeys[table] = new Set();
          }
          this.tableToKeys[table].add(hashedQuery);
        }
      }
    } catch (error) {
      console.error('[Cache] Error storing to KV:', error);
    }
  }

  override async onMutate(params: {
    tags: string | string[];
    tables: string | string[] | TableType | TableType[];
  }): Promise<void> {
    try {
      const tagsArray = this.normalizeToArray(params.tags);
      const tablesArray = this.normalizeToArray(params.tables);

      // Collect all keys to invalidate
      const keysToInvalidate = new Set<string>();

      for (const table of tablesArray) {
        const tableName = this.getTableName(table);
        const keys = this.tableToKeys[tableName];

        if (keys) {
          keys.forEach(key => keysToInvalidate.add(key));
          delete this.tableToKeys[tableName];
        }
      }

      for (const tag of tagsArray) {
        keysToInvalidate.add(tag);
      }

      if (keysToInvalidate.size > 0) {
        await Promise.all(
          Array.from(keysToInvalidate).map(key =>
            this.kv.delete(this.getPrefixedKey(key)),
          ),
        );
      }
    } catch (error) {
      console.error('[Cache] Error during invalidation:', error);
    }
  }

  async invalidate(params: {
    tables?: string | string[] | TableType | TableType[];
    tags?: string | string[];
  }): Promise<void> {
    await this.onMutate({
      tags: params.tags ?? [],
      tables: params.tables ?? [],
    });
  }

  async clearAll(): Promise<void> {
    try {
      const allKeys = new Set<string>();

      Object.values(this.tableToKeys).forEach((keys) => {
        keys.forEach(key => allKeys.add(key));
      });

      if (allKeys.size > 0) {
        await Promise.all(
          Array.from(allKeys).map(key =>
            this.kv.delete(this.getPrefixedKey(key)),
          ),
        );
      }

      this.tableToKeys = {};
    } catch (error) {
      console.error('[Cache] Error clearing cache:', error);
    }
  }

  private getPrefixedKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private calculateTtl(config?: CacheConfig): number {
    if (config?.ex)
      return config.ex;
    if (config?.px)
      return Math.floor(config.px / 1000);
    if (config?.exat)
      return Math.max(0, config.exat - Math.floor(Date.now() / 1000));
    if (config?.pxat)
      return Math.max(0, Math.floor((config.pxat - Date.now()) / 1000));
    return this.defaultTtl;
  }

  private normalizeToArray<T>(value: T | T[] | undefined | null): T[] {
    if (!value)
      return [];
    return Array.isArray(value) ? value : [value];
  }

  private getTableName(table: string | TableType): string {
    if (typeof table === 'string') {
      return table;
    }
    return is(table, Table) ? getTableName(table) : String(table);
  }
}
