/**
 * Memory Safety Utilities for Cloudflare Workers
 *
 * Cloudflare Workers have a 128MB memory limit. This module provides:
 * - Memory budget tracking per request
 * - Size estimation for common data structures
 * - Early bailout when approaching limits
 * - Graceful degradation strategies
 *
 * @see https://developers.cloudflare.com/workers/platform/limits/
 */

import { z } from 'zod';

// ============================================================================
// CONSTANTS - Memory Limits
// ============================================================================

/**
 * Cloudflare Worker memory limit in bytes (128MB)
 * This is a HARD PLATFORM LIMIT - cannot be configured higher
 * We use a conservative threshold to leave headroom for:
 * - V8 runtime overhead (~20-30MB)
 * - Framework allocations
 * - Response buffering
 * @see https://developers.cloudflare.com/workers/platform/limits/
 */
export const WORKER_MEMORY_LIMIT = 128 * 1024 * 1024; // 128MB (hard limit)

/**
 * Safe memory budget per request (70% of limit = ~90MB)
 * Leaves ~38MB headroom for V8 runtime overhead
 */
export const SAFE_REQUEST_MEMORY_BUDGET = Math.floor(WORKER_MEMORY_LIMIT * 0.70);

/**
 * Critical memory threshold (85% of limit = ~109MB)
 * If we approach this, start aggressive cleanup
 */
export const CRITICAL_MEMORY_THRESHOLD = Math.floor(WORKER_MEMORY_LIMIT * 0.85);

/**
 * Maximum size for a single allocation (20MB)
 * With base64 overhead (~33%), a 20MB file = ~27MB in memory
 * Must leave room for other allocations within 128MB limit
 */
export const MAX_SINGLE_ALLOCATION = 20 * 1024 * 1024;

// ============================================================================
// Memory Budget Tracker
// ============================================================================

export const MemoryBudgetConfigSchema = z.object({
  /** Total budget in bytes (~90MB safe budget) */
  totalBudget: z.number().int().positive().default(SAFE_REQUEST_MEMORY_BUDGET),
  /** Maximum messages to load */
  maxMessages: z.number().int().positive().default(75),
  /** Maximum attachments to process */
  maxAttachments: z.number().int().positive().default(10),
  /** Maximum attachment content size per file (10MB - matches MAX_BASE64_FILE_SIZE) */
  maxAttachmentContentSize: z.number().int().positive().default(10 * 1024 * 1024), // 10MB
  /** Maximum total attachment content (20MB for multiple files) */
  maxTotalAttachmentContent: z.number().int().positive().default(20 * 1024 * 1024), // 20MB
  /** Maximum system prompt size */
  maxSystemPromptSize: z.number().int().positive().default(100 * 1024), // 100KB
  /** Maximum RAG results */
  maxRagResults: z.number().int().positive().default(3),
  /** Maximum citation sources */
  maxCitationSources: z.number().int().positive().default(15),
});

export type MemoryBudgetConfig = z.infer<typeof MemoryBudgetConfigSchema>;

/**
 * Tracks memory usage during request processing
 * Provides warnings and hard stops when limits are approached
 */
export class MemoryBudgetTracker {
  private allocated = 0;
  private readonly config: MemoryBudgetConfig;
  private readonly allocations: Map<string, number> = new Map();

  constructor(config?: Partial<MemoryBudgetConfig>) {
    this.config = MemoryBudgetConfigSchema.parse(config ?? {});
  }

  /**
   * Get current configuration
   */
  getConfig(): MemoryBudgetConfig {
    return { ...this.config };
  }

  /**
   * Record a memory allocation
   * @returns true if allocation is within budget, false if exceeded
   */
  allocate(label: string, bytes: number): boolean {
    const newTotal = this.allocated + bytes;

    if (newTotal > this.config.totalBudget) {
      return false;
    }

    this.allocated = newTotal;
    const existing = this.allocations.get(label) ?? 0;
    this.allocations.set(label, existing + bytes);
    return true;
  }

