/**
 * Memory Safety Module Unit Tests
 *
 * Comprehensive tests for the memory safety utilities that prevent
 * Cloudflare Worker memory exhaustion (128MB limit).
 *
 * Tests cover:
 * - Memory budget tracking and allocation
 * - Size estimation utilities
 * - Dynamic limit calculation based on request complexity
 * - Safe array slicing and string truncation
 * - Error creation utilities
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  calculateDynamicLimits,
  createMemoryError,
  CRITICAL_MEMORY_THRESHOLD,
  estimateBase64Size,
  estimateBinarySize,
  estimateFileContentMemory,
  estimateMessageSize,
  estimateObjectSize,
  estimateStringArraySize,
  estimateStringSize,
  MAX_SINGLE_ALLOCATION,
  MemoryBudgetConfigSchema,
  MemoryBudgetExceededError,
  MemoryBudgetTracker,
  SAFE_REQUEST_MEMORY_BUDGET,
  safeSlice,
  truncateToMemoryBudget,
  WORKER_MEMORY_LIMIT,
} from '../memory-safety';

// ============================================================================
// Tests: Constants
// ============================================================================

describe('memory Safety Constants', () => {
  it('should have correct memory limit values', () => {
    // Cloudflare Worker has 128MB limit
    expect(WORKER_MEMORY_LIMIT).toBe(128 * 1024 * 1024);

    // Safe budget is 70% of limit
    expect(SAFE_REQUEST_MEMORY_BUDGET).toBe(Math.floor(WORKER_MEMORY_LIMIT * 0.70));

    // Critical threshold is 85% of limit
    expect(CRITICAL_MEMORY_THRESHOLD).toBe(Math.floor(WORKER_MEMORY_LIMIT * 0.85));

    // Max single allocation is 20MB
    expect(MAX_SINGLE_ALLOCATION).toBe(20 * 1024 * 1024);
  });
});

// ============================================================================
// Tests: Memory Budget Config Schema
// ============================================================================

describe('memoryBudgetConfigSchema', () => {
  it('should parse default config with expected values', () => {
    const config = MemoryBudgetConfigSchema.parse({});

    expect(config.totalBudget).toBe(SAFE_REQUEST_MEMORY_BUDGET);
    expect(config.maxMessages).toBe(75);
    expect(config.maxAttachments).toBe(10);
    expect(config.maxAttachmentContentSize).toBe(10 * 1024 * 1024); // 10MB (fits 128MB worker limit)
    expect(config.maxTotalAttachmentContent).toBe(20 * 1024 * 1024); // 20MB
    expect(config.maxSystemPromptSize).toBe(100 * 1024);
    expect(config.maxRagResults).toBe(3);
    expect(config.maxCitationSources).toBe(15);
  });

  it('should allow custom values', () => {
    const config = MemoryBudgetConfigSchema.parse({
      maxMessages: 50,
      maxAttachments: 5,
      maxRagResults: 2,
    });

    expect(config.maxMessages).toBe(50);
    expect(config.maxAttachments).toBe(5);
    expect(config.maxRagResults).toBe(2);
  });

  it('should reject invalid values', () => {
    expect(() => MemoryBudgetConfigSchema.parse({
      maxMessages: -1,
    })).toThrow();

    expect(() => MemoryBudgetConfigSchema.parse({
      maxMessages: 0,
    })).toThrow();
  });
});

// ============================================================================
// Tests: Memory Budget Tracker
// ============================================================================

describe('memoryBudgetTracker', () => {
  let tracker: MemoryBudgetTracker;

  beforeEach(() => {
    tracker = new MemoryBudgetTracker({
      totalBudget: 1000, // Small budget for testing
    });
  });

  describe('allocation', () => {
    it('should track allocations', () => {
      expect(tracker.allocate('test1', 100)).toBe(true);
      expect(tracker.allocate('test2', 200)).toBe(true);

      const summary = tracker.getSummary();
      expect(summary.total).toBe(300);
      expect(summary.remaining).toBe(700);
    });

    it('should reject allocations that exceed budget', () => {
      expect(tracker.allocate('test1', 800)).toBe(true);
      expect(tracker.allocate('test2', 300)).toBe(false);

      const summary = tracker.getSummary();
      expect(summary.total).toBe(800); // Only first allocation counted
    });

    it('should accumulate allocations with same label', () => {
      tracker.allocate('messages', 100);
      tracker.allocate('messages', 150);

      const summary = tracker.getSummary();
      expect(summary.allocations.messages).toBe(250);
    });
  });

  describe('canAllocate', () => {
    it('should return true for valid allocations', () => {
      expect(tracker.canAllocate(500)).toBe(true);
      expect(tracker.canAllocate(1000)).toBe(true);
    });

    it('should return false for allocations exceeding budget', () => {
      expect(tracker.canAllocate(1001)).toBe(false);
      expect(tracker.canAllocate(2000)).toBe(false);
    });
  });

  describe('usage tracking', () => {
    it('should calculate usage percentage correctly', () => {
      tracker.allocate('test', 500);
      expect(tracker.getUsagePercentage()).toBe(50);

      tracker.allocate('test2', 300);
      expect(tracker.getUsagePercentage()).toBe(80);
    });

    it('should detect warning level', () => {
      expect(tracker.isWarning()).toBe(false);

      tracker.allocate('test', 750); // 75%
      expect(tracker.isWarning()).toBe(true);
    });

    it('should detect critical level', () => {
      expect(tracker.isCritical()).toBe(false);

      tracker.allocate('test', 910); // 91%
      expect(tracker.isCritical()).toBe(true);
    });
  });

  describe('release', () => {
    it('should release allocations', () => {
      tracker.allocate('test', 500);
      expect(tracker.getRemainingBudget()).toBe(500);

      tracker.release('test');
      expect(tracker.getRemainingBudget()).toBe(1000);
    });

    it('should handle releasing non-existent allocation', () => {
      tracker.allocate('test', 500);
      tracker.release('nonexistent');

      expect(tracker.getRemainingBudget()).toBe(500);
    });
  });

  describe('reset', () => {
    it('should reset all allocations', () => {
      tracker.allocate('test1', 300);
      tracker.allocate('test2', 400);

      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.total).toBe(0);
      expect(summary.remaining).toBe(1000);
      expect(Object.keys(summary.allocations)).toHaveLength(0);
    });
  });

  describe('getConfig', () => {
    it('should return config copy', () => {
      const config = tracker.getConfig();
      expect(config.totalBudget).toBe(1000);
    });
  });
});

// ============================================================================
// Tests: Size Estimation Utilities
// ============================================================================

describe('size Estimation Utilities', () => {
  describe('estimateStringSize', () => {
    it('should estimate string size as 2 bytes per char', () => {
      expect(estimateStringSize('')).toBe(0);
      expect(estimateStringSize('a')).toBe(2);
      expect(estimateStringSize('hello')).toBe(10);
      expect(estimateStringSize('test string')).toBe(22);
    });
  });

  describe('estimateStringArraySize', () => {
    it('should sum sizes of all strings', () => {
      expect(estimateStringArraySize([])).toBe(0);
      expect(estimateStringArraySize(['a', 'b'])).toBe(4);
      expect(estimateStringArraySize(['hello', 'world'])).toBe(20);
    });
  });

  describe('estimateObjectSize', () => {
    it('should estimate object size based on JSON length', () => {
      const obj = { key: 'value' };
      const size = estimateObjectSize(obj);

      // JSON.stringify gives '{"key":"value"}' = 15 chars
      // Multiply by 2 (UTF-16) and 1.2 (overhead) = 36
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1000);
    });

    it('should handle non-serializable objects', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      // Should return default 1KB for non-serializable
      expect(estimateObjectSize(circular)).toBe(1024);
    });
  });

  describe('estimateBinarySize', () => {
    it('should return byte length of Uint8Array', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      expect(estimateBinarySize(data)).toBe(5);
    });

    it('should return byte length of ArrayBuffer', () => {
      const buffer = new ArrayBuffer(100);
      expect(estimateBinarySize(buffer)).toBe(100);
    });
  });

  describe('estimateBase64Size', () => {
    it('should estimate 33% overhead for base64', () => {
      expect(estimateBase64Size(100)).toBe(134); // ceil(100 * 1.34)
      expect(estimateBase64Size(1000)).toBe(1340);
    });
  });

  describe('estimateMessageSize', () => {
    it('should estimate 2KB per message', () => {
      expect(estimateMessageSize(0)).toBe(0);
      expect(estimateMessageSize(1)).toBe(2048);
      expect(estimateMessageSize(10)).toBe(20480);
      expect(estimateMessageSize(100)).toBe(204800);
    });
  });

  describe('estimateFileContentMemory', () => {
    it('should include original + base64 + overhead', () => {
      const size = estimateFileContentMemory(1000);

      // Should be > original + base64 encoded
      expect(size).toBeGreaterThan(1000 + 1340);
      expect(size).toBe(1000 + Math.ceil(1000 * 1.34) + 1024);
    });
  });
});

// ============================================================================
// Tests: Dynamic Limits Calculation
// ============================================================================

describe('calculateDynamicLimits', () => {
  it('should return default limits for simple requests', () => {
    const limits = calculateDynamicLimits({
      messageCount: 10,
      attachmentCount: 0,
      hasRag: false,
      hasWebSearch: false,
      hasProject: false,
    });

    expect(limits.maxMessages).toBe(75);
    expect(limits.maxAttachments).toBe(10);
    expect(limits.maxRagResults).toBe(3);
  });

  it('should reduce limits for high attachment count', () => {
    const limits = calculateDynamicLimits({
      messageCount: 10,
      attachmentCount: 8,
      hasRag: false,
      hasWebSearch: false,
      hasProject: false,
    });

    expect(limits.maxMessages).toBe(50); // Reduced
    expect(limits.maxAttachmentContentSize).toBe(5 * 1024 * 1024); // Reduced to 5MB for >3 attachments
  });

  it('should reduce limits for RAG + web search', () => {
    const limits = calculateDynamicLimits({
      messageCount: 10,
      attachmentCount: 0,
      hasRag: true,
      hasWebSearch: true,
      hasProject: true,
    });

    expect(limits.maxMessages).toBe(50);
    expect(limits.maxAttachments).toBe(3); // Reduced to 3 for RAG + web search
    expect(limits.maxRagResults).toBe(2);
  });

  it('should reduce limits for high message count', () => {
    const limits = calculateDynamicLimits({
      messageCount: 120,
      attachmentCount: 2,
      hasRag: false,
      hasWebSearch: false,
      hasProject: false,
    });

    expect(limits.maxAttachments).toBe(3); // Reduced to 3 for >50 messages
    expect(limits.maxAttachmentContentSize).toBe(5 * 1024 * 1024); // Reduced to 5MB
  });

  it('should use minimum limits for complex requests', () => {
    const limits = calculateDynamicLimits({
      messageCount: 80,
      attachmentCount: 5,
      hasRag: true,
      hasWebSearch: true,
      hasProject: true,
    });

    // Most restrictive limits for complex requests within 128MB worker memory
    expect(limits.maxMessages).toBe(30);
    expect(limits.maxAttachments).toBe(2);
    expect(limits.maxAttachmentContentSize).toBe(3 * 1024 * 1024); // 3MB for complex requests
    expect(limits.maxRagResults).toBe(2);
  });
});

// ============================================================================
// Tests: Safe Operations
// ============================================================================

describe('safe Operations', () => {
  describe('truncateToMemoryBudget', () => {
    it('should not truncate short strings', () => {
      const result = truncateToMemoryBudget('hello', 1000);
      expect(result).toBe('hello');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(1000);
      const result = truncateToMemoryBudget(longString, 100); // 50 chars max

      expect(result.length).toBeLessThan(100);
      expect(result).toContain('truncated for memory safety');
    });

    it('should handle edge cases', () => {
      expect(truncateToMemoryBudget('', 100)).toBe('');
      // 'short' = 5 chars, needs 10 bytes (2 bytes/char), fits in 10 byte budget
      expect(truncateToMemoryBudget('short', 10)).toBe('short');
      // Very small budget forces truncation
      expect(truncateToMemoryBudget('short', 4)).toContain('truncated');
    });
  });

  describe('safeSlice', () => {
    it('should return full array if within limits', () => {
      const arr = [1, 2, 3, 4, 5];
      expect(safeSlice(arr, 10)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should slice to max items', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(safeSlice(arr, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty array', () => {
      expect(safeSlice([], 5)).toEqual([]);
    });

    it('should skip undefined items when iterating', () => {
      const arr = [1, undefined, 3, undefined, 5, 6];
      // When maxItems < arr.length, it iterates and skips undefined
      const result = safeSlice(arr as number[], 5);
      // Only gets 4 non-undefined values from first 5 positions: 1, 3, 5
      expect(result).toEqual([1, 3, 5]);
    });

    it('should return original array when under maxItems limit', () => {
      // When arr.length <= maxItems, returns original array directly
      const arr = [1, 2, 3];
      const result = safeSlice(arr, 10);
      expect(result).toBe(arr); // Same reference
    });

    it('should respect byte limit with estimator', () => {
      const arr = ['short', 'medium length', 'very long string here'];
      const result = safeSlice(
        arr,
        10,
        (s: string) => s.length * 2,
        30, // 15 chars max
      );

      // Should only include 'short' (10 bytes) and partial
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });
});

// ============================================================================
// Tests: Error Types
// ============================================================================

describe('error Types', () => {
  describe('memoryBudgetExceededError', () => {
    it('should create error with correct properties', () => {
      const error = new MemoryBudgetExceededError(
        'Test error',
        1000,
        2000,
        'testOperation',
      );

      expect(error.name).toBe('MemoryBudgetExceededError');
      expect(error.message).toBe('Test error');
      expect(error.allocated).toBe(1000);
      expect(error.budget).toBe(2000);
      expect(error.operation).toBe('testOperation');
    });
  });

  describe('createMemoryError', () => {
    it('should create user-friendly error', () => {
      const tracker = new MemoryBudgetTracker({ totalBudget: 1000 });
      tracker.allocate('test', 800);

      const error = createMemoryError('streaming', tracker);

      expect(error.name).toBe('MemoryBudgetExceededError');
      expect(error.message).toContain('Memory budget exceeded');
      expect(error.message).toContain('streaming');
      expect(error.message).toContain('MB');
      expect(error.operation).toBe('streaming');
    });
  });
});

// ============================================================================
// Tests: Integration Scenarios
// ============================================================================

describe('integration Scenarios', () => {
  it('should handle typical streaming request memory budget', () => {
    const tracker = new MemoryBudgetTracker();

    // Simulate typical allocations during streaming
    expect(tracker.allocate('messages', estimateMessageSize(50))).toBe(true);
    expect(tracker.allocate('systemPrompt', 50 * 1024)).toBe(true);
    expect(tracker.allocate('attachments', 200 * 1024)).toBe(true);
    expect(tracker.allocate('ragContext', 100 * 1024)).toBe(true);

    expect(tracker.isCritical()).toBe(false);
    expect(tracker.isWarning()).toBe(false);
  });

  it('should reject oversized streaming request', () => {
    const tracker = new MemoryBudgetTracker({
      totalBudget: 1024 * 1024, // 1MB for testing
    });

    // Try to allocate more than budget
    expect(tracker.allocate('messages', estimateMessageSize(200))).toBe(true); // 400KB
    expect(tracker.allocate('bigAttachment', 800 * 1024)).toBe(false); // Rejected

    expect(tracker.getSummary().total).toBe(estimateMessageSize(200));
  });

  it('should dynamically adjust limits for complex request', () => {
    // Simulate a complex request with many features enabled
    const limits = calculateDynamicLimits({
      messageCount: 100,
      attachmentCount: 10,
      hasRag: true,
      hasWebSearch: true,
      hasProject: true,
    });

    const tracker = new MemoryBudgetTracker(limits);

    // Even with complex request, should have reasonable budget
    expect(limits.maxMessages).toBeLessThanOrEqual(50);
    expect(limits.maxAttachments).toBeLessThanOrEqual(5);
    expect(tracker.getConfig().totalBudget).toBeGreaterThan(0);
  });

  it('should handle file upload scenario within limits', () => {
    const limits = calculateDynamicLimits({
      messageCount: 20,
      attachmentCount: 5,
      hasRag: false,
      hasWebSearch: false,
      hasProject: false,
    });

    const tracker = new MemoryBudgetTracker(limits);

    // Simulate uploading 5 files of 50KB each
    const fileSize = 50 * 1024;
    for (let i = 0; i < 5; i++) {
      const allocated = tracker.allocate(
        `file${i}`,
        estimateFileContentMemory(fileSize),
      );
      expect(allocated).toBe(true);
    }

    expect(tracker.isCritical()).toBe(false);
  });

  it('should gracefully handle edge cases', () => {
    const tracker = new MemoryBudgetTracker({ totalBudget: 100 });

    // Zero allocation should succeed
    expect(tracker.allocate('zero', 0)).toBe(true);

    // Exact budget allocation should succeed
    expect(tracker.allocate('exact', 100)).toBe(true);

    // Any more should fail
    expect(tracker.allocate('over', 1)).toBe(false);
  });
});
