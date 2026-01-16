/**
 * Upload & Attachment Types
 *
 * Consolidated type definitions for file uploads, storage, and attachments.
 * SINGLE SOURCE OF TRUTH for upload-related types across all services.
 *
 * Services using these types:
 * - storage.service.ts
 * - attachment-content.service.ts
 * - signed-url.service.ts
 * - upload-cleanup.service.ts
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import { z } from '@hono/zod-openapi';

import type { TypedLogger } from '@/api/types/logger';
import type { getDbAsync } from '@/db';

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Storage operation result schema
 */
export const StorageResultSchema = z.object({
  success: z.boolean(),
  key: z.string().optional(),
  error: z.string().optional(),
});

/** Storage operation result */
export type StorageResult = z.infer<typeof StorageResultSchema>;

/**
 * Storage object metadata schema
 */
export const StorageMetadataSchema = z.object({
  contentType: z.string().optional(),
  customMetadata: z.record(z.string(), z.string()).optional(),
});

/** Storage object metadata */
export type StorageMetadata = z.infer<typeof StorageMetadataSchema>;

/**
 * Stored object info schema
 */
export const StoredObjectSchema = z.object({
  key: z.string(),
  size: z.number(),
  etag: z.string().optional(),
  lastModified: z.date().optional(),
  httpMetadata: z.object({
    contentType: z.string().optional(),
  }).optional(),
  customMetadata: z.record(z.string(), z.string()).optional(),
});

/** Stored object info */
export type StoredObject = z.infer<typeof StoredObjectSchema>;

// ============================================================================
// FILE PART TYPES (AI Model Consumption)
// ============================================================================

/**
 * File part ready for AI model consumption (non-image files like PDF)
 *
 * The flow:
 * 1. File parts are added to UIMessage with url/mediaType (for UI compatibility)
 * 2. convertToModelMessages() converts to LanguageModelV2 format
 * 3. Our parts include `data` which the OpenRouter provider directly uses
 */
export const ModelFilePartSchema = z.object({
  type: z.literal('file'),
  /** File data as Uint8Array - OpenRouter provider expects this format */
  data: z.custom<Uint8Array>(val => val instanceof Uint8Array, {
    message: 'data must be Uint8Array',
  }),
  /** MIME type of the file (AI SDK v6 LanguageModelV2 format) */
  mimeType: z.string(),
  /** Original filename for reference */
  filename: z.string().optional(),
  /** Data URL for UIMessage compatibility */
  url: z.string(),
  /** MIME type for UIMessage compatibility (same as mimeType) */
  mediaType: z.string(),
});

/** File part ready for AI model consumption */
export type ModelFilePart = z.infer<typeof ModelFilePartSchema>;

/**
 * Image part ready for AI model consumption
 *
 * AI SDK v6 PATTERN: Images must use type:'image' with raw base64 in 'image' field
 * This fixes Bedrock error: "URL sources are not supported"
 * Bedrock requires raw base64, not data URLs
 *
 * Matches AI SDK's ImageUIPart structure for compatibility:
 * - type: 'image'
 * - image: string (base64 or data URL)
 * - mimeType: string (optional in AI SDK, required here for provider compatibility)
 */
export const ModelImagePartSchema = z.object({
  type: z.literal('image'),
  /** Raw base64 string (NOT data URL) - required for Bedrock compatibility */
  image: z.string(),
  /** MIME type of the image - matches AI SDK's ImageUIPart.mimeType */
  mimeType: z.string(),
});

/** Image part ready for AI model consumption */
export type ModelImagePart = z.infer<typeof ModelImagePartSchema>;

/**
 * URL-based file part for AI model consumption (large files)
 *
 * Used for files >4MB that exceed base64 memory limits.
 * AI providers (OpenAI, Anthropic, Google, OpenRouter) fetch from the URL directly.
 * URL must be publicly accessible with signed authentication.
 */
export const ModelFilePartUrlSchema = z.object({
  type: z.literal('file'),
  /** Public URL for AI provider to fetch the file */
  url: z.string().url(),
  /** MIME type of the file (AI SDK v6 LanguageModelV2 format) */
  mimeType: z.string(),
  /** Original filename for reference */
  filename: z.string().optional(),
  /** MIME type for UIMessage compatibility (same as mimeType) */
  mediaType: z.string(),
});

/** URL-based file part for AI model consumption */
export type ModelFilePartUrl = z.infer<typeof ModelFilePartUrlSchema>;

/**
 * URL-based image part for AI model consumption (large images)
 *
 * Used for images >4MB that exceed base64 memory limits.
 * AI providers fetch the image from the URL directly.
 */