  /**
   * Check if we can allocate a given amount
   */
  canAllocate(bytes: number): boolean {
    return this.allocated + bytes <= this.config.totalBudget;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number {
    return Math.max(0, this.config.totalBudget - this.allocated);
  }

  /**
   * Get current usage percentage
   */
  getUsagePercentage(): number {
    return (this.allocated / this.config.totalBudget) * 100;
  }

  /**
   * Check if we're at critical memory pressure
   */
  isCritical(): boolean {
    return this.allocated > this.config.totalBudget * 0.9;
  }

  /**
   * Check if we're at warning level
   */
  isWarning(): boolean {
    return this.allocated > this.config.totalBudget * 0.7;
  }

  /**
   * Get allocation summary for debugging
   */
  getSummary(): { total: number; remaining: number; percentage: number; allocations: Record<string, number> } {
    return {
      total: this.allocated,
      remaining: this.getRemainingBudget(),
      percentage: this.getUsagePercentage(),
      allocations: Object.fromEntries(this.allocations),
    };
  }

  /**
   * Release memory allocation (for cleanup)
   */
  release(label: string): void {
    const amount = this.allocations.get(label);
    if (amount) {
      this.allocated = Math.max(0, this.allocated - amount);
      this.allocations.delete(label);
    }
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.allocated = 0;
    this.allocations.clear();
  }
}

// ============================================================================
// Size Estimation Utilities
// ============================================================================

/**
 * Estimate memory size of a string
 * JavaScript strings use 2 bytes per character (UTF-16)
 */
export function estimateStringSize(str: string): number {
  return str.length * 2;
}

/**
 * Estimate memory size of an array of strings
 */
export function estimateStringArraySize(arr: string[]): number {
  return arr.reduce((sum, str) => sum + estimateStringSize(str), 0);
}

/**
 * Estimate memory size of a JSON object
 * Rough estimate: JSON.stringify length * 2 + 20% overhead for object structure
 */
export function estimateObjectSize(obj: unknown): number {
  try {
    const jsonStr = JSON.stringify(obj);
    return Math.ceil(jsonStr.length * 2 * 1.2);
  } catch {
    return 1024; // Default 1KB for non-serializable objects
  }
}

/**
 * Estimate memory size of a Uint8Array (binary data)
 */
export function estimateBinarySize(data: Uint8Array | ArrayBuffer): number {
  return data.byteLength;
}

/**
 * Estimate base64 encoding overhead
 * Base64 encoding increases size by ~33%
 */
export function estimateBase64Size(originalBytes: number): number {
  return Math.ceil(originalBytes * 1.34);
}

/**
 * Estimate memory for DB message records
 * Average message: ~2KB for content + metadata
 */
export function estimateMessageSize(messageCount: number): number {
  const AVG_MESSAGE_SIZE = 2 * 1024; // 2KB average
  return messageCount * AVG_MESSAGE_SIZE;
}

/**
 * Estimate memory for file content with base64 encoding
 */
export function estimateFileContentMemory(fileSizeBytes: number): number {
  // Original + base64 encoded version + some processing overhead
  return fileSizeBytes + estimateBase64Size(fileSizeBytes) + 1024;
}

// ============================================================================
// Dynamic Scaling Based on Request Complexity
// ============================================================================

export type RequestComplexity = {
  messageCount: number;
  attachmentCount: number;
  hasRag: boolean;
  hasWebSearch: boolean;
  hasProject: boolean;
};

/**
 * Calculate dynamic limits based on request complexity
 * More complex requests get stricter limits to stay within 128MB budget
 * Must account for: V8 overhead (~30MB) + messages + attachments + system prompt
 */
export function calculateDynamicLimits(complexity: RequestComplexity): MemoryBudgetConfig {
  const base = MemoryBudgetConfigSchema.parse({});

  // Start with base limits (10MB per file max)
  let maxMessages = base.maxMessages;
  let maxAttachments = base.maxAttachments;
  let maxAttachmentContentSize = base.maxAttachmentContentSize;
  let maxRagResults = base.maxRagResults;

  // Reduce limits based on complexity to stay within 128MB
  if (complexity.attachmentCount > 3) {
    maxMessages = Math.min(maxMessages, 50);
    maxAttachmentContentSize = Math.min(maxAttachmentContentSize, 5 * 1024 * 1024); // 5MB per file
  }

  if (complexity.hasRag && complexity.hasWebSearch) {
    maxMessages = Math.min(maxMessages, 50);
    maxAttachments = Math.min(maxAttachments, 3);
    maxRagResults = Math.min(maxRagResults, 2);
  }

  if (complexity.messageCount > 50) {
    maxAttachments = Math.min(maxAttachments, 3);
    maxAttachmentContentSize = Math.min(maxAttachmentContentSize, 5 * 1024 * 1024); // 5MB per file
  }

  // If everything is enabled, use minimal limits to fit in 128MB
  if (complexity.hasRag && complexity.hasWebSearch && complexity.attachmentCount > 0 && complexity.messageCount > 30) {
    maxMessages = 30;
    maxAttachments = 2;
    maxAttachmentContentSize = 3 * 1024 * 1024; // 3MB per file
    maxRagResults = 2;
  }

  return {
    ...base,
    maxMessages,
    maxAttachments,
    maxAttachmentContentSize,
    maxRagResults,
  };
}

// ============================================================================
// Memory-Safe Operations
// ============================================================================

/**
 * Truncate string to fit within memory budget
 */
export function truncateToMemoryBudget(str: string, maxBytes: number): string {
  const maxChars = Math.floor(maxBytes / 2); // 2 bytes per char
  if (str.length <= maxChars) {
    return str;
  }
  return `${str.slice(0, maxChars - 20)}\n... (truncated for memory safety)`;
}

/**
 * Safely slice array to fit within budget
 */
export function safeSlice<T>(arr: T[], maxItems: number, estimateFn?: (item: T) => number, maxTotalBytes?: number): T[] {
  if (arr.length <= maxItems && !maxTotalBytes) {
    return arr;
  }

  const result: T[] = [];
  let totalBytes = 0;

  for (let i = 0; i < Math.min(arr.length, maxItems); i++) {
    const item = arr[i];
    if (!item) {
      continue;
    }

    if (estimateFn && maxTotalBytes) {
      const itemSize = estimateFn(item);
      if (totalBytes + itemSize > maxTotalBytes) {
        break;
      }
      totalBytes += itemSize;
    }

    result.push(item);
  }

  return result;
}

// ============================================================================
// Error Types
// ============================================================================

export class MemoryBudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly allocated: number,
    public readonly budget: number,
    public readonly operation: string,
  ) {
    super(message);
    this.name = 'MemoryBudgetExceededError';
  }
}

