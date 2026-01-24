/**
 * Permission Verification Type Schemas
 *
 * Zod-first schemas for ownership verification return types
 * Following the type-inference-patterns.md pattern
 */

import * as z from 'zod';

import { chatParticipantSelectSchema, chatThreadSelectSchema } from '@/db/validation/chat';
import { chatProjectSelectSchema } from '@/db/validation/project';

// ============================================================================
// THREAD SCHEMAS
// ============================================================================

/**
 * Thread with participants - return type for verifyThreadOwnership with includeParticipants: true
 */
export const ThreadWithParticipantsSchema = chatThreadSelectSchema.extend({
  participants: z.array(chatParticipantSelectSchema),
});

export type ThreadWithParticipants = z.infer<typeof ThreadWithParticipantsSchema>;

/**
 * Participant with thread - return type for verifyParticipantOwnership
 */
export const ParticipantWithThreadSchema = chatParticipantSelectSchema.extend({
  thread: chatThreadSelectSchema,
});

export type ParticipantWithThread = z.infer<typeof ParticipantWithThreadSchema>;

// ============================================================================
// PROJECT SCHEMAS
// ============================================================================

/**
 * Project with attachments - return type for verifyProjectOwnership with includeAttachments: true
 */
export const ProjectWithAttachmentsSchema = chatProjectSelectSchema.extend({
  attachments: z.array(z.object({ id: z.string() })),
});

export type ProjectWithAttachments = z.infer<typeof ProjectWithAttachmentsSchema>;

/**
 * Project with threads - return type for verifyProjectOwnership with includeThreads: true
 */
export const ProjectWithThreadsSchema = chatProjectSelectSchema.extend({
  threads: z.array(z.object({ id: z.string() })),
});

export type ProjectWithThreads = z.infer<typeof ProjectWithThreadsSchema>;

/**
 * Project with counts - return type for verifyProjectOwnership with includeAttachments + includeThreads
 */
export const ProjectWithCountsSchema = chatProjectSelectSchema.extend({
  attachments: z.array(z.object({ id: z.string() })),
  threads: z.array(z.object({ id: z.string() })),
});

export type ProjectWithCounts = z.infer<typeof ProjectWithCountsSchema>;

/**
 * Project with memories - return type for verifyProjectOwnership with includeMemories: true
 */
export const ProjectWithMemoriesSchema = chatProjectSelectSchema.extend({
  memories: z.array(z.object({ id: z.string() })),
});

export type ProjectWithMemories = z.infer<typeof ProjectWithMemoriesSchema>;
