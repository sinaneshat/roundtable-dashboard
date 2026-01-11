/**
 * Storage Service
 *
 * R2 storage operations following official Cloudflare patterns.
 * Follows backend-patterns.md service layer conventions.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
 */

import type { StorageMetadata, StorageResult } from '@/api/types/uploads';

// ============================================================================
// R2 STORAGE OPERATIONS
// ============================================================================

export async function putFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  if (!r2Bucket) {
    return { success: false, error: 'R2 bucket binding required' };
  }

  try {
    await r2Bucket.put(key, data, {
      httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
      customMetadata: metadata?.customMetadata,
    });
    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 upload failed';
    return { success: false, error: message };
  }
}

export async function getFileStream(
  r2Bucket: R2Bucket | undefined,
  key: string,
  options?: { onlyIf?: Headers; range?: Headers },
): Promise<R2StreamResult> {
  const notFound: R2StreamResult = {
    found: false,
    body: null,
    writeHttpMetadata: () => {},
    httpEtag: '',
    size: 0,
  };

  if (!r2Bucket) {
    return notFound;
  }

  try {
    const object = await r2Bucket.get(key, {
      onlyIf: options?.onlyIf,
      range: options?.range,
    });

    if (!object) {
      return notFound;
    }

    return {
      found: true,
      body: object.body,
      writeHttpMetadata: (headers: Headers) => object.writeHttpMetadata(headers),
      httpEtag: object.httpEtag,
      size: object.size,
      customMetadata: object.customMetadata,
    };
  } catch {
    return notFound;
  }
}

export type R2StreamResult = {
  found: boolean;
  body: ReadableStream | null;
  writeHttpMetadata: (headers: Headers) => void;
  httpEtag: string;
  size: number;
  customMetadata?: Record<string, string>;
};

export async function getFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<{ data: ArrayBuffer | null; metadata?: StorageMetadata }> {
  if (!r2Bucket) {
    return { data: null };
  }

  try {
    const object = await r2Bucket.get(key);
    if (!object) {
      return { data: null };
    }

    return {
      data: await object.arrayBuffer(),
      metadata: {
        contentType: object.httpMetadata?.contentType,
        customMetadata: object.customMetadata,
      },
    };
  } catch {
    return { data: null };
  }
}

export async function deleteFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<StorageResult> {
  if (!r2Bucket) {
    return { success: false, error: 'R2 bucket required' };
  }

  try {
    await r2Bucket.delete(key);
    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 delete failed';
    return { success: false, error: message };
  }
}

export async function fileExists(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<boolean> {
  if (!r2Bucket) {
    return false;
  }

  try {
    const object = await r2Bucket.head(key);
    return object !== null;
  } catch {
    return false;
  }
}

export async function copyFile(
  r2Bucket: R2Bucket | undefined,
  sourceKey: string,
  destKey: string,
): Promise<StorageResult> {
  const { data, metadata } = await getFile(r2Bucket, sourceKey);

  if (!data) {
    return { success: false, error: `Source not found: ${sourceKey}` };
  }

  return putFile(r2Bucket, destKey, data, metadata);
}

export async function createMultipartUpload(
  r2Bucket: R2Bucket | undefined,
  key: string,
  metadata?: StorageMetadata,
): Promise<{ uploadId: string } | null> {
  if (!r2Bucket) {
    return null;
  }

  try {
    const upload = await r2Bucket.createMultipartUpload(key, {
      httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
      customMetadata: metadata?.customMetadata,
    });
    return { uploadId: upload.uploadId };
  } catch {
    return null;
  }
}

export function getPublicUrl(key: string, baseUrl: string): string {
  return `${baseUrl}/api/v1/uploads/${encodeURIComponent(key)}/download`;
}

export function isLocalDevelopment(r2Bucket: R2Bucket | undefined): boolean {
  return !r2Bucket;
}
