/**
 * Storage Service
 *
 * Provides a unified interface for file storage that works both:
 * - In Cloudflare Workers (using R2)
 * - In local Next.js dev mode (using local filesystem or memory)
 *
 * This abstraction ensures uploads work in all environments.
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { StorageMetadata, StorageResult } from '@/api/types/uploads';

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

    // Convert data to Buffer - type-safe checks without force casts
    // Note: instanceof checks can fail for cross-realm objects, so we use additional checks
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (data instanceof ArrayBuffer || (data && data.constructor?.name === 'ArrayBuffer')) {
      // Handle both native ArrayBuffer and cross-realm ArrayBuffer
      buffer = Buffer.from(data as ArrayBuffer);
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      // Handle both Uint8Array and other TypedArrays
      buffer = Buffer.from(data as Uint8Array);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else {
      // TypeScript narrowing: remaining type is ReadableStream
      const stream: ReadableStream = data;
      const reader = stream.getReader();
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
 * R2 Object result with streaming body
 * Following official Cloudflare R2 pattern for efficient streaming
 */
export type R2GetResult = {
  /** Readable stream body (null if preconditions failed) */
  body: ReadableStream | null;
  /** Write HTTP metadata to response headers (official R2 pattern) */
  writeHttpMetadata: (headers: Headers) => void;
  /** HTTP ETag for caching */
  httpEtag: string;
  /** File size in bytes */
  size: number;
  /** Custom metadata */
  customMetadata?: Record<string, string>;
  /** Whether the object was found */
  found: boolean;
  /** Whether preconditions were met (for conditional requests) */
  preconditionsMet: boolean;
};

/**
 * Get options for conditional and range requests
 * Following official Cloudflare R2 pattern
 */
export type GetFileOptions = {
  /** Request headers for conditional requests (If-Match, If-None-Match, etc.) */
  onlyIf?: Headers;
  /** Request headers for range requests */
  range?: Headers;
};

/**
 * Get a file from storage with streaming support
 * Following official Cloudflare R2 patterns:
 * - Returns streaming body instead of buffering entire file
 * - Supports writeHttpMetadata() for proper response headers
 * - Supports conditional requests (onlyIf)
 * - Supports range requests
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage
 */
export async function getFileStream(
  r2Bucket: R2Bucket | undefined,
  key: string,
  options?: GetFileOptions,
): Promise<R2GetResult> {
  try {
    if (r2Bucket) {
      // Production: Use R2 with official pattern
      const object = await r2Bucket.get(key, {
        onlyIf: options?.onlyIf,
        range: options?.range,
      });

      if (!object) {
        return {
          body: null,
          writeHttpMetadata: () => {},
          httpEtag: '',
          size: 0,
          found: false,
          preconditionsMet: true,
        };
      }

      // Check if body is present (preconditions may have failed)
      const hasBody = 'body' in object && object.body !== null;

      return {
        body: hasBody ? object.body : null,
        writeHttpMetadata: (headers: Headers) => object.writeHttpMetadata(headers),
        httpEtag: object.httpEtag,
        size: object.size,
        customMetadata: object.customMetadata,
        found: true,
        preconditionsMet: hasBody,
      };
    }

    // Development: Use local filesystem (simulated streaming)
    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      return {
        body: null,
        writeHttpMetadata: () => {},
        httpEtag: '',
        size: 0,
        found: false,
        preconditionsMet: true,
      };
    }

    let metadata: StorageMetadata | undefined;
    try {
      const metaPath = `${filePath}.meta.json`;
      const metaData = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(metaData);
    } catch {
      // No metadata file
    }

    // Create a ReadableStream from buffer for consistent API
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(fileBuffer));
        controller.close();
      },
    });

    // Generate simple ETag from file size and modification
    const etag = `"${fileBuffer.length.toString(16)}"`;

    return {
      body: stream,
      writeHttpMetadata: (headers: Headers) => {
        if (metadata?.contentType) {
          headers.set('content-type', metadata.contentType);
        }
      },
      httpEtag: etag,
      size: fileBuffer.length,
      customMetadata: metadata?.customMetadata,
      found: true,
      preconditionsMet: true,
    };
  } catch {
    return {
      body: null,
      writeHttpMetadata: () => {},
      httpEtag: '',
      size: 0,
      found: false,
      preconditionsMet: true,
    };
  }
}

/**
 * Get a file from storage (buffers entire file into memory)
 *
 * Use cases:
 * - Text extraction for AI processing (need full content)
 * - File copy operations (need full buffer)
 * - Small file processing
 *
 * For HTTP responses/downloads, prefer getFileStream() for:
 * - Better memory efficiency (streaming)
 * - Proper ETag/caching headers
 * - Conditional request support (304 Not Modified)
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
    const fileBuffer = await fs.readFile(filePath);

    let metadata: StorageMetadata | undefined;
    try {
      const metaPath = `${filePath}.meta.json`;
      const metaData = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(metaData);
    } catch {
      // No metadata file
    }

    // Convert Buffer to ArrayBuffer properly without force cast
    // Buffer.buffer may be shared, so slice to get exact bytes
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
    return { data: arrayBuffer, metadata };
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
 * Copy a file to a new location in storage
 *
 * Used for:
 * - Copying uploads to project folders for AI Search indexing
 * - Creating backups before modifications
 *
 * @param r2Bucket - R2 bucket or undefined for local dev
 * @param sourceKey - Source file key
 * @param destKey - Destination file key
 * @returns StorageResult with success status
 */
export async function copyFile(
  r2Bucket: R2Bucket | undefined,
  sourceKey: string,
  destKey: string,
): Promise<StorageResult> {
  try {
    // Read the source file
    const { data, metadata } = await getFile(r2Bucket, sourceKey);

    if (!data) {
      return { success: false, error: `Source file not found: ${sourceKey}` };
    }

    // Write to destination
    const result = await putFile(r2Bucket, destKey, data, metadata);

    if (!result.success) {
      return { success: false, error: `Failed to write to destination: ${result.error}` };
    }

    return { success: true, key: destKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Storage] Copy failed: ${message}`);
    return { success: false, error: message };
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