export const ModelImagePartUrlSchema = z.object({
  type: z.literal('image'),
  /** Public URL for AI provider to fetch the image */
  image: z.string().url(),
  /** MIME type of the image */
  mimeType: z.string(),
});

/** URL-based image part for AI model consumption */
export type ModelImagePartUrl = z.infer<typeof ModelImagePartUrlSchema>;

/**
 * Union type for model-ready media parts (images or files)
 */
export const ModelMediaPartSchema = z.discriminatedUnion('type', [
  ModelFilePartSchema,
  ModelImagePartSchema,
]);

/** Union type for model-ready media parts */
export type ModelMediaPart = z.infer<typeof ModelMediaPartSchema>;

/**
 * Minimal file part with binary data (used in streaming orchestration)
 * Subset of ModelFilePart for internal use
 */
export const ModelFilePartWithDataSchema = z.object({
  type: z.literal('file'),
  data: z.custom<Uint8Array>(val => val instanceof Uint8Array, {
    message: 'data must be Uint8Array',
  }),
  mimeType: z.string(),
  filename: z.string().optional(),
});

/** Minimal file part with binary data */
export type ModelFilePartWithData = z.infer<typeof ModelFilePartWithDataSchema>;

// ============================================================================
// ATTACHMENT LOADING TYPES
// ============================================================================

/**
 * Parameters for loading attachment content
 */
export const LoadAttachmentContentParamsSchema = z.object({
  attachmentIds: z.array(z.string()),
  r2Bucket: z.custom<R2Bucket | undefined>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  logger: z.custom<TypedLogger>().optional(),
});

export type LoadAttachmentContentParams = z.infer<typeof LoadAttachmentContentParamsSchema>;

/**
 * Error that occurred during attachment loading
 */
export const AttachmentLoadErrorSchema = z.object({
  uploadId: z.string(),
  error: z.string(),
});

export type AttachmentLoadError = z.infer<typeof AttachmentLoadErrorSchema>;

/**
 * Statistics for attachment load operation
 */
