/**
 * Multipart Upload Service
 *
 * Manages multipart upload metadata using Cloudflare KV.
 * Tracks association between R2 multipart upload and internal upload records.
 * Follows backend-patterns.md service layer conventions.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/
 */

import * as z from 'zod';

// ============================================================================
// CONSTANTS
// ============================================================================

const MULTIPART_KV_PREFIX = 'multipart-upload:';
const DEFAULT_MULTIPART_TTL_SECONDS = 4 * 60 * 60;

// ============================================================================
// SCHEMAS (Zod first - single source of truth)
// ============================================================================

export const MultipartUploadMetadataSchema = z.object({
  uploadId: z.string(),
  userId: z.string(),
  r2Key: z.string(),
  r2UploadId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  createdAt: z.number(),
}).strict();

export type MultipartUploadMetadata = z.infer<typeof MultipartUploadMetadataSchema>;

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

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
  }
}

export async function getMultipartMetadata(
  kv: KVNamespace | undefined,
  uploadId: string,
): Promise<MultipartUploadMetadata | null> {
  if (!kv)
    return null;

  const key = `${MULTIPART_KV_PREFIX}${uploadId}`;
  const data = await kv.get(key);
  if (!data)
    return null;

  const parsed = MultipartUploadMetadataSchema.safeParse(JSON.parse(data));
  return parsed.success ? parsed.data : null;
}

export async function deleteMultipartMetadata(
  kv: KVNamespace | undefined,
  uploadId: string,
): Promise<void> {
  if (!kv)
    return;
  await kv.delete(`${MULTIPART_KV_PREFIX}${uploadId}`);
}

export async function validateMultipartOwnership(
  kv: KVNamespace | undefined,
  uploadId: string,
  userId: string,
): Promise<MultipartUploadMetadata | null> {
  const metadata = await getMultipartMetadata(kv, uploadId);
  if (!metadata || metadata.userId !== userId) {
    return null;
  }
  return metadata;
}

export function validateR2UploadId(
  metadata: MultipartUploadMetadata,
  r2UploadId: string,
): boolean {
  return metadata.r2UploadId === r2UploadId;
}
