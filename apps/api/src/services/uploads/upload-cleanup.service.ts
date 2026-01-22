/**
 * Upload Cleanup Service
 *
 * Schedules and cancels automatic cleanup of orphaned uploads via Durable Objects.
 * Follows backend-patterns.md service layer conventions.
 *
 * Usage:
 * - scheduleCleanup() after R2 upload
 * - cancelCleanup() when upload attached to message/thread/project
 */

import { WebAppEnvs } from '@roundtable/shared';

import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import type {
  CancelCleanupResult,
  GetCleanupStateResult,
  ScheduleCleanupResult,
} from '@/types/uploads';

export async function scheduleUploadCleanup(
  cleanupScheduler: DurableObjectNamespace<unknown>,
  uploadId: string,
  userId: string,
  r2Key: string,
): Promise<ScheduleCleanupResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch('https://cleanup.internal/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, userId, r2Key }),
  });

  if (!response.ok) {
    const error = await response.text();
    const errorContext: ErrorContext = {
      errorType: 'external_service',
      service: 'UploadCleanupScheduler',
      operation: 'schedule',
    };
    throw createError.internal(`Failed to schedule upload cleanup: ${error}`, errorContext);
  }

  return response.json();
}

export async function cancelUploadCleanup(
  cleanupScheduler: DurableObjectNamespace<unknown>,
  uploadId: string,
): Promise<CancelCleanupResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch('https://cleanup.internal/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });

  if (!response.ok) {
    return { cancelled: false };
  }

  return response.json();
}

export async function getUploadCleanupState(
  cleanupScheduler: DurableObjectNamespace<unknown>,
  uploadId: string,
): Promise<GetCleanupStateResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch(`https://cleanup.internal/state/${uploadId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    return { state: null };
  }

  return response.json();
}

export function isCleanupSchedulerAvailable(env: CloudflareEnv): boolean {
  if (env.WEBAPP_ENV === WebAppEnvs.LOCAL) {
    return false;
  }
  return env.UPLOAD_CLEANUP_SCHEDULER !== undefined;
}
