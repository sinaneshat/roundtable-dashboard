/**
 * Pre-Search Orphan Detection Tests
 *
 * Tests the logic for detecting truly orphaned pre-searches vs still-active ones.
 *
 * The orphan cleanup runs in getThreadPreSearchesHandler and must:
 * 1. Check if search was created > 2 minutes ago (ORPHAN_CLEANUP_TIMEOUT_MS)
 * 2. Check KV buffer for recent activity before marking as failed
 * 3. Only mark as FAILED if BOTH conditions are true:
 *    - Created > 2 minutes ago
 *    - No recent KV activity (> 30 seconds since last chunk)
 *
 * This prevents false positives where slow-but-active searches are
 * incorrectly marked as failed after page refresh.
 */

import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

// ============================================================================
// TEST HELPER TYPES
// ============================================================================

type PreSearchRecord = {
  id: string;
  threadId: string;
  roundNumber: number;
  status: string;
  createdAt: Date;
};

type KVChunk = {
  index: number;
  event: string;
  data: string;
  timestamp: number;
};

// ============================================================================
// ORPHAN DETECTION LOGIC (mirrors handler logic)
// ============================================================================

const ORPHAN_CLEANUP_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const STALE_CHUNK_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Check if timestamp has exceeded a timeout threshold
 */
function hasTimestampExceededTimeout(createdAt: Date, timeoutMs: number): boolean {
  const age = Date.now() - createdAt.getTime();
  return age > timeoutMs;
}

/**
 * Determines if a pre-search is a potential orphan based on createdAt
 */
function isPotentialOrphan(search: PreSearchRecord): boolean {
  if (search.status !== MessageStatuses.STREAMING && search.status !== MessageStatuses.PENDING) {
    return false;
  }
  return hasTimestampExceededTimeout(search.createdAt, ORPHAN_CLEANUP_TIMEOUT_MS);
}

/**
 * Determines if KV buffer shows recent activity
 * Returns true if stream is still active (NOT stale)
 */
function hasRecentKVActivity(chunks: KVChunk[] | null): boolean {
  if (!chunks || chunks.length === 0) {
    return false;
  }

  const lastChunkTime = Math.max(...chunks.map(chunk => chunk.timestamp));
  const isStale = Date.now() - lastChunkTime > STALE_CHUNK_TIMEOUT_MS;

  return !isStale; // Active if NOT stale
}

/**
 * Determines if a pre-search should be marked as orphaned (FAILED)
 * This is the core logic tested here
 */
function shouldMarkAsOrphaned(search: PreSearchRecord, kvChunks: KVChunk[] | null): boolean {
  // First check: must be a potential orphan (old + still streaming/pending)
  if (!isPotentialOrphan(search)) {
    return false;
  }

  // Second check: must NOT have recent KV activity
  if (hasRecentKVActivity(kvChunks)) {
    return false; // Stream is still active, don't orphan
  }

  return true; // Truly orphaned
}

// ============================================================================
// TESTS
// ============================================================================

