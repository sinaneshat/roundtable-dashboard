/**
 * Instruction Memory Service
 *
 * Syncs project custom instructions to a project memory entry.
 * When custom instructions are set/updated, this creates or updates
 * a corresponding memory that can be cited by AI participants.
 */

import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { getDbAsync } from '@/db';
import * as tables from '@/db/tables';
import { log } from '@/lib/logger';

const INSTRUCTION_MEMORY_SUMMARY = 'Project Custom Instructions';
const INSTRUCTION_MEMORY_IMPORTANCE = 10; // Highest importance
const INSTRUCTION_SOURCE = 'instruction' as const;

export type SyncInstructionMemoryParams = {
  db: Awaited<ReturnType<typeof getDbAsync>>;
  projectId: string;
  customInstructions: string | null;
  userId: string;
};

/**
 * Sync custom instructions to a project memory.
 *
 * - If instructions are provided: creates/updates the instruction memory
 * - If instructions are null/empty: deactivates any existing instruction memory
 *
 * The memory is marked with source='instruction' and highest importance (10)
 * so it appears at the top of project context.
 */
export async function syncInstructionMemory(params: SyncInstructionMemoryParams): Promise<void> {
  const { customInstructions, db, projectId, userId } = params;

  log.db('sync', 'syncInstructionMemory called', {
    hasInstructions: !!customInstructions,
    instructionLength: customInstructions?.length ?? 0,
    projectId,
    userId,
  });

  // Find existing instruction memory for this project
  const existingMemory = await db.query.projectMemory.findFirst({
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.source, INSTRUCTION_SOURCE),
    ),
  });

  log.db('check', 'Existing memory check', {
    existingId: existingMemory?.id,
    existingIsActive: existingMemory?.isActive,
    hasExisting: !!existingMemory,
    projectId,
  });

  const now = new Date();

  if (!customInstructions || customInstructions.trim().length === 0) {
    // No instructions - deactivate existing memory if any
    if (existingMemory?.isActive) {
      log.db('deactivate', 'Deactivating existing memory', {
        memoryId: existingMemory.id,
        projectId,
      });
      await db
        .update(tables.projectMemory)
        .set({
          isActive: false,
          updatedAt: now,
        })
        .where(eq(tables.projectMemory.id, existingMemory.id));
    }
    return;
  }

  // Instructions provided - create or update memory
  if (existingMemory) {
    // Update existing memory
    log.db('update', 'Updating existing memory', {
      instructionLength: customInstructions.length,
      memoryId: existingMemory.id,
      projectId,
    });
    await db
      .update(tables.projectMemory)
      .set({
        content: customInstructions,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(tables.projectMemory.id, existingMemory.id));
    log.db('done', 'Memory updated successfully', { memoryId: existingMemory.id, projectId });
  } else {
    // Create new instruction memory
    const newMemoryId = ulid();
    log.db('create', 'Creating new memory', {
      instructionLength: customInstructions.length,
      newMemoryId,
      projectId,
    });
    await db.insert(tables.projectMemory).values({
      content: customInstructions,
      createdAt: now,
      createdBy: userId,
      id: newMemoryId,
      importance: INSTRUCTION_MEMORY_IMPORTANCE,
      isActive: true,
      projectId,
      source: 'instruction',
      summary: INSTRUCTION_MEMORY_SUMMARY,
      updatedAt: now,
    });
    log.db('done', 'Memory created successfully', { newMemoryId, projectId });
  }
}
