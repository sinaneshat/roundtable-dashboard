/**
 * Multipart Upload Service
 *
 * Manages multipart upload metadata using Cloudflare KV for persistence.
 * In-memory fallback for local development when KV is unavailable.
 *
 * This service handles the critical gap in R2 multipart uploads:
 * R2 tracks the upload itself, but we need to track our own metadata
 * (user association, DB record ID, etc.) between part uploads.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */

import { z } from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

/** KV key prefix for multipart uploads */
const MULTIPART_KV_PREFIX = 'multipart-upload:';

/** Default TTL for multipart metadata (4 hours - generous for large uploads) */
const DEFAULT_MULTIPART_TTL_SECONDS = 4 * 60 * 60;

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Multipart upload metadata schema
 * Tracks the association between R2 multipart upload and our system
 */
export const MultipartUploadMetadataSchema = z.object({
  /** Our internal upload ID (used for DB record) */
  uploadId: z.string(),
  /** User who initiated the upload */
  userId: z.string(),
  /** R2 object key where file will be stored */
  r2Key: z.string(),
  /** R2's multipart upload ID (needed to resume/complete) */
  r2UploadId: z.string(),
  /** Original filename */
  filename: z.string(),
  /** MIME type of the file */
  mimeType: z.string(),
  /** Expected total file size */
  fileSize: z.number(),
  /** Timestamp when upload was created */
  createdAt: z.number(),
});

export type MultipartUploadMetadata = z.infer<typeof MultipartUploadMetadataSchema>;

// ============================================================================
// IN-MEMORY FALLBACK (Local Development)
// ============================================================================

/**
 * In-memory store for local development when KV is unavailable
 * Map: uploadId -> { data, expiresAt }
 */
const localMultipartStore = new Map<string, { data: string; expiresAt: number }>();

/**
 * Clean up expired entries from local store
 */
function cleanupExpiredLocalEntries(): void {
  const now = Date.now();
  for (const [key, value] of localMultipartStore.entries()) {
    if (value.expiresAt < now) {
      localMultipartStore.delete(key);
    }
  }
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Store multipart upload metadata
 *
 * @param kv - KV namespace (optional, falls back to memory)
 * @param metadata - Upload metadata to store
 */
export async function storeMultipartMetadata(
  kv: KVNamespace | undefined,
  metadata: MultipartUploadMetadata,
): Promise<void> {
  const key = `${MULTIPART_KV_PREFIX}${metadata.uploadId}`;
  const data = JSON.stringify(metadata);

  if (kv) {
    await kv.put(key, data, {
      expirationTtl: DEFAULT_MULTIPART_TTL_SECONDS,
    });
  } else {
    // Local dev fallback
    cleanupExpiredLocalEntries();
    localMultipartStore.set(key, {
      data,
      expiresAt: Date.now() + DEFAULT_MULTIPART_TTL_SECONDS * 1000,
    });
  }
}

/**
 * Retrieve multipart upload metadata
 *
 * @param kv - KV namespace (optional, falls back to memory)
 * @param uploadId - Our internal upload ID
 * @returns Metadata or null if not found/expired
 */
export async function getMultipartMetadata(
  kv: KVNamespace | undefined,
  uploadId: string,
): Promise<MultipartUploadMetadata | null> {
  const key = `${MULTIPART_KV_PREFIX}${uploadId}`;

  let data: string | null = null;

  if (kv) {
    data = await kv.get(key);
  } else {
    // Local dev fallback
    cleanupExpiredLocalEntries();
    const entry = localMultipartStore.get(key);
    data = entry?.data ?? null;
  }

  if (!data) {
    return null;
  }

  // Validate and parse
  const parsed = MultipartUploadMetadataSchema.safeParse(JSON.parse(data));
  return parsed.success ? parsed.data : null;
}

/**
 * Delete multipart upload metadata
 * Called after upload completes or is aborted
 *
 * @param kv - KV namespace (optional, falls back to memory)
 * @param uploadId - Our internal upload ID
 */
export async function deleteMultipartMetadata(
  kv: KVNamespace | undefined,
  uploadId: string,
): Promise<void> {
  const key = `${MULTIPART_KV_PREFIX}${uploadId}`;

  if (kv) {
    await kv.delete(key);
  } else {
    localMultipartStore.delete(key);
  }
}

/**
 * Validate multipart metadata belongs to user
 * Returns metadata if valid, null if not found or user mismatch
 *
 * @param kv - KV namespace
 * @param uploadId - Our internal upload ID
 * @param userId - User ID to validate against
 * @returns Metadata if valid, null otherwise
 */
export async function validateMultipartOwnership(
  kv: KVNamespace | undefined,
  uploadId: string,
  userId: string,
): Promise<MultipartUploadMetadata | null> {
  const metadata = await getMultipartMetadata(kv, uploadId);

  if (!metadata) {
    return null;
  }

  if (metadata.userId !== userId) {
    return null;
  }

  return metadata;
}

/**
 * Check if R2 upload ID matches stored metadata
 * Prevents using wrong R2 upload ID with our upload record
 *
 * @param metadata - Stored metadata
 * @param r2UploadId - R2 upload ID to validate
 * @returns true if matches
 */
export function validateR2UploadId(
  metadata: MultipartUploadMetadata,
  r2UploadId: string,
): boolean {
  return metadata.r2UploadId === r2UploadId;
}
