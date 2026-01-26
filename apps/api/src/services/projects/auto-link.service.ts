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
import { deductCreditsForAction } from '@/services/billing/credit.service';
import { generateProjectFileR2Key } from '@/services/search';
import { copyFile } from '@/services/uploads';

export type AutoLinkParams = {
  db: Awaited<ReturnType<typeof getDbAsync>>;
  projectId: string;
  uploadIds: string[];
  userId: string;
  r2Bucket: R2Bucket | undefined;
  executionCtx?: { waitUntil: (promise: Promise<unknown>) => void };
  threadId?: string;
};

/**
 * Auto-link uploads to a project
 *
 * Creates projectAttachment records and copies files to project R2 folder.
 * Runs in background via waitUntil when executionCtx is provided.
 */
export async function autoLinkUploadsToProject(params: AutoLinkParams): Promise<void> {
  const { db, executionCtx, projectId, r2Bucket, threadId, uploadIds, userId } = params;

  if (uploadIds.length === 0) {
    return;
  }

  // 1. Verify project exists
  const project = await db.query.chatProject.findFirst({
    columns: { id: true },
    where: eq(tables.chatProject.id, projectId),
  });
  if (!project) {
    return;
  }

  // 2. Get upload details
  const uploads = await db.query.upload.findMany({
    columns: { filename: true, id: true, r2Key: true },
    where: inArray(tables.upload.id, uploadIds),
  });
  if (uploads.length === 0) {
    return;
  }

  // 3. Filter out already-linked uploads (avoid duplicates)
  const existing = await db.query.projectAttachment.findMany({
    columns: { uploadId: true },
    where: and(
      eq(tables.projectAttachment.projectId, projectId),
      inArray(tables.projectAttachment.uploadId, uploadIds),
    ),
  });
  const existingSet = new Set(existing.map(a => a.uploadId));
  const newUploads = uploads.filter(u => !existingSet.has(u.id));
  if (newUploads.length === 0) {
    return;
  }

  // 4. Create project attachments + copy files to project R2 folder
  const now = new Date();
  const attachments = newUploads.map(upload => ({
    addedBy: userId,
    createdAt: now,
    id: ulid(),
    indexStatus: DEFAULT_PROJECT_INDEX_STATUS,
    projectId,
    ragMetadata: {
      context: 'Auto-linked from chat upload',
      projectR2Key: generateProjectFileR2Key(projectId, upload.filename),
      sourceThreadId: threadId,
    },
    updatedAt: now,
    uploadId: upload.id,
  }));

  const runTask = async () => {
    // Copy files to project folder (for AI Search)
    await Promise.all(newUploads.map(async upload =>
      await copyFile(
        r2Bucket,
        upload.r2Key,
        generateProjectFileR2Key(projectId, upload.filename),
      ).catch(() => {}), // Silent failure - don't block the flow
    ));

    // Insert project attachment records
    await db.insert(tables.projectAttachment)
      .values(attachments)
      .onConflictDoNothing();

    // Deduct credits for each file linked
    try {
      await Promise.all(newUploads.map(async upload =>
        await deductCreditsForAction(userId, 'projectFileLink', {
          description: `File linked: ${upload.filename}`,
        }).catch(() => {}), // Silent failure - don't block the flow
      ));
    } catch {
      // Non-critical - don't fail auto-linking if billing fails
    }
  };

  if (executionCtx) {
    executionCtx.waitUntil(runTask());
  } else {
    await runTask();
  }
}
