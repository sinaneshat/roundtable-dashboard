/**
 * Session Tracking Service
 *
 * Manages roundtable session identification with normalized schema.
 * A session = 1 user prompt + all participant responses
 *
 * Following backend patterns from docs/backend-patterns.md
 * Using normalized tables for optimal query performance (Drizzle best practices)
 */

import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { z } from 'zod';

import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import type { ChatModeId } from '@/lib/config/chat-modes';

/**
 * ✅ Zod Schema for Session Creation Parameters
 * Following Drizzle + Zod best practices for type-safe API inputs
 */
export const createSessionParamsSchema = z.object({
  threadId: z.string().min(1),
  sessionNumber: z.number().int().positive(),
  mode: z.string(),
  userMessageId: z.string().min(1),
  userPrompt: z.string().min(1),
  participants: z.array(z.object({
    id: z.string().min(1),
    modelId: z.string(),
    role: z.string().nullable(),
    priority: z.number().int().min(0),
  })),
  memories: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(200),
  })),
});

export type CreateSessionParams = z.infer<typeof createSessionParamsSchema>;

/**
 * Create a new chat session
 *
 * Creates the session record and all junction table entries for participants and memories.
 * This provides full referential integrity and enables powerful querying.
 *
 * @param params - Session creation parameters (validated via Zod schema)
 * @returns Created session ID
 *
 * @example
 * ```typescript
 * const sessionId = await createSession({
 *   threadId: 'thread_123',
 *   sessionNumber: 1,
 *   mode: 'brainstorming',
 *   userMessageId: 'msg_456',
 *   userPrompt: 'How can we improve performance?',
 *   participants: [...],
 *   memories: [...],
 * });
 * ```
 */
export async function createSession(params: CreateSessionParams): Promise<string> {
  const db = await getDbAsync();
  const sessionId = ulid();
  const now = new Date();

  // Create session record
  await db.insert(tables.chatSession).values({
    id: sessionId,
    threadId: params.threadId,
    sessionNumber: params.sessionNumber,
    mode: params.mode as ChatModeId,
    userPrompt: params.userPrompt,
    userMessageId: params.userMessageId,
    createdAt: now,
    completedAt: null, // Will be set when all participants respond
  });

  // Create session participant entries (junction table)
  if (params.participants.length > 0) {
    await db.insert(tables.chatSessionParticipant).values(
      params.participants.map(p => ({
        id: ulid(),
        sessionId,
        participantId: p.id,
        modelId: p.modelId, // Denormalized for fast queries
        role: p.role,
        priority: p.priority,
        responded: false, // Will be set to true when they complete
      })),
    );
  }

  // Create session memory entries (junction table)
  if (params.memories.length > 0) {
    await db.insert(tables.chatSessionMemory).values(
      params.memories.map(m => ({
        id: ulid(),
        sessionId,
        memoryId: m.id,
        memoryTitle: m.title, // Denormalized for display without joins
      })),
    );
  }

  return sessionId;
}

/**
 * Get the current session number for a thread
 *
 * Counts existing sessions + 1 for the new session number.
 * More efficient than counting user messages.
 *
 * @param threadId - Thread ID
 * @returns Next session number (1, 2, 3, ...)
 */
export async function getNextSessionNumber(
  threadId: string,
): Promise<number> {
  const db = await getDbAsync();

  const existingSessions = await db.query.chatSession.findMany({
    where: eq(tables.chatSession.threadId, threadId),
    columns: { id: true },
  });

  return existingSessions.length + 1;
}

/**
 * Get the current session for a thread (most recent)
 *
 * Returns null if no sessions exist yet.
 *
 * @param threadId - Thread ID
 * @returns Session with participants and memories, or null
 */
export async function getCurrentSession(
  threadId: string,
): Promise<{
  id: string;
  sessionNumber: number;
  mode: string;
  participants: Array<{
    id: string;
    participantId: string;
    modelId: string;
    role: string | null;
    priority: number;
    responded: boolean;
  }>;
  memories: Array<{
    id: string;
    memoryId: string;
    memoryTitle: string;
  }>;
} | null> {
  const db = await getDbAsync();

  const session = await db.query.chatSession.findFirst({
    where: eq(tables.chatSession.threadId, threadId),
    orderBy: [desc(tables.chatSession.sessionNumber)],
    with: {
      sessionParticipants: true,
      sessionMemories: true,
    },
  });

  if (!session) {
    return null;
  }

  return {
    id: session.id,
    sessionNumber: session.sessionNumber,
    mode: session.mode,
    participants: session.sessionParticipants.map(sp => ({
      id: sp.id,
      participantId: sp.participantId,
      modelId: sp.modelId,
      role: sp.role,
      priority: sp.priority,
      responded: sp.responded,
    })),
    memories: session.sessionMemories.map(sm => ({
      id: sm.id,
      memoryId: sm.memoryId,
      memoryTitle: sm.memoryTitle,
    })),
  };
}

/**
 * Mark a participant as having responded in a session
 *
 * Updates the junction table to track completion.
 * When all participants have responded, marks the session as completed.
 *
 * @param sessionId - Session ID
 * @param participantId - Participant ID
 */
export async function markParticipantResponded(
  sessionId: string,
  participantId: string,
): Promise<void> {
  const db = await getDbAsync();

  // Mark this participant as responded
  await db
    .update(tables.chatSessionParticipant)
    .set({ responded: true })
    .where(
      and(
        eq(tables.chatSessionParticipant.sessionId, sessionId),
        eq(tables.chatSessionParticipant.participantId, participantId),
      ),
    );

  // Check if all participants have responded
  const sessionParticipants = await db.query.chatSessionParticipant.findMany({
    where: eq(tables.chatSessionParticipant.sessionId, sessionId),
    columns: { responded: true },
  });

  const allResponded = sessionParticipants.every(sp => sp.responded);

  if (allResponded) {
    // Mark session as completed
    await db
      .update(tables.chatSession)
      .set({ completedAt: new Date() })
      .where(eq(tables.chatSession.id, sessionId));
  }
}

/**
 * Get session data for a message
 *
 * Helper to retrieve full session context when you only have a message.
 * Used by frontend to display session metadata.
 *
 * @param messageId - Message ID
 * @returns Session data or null if message doesn't belong to a session
 */
export async function getSessionForMessage(
  messageId: string,
): Promise<{
  sessionNumber: number;
  mode: string;
  participants: Array<{
    modelId: string;
    role: string | null;
    priority: number;
  }>;
  memoryTitles: string[];
} | null> {
  const db = await getDbAsync();

  const message = await db.query.chatMessage.findFirst({
    where: eq(tables.chatMessage.id, messageId),
    columns: { sessionId: true },
    with: {
      session: {
        with: {
          sessionParticipants: {
            columns: {
              modelId: true,
              role: true,
              priority: true,
            },
            orderBy: [tables.chatSessionParticipant.priority],
          },
          sessionMemories: {
            columns: {
              memoryTitle: true,
            },
          },
        },
      },
    },
  });

  if (!message?.session) {
    return null;
  }

  return {
    sessionNumber: message.session.sessionNumber,
    mode: message.session.mode,
    participants: message.session.sessionParticipants.map(sp => ({
      modelId: sp.modelId,
      role: sp.role,
      priority: sp.priority,
    })),
    memoryTitles: message.session.sessionMemories.map(sm => sm.memoryTitle),
  };
}
