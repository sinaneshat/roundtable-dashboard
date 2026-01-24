/**
 * Upload Ownership Verification
 *
 * Verifies user owns an upload before operations.
 */

import { and, eq } from 'drizzle-orm';

import { ErrorContextBuilders } from '@/common/error-contexts';
import { createError } from '@/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { Upload } from '@/db/validation/upload';

type DbInstance = Awaited<ReturnType<typeof getDbAsync>>;

/**
 * Verify upload ownership
 *
 * @throws NotFoundError if upload doesn't exist or user doesn't own it
 *
 * @example
 * ```ts
 * const upload = await verifyUploadOwnership(uploadId, userId, db);
 * ```
 */
export async function verifyUploadOwnership(
  uploadId: string,
  userId: string,
  db: DbInstance,
): Promise<Upload> {
  const upload = await db.query.upload.findFirst({
    where: and(
      eq(tables.upload.id, uploadId),
      eq(tables.upload.userId, userId),
    ),
  });

  if (!upload) {
    throw createError.notFound(
      'Upload not found',
      ErrorContextBuilders.resourceNotFound('upload', uploadId, userId),
    );
  }

  return upload;
}
