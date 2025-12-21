/**
 * RAG Indexing Service
 *
 * Following backend-patterns.md: Service layer for business logic
 *
 * This service handles:
 * - Tracking indexing status for project attachments
 * - Syncing files with Cloudflare AI Search instances
 * - Managing the connection between R2 uploads and AI Search
 *
 * Cloudflare AI Search Architecture:
 * - AI Search automatically indexes R2 buckets every 6 hours
 * - Files uploaded to R2 with correct folder structure are auto-indexed
 * - Multitenancy via folder-based filtering (projects/{projectId}/)
 *
 * Reference: https://developers.cloudflare.com/ai-search/configuration/indexing/
 */

import { and, eq, inArray } from 'drizzle-orm';

import type { ProjectIndexStatus } from '@/api/core/enums';
import type { TypedLogger } from '@/api/types/logger';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';

// ✅ SINGLE SOURCE OF TRUTH: Uses global Ai type from cloudflare-env.d.ts
// The Ai class includes autorag() method that returns AutoRAG with list/search/aiSearch

// ============================================================================
// Type Definitions
// ============================================================================

export type RagIndexingParams = {
  db: Awaited<ReturnType<typeof getDbAsync>>;
  logger?: TypedLogger;
};

export type UpdateIndexStatusParams = RagIndexingParams & {
  projectAttachmentId: string;
  status: ProjectIndexStatus;
};

export type SyncProjectFilesParams = RagIndexingParams & {
  projectId: string;
  /** ✅ Uses global Ai type from cloudflare-env.d.ts */
  ai?: Ai;
};

export type GetIndexStatusParams = RagIndexingParams & {
  projectId: string;
};

export type IndexStatusSummary = {
  total: number;
  pending: number;
  inProgress: number;
  indexed: number;
  failed: number;
  lastIndexedAt: Date | null;
};

// ============================================================================
// Index Status Management
// ============================================================================

/**
 * Update the index status for a project attachment
 *
 * Called after file upload to track AI Search indexing progress.
 * AI Search auto-indexes R2 every 6 hours, so this tracks our expected state.
 */
