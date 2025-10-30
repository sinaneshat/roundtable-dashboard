/**
 * AI SDK v5 Data Parts Utilities
 *
 * Helpers for working with custom data parts in AI SDK v5 streams.
 * Prevents common ID reuse bugs and simplifies data part management.
 *
 * Key AI SDK v5 Patterns:
 * - Custom Data Parts: Stream arbitrary data alongside text
 * - ID Management: Unique IDs prevent frontend race conditions
 * - Type-safe data streaming with Zod schemas
 *
 * Common Bug Prevention:
 * - ID Reuse: Each data part MUST have unique ID within a stream
 * - Timing: Data parts can arrive before/after/during text chunks
 * - Type Safety: Use Zod schemas for data part validation
 *
 * @module lib/ai/data-parts
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/streaming-data
 * @see exercises/07-streaming/07.01-custom-data-parts in AI SDK v5 course
 */

import { generateId } from 'ai';

// ============================================================================
// ID Generation for Data Parts
// ============================================================================

/**
 * Create ID generator for data parts
 *
 * Wrapper around AI SDK's generateId() with clear naming.
 * CRITICAL: Each data part needs a unique ID to prevent frontend conflicts.
 *
 * AI SDK v5 Pattern:
 * - generateId() returns a unique ID string
 * - IDs are random strings for uniqueness
 * - Prevents ID reuse bugs in streaming custom data
 *
 * Common Bug:
 * ❌ Reusing same ID → Frontend overwrites previous data
 * ✅ Unique ID per data part → All data preserved correctly
 *
 * @param prefix - Optional prefix for generated IDs
 * @returns Function that generates unique IDs
 *
 * @example
 * ```typescript
 * const generateAnalysisId = createDataPartIdGenerator('analysis');
 * const id1 = generateAnalysisId(); // "analysis-<random>"
 * const id2 = generateAnalysisId(); // "analysis-<random>"
 * const id3 = generateAnalysisId(); // "analysis-<random>"
 * ```
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-core/generate-id
 */
export function createDataPartIdGenerator(prefix?: string): () => string {
  if (!prefix) {
    return generateId;
  }

  return () => `${prefix}-${generateId()}`;
}

/**
 * Create scoped ID generator for specific data part type
 *
 * Convenience wrapper for common data part types in the application.
 * Provides semantic naming for different data part categories.
 *
 * @param type - Data part type (analysis, tool, metadata, etc.)
 * @returns Function that generates unique IDs for that type
 *
 * @example
 * ```typescript
 * const generateAnalysisId = createScopedIdGenerator('analysis');
 * const generateToolId = createScopedIdGenerator('tool');
 *
 * const analysisId = generateAnalysisId(); // "analysis-0"
 * const toolId = generateToolId(); // "tool-0"
 * ```
 */
export function createScopedIdGenerator(
  type: 'analysis' | 'tool' | 'metadata' | 'progress' | 'custom',
): () => string {
  return createDataPartIdGenerator(type);
}

// ============================================================================
// Data Part Creation Helpers
// ============================================================================

/**
 * Create streaming data part with auto-generated ID
 *
 * Simplifies data part creation by handling ID generation automatically.
 * Ensures each data part has a unique ID within the stream.
 *
 * AI SDK v5 Pattern:
 * - Data parts sent via stream.writeData()
 * - Each part needs: { id, type, data }
 * - Frontend receives via useChat's data prop
 *
 * @param type - Data part type identifier
 * @param data - Data payload (any JSON-serializable object)
 * @param idGenerator - Optional custom ID generator
 * @returns Data part object ready for streaming
 *
 * @example
 * ```typescript
 * const analysisIdGen = createScopedIdGenerator('analysis');
 *
 * // In streaming handler
 * const part1 = createStreamingDataPart('analysis', { step: 1 }, analysisIdGen);
 * const part2 = createStreamingDataPart('analysis', { step: 2 }, analysisIdGen);
 *
 * stream.writeData(part1);
 * stream.writeData(part2);
 * ```
 *
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/streaming-data#streaming-custom-data
 */
export function createStreamingDataPart<T = unknown>(
  type: string,
  data: T,
  idGenerator?: () => string,
): { id: string; type: string; data: T } {
  const id = idGenerator ? idGenerator() : generateId();

  return {
    id,
    type,
    data,
  };
}

/**
 * Create multiple data parts with sequential IDs
 *
 * Batch creation helper for multiple related data parts.
 * Ensures all parts in the batch have unique sequential IDs.
 *
 * @param type - Data part type identifier
 * @param dataArray - Array of data payloads
 * @param idGenerator - Optional custom ID generator
 * @returns Array of data part objects ready for streaming
 *
 * @example
 * ```typescript
 * const analysisSteps = [
 *   { step: 1, status: 'analyzing' },
 *   { step: 2, status: 'analyzing' },
 *   { step: 3, status: 'analyzing' }
 * ];
 *
 * const parts = createMultipleDataParts('analysis', analysisSteps);
 * // Returns: [
 * //   { id: '0', type: 'analysis', data: { step: 1, ... } },
 * //   { id: '1', type: 'analysis', data: { step: 2, ... } },
 * //   { id: '2', type: 'analysis', data: { step: 3, ... } }
 * // ]
 *
 * for (const part of parts) {
 *   stream.writeData(part);
 * }
 * ```
 */
