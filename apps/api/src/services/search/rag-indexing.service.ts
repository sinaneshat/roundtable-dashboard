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

import type { AiSearchCheckStatus, ProjectIndexStatus } from '@roundtable/shared/enums';
import { AiSearchCheckStatuses, LogTypes, ProjectIndexStatuses } from '@roundtable/shared/enums';
import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { TypedLogger } from '@/types/logger';

// ✅ SINGLE SOURCE OF TRUTH: Uses global Ai type from cloudflare-env.d.ts
// The Ai class includes autorag() method that returns AutoRAG with list/search/aiSearch

// ============================================================================
// Zod Schemas - Type Definitions
// ============================================================================

/**
 * Base parameters for RAG indexing operations
 */
export const RagIndexingParamsSchema = z.object({
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  logger: z.union([z.custom<TypedLogger>(), z.undefined()]).optional(),
});

export type RagIndexingParams = z.infer<typeof RagIndexingParamsSchema>;

/**
 * Parameters for updating index status
 */
export const UpdateIndexStatusParamsSchema = RagIndexingParamsSchema.extend({
  projectAttachmentId: z.string().min(1),
  status: z.custom<ProjectIndexStatus>(),
});

export type UpdateIndexStatusParams = z.infer<typeof UpdateIndexStatusParamsSchema>;

/**
 * Parameters for syncing project files with AI Search
 */
export const SyncProjectFilesParamsSchema = RagIndexingParamsSchema.extend({
  /** ✅ Uses global Ai type from cloudflare-env.d.ts */
  ai: z.custom<Ai>().optional(),
  projectId: z.string().min(1),
});

export type SyncProjectFilesParams = z.infer<typeof SyncProjectFilesParamsSchema>;

/**
 * Parameters for getting project index status
 */
export const GetIndexStatusParamsSchema = RagIndexingParamsSchema.extend({
  projectId: z.string().min(1),
});

export type GetIndexStatusParams = z.infer<typeof GetIndexStatusParamsSchema>;

/**
 * Parameters for marking attachments as pending
 */
export const MarkAttachmentsPendingParamsSchema = RagIndexingParamsSchema.extend({
  attachmentIds: z.array(z.string()),
});

export type MarkAttachmentsPendingParams = z.infer<typeof MarkAttachmentsPendingParamsSchema>;

/**
 * Parameters for verifying project file locations
 */
export const VerifyProjectFileLocationsParamsSchema = RagIndexingParamsSchema.extend({
  projectId: z.string().min(1),
});

export type VerifyProjectFileLocationsParams = z.infer<typeof VerifyProjectFileLocationsParamsSchema>;

/**
 * Index status summary schema
 */
