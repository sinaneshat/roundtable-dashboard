/**
 * Upload Orphan Check Service
 *
 * Provides database operations for checking if uploads are orphaned
 * (not attached to any message/thread/project) and cleaning them up.
 *
 * Uses Drizzle ORM following established patterns from:
 * - src/api/services/title-generator.service.ts
 * - docs/backend-patterns.md
 *
 * ⚠️ DURABLE OBJECT COMPATIBLE: This service is used by UploadCleanupScheduler DO.
 * Do NOT import from @/db directly as it includes Node.js modules (fs, path)
 * that crash Workers runtime. Import schema tables directly from @/db/tables/.
 *
 * Supports two usage patterns:
 * 1. From API handlers: Use functions without db param (uses getDbAsync())
 * 2. From Durable Objects: Use functions with db param (from createDrizzleFromD1())
 *
 * @see src/workers/upload-cleanup-scheduler.ts - Consumer of this service
 */

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

// ⚠️ DO-COMPATIBLE: Import schema tables directly, NOT from @/db
// The @/db barrel export includes Node.js modules (fs, path) that crash Workers
import * as chatTables from '@/db/tables/chat';
import * as projectTables from '@/db/tables/project';
import * as uploadTables from '@/db/tables/upload';

// Combine schemas needed for this service
const schema = {
  ...chatTables,
  ...projectTables,
  ...uploadTables,
};

// ============================================================================
// TYPES
// ============================================================================

export type OrphanCheckResult = {
  isOrphaned: boolean;
  messageCount: number;
  threadCount: number;
  projectCount: number;
};

/** Drizzle D1 database type for type-safe function signatures */
type DrizzleD1Database = ReturnType<typeof drizzle<typeof schema>>;

// ============================================================================
// DATABASE FACTORY
// ============================================================================

/**
 * Create Drizzle instance from D1 binding
 *
 * For use in Durable Objects where getDbAsync() is not available.
 * Follows the same schema setup as src/db/index.ts
 */
export function createDrizzleFromD1(d1: D1Database): DrizzleD1Database {
  return drizzle(d1, { schema });
}

// ============================================================================
// ORPHAN CHECK
// ============================================================================

/**
 * Check if an upload is orphaned (not attached to any message/thread/project)
 *
 * Uses Drizzle ORM for type-safe queries instead of raw D1 SQL.
 * Following backend-patterns.md - use db.query.* for reads.
 *
 * @param uploadId - The upload ID to check
 * @param db - Required Drizzle database instance. For API handlers, use getDbAsync(). For DOs, use createDrizzleFromD1().
 */
export async function checkUploadOrphaned(
  uploadId: string,
  db: DrizzleD1Database,
): Promise<OrphanCheckResult> {
  const database = db;

  // Check all junction tables for references using Drizzle's relational queries
  const [messageUploads, threadUploads, projectAttachments] = await Promise.all([
    database.query.messageUpload.findMany({
      where: eq(schema.messageUpload.uploadId, uploadId),
      columns: { id: true },
    }),
    database.query.threadUpload.findMany({
      where: eq(schema.threadUpload.uploadId, uploadId),
      columns: { id: true },
    }),
    database.query.projectAttachment.findMany({
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

/**
 * Delete upload record from database
 *
 * Uses Drizzle ORM delete pattern following backend-patterns.md.
 * Note: This only deletes the database record. R2 deletion should be handled separately.
 *
 * @param uploadId - The upload ID to delete
 * @param db - Required Drizzle database instance. For API handlers, use getDbAsync(). For DOs, use createDrizzleFromD1().
 */
export async function deleteUploadRecord(
  uploadId: string,
  db: DrizzleD1Database,
): Promise<void> {
  await db.delete(uploadTables.upload).where(eq(uploadTables.upload.id, uploadId));
}

/**
 * Delete file from R2 storage
 *
 * Wrapper for R2 bucket deletion with error handling.
 * Deletion is best-effort - errors are logged but not thrown.
 */
export async function deleteFromR2(
  bucket: R2Bucket,
  r2Key: string,
): Promise<boolean> {
  try {
    await bucket.delete(r2Key);
    return true;
  } catch (error) {
    console.error(`[UploadCleanup] Failed to delete R2 object ${r2Key}:`, error);
    return false;
  }
}

/**
 * Delete orphaned upload (both R2 file and database record)
 *
 * Combines R2 deletion and database record deletion.
 * R2 deletion is attempted first (best-effort), then database record.
 *
 * @param uploadId - The upload ID to delete
 * @param r2Key - The R2 storage key
 * @param bucket - The R2 bucket binding
 * @param db - Required Drizzle database instance. For API handlers, use getDbAsync(). For DOs, use createDrizzleFromD1().
 */
export async function deleteOrphanedUpload(
  uploadId: string,
  r2Key: string,
  bucket: R2Bucket,
  db: DrizzleD1Database,
): Promise<{ r2Deleted: boolean; dbDeleted: boolean }> {
  // Delete from R2 (best-effort)
  const r2Deleted = await deleteFromR2(bucket, r2Key);

  // Delete from database
  try {
    await deleteUploadRecord(uploadId, db);
    return { r2Deleted, dbDeleted: true };
  } catch (error) {
    console.error(`[UploadCleanup] Failed to delete DB record for ${uploadId}:`, error);
    return { r2Deleted, dbDeleted: false };
  }
}
