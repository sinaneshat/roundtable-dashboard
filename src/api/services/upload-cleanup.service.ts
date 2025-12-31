/**
 * Upload Cleanup Service
 *
 * Provides a clean API for scheduling and cancelling automatic cleanup
 * of orphaned uploads via the UploadCleanupScheduler Durable Object.
 *
 * Usage:
 * - Call scheduleCleanup() after a file is uploaded to R2
 * - Call cancelCleanup() when an upload is attached to a message/thread/project
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type {
  CancelCleanupResult,
  GetCleanupStateResult,
  ScheduleCleanupResult,
} from '@/api/types/uploads';
import type { UploadCleanupScheduler } from '@/workers/upload-cleanup-scheduler';

/**
 * Schedule automatic cleanup for an upload
 *
 * Should be called immediately after a file is uploaded.
 * The cleanup will be executed 15 minutes later if the upload
 * hasn't been attached to any message/thread/project.
 */
export async function scheduleUploadCleanup(
  cleanupScheduler: DurableObjectNamespace<UploadCleanupScheduler>,
  uploadId: string,
  userId: string,
  r2Key: string,
): Promise<ScheduleCleanupResult> {
  // Get or create DO instance for this upload
  // Using uploadId as the name ensures each upload gets its own instance
  const stub = cleanupScheduler.get(
    cleanupScheduler.idFromName(uploadId),
  );

  const response = await stub.fetch('https://cleanup.internal/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, userId, r2Key }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[UploadCleanup] Failed to schedule cleanup for ${uploadId}:`, error);
    const errorContext: ErrorContext = {
      errorType: 'external_service',
      serviceName: 'UploadCleanupScheduler',
    };
    throw createError.internal(`Failed to schedule upload cleanup: ${error}`, errorContext);
  }

  return response.json();
}

/**
 * Cancel scheduled cleanup for an upload
 *
 * Should be called when an upload is successfully attached to
 * a message, thread, or project. This prevents the upload from
 * being deleted as orphaned.
 */
export async function cancelUploadCleanup(
  cleanupScheduler: DurableObjectNamespace<UploadCleanupScheduler>,
  uploadId: string,
): Promise<CancelCleanupResult> {
  const stub = cleanupScheduler.get(
    cleanupScheduler.idFromName(uploadId),
  );

  const response = await stub.fetch('https://cleanup.internal/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`[UploadCleanup] Failed to cancel cleanup for ${uploadId}:`, error);
    // Don't throw - cancellation failure shouldn't break attachment flow
    return { cancelled: false };
  }

  return response.json();
}

/**
 * Get the current cleanup state for an upload
 *
 * Useful for debugging or checking if cleanup is scheduled.
 */
export async function getUploadCleanupState(
  cleanupScheduler: DurableObjectNamespace<UploadCleanupScheduler>,
  uploadId: string,
): Promise<GetCleanupStateResult> {
  const stub = cleanupScheduler.get(
    cleanupScheduler.idFromName(uploadId),
  );

  const response = await stub.fetch(`https://cleanup.internal/state/${uploadId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    return { state: null };
  }

  return response.json();
}

/**
 * Helper to check if cleanup scheduler is available
 *
 * Returns false in local development to avoid DO migration issues.
 * DOs require migration state that doesn't auto-sync in local dev.
 */
export function isCleanupSchedulerAvailable(env: CloudflareEnv): boolean {
  // Skip in local development - DOs require migration state
  if (env.NEXT_PUBLIC_WEBAPP_ENV === 'local') {
    return false;
  }
  return env.UPLOAD_CLEANUP_SCHEDULER !== undefined;
}
