/**
 * Feedback Enums
 *
 * Enums for user feedback on AI responses and rounds.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// FEEDBACK TYPE (Basic like/dislike)
// ============================================================================

export const FEEDBACK_TYPES = ['like', 'dislike'] as const;

export const FeedbackTypeSchema = z.enum(FEEDBACK_TYPES).openapi({
  description: 'User feedback type for a conversation round',
  example: 'like',
});

export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

export const FeedbackTypes = {
  LIKE: 'like' as const,
  DISLIKE: 'dislike' as const,
} as const;

// ============================================================================
// ROUND FEEDBACK VALUE (includes 'none' for clearing feedback)
// ============================================================================

export const RoundFeedbackValueSchema = z.enum(['like', 'dislike', 'none']).openapi({
  description: 'User feedback value for a round (none clears feedback)',
  example: 'like',
});

export type RoundFeedbackValue = z.infer<typeof RoundFeedbackValueSchema>;

export const RoundFeedbackValues = {
  LIKE: 'like' as const,
  DISLIKE: 'dislike' as const,
  NONE: 'none' as const,
} as const;
