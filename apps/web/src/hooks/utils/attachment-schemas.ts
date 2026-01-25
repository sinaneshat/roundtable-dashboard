/**
 * Attachment Zod Schemas - Dependency-free
 *
 * These schemas are extracted to avoid circular dependencies.
 * They have NO imports from hooks that depend on stores.
 *
 * Import chain: store-schemas -> attachment-schemas (no cycle possible)
 */

import { UploadStatusSchema } from '@roundtable/shared';
import { z } from 'zod';

import { FilePreviewSchema } from './use-file-preview';
import { UploadItemSchema } from './use-file-upload';

/**
 * Pending attachment schema - Zod-first pattern
 * Combines upload status, item, and preview for chat input display
 */
export const PendingAttachmentSchema = z.object({
  /** Unique attachment ID (client-side) */
  id: z.string(),
  /** Original file */
  file: z.custom<File>(val => val instanceof File, { message: 'Must be a File object' }),
  /** Upload status */
  status: UploadStatusSchema,
  /** Upload item with progress */
  uploadItem: UploadItemSchema.optional(),
  /** File preview (thumbnail/icon) */
  preview: FilePreviewSchema.optional(),
  /** Backend upload ID (after successful upload) */
  uploadId: z.string().optional(),
});

export type PendingAttachment = z.infer<typeof PendingAttachmentSchema>;
