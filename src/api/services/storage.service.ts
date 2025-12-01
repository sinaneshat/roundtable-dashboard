/**
 * Storage Service
 *
 * Provides a unified interface for file storage that works both:
 * - In Cloudflare Workers (using R2)
 * - In local Next.js dev mode (using local filesystem or memory)
 *
 * This abstraction ensures uploads work in all environments.
 */

import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Storage operation result
 */
export type StorageResult = {
  success: boolean;
  key?: string;
  error?: string;
};

/**
 * Storage object metadata
 */
export type StorageMetadata = {
  contentType?: string;
  customMetadata?: Record<string, string>;
};

/**
 * Stored object info
 */
export type StoredObject = {
  key: string;
  size: number;
  etag?: string;
  lastModified?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

/**
 * Local storage directory for development
 * Files are stored in .local-uploads/ which is gitignored
 */
const LOCAL_UPLOAD_DIR = '.local-uploads';

/**
 * Ensure local upload directory exists
 */
async function ensureLocalDir(): Promise<void> {
  try {
    await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Check if we're in local development mode (no R2 available)
 */
export function isLocalDevelopment(r2Bucket: R2Bucket | undefined): boolean {
  return !r2Bucket;
}

/**
 * Put a file to storage
 * Uses R2 in production, local filesystem in development
 */
export async function putFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
  data: ArrayBuffer | ReadableStream | string | Buffer | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  try {
    if (r2Bucket) {
      // Production: Use R2
      await r2Bucket.put(key, data, {
        httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
        customMetadata: metadata?.customMetadata,
      });
      return { success: true, key };
    }

    // Development: Use local filesystem
    await ensureLocalDir();
    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));

    // Convert data to Buffer
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else {
      // ReadableStream - collect chunks
      const reader = (data as ReadableStream).getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          chunks.push(result.value);
        }
      }
      buffer = Buffer.concat(chunks);
    }

    await fs.writeFile(filePath, buffer);

    // Store metadata in a sidecar file
    if (metadata) {
      const metaPath = `${filePath}.meta.json`;
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    }

    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Storage] Upload failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Get a file from storage
 */
export async function getFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<{ data: ArrayBuffer | null; metadata?: StorageMetadata }> {
  try {
    if (r2Bucket) {
      // Production: Use R2
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
    }

    // Development: Use local filesystem
    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));
    const data = await fs.readFile(filePath);

    let metadata: StorageMetadata | undefined;
    try {
      const metaPath = `${filePath}.meta.json`;
      const metaData = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(metaData);
    } catch {
      // No metadata file
    }

    return { data: data.buffer as ArrayBuffer, metadata };
  } catch {
    return { data: null };
  }
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<StorageResult> {
  try {
    if (r2Bucket) {
      // Production: Use R2
      await r2Bucket.delete(key);
      return { success: true, key };
    }

    // Development: Use local filesystem
    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));
    await fs.unlink(filePath);

    // Also try to delete metadata file
    try {
      await fs.unlink(`${filePath}.meta.json`);
    } catch {
      // Metadata file may not exist
    }

    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Storage] Delete failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Check if a file exists in storage
 */
export async function fileExists(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<boolean> {
  try {
    if (r2Bucket) {
      const object = await r2Bucket.head(key);
      return object !== null;
    }

    // Development: Check local filesystem
    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a multipart upload
 * Note: Local dev doesn't support true multipart, so we simulate it
 */
export async function createMultipartUpload(
  r2Bucket: R2Bucket | undefined,
  key: string,
  _metadata?: StorageMetadata,
): Promise<{ uploadId: string } | null> {
  try {
    if (r2Bucket) {
      const upload = await r2Bucket.createMultipartUpload(key);
      return { uploadId: upload.uploadId };
    }

    // Development: Generate a fake upload ID
    // We'll collect parts in memory/filesystem
    const uploadId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { uploadId };
  } catch (error) {
    console.error('[Storage] Failed to create multipart upload:', error);
    return null;
  }
}

/**
 * Generate a public/signed URL for a file
 * In development, returns a local API route URL
 */
export function getPublicUrl(
  key: string,
  baseUrl: string,
): string {
  // For now, return an API route that serves the file
  // This works both locally and in production
  return `${baseUrl}/api/v1/uploads/${encodeURIComponent(key)}/download`;
}
