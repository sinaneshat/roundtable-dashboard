/**
 * Auto-Link Service
 *
 * Automatically links uploads from chat threads to their parent project.
 * When a user uploads files in a project thread, this service:
 * 1. Creates projectAttachment records
 * 2. Copies files to project R2 folder for AI Search indexing
 */

import { DEFAULT_PROJECT_INDEX_STATUS } from '@roundtable/shared/enums';
import { and, eq, inArray } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { getDbAsync } from '@/db';
import * as tables from '@/db/tables';
import { generateProjectFileR2Key } from '@/services/search';
import { copyFile } from '@/services/uploads';

export type AutoLinkParams = {
  db: Awaited<ReturnType<typeof getDbAsync>>;
  projectId: string;
  uploadIds: string[];
  userId: string;
  r2Bucket: R2Bucket | undefined;
  executionCtx?: { waitUntil: (promise: Promise<unknown>) => void };
};

/**
 * Auto-link uploads to a project
 *
 * Creates projectAttachment records and copies files to project R2 folder.
 * Runs in background via waitUntil when executionCtx is provided.
 */
export async function autoLinkUploadsToProject(params: AutoLinkParams): Promise<void> {
  const { db, projectId, uploadIds, userId, r2Bucket, executionCtx } = params;

  if (uploadIds.length === 0)
    return;

  // 1. Verify project exists
  const project = await db.query.chatProject.findFirst({
    where: eq(tables.chatProject.id, projectId),
    columns: { id: true },
  });
  if (!project)
    return;

  // 2. Get upload details
  const uploads = await db.query.upload.findMany({
    where: inArray(tables.upload.id, uploadIds),
    columns: { id: true, filename: true, r2Key: true },
  });
  if (uploads.length === 0)
    return;

  // 3. Filter out already-linked uploads (avoid duplicates)
  const existing = await db.query.projectAttachment.findMany({
    where: and(
      eq(tables.projectAttachment.projectId, projectId),
      inArray(tables.projectAttachment.uploadId, uploadIds),
    ),
    columns: { uploadId: true },
  });
  const existingSet = new Set(existing.map(a => a.uploadId));
  const newUploads = uploads.filter(u => !existingSet.has(u.id));
  if (newUploads.length === 0)
    return;

  // 4. Create project attachments + copy files to project R2 folder
  const now = new Date();
  const attachments = newUploads.map(upload => ({
    id: ulid(),
    projectId,
    uploadId: upload.id,
    addedBy: userId,
    indexStatus: DEFAULT_PROJECT_INDEX_STATUS,
    ragMetadata: {
      context: 'Auto-linked from chat upload',
      projectR2Key: generateProjectFileR2Key(projectId, upload.filename),
    },
    createdAt: now,
    updatedAt: now,
  }));

  const runTask = async () => {
    // Copy files to project folder (for AI Search)
    await Promise.all(newUploads.map(upload =>
      copyFile(
        r2Bucket,
        upload.r2Key,
        generateProjectFileR2Key(projectId, upload.filename),
      ).catch(() => {}), // Silent failure - don't block the flow
    ));

    // Insert project attachment records
    await db.insert(tables.projectAttachment)
      .values(attachments)
      .onConflictDoNothing();
  };

  if (executionCtx) {
    executionCtx.waitUntil(runTask());
  } else {
    await runTask();
  }
}
