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
  totalPages: z.number().int().positive().optional(), // Alias for PDF extraction
  // Text extraction result
  extractedText: z.string().optional(),
  extractedAt: z.string().optional(), // ISO timestamp when extraction completed
  extractionError: z.string().optional(), // Error message if extraction failed
  requiresVision: z.boolean().optional(), // True if text extraction failed, needs visual AI processing
  // User-provided context
  description: z.string().max(500).optional(),
  // Processing error details
  errorMessage: z.string().optional(),
  // Upload ticket tracking (for secure upload flow)
  ticketId: z.string().optional(),
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
 * Note: Field validation applied at API layer
 */
export const uploadInsertSchema = createInsertSchema(upload);

/**
 * Upload update schema
 * Note: Field validation applied at API layer
 */
export const uploadUpdateSchema = createUpdateSchema(upload);

// ============================================================================
// THREAD UPLOAD SCHEMAS (Junction Table)
// ============================================================================

/**
 * Thread upload select schema
 */
export const threadUploadSelectSchema = createSelectSchema(threadUpload);

/**
 * Thread upload insert schema
 * Note: Field validation applied at API layer
 */
export const threadUploadInsertSchema = createInsertSchema(threadUpload);

/**
 * Thread upload update schema
 * Note: Field validation applied at API layer
 */
export const threadUploadUpdateSchema = createUpdateSchema(threadUpload);

// ============================================================================
// MESSAGE UPLOAD SCHEMAS (Junction Table)
// ============================================================================

/**
 * Message upload select schema
 */
export const messageUploadSelectSchema = createSelectSchema(messageUpload);

/**
 * Message upload insert schema
 * Note: Field validation applied at API layer
 */
export const messageUploadInsertSchema = createInsertSchema(messageUpload);

/**
 * Message upload update schema
 * Note: Field validation applied at API layer
 */
export const messageUploadUpdateSchema = createUpdateSchema(messageUpload);

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
