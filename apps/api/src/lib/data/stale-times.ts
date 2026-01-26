/**
 * KV Cache TTLs for $withCache DB-level caching
 *
 * These values are in SECONDS (not milliseconds) for Cloudflare KV cache config.
 * KV has a minimum TTL of 60 seconds.
 */
export const STALE_TIMES = {
  // Public messages are immutable
  publicMessagesKV: 3600, // 1 hour
  // Public slugs list for SSG
  publicSlugsListKV: 3600, // 1 hour
  // Public thread immutable content
  publicThreadKV: 3600, // 1 hour
  // Thread detail DB cache
  threadDetailKV: 300, // 5 minutes
  // Thread list DB cache
  threadListKV: 120, // 2 minutes
  // Messages immutable, fast load on nav
  threadMessagesKV: 300, // 5 minutes
  // Participants rarely change
  threadParticipantsKV: 600, // 10 minutes
  // Lightweight sidebar (KV min TTL is 60s)
  threadSidebarKV: 60, // 60 seconds
} as const;