export function createMultipleDataParts<T = unknown>(
  type: string,
  dataArray: T[],
  idGenerator?: () => string,
): Array<{ id: string; type: string; data: T }> {
  const generator = idGenerator || generateId;

  return dataArray.map(data => ({
    id: generator(),
    type,
    data,
  }));
}

// ============================================================================
// Data Part Validation
// ============================================================================

/**
 * Validate data part structure
 *
 * Ensures data part has required fields and proper types.
 * Used for runtime validation of custom data parts.
 *
 * @param part - Data part object to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * ```typescript
 * const part = { id: '0', type: 'analysis', data: { step: 1 } };
 *
 * if (isValidDataPart(part)) {
 *   stream.writeData(part);
 * }
 * ```
 */
export function isValidDataPart(part: unknown): part is {
  id: string;
  type: string;
  data: unknown;
} {
  if (typeof part !== 'object' || part === null) {
    return false;
  }

  const obj = part as Record<string, unknown>;

  return (
    typeof obj.id === 'string'
    && typeof obj.type === 'string'
    && 'data' in obj
  );
}

/**
 * Validate array of data parts
 *
 * Ensures all items in array are valid data parts.
 * Also checks for duplicate IDs within the array.
 *
 * @param parts - Array of data part objects to validate
 * @returns Validation result with error details
 *
 * @example
 * ```typescript
 * const result = validateDataParts(parts);
 *
 * if (!result.valid) {
 *   throw new Error('Invalid data parts');
 * }
 * ```
 */
export function validateDataParts(
  parts: unknown[],
): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!isValidDataPart(part)) {
      errors.push(`Item at index ${i} is not a valid data part`);
      continue;
    }

    if (seenIds.has(part.id)) {
      errors.push(`Duplicate ID "${part.id}" at index ${i}`);
    }

    seenIds.add(part.id);
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true };
}

// ============================================================================
// Data Part Type Helpers
// ============================================================================

/**
 * Type guard for specific data part type
 *
 * Narrows data part type based on the type field.
 * Useful for handling different data part types in frontend.
 *
 * @param part - Data part object
 * @param part.id - Unique identifier for the data part
 * @param part.type - Type identifier string
 * @param part.data - The actual data payload
 * @param type - Expected type string
 * @returns True if part matches type
 *
 * @example
 * ```typescript
 * if (isDataPartType(part, 'analysis')) {
 *   // TypeScript knows part.data has analysis-specific shape
 *   const step = part.data.step;
 * }
 * ```
 */
export function isDataPartType<T = unknown>(
  part: { id: string; type: string; data: unknown },
  type: string,
): part is { id: string; type: string; data: T } {
  return part.type === type;
}

/**
 * Filter data parts by type
 *
 * Extracts all data parts matching a specific type.
 * Useful for processing specific data part categories.
 *
 * @param parts - Array of data part objects
 * @param type - Type to filter by
 * @returns Array of matching data parts
 *
 * @example
 * ```typescript
 * const allParts = [
 *   { id: '0', type: 'analysis', data: { step: 1 } },
 *   { id: '1', type: 'tool', data: { name: 'search' } },
 *   { id: '2', type: 'analysis', data: { step: 2 } }
 * ];
 *
 * const analysisParts = filterDataPartsByType(allParts, 'analysis');
 * // Returns: [
 * //   { id: '0', type: 'analysis', data: { step: 1 } },
 * //   { id: '2', type: 'analysis', data: { step: 2 } }
 * // ]
 * ```
 */
export function filterDataPartsByType<T = unknown>(
  parts: Array<{ id: string; type: string; data: unknown }>,
  type: string,
): Array<{ id: string; type: string; data: T }> {
  return parts.filter(part => part.type === type) as Array<{
    id: string;
    type: string;
    data: T;
  }>;
}

// ============================================================================
// Usage Example Pattern (Reference)
// ============================================================================

/**
 * Example: Streaming analysis progress with data parts
 *
 * This example demonstrates proper ID management for streaming custom data.
 * Prevents the common bug of ID reuse causing frontend data overwrites.
 *
 * @example
 * ```typescript
 * // In API handler
 * import { createScopedIdGenerator, createStreamingDataPart } from '@/lib/ai/data-parts';
 * import { streamText } from 'ai';
 *
 * export const handler = async (c) => {
 *   // Create ID generator for analysis steps
 *   const generateAnalysisId = createScopedIdGenerator('analysis');
 *
 *   const result = await streamText({
 *     model,
 *     messages,
 *     async onChunk({ chunk }) {
 *       // Stream progress data with unique IDs
 *       const progressPart = createStreamingDataPart(
 *         'analysis',
 *         {
 *           step: chunk.step,
 *           status: 'processing',
 *           timestamp: Date.now()
 *         },
 *         generateAnalysisId
 *       );
 *
 *       // Each data part has unique ID: 'analysis-0', 'analysis-1', etc.
 *       stream.writeData(progressPart);
 *     }
 *   });
 *
 *   return result.toUIMessageStreamResponse();
 * };
 * ```
 *
 * ```typescript
 * // In frontend
 * import { useChat } from 'ai/react';
 *
 * const { messages, data } = useChat({
 *   api: '/api/chat'
 * });
 *
 * // Access streamed data parts
 * const analysisParts = filterDataPartsByType(data || [], 'analysis');
 * analysisParts.forEach(part => {
 *   const step = part.data.step;
 * });
 * ```
 */