/**
 * Create a user-friendly error for memory exhaustion
 */
export function createMemoryError(operation: string, tracker: MemoryBudgetTracker): MemoryBudgetExceededError {
  const summary = tracker.getSummary();
  return new MemoryBudgetExceededError(
    `Memory budget exceeded during ${operation}. `
    + `Allocated: ${(summary.total / 1024 / 1024).toFixed(2)}MB, `
    + `Budget: ${(summary.remaining / 1024 / 1024).toFixed(2)}MB remaining. `
    + `Try reducing conversation length or attachment count.`,
    summary.total,
    summary.total + summary.remaining,
    operation,
  );
}

// ============================================================================
// Exports
// ============================================================================

export const MemorySafety = {
  // Constants
  WORKER_MEMORY_LIMIT,
  SAFE_REQUEST_MEMORY_BUDGET,
  CRITICAL_MEMORY_THRESHOLD,
  MAX_SINGLE_ALLOCATION,

  // Classes
  MemoryBudgetTracker,
  MemoryBudgetExceededError,

  // Estimation
  estimateStringSize,
  estimateStringArraySize,
  estimateObjectSize,
  estimateBinarySize,
  estimateBase64Size,
  estimateMessageSize,
  estimateFileContentMemory,

  // Dynamic scaling
  calculateDynamicLimits,

  // Safe operations
  truncateToMemoryBudget,
  safeSlice,

  // Errors
  createMemoryError,
};
