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
  const { db, projectId, customInstructions, userId } = params;

  console.error('[Instruction Memory] syncInstructionMemory called', {
    projectId,
    userId,
    hasInstructions: !!customInstructions,
    instructionLength: customInstructions?.length ?? 0,
  });

  // Find existing instruction memory for this project
  const existingMemory = await db.query.projectMemory.findFirst({
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.source, INSTRUCTION_SOURCE),
    ),
  });

  console.error('[Instruction Memory] Existing memory check', {
    projectId,
    hasExisting: !!existingMemory,
    existingId: existingMemory?.id,
    existingIsActive: existingMemory?.isActive,
  });

  const now = new Date();

  if (!customInstructions || customInstructions.trim().length === 0) {
    // No instructions - deactivate existing memory if any
    if (existingMemory && existingMemory.isActive) {
      console.error('[Instruction Memory] Deactivating existing memory', {
        projectId,
        memoryId: existingMemory.id,
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
    console.error('[Instruction Memory] Updating existing memory', {
      projectId,
      memoryId: existingMemory.id,
      instructionLength: customInstructions.length,
    });
    await db
      .update(tables.projectMemory)
      .set({
        content: customInstructions,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(tables.projectMemory.id, existingMemory.id));
    console.error('[Instruction Memory] Memory updated successfully', { projectId, memoryId: existingMemory.id });
  } else {
    // Create new instruction memory
    const newMemoryId = ulid();
    console.error('[Instruction Memory] Creating new memory', {
      projectId,
      newMemoryId,
      instructionLength: customInstructions.length,
    });
    await db.insert(tables.projectMemory).values({
      id: newMemoryId,
      projectId,
      content: customInstructions,
      summary: INSTRUCTION_MEMORY_SUMMARY,
      source: 'instruction',
      importance: INSTRUCTION_MEMORY_IMPORTANCE,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    console.error('[Instruction Memory] Memory created successfully', { projectId, newMemoryId });
  }
}