export async function updateIndexStatus(
  params: UpdateIndexStatusParams,
): Promise<void> {
  const { projectAttachmentId, status, db, logger } = params;

  await db
    .update(tables.projectAttachment)
    .set({
      indexStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(tables.projectAttachment.id, projectAttachmentId));

  logger?.info('Updated attachment index status', {
    logType: 'operation',
    operationName: 'updateIndexStatus',
    projectAttachmentId,
    status,
  });
}

/**
 * Mark multiple attachments as pending indexing
 *
 * Called when files are uploaded to a project.
 * Since AI Search indexes every 6 hours, we mark as 'pending' until indexed.
 */
export async function markAttachmentsPending(
  params: RagIndexingParams & { attachmentIds: string[] },
): Promise<void> {
  const { attachmentIds, db, logger } = params;

  if (attachmentIds.length === 0)
    return;

  await db
    .update(tables.projectAttachment)
    .set({
      indexStatus: 'pending',
      updatedAt: new Date(),
    })
    .where(inArray(tables.projectAttachment.id, attachmentIds));

  logger?.info('Marked attachments as pending indexing', {
    logType: 'operation',
    operationName: 'markAttachmentsPending',
    count: attachmentIds.length,
  });
}

/**
 * Get index status summary for a project
 *
 * Returns counts of attachments in each indexing state.
 */
export async function getProjectIndexStatus(
  params: GetIndexStatusParams,
): Promise<IndexStatusSummary> {
  const { projectId, db } = params;

  const attachments = await db.query.projectAttachment.findMany({
    where: eq(tables.projectAttachment.projectId, projectId),
    columns: {
      indexStatus: true,
      updatedAt: true,
    },
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
  });

  const counts = {
    pending: 0,
    indexing: 0,
    indexed: 0,
    failed: 0,
  };

  let lastIndexedAt: Date | null = null;

  for (const att of attachments) {
    const status = att.indexStatus as keyof typeof counts;
    if (status in counts) {
      counts[status]++;
    }
    if (att.indexStatus === 'indexed' && att.updatedAt) {
      if (!lastIndexedAt || att.updatedAt > lastIndexedAt) {
        lastIndexedAt = att.updatedAt;
      }
    }
  }

  return {
    total: attachments.length,
    pending: counts.pending,
    inProgress: counts.indexing,
    indexed: counts.indexed,
    failed: counts.failed,
    lastIndexedAt,
  };
}

// ============================================================================
// AI Search Instance Management
// ============================================================================

/**
 * Check if AI Search instance is available and configured
 *
 * Verifies the AutoRAG instance exists and is enabled.
 */
export async function checkAiSearchInstance(
  params: {
    /** ✅ Uses global Ai type from cloudflare-env.d.ts */
    ai: Ai;
    instanceId: string;
    logger?: TypedLogger;
  },
): Promise<{
  available: boolean;
  status: string;
  paused: boolean;
}> {
  const { ai, instanceId, logger } = params;

  try {
    const instances = await ai.autorag(instanceId).list();
    const instance = instances.find(i => i.id === instanceId);

    if (!instance) {
      logger?.warn('AI Search instance not found', {
        logType: 'operation',
        operationName: 'checkAiSearchInstance',
        instanceId,
        availableInstances: instances.map(i => i.id),
      });
      return { available: false, status: 'not_found', paused: false };
    }

    return {
      available: instance.enable,
      status: instance.status,
      paused: instance.paused,
    };
  } catch (error) {
    logger?.warn('Failed to check AI Search instance', {
      logType: 'operation',
      operationName: 'checkAiSearchInstance',
      instanceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { available: false, status: 'error', paused: false };
  }
}

/**
 * Verify project files are in correct R2 folder for AI Search
 *
 * AI Search uses folder-based filtering for multitenancy.
 * Files must be in projects/{projectId}/ folder to be included in search.
 */
export async function verifyProjectFileLocations(
  params: RagIndexingParams & { projectId: string },
): Promise<{
  correctlyLocated: number;
  incorrectlyLocated: string[];
}> {
  const { projectId, db, logger } = params;

  // Get project with its R2 folder prefix
  const project = await db.query.chatProject.findFirst({
    where: eq(tables.chatProject.id, projectId),
    columns: {
      id: true,
      r2FolderPrefix: true,
    },
  });

  if (!project) {
    return { correctlyLocated: 0, incorrectlyLocated: [] };
  }

  // Get all project attachments with their upload R2 keys
  const attachments = await db.query.projectAttachment.findMany({
    where: eq(tables.projectAttachment.projectId, projectId),
    with: {
      upload: {
        columns: {
          id: true,
          r2Key: true,
        },
      },
    },
  });

  const incorrectlyLocated: string[] = [];
  let correctlyLocated = 0;

  for (const att of attachments) {
    if (att.upload?.r2Key?.startsWith(project.r2FolderPrefix)) {
      correctlyLocated++;
    } else if (att.upload) {
      incorrectlyLocated.push(att.upload.id);
    }
  }

  if (incorrectlyLocated.length > 0) {
    logger?.warn('Found attachments in incorrect R2 location', {
      logType: 'operation',
      operationName: 'verifyProjectFileLocations',
      projectId,
      expectedPrefix: project.r2FolderPrefix,
      incorrectCount: incorrectlyLocated.length,
    });
  }

  return { correctlyLocated, incorrectlyLocated };
}

// ============================================================================
// Indexing Status Sync (Background Job)
// ============================================================================

/**
 * Sync indexing status based on AI Search state
 *
 * This can be called periodically or after the 6-hour indexing cycle.
 * Queries AI Search to verify which files are actually indexed.
 *
 * Note: AI Search auto-indexes every 6 hours from R2.
 * This function syncs our database state with actual indexed state.
 */
export async function syncIndexingStatus(
  params: SyncProjectFilesParams,
): Promise<{
  synced: number;
  updated: number;
}> {
  const { projectId, ai, db, logger } = params;

  if (!ai) {
    logger?.warn('AI binding not available for sync', {
      logType: 'operation',
      operationName: 'syncIndexingStatus',
      projectId,
    });
    return { synced: 0, updated: 0 };
  }

  const project = await db.query.chatProject.findFirst({
    where: eq(tables.chatProject.id, projectId),
    columns: {
      id: true,
      autoragInstanceId: true,
      r2FolderPrefix: true,
    },
  });

  if (!project?.autoragInstanceId) {
    return { synced: 0, updated: 0 };
  }

  // Get all pending/in_progress attachments
  const pendingAttachments = await db.query.projectAttachment.findMany({
    where: and(
      eq(tables.projectAttachment.projectId, projectId),
      inArray(tables.projectAttachment.indexStatus, ['pending', 'indexing']),
    ),
    with: {
      upload: {
        columns: {
          filename: true,
          r2Key: true,
        },
      },
    },
  });

  if (pendingAttachments.length === 0) {
    return { synced: 0, updated: 0 };
  }

  let updated = 0;

  // For each pending attachment, try to search for it to verify indexing
  for (const att of pendingAttachments) {
    if (!att.upload)
      continue;

    try {
      // Search for the specific file by name
      // Uses "starts with" filter pattern per Cloudflare docs:
      // https://developers.cloudflare.com/ai-search/how-to/multitenancy/
      const searchResult = await ai.autorag(project.autoragInstanceId).search({
        query: att.upload.filename,
        max_num_results: 1,
        filters: {
          type: 'and',
          filters: [
            { key: 'folder', type: 'gt', value: `${project.r2FolderPrefix}//` },
            { key: 'folder', type: 'lte', value: `${project.r2FolderPrefix}/z` },
          ],
        },
      });

      // If we found results matching this filename, mark as indexed
      const found = searchResult.data?.some(d =>
        d.filename === att.upload?.filename,
      );

      if (found) {
        await updateIndexStatus({
          projectAttachmentId: att.id,
          status: 'indexed',
          db,
          logger,
        });
        updated++;
      }
    } catch (error) {
      // If search fails for this file, it might not be indexed yet
      logger?.debug('Search verification failed for attachment', {
        logType: 'operation',
        operationName: 'syncIndexingStatus',
        attachmentId: att.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger?.info('Synced indexing status', {
    logType: 'operation',
    operationName: 'syncIndexingStatus',
    projectId,
    synced: pendingAttachments.length,
    updated,
  });

  return {
    synced: pendingAttachments.length,
    updated,
  };
}

// ============================================================================
// R2 Folder Path Utilities
// ============================================================================

/**
 * Generate the R2 key for a project file
 *
 * Files must be in projects/{projectId}/ for AI Search multitenancy.
 */
export function generateProjectFileR2Key(
  projectId: string,
  filename: string,
): string {
  return `projects/${projectId}/${filename}`;
}

/**
 * Extract project ID from R2 key
 */
export function extractProjectIdFromR2Key(
  r2Key: string,
): string | null {
  const match = r2Key.match(/^projects\/([^/]+)\//);
  return match?.[1] ?? null;
}

/**
 * Validate R2 key is in correct project folder
 */
export function isValidProjectFileKey(
  r2Key: string,
  projectId: string,
): boolean {
  const expectedPrefix = `projects/${projectId}/`;
  return r2Key.startsWith(expectedPrefix);
}