describe('pre-search orphan detection', () => {
  describe('isPotentialOrphan', () => {
    it('returns false for COMPLETE status', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.COMPLETE,
        createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
      };

      expect(isPotentialOrphan(search)).toBe(false);
    });

    it('returns false for FAILED status', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.FAILED,
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      };

      expect(isPotentialOrphan(search)).toBe(false);
    });

    it('returns false for STREAMING status created recently', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 30 * 1000), // 30 seconds ago
      };

      expect(isPotentialOrphan(search)).toBe(false);
    });

    it('returns true for STREAMING status older than 2 minutes', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 minutes ago
      };

      expect(isPotentialOrphan(search)).toBe(true);
    });

    it('returns true for PENDING status older than 2 minutes', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.PENDING,
        createdAt: new Date(Date.now() - 3 * 60 * 1000),
      };

      expect(isPotentialOrphan(search)).toBe(true);
    });
  });

  describe('hasRecentKVActivity', () => {
    it('returns false for null chunks', () => {
      expect(hasRecentKVActivity(null)).toBe(false);
    });

    it('returns false for empty chunks array', () => {
      expect(hasRecentKVActivity([])).toBe(false);
    });

    it('returns false for chunks older than 30 seconds', () => {
      const oldChunks: KVChunk[] = [
        { index: 0, event: 'data', data: '{}', timestamp: Date.now() - 60_000 }, // 60s ago
      ];

      expect(hasRecentKVActivity(oldChunks)).toBe(false);
    });

    it('returns true for chunks within last 30 seconds', () => {
      const recentChunks: KVChunk[] = [
        { index: 0, event: 'data', data: '{}', timestamp: Date.now() - 10_000 }, // 10s ago
      ];

      expect(hasRecentKVActivity(recentChunks)).toBe(true);
    });

    it('returns true if ANY chunk is recent (uses max timestamp)', () => {
      const mixedChunks: KVChunk[] = [
        { index: 0, event: 'data', data: '{}', timestamp: Date.now() - 120_000 }, // 2 min ago
        { index: 1, event: 'data', data: '{}', timestamp: Date.now() - 60_000 }, // 1 min ago
        { index: 2, event: 'data', data: '{}', timestamp: Date.now() - 5_000 }, // 5s ago (recent!)
      ];

      expect(hasRecentKVActivity(mixedChunks)).toBe(true);
    });
  });

  describe('shouldMarkAsOrphaned', () => {
    it('returns false for recently created STREAMING search', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 30_000), // 30 seconds ago
      };

      expect(shouldMarkAsOrphaned(search, null)).toBe(false);
    });

    it('returns false for old STREAMING search WITH recent KV activity', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      };

      const recentChunks: KVChunk[] = [
        { index: 0, event: 'data', data: '{}', timestamp: Date.now() - 10_000 }, // 10s ago
      ];

      // Key test: old search but recent KV activity = NOT orphaned
      expect(shouldMarkAsOrphaned(search, recentChunks)).toBe(false);
    });

    it('returns true for old STREAMING search WITHOUT recent KV activity', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      };

      const staleChunks: KVChunk[] = [
        { index: 0, event: 'data', data: '{}', timestamp: Date.now() - 60_000 }, // 1 min ago (stale)
      ];

      expect(shouldMarkAsOrphaned(search, staleChunks)).toBe(true);
    });

    it('returns true for old STREAMING search with null KV chunks (local dev)', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      };

      // No KV available = assume orphaned (local dev fallback)
      expect(shouldMarkAsOrphaned(search, null)).toBe(true);
    });

    it('returns false for COMPLETE status regardless of age or KV', () => {
      const search: PreSearchRecord = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.COMPLETE,
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      };

      expect(shouldMarkAsOrphaned(search, null)).toBe(false);
    });
  });

  describe('page refresh scenarios', () => {
    it('scenario: user refreshes during active search - should NOT orphan', () => {
      // Simulates: search started 3 minutes ago, user just refreshed
      // KV shows activity from 5 seconds ago (stream still running in background)
      const search: PreSearchRecord = {
        id: 'ps-refresh-1',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 min ago
      };

      const activeChunks: KVChunk[] = [
        { index: 0, event: 'query', data: '{}', timestamp: Date.now() - 60_000 },
        { index: 1, event: 'search', data: '{}', timestamp: Date.now() - 30_000 },
        { index: 2, event: 'search', data: '{}', timestamp: Date.now() - 5_000 }, // Recent!
      ];

      expect(shouldMarkAsOrphaned(search, activeChunks)).toBe(false);
    });

    it('scenario: user refreshes after connection died - SHOULD orphan', () => {
      // Simulates: search started 3 minutes ago, connection died 1 minute ago
      // KV shows last activity was 1 minute ago (stale - no new chunks)
      const search: PreSearchRecord = {
        id: 'ps-refresh-2',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 3 * 60 * 1000), // 3 min ago
      };

      const staleChunks: KVChunk[] = [
        { index: 0, event: 'query', data: '{}', timestamp: Date.now() - 2 * 60_000 },
        { index: 1, event: 'search', data: '{}', timestamp: Date.now() - 60_000 }, // Last chunk 1 min ago
      ];

      expect(shouldMarkAsOrphaned(search, staleChunks)).toBe(true);
    });

    it('scenario: quick refresh within 2 minutes - should NOT orphan', () => {
      // Simulates: search started 1 minute ago, user refreshed quickly
      const search: PreSearchRecord = {
        id: 'ps-quick-refresh',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 60_000), // 1 min ago (under 2 min threshold)
      };

      // Doesn't matter if KV is null - createdAt is too recent
      expect(shouldMarkAsOrphaned(search, null)).toBe(false);
    });

    it('scenario: long-running search with slow model - should NOT orphan if active', () => {
      // Simulates: complex query that takes 5 minutes, but model is still working
      // KV shows sparse activity but last chunk was 20 seconds ago (within threshold)
      const search: PreSearchRecord = {
        id: 'ps-slow-model',
        threadId: 't-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
      };

      const sparseChunks: KVChunk[] = [
        { index: 0, event: 'query', data: '{}', timestamp: Date.now() - 4 * 60_000 }, // 4 min ago
        { index: 1, event: 'thinking', data: '{}', timestamp: Date.now() - 20_000 }, // 20s ago (active!)
      ];

      expect(shouldMarkAsOrphaned(search, sparseChunks)).toBe(false);
    });
  });
});
