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

export async function scheduleUploadCleanup<T extends Rpc.DurableObjectBranded>(
  cleanupScheduler: DurableObjectNamespace<T>,
  uploadId: string,
  userId: string,
  r2Key: string,
): Promise<ScheduleCleanupResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch('https://cleanup.internal/schedule', {
    body: JSON.stringify({ r2Key, uploadId, userId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.text();
    const errorContext: ErrorContext = {
      errorType: 'external_service',
      operation: 'schedule',
      service: 'UploadCleanupScheduler',
    };
    throw createError.internal(`Failed to schedule upload cleanup: ${error}`, errorContext);
  }

  return await response.json();
}

export async function cancelUploadCleanup<T extends Rpc.DurableObjectBranded>(
  cleanupScheduler: DurableObjectNamespace<T>,
  uploadId: string,
): Promise<CancelCleanupResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch('https://cleanup.internal/cancel', {
    body: JSON.stringify({ uploadId }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    return { cancelled: false };
  }

  return await response.json();
}

export async function getUploadCleanupState<T extends Rpc.DurableObjectBranded>(
  cleanupScheduler: DurableObjectNamespace<T>,
  uploadId: string,
): Promise<GetCleanupStateResult> {
  const stub = cleanupScheduler.get(cleanupScheduler.idFromName(uploadId));

  const response = await stub.fetch(`https://cleanup.internal/state/${uploadId}`, {
    method: 'GET',
  });

  if (!response.ok) {
    return { state: null };
  }

  return await response.json();
}

export function isCleanupSchedulerAvailable(env: CloudflareEnv): boolean {
  if (env.WEBAPP_ENV === WebAppEnvs.LOCAL) {
    return false;
  }
  return env.UPLOAD_CLEANUP_SCHEDULER !== undefined;
}
