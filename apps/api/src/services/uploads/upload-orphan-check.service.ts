/**
 * Upload Orphan Check Service
 *
 * Database operations for orphan detection and cleanup following backend-patterns.md.
 * DO-compatible - used by UploadCleanupScheduler Durable Object.
 *
 * Import schema tables directly from @/db/tables/ (NOT @/db) to avoid Node.js modules.
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import * as z from 'zod';

import * as chatTables from '@/db/tables/chat';
import * as projectTables from '@/db/tables/project';
import * as uploadTables from '@/db/tables/upload';

const schema = {
  ...chatTables,
  ...projectTables,
  ...uploadTables,
};

// ============================================================================
// TYPES (Zod inference)
// ============================================================================

type DrizzleD1Database = ReturnType<typeof drizzle<typeof schema>>;

export const OrphanCheckResultSchema = z.object({
  isOrphaned: z.boolean(),
  messageCount: z.number().int().nonnegative(),
  threadCount: z.number().int().nonnegative(),
  projectCount: z.number().int().nonnegative(),
});

export type OrphanCheckResult = z.infer<typeof OrphanCheckResultSchema>;

// ============================================================================
// DATABASE FACTORY
// ============================================================================

export function createDrizzleFromD1(d1: D1Database): DrizzleD1Database {
  return drizzle(d1, { schema });
}

// ============================================================================
// ORPHAN CHECK
// ============================================================================

export async function checkUploadOrphaned(
  uploadId: string,
  db: DrizzleD1Database,
): Promise<OrphanCheckResult> {
  const [messageUploads, threadUploads, projectAttachments] = await Promise.all([
    db.query.messageUpload.findMany({
      where: eq(schema.messageUpload.uploadId, uploadId),
      columns: { id: true },
    }),
    db.query.threadUpload.findMany({
      where: eq(schema.threadUpload.uploadId, uploadId),
      columns: { id: true },
    }),
    db.query.projectAttachment.findMany({
      where: eq(schema.projectAttachment.uploadId, uploadId),
      columns: { id: true },
    }),
  ]);

  const messageCount = messageUploads.length;
  const threadCount = threadUploads.length;
  const projectCount = projectAttachments.length;
  const totalReferences = messageCount + threadCount + projectCount;

  return {
    isOrphaned: totalReferences === 0,
    messageCount,
    threadCount,
    projectCount,
  };
}

// ============================================================================
// DELETION
// ============================================================================

export async function deleteUploadRecord(
  uploadId: string,
  db: DrizzleD1Database,
): Promise<void> {
  await db.delete(uploadTables.upload).where(eq(uploadTables.upload.id, uploadId));
}

export async function deleteFromR2(
  bucket: R2Bucket,
  r2Key: string,
): Promise<boolean> {
  try {
    await bucket.delete(r2Key);
    return true;
  } catch {
    return false;
  }
}

export async function deleteOrphanedUpload(
  uploadId: string,
  r2Key: string,
  bucket: R2Bucket,
  db: DrizzleD1Database,
): Promise<{ r2Deleted: boolean; dbDeleted: boolean }> {
  const r2Deleted = await deleteFromR2(bucket, r2Key);

  try {
    await deleteUploadRecord(uploadId, db);
    return { r2Deleted, dbDeleted: true };
  } catch {
    return { r2Deleted, dbDeleted: false };
  }
}