export const AttachmentLoadStatsSchema = z.object({
  total: z.number(),
  loaded: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

export type AttachmentLoadStats = z.infer<typeof AttachmentLoadStatsSchema>;

/**
 * Result of loading attachment content
 */
export const LoadAttachmentContentResultSchema = z.object({
  fileParts: z.array(ModelFilePartSchema),
  errors: z.array(AttachmentLoadErrorSchema),
  stats: AttachmentLoadStatsSchema,
});

export type LoadAttachmentContentResult = z.infer<typeof LoadAttachmentContentResultSchema>;

/**
 * Parameters for loading attachment content for multiple messages
 */
export const LoadMessageAttachmentsParamsSchema = z.object({
  messageIds: z.array(z.string()),
  r2Bucket: z.custom<R2Bucket | undefined>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  logger: z.custom<TypedLogger>().optional(),
});

export type LoadMessageAttachmentsParams = z.infer<typeof LoadMessageAttachmentsParamsSchema>;

/**
 * Error that occurred during message attachment loading
 */
export const MessageAttachmentLoadErrorSchema = z.object({
  messageId: z.string(),
  uploadId: z.string(),
  error: z.string(),
});

export type MessageAttachmentLoadError = z.infer<typeof MessageAttachmentLoadErrorSchema>;

/**
 * Statistics for message attachment load operation
 */
export const MessageAttachmentLoadStatsSchema = z.object({
  messagesWithAttachments: z.number(),
  totalUploads: z.number(),
  loaded: z.number(),
  failed: z.number(),
  skipped: z.number(),
});

export type MessageAttachmentLoadStats = z.infer<typeof MessageAttachmentLoadStatsSchema>;

/**
 * Result of loading message attachments
 */
export const LoadMessageAttachmentsResultSchema = z.object({
  filePartsByMessageId: z.custom<Map<string, ModelFilePart[]>>(),
  errors: z.array(MessageAttachmentLoadErrorSchema),
  stats: MessageAttachmentLoadStatsSchema,
});

export type LoadMessageAttachmentsResult = z.infer<typeof LoadMessageAttachmentsResultSchema>;

// ============================================================================
// SIGNED URL TYPES
// ============================================================================

/**
 * Options for generating signed URLs
 */
export const SignedUrlOptionsSchema = z.object({
  /** Upload ID to sign */
  uploadId: z.string(),
  /** User ID who is being granted access */
  userId: z.string(),
  /** Optional thread ID for thread-scoped access */
  threadId: z.string().optional(),
  /** Expiration time in milliseconds (default: 1 hour) */
  expirationMs: z.number().optional(),
  /** Whether this is for a public thread */
  isPublic: z.boolean().optional(),
});

export type SignedUrlOptions = z.infer<typeof SignedUrlOptionsSchema>;

/**
 * Signed URL query parameters
 */
export const SignedUrlParamsSchema = z.object({
  /** Upload ID */
  id: z.string(),
  /** Expiration timestamp (Unix ms) */
  exp: z.number(),
  /** User ID or 'public' */
  uid: z.string(),
  /** Optional thread ID */
  tid: z.string().optional(),
  /** Cryptographic signature */
  sig: z.string(),
});

export type SignedUrlParams = z.infer<typeof SignedUrlParamsSchema>;

/**
 * Valid signature result
 */
export const ValidSignatureResultSchema = z.object({
  valid: z.literal(true),
  uploadId: z.string(),
  userId: z.string(),
  threadId: z.string().optional(),
  isPublic: z.boolean(),
});

/**
 * Invalid signature result
 */
export const InvalidSignatureResultSchema = z.object({
  valid: z.literal(false),
  error: z.string(),
});

/**
 * Signature validation result (discriminated union)
 */
export const ValidateSignatureResultSchema = z.discriminatedUnion('valid', [
  ValidSignatureResultSchema,
  InvalidSignatureResultSchema,
]);

export type ValidateSignatureResult = z.infer<typeof ValidateSignatureResultSchema>;

// ============================================================================
// UPLOAD CLEANUP TYPES
// ============================================================================

/**
 * Upload cleanup state schema
 */
export const UploadCleanupStateSchema = z.object({
  uploadId: z.string(),
  userId: z.string(),
  r2Key: z.string(),
  scheduledAt: z.number(),
  createdAt: z.number(),
});

export type UploadCleanupState = z.infer<typeof UploadCleanupStateSchema>;

/**
 * Schedule cleanup result
 */
export const ScheduleCleanupResultSchema = z.object({
  scheduled: z.boolean(),
  alarmTime: z.number(),
});

export type ScheduleCleanupResult = z.infer<typeof ScheduleCleanupResultSchema>;

/**
 * Cancel cleanup result
 */
export const CancelCleanupResultSchema = z.object({
  cancelled: z.boolean(),
});

export type CancelCleanupResult = z.infer<typeof CancelCleanupResultSchema>;

/**
 * Get cleanup state result
 */
export const GetCleanupStateResultSchema = z.object({
  state: UploadCleanupStateSchema.nullable(),
});

export type GetCleanupStateResult = z.infer<typeof GetCleanupStateResultSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if value is a ModelFilePart
 */
export function isModelFilePart(value: unknown): value is ModelFilePart {
  return ModelFilePartSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is a ModelFilePartWithData
 */
export function isModelFilePartWithData(
  value: unknown,
): value is ModelFilePartWithData {
  return ModelFilePartWithDataSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is a ModelImagePart
 */
export function isModelImagePart(value: unknown): value is ModelImagePart {
  return ModelImagePartSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is a ModelMediaPart (image or file)
 */
export function isModelMediaPart(value: unknown): value is ModelMediaPart {
  return ModelMediaPartSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is a ModelFilePartUrl
 */
export function isModelFilePartUrl(value: unknown): value is ModelFilePartUrl {
  return ModelFilePartUrlSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is a ModelImagePartUrl
 */
export function isModelImagePartUrl(value: unknown): value is ModelImagePartUrl {
  return ModelImagePartUrlSchema.safeParse(value).success;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum file size to convert to base64
 *
 * Memory calculation for Cloudflare Workers (128MB limit):
 * - 4MB file → ~5.3MB base64 string (33% larger)
 * - Plus Uint8Array copy: ~4MB
 * - Plus ArrayBuffer: ~4MB
 * - Total per file: ~13.3MB
 *
 * Reduced from 10MB to 4MB to prevent memory exhaustion
 * when processing multiple attachments per request.
 */
export const MAX_BASE64_FILE_SIZE = 4 * 1024 * 1024;

/** Default URL expiration time (1 hour) */
export const DEFAULT_URL_EXPIRATION_MS = 60 * 60 * 1000;

/** Maximum allowed expiration (24 hours) */
export const MAX_URL_EXPIRATION_MS = 24 * 60 * 60 * 1000;

/** Minimum allowed expiration (5 minutes) */
export const MIN_URL_EXPIRATION_MS = 5 * 60 * 1000;

/** Cleanup delay before orphaned uploads are deleted (15 minutes) */
export const UPLOAD_CLEANUP_DELAY_MS = 15 * 60 * 1000;

/** Public URL expiration for AI provider access (4 hours for long conversations) */
export const AI_PUBLIC_URL_EXPIRATION_MS = 4 * 60 * 60 * 1000;
