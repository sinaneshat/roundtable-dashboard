/**
 * Thread Schemas - Single Source of Truth for Thread UI Types
 *
 * ✅ CONSOLIDATES: Repeated inline thread type definitions
 *
 * REPLACES hardcoded types in:
 * - command-search.tsx
 * - thread list components
 *
 * @see /docs/backend-patterns.md - Zero-casting principle
 */

import { z } from 'zod';

// ============================================================================
// THREAD UI SCHEMAS
// ============================================================================

/**
 * ✅ Thread list item for command search and quick actions
 * Minimal thread data needed for lists/search
 */
export const ThreadListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  updatedAt: z.string(),
  isFavorite: z.boolean().nullable().optional(),
});

export type ThreadListItem = z.infer<typeof ThreadListItemSchema>;

/**
 * ✅ Thread reference with metadata
 * Used in components that need additional thread context
 */
export const ThreadReferenceSchema = ThreadListItemSchema.extend({
  mode: z.string(),
  status: z.string(),
  participantCount: z.number().optional(),
});

export type ThreadReference = z.infer<typeof ThreadReferenceSchema>;
