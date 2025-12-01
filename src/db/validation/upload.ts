/**
 * Upload Validation Schemas
 *
 * Database-only Drizzle-Zod schemas derived from upload tables
 * @see /src/db/tables/upload.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  messageUpload,
  threadUpload,
  upload,
} from '@/db/tables/upload';

import { Refinements } from './refinements';

// ============================================================================
// UPLOAD METADATA SCHEMA - Single Source of Truth
// ============================================================================

/**
 * Upload metadata Zod schema
 *
 * SINGLE SOURCE OF TRUTH for upload metadata type
 * The TypeScript type is inferred from this schema using z.infer<>
 * The database table uses this inferred type via $type<>
 */
export const UploadMetadataSchema = z.object({
  // Image-specific
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  // Document-specific
  pageCount: z.number().int().positive().optional(),
  // Text extraction result
  extractedText: z.string().optional(),
  // User-provided context
  description: z.string().max(500).optional(),
  // Processing error details
  errorMessage: z.string().optional(),
}).strict();

/**
 * Upload metadata type - inferred from Zod schema
 */
export type UploadMetadata = z.infer<typeof UploadMetadataSchema>;

// ============================================================================
// UPLOAD SCHEMAS
// ============================================================================

/**
 * Upload select schema
 */
const baseUploadSelectSchema = createSelectSchema(upload);
export const uploadSelectSchema = baseUploadSelectSchema.extend({
  metadata: UploadMetadataSchema.nullable().optional(),
});

/**
 * Upload insert schema
 */
export const uploadInsertSchema = createInsertSchema(upload, {
  filename: Refinements.name(),
  r2Key: Refinements.content(),
  mimeType: Refinements.content(),
  fileSize: Refinements.nonNegativeInt(),
});

/**
 * Upload update schema
 */
export const uploadUpdateSchema = createUpdateSchema(upload, {
  filename: Refinements.nameOptional(),
});

// ============================================================================
// THREAD UPLOAD SCHEMAS (Junction Table)
// ============================================================================

/**
 * Thread upload select schema
 */
export const threadUploadSelectSchema = createSelectSchema(threadUpload);

/**
 * Thread upload insert schema
 */
export const threadUploadInsertSchema = createInsertSchema(threadUpload, {
  context: Refinements.descriptionOptional(),
});

/**
 * Thread upload update schema
 */
export const threadUploadUpdateSchema = createUpdateSchema(threadUpload, {
  context: Refinements.descriptionOptional(),
});

// ============================================================================
// MESSAGE UPLOAD SCHEMAS (Junction Table)
// ============================================================================

/**
 * Message upload select schema
 */
export const messageUploadSelectSchema = createSelectSchema(messageUpload);

/**
 * Message upload insert schema
 */
export const messageUploadInsertSchema = createInsertSchema(messageUpload, {
  displayOrder: Refinements.nonNegativeInt(),
});

/**
 * Message upload update schema
 */
export const messageUploadUpdateSchema = createUpdateSchema(messageUpload, {
  displayOrder: Refinements.nonNegativeIntOptional(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Upload = z.infer<typeof uploadSelectSchema>;
export type UploadInsert = z.infer<typeof uploadInsertSchema>;
export type UploadUpdate = z.infer<typeof uploadUpdateSchema>;

export type ThreadUpload = z.infer<typeof threadUploadSelectSchema>;
export type ThreadUploadInsert = z.infer<typeof threadUploadInsertSchema>;
export type ThreadUploadUpdate = z.infer<typeof threadUploadUpdateSchema>;

export type MessageUpload = z.infer<typeof messageUploadSelectSchema>;
export type MessageUploadInsert = z.infer<typeof messageUploadInsertSchema>;
export type MessageUploadUpdate = z.infer<typeof messageUploadUpdateSchema>;