export const IndexStatusSummarySchema = z.object({
  failed: z.number().int().nonnegative(),
  indexed: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  lastIndexedAt: z.date().nullable(),
  pending: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type IndexStatusSummary = z.infer<typeof IndexStatusSummarySchema>;

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
  const { db, logger, projectAttachmentId, status } = params;

  await db
    .update(tables.projectAttachment)
    .set({
      indexStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(tables.projectAttachment.id, projectAttachmentId));

  logger?.info('Updated attachment index status', {
    logType: LogTypes.OPERATION,
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
  params: MarkAttachmentsPendingParams,
): Promise<void> {
  const { attachmentIds, db, logger } = params;

  if (attachmentIds.length === 0) {
    return;
  }

  await db
    .update(tables.projectAttachment)
    .set({
      indexStatus: ProjectIndexStatuses.PENDING,
      updatedAt: new Date(),
    })
    .where(inArray(tables.projectAttachment.id, attachmentIds));

  logger?.info('Marked attachments as pending indexing', {
    count: attachmentIds.length,
    logType: LogTypes.OPERATION,
    operationName: 'markAttachmentsPending',
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
  const { db, projectId } = params;

  const attachments = await db.query.projectAttachment.findMany({
    columns: {
      indexStatus: true,
      updatedAt: true,
    },
    orderBy: (t, { desc }) => [desc(t.updatedAt)],
    where: eq(tables.projectAttachment.projectId, projectId),
  });

  let pending = 0;
  let indexing = 0;
  let indexed = 0;
  let failed = 0;
  let lastIndexedAt: Date | null = null;

  for (const att of attachments) {
    switch (att.indexStatus) {
      case ProjectIndexStatuses.PENDING:
        pending++;
        break;
      case ProjectIndexStatuses.INDEXING:
        indexing++;
        break;
      case ProjectIndexStatuses.INDEXED:
        indexed++;
        if (att.updatedAt && (!lastIndexedAt || att.updatedAt > lastIndexedAt)) {
          lastIndexedAt = att.updatedAt;
        }
        break;
      case ProjectIndexStatuses.FAILED:
        failed++;
        break;
    }
  }

  return {
    failed,
    indexed,
    inProgress: indexing,
    lastIndexedAt,
    pending,
    total: attachments.length,
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
  status: AiSearchCheckStatus | string;
  paused: boolean;
}> {
  const { ai, instanceId, logger } = params;

  try {
    const instances = await ai.autorag(instanceId).list();
    const instance = instances.find(i => i.id === instanceId);

    if (!instance) {
      logger?.warn('AI Search instance not found', {
        availableInstances: instances.map(i => i.id),
        instanceId,
        logType: LogTypes.OPERATION,
        operationName: 'checkAiSearchInstance',
      });
      return { available: false, paused: false, status: AiSearchCheckStatuses.NOT_FOUND };
    }

    return {
      available: instance.enable,
      paused: instance.paused,
      status: instance.status,
    };
  } catch (error) {
    logger?.warn('Failed to check AI Search instance', {
      error: error instanceof Error ? error.message : String(error),
      instanceId,
      logType: LogTypes.OPERATION,
      operationName: 'checkAiSearchInstance',
    });
    return { available: false, paused: false, status: AiSearchCheckStatuses.ERROR };
  }
}

/**
 * Verify project files are in correct R2 folder for AI Search
 *
 * AI Search uses folder-based filtering for multitenancy.
 * Files must be in projects/{projectId}/ folder to be included in search.
 */
export async function verifyProjectFileLocations(
  params: VerifyProjectFileLocationsParams,
): Promise<{
  correctlyLocated: number;
  incorrectlyLocated: string[];
}> {
  const { db, logger, projectId } = params;

  // Get project with its R2 folder prefix
  const project = await db.query.chatProject.findFirst({
    columns: {
      id: true,
      r2FolderPrefix: true,
    },
    where: eq(tables.chatProject.id, projectId),
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
      expectedPrefix: project.r2FolderPrefix,
      incorrectCount: incorrectlyLocated.length,
      logType: LogTypes.OPERATION,
      operationName: 'verifyProjectFileLocations',
      projectId,
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
  const { ai, db, logger, projectId } = params;

  if (!ai) {
    logger?.warn('AI binding not available for sync', {
      logType: LogTypes.OPERATION,
      operationName: 'syncIndexingStatus',
      projectId,
    });
    return { synced: 0, updated: 0 };
  }

  const project = await db.query.chatProject.findFirst({
    columns: {
      autoragInstanceId: true,
      id: true,
      r2FolderPrefix: true,
    },
    where: eq(tables.chatProject.id, projectId),
  });

  if (!project?.autoragInstanceId) {
    return { synced: 0, updated: 0 };
  }

  // Get all pending/in_progress attachments
  const pendingAttachments = await db.query.projectAttachment.findMany({
    where: and(
      eq(tables.projectAttachment.projectId, projectId),
      inArray(tables.projectAttachment.indexStatus, [ProjectIndexStatuses.PENDING, ProjectIndexStatuses.INDEXING]),
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
    if (!att.upload) {
      continue;
    }

    try {
      // Search for the specific file by name
      // Uses "starts with" filter pattern per Cloudflare docs:
      // https://developers.cloudflare.com/ai-search/how-to/multitenancy/
      const searchResult = await ai.autorag(project.autoragInstanceId).search({
        filters: {
          filters: [
            { key: 'folder', type: 'gt', value: `${project.r2FolderPrefix}//` },
            { key: 'folder', type: 'lte', value: `${project.r2FolderPrefix}/z` },
          ],
          type: 'and',
        },
        max_num_results: 1,
        query: att.upload.filename,
      });

      // If we found results matching this filename, mark as indexed
      const found = searchResult.data?.some(d =>
        d.filename === att.upload?.filename,
      );

      if (found) {
        await updateIndexStatus({
          db,
          logger,
          projectAttachmentId: att.id,
          status: ProjectIndexStatuses.INDEXED,
        });
        updated++;
      }
    } catch (error) {
      // If search fails for this file, it might not be indexed yet
      logger?.debug('Search verification failed for attachment', {
        attachmentId: att.id,
        error: error instanceof Error ? error.message : String(error),
        logType: LogTypes.OPERATION,
        operationName: 'syncIndexingStatus',
      });
    }
  }

  logger?.info('Synced indexing status', {
    logType: LogTypes.OPERATION,
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
