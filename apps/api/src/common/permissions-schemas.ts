/**
 * Permission Verification Type Schemas
 *
 * Zod-first schemas for ownership verification return types
 * Following the type-inference-patterns.md pattern
 */

import * as z from 'zod';

import { chatParticipantSelectSchema, chatThreadSelectSchema } from '@/db/validation/chat';

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
