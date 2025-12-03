/**
 * Storage Service
 *
 * Provides a unified interface for file storage that works both:
 * - In Cloudflare Workers (using R2) - REQUIRED for preview/production
 * - In local Next.js dev mode (using local filesystem)
 *
 * IMPORTANT: In Cloudflare Workers environments (preview/production),
 * R2 is REQUIRED. The filesystem fallback only works in local Node.js dev.
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import type { StorageMetadata, StorageResult } from '@/api/types/uploads';

/**
 * Cloudflare Workers CacheStorage extension
 * Workers expose a `default` property on the caches object for the default cache
 * This is not part of the standard CacheStorage interface but exists in Workers runtime
 */
type WorkersCacheStorage = CacheStorage & {
  readonly default: Cache;
};

/**
 * Type guard: Check if caches object has Workers-specific `default` property
 */
function hasWorkersDefaultCache(cacheStorage: CacheStorage): cacheStorage is WorkersCacheStorage {
  return 'default' in cacheStorage && cacheStorage.default !== undefined;
}

/**
 * Type guard: Check if value is an ArrayBuffer (including cross-realm ArrayBuffers)
 * Cross-realm ArrayBuffers (from different JS contexts) fail instanceof checks,
 * so we also check the constructor name as a fallback.
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return true;
  }
  // Cross-realm ArrayBuffer check (e.g., from Workers/Node.js buffer modules)
  if (value !== null && typeof value === 'object') {
    const constructor = Object.getPrototypeOf(value)?.constructor;
    return constructor?.name === 'ArrayBuffer';
  }
  return false;
}

/**
 * Check if we're running in Cloudflare Workers environment
 * Workers environment doesn't have Node.js fs module available
 *
 * Detection strategy:
 * 1. Workers have the caches API available globally with `caches.default`
 * 2. Workers don't have a real `fs` module (unenv polyfill throws)
 */
function isWorkersEnvironment(): boolean {
  // Workers have the caches API as a global with a `default` property, Node.js doesn't
  return typeof caches !== 'undefined' && hasWorkersDefaultCache(caches);
}

/**
 * Check if we're in local development mode (Node.js with fs available)
 * Only returns true if:
 * 1. R2 is not available AND
 * 2. We're NOT in a Workers environment (where fs doesn't exist)
 */
export function isLocalDevelopment(r2Bucket: R2Bucket | undefined): boolean {
  if (r2Bucket) {
    return false;
  }
  // Only allow local dev fallback if NOT in Workers environment
  return !isWorkersEnvironment();
}

/**
 * Put a file to storage
 * Uses R2 in production/preview, local filesystem only in local dev
 *
 * IMPORTANT: In Cloudflare Workers (preview/prod), R2 binding is REQUIRED.
 * The fs fallback only works in local Node.js development.
 */
export async function putFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  try {
    // Production/Preview: Use R2 (REQUIRED)
    if (r2Bucket) {
      await r2Bucket.put(key, data, {
        httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
        customMetadata: metadata?.customMetadata,
      });
      return { success: true, key };
    }

    // Check if we're in Workers environment without R2 - this is a configuration error
    if (isWorkersEnvironment()) {
      const errorMsg = 'R2 bucket binding is required in preview/production. Check wrangler.jsonc UPLOADS_R2_BUCKET config and ensure the R2 bucket exists.';
      console.error(`[Storage] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // Local development only: Use filesystem fallback
    // Dynamic imports to avoid loading Node.js modules in Workers
    const { Buffer } = await import('node:buffer');
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    const LOCAL_UPLOAD_DIR = '.local-uploads';

    // Ensure directory exists
    try {
      await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    } catch {
      // Directory already exists
    }

    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));

    // Convert data to Uint8Array for fs.writeFile
    let buffer: Uint8Array;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else if (isArrayBuffer(data)) {
      buffer = Buffer.from(data);
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else {
      // ReadableStream - consume and concatenate chunks
      const reader = data.getReader();
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
  const notFoundResult: R2GetResult = {
    body: null,
    writeHttpMetadata: () => {},
    httpEtag: '',
    size: 0,
    found: false,
    preconditionsMet: true,
  };

  try {
    // Production/Preview: Use R2
    if (r2Bucket) {
      const object = await r2Bucket.get(key, {
        onlyIf: options?.onlyIf,
        range: options?.range,
      });

      if (!object) {
        return notFoundResult;
      }

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

    // Workers without R2 is a config error
    if (isWorkersEnvironment()) {
      console.error('[Storage] R2 bucket required in preview/production');
      return notFoundResult;
    }

    // Local development: Use filesystem
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const LOCAL_UPLOAD_DIR = '.local-uploads';

    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));

    let fileBuffer: Uint8Array;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      return notFoundResult;
    }

    let metadata: StorageMetadata | undefined;
    try {
      const metaPath = `${filePath}.meta.json`;
      const metaData = await fs.readFile(metaPath, 'utf-8');
      metadata = JSON.parse(metaData);
    } catch {
      // No metadata file
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(fileBuffer));
        controller.close();
      },
    });

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
    return notFoundResult;
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
    // Production/Preview: Use R2
    if (r2Bucket) {
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

    // Workers without R2 is a config error
    if (isWorkersEnvironment()) {
      console.error('[Storage] R2 bucket required in preview/production');
      return { data: null };
    }

    // Local development: Use filesystem
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const LOCAL_UPLOAD_DIR = '.local-uploads';

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

    // Convert Buffer to ArrayBuffer
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
    // Production/Preview: Use R2
    if (r2Bucket) {
      await r2Bucket.delete(key);
      return { success: true, key };
    }

    // Workers without R2 is a config error
    if (isWorkersEnvironment()) {
      const errorMsg = 'R2 bucket required in preview/production';
      console.error(`[Storage] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // Local development: Use filesystem
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const LOCAL_UPLOAD_DIR = '.local-uploads';

    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));
    await fs.unlink(filePath);

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
    // Production/Preview: Use R2
    if (r2Bucket) {
      const object = await r2Bucket.head(key);
      return object !== null;
    }

    // Workers without R2 - return false (can't check)
    if (isWorkersEnvironment()) {
      console.error('[Storage] R2 bucket required in preview/production');
      return false;
    }

    // Local development: Check filesystem
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const LOCAL_UPLOAD_DIR = '.local-uploads';

    const filePath = path.join(LOCAL_UPLOAD_DIR, key.replace(/\//g, '_'));
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a multipart upload
 * Note: Multipart uploads REQUIRE R2 - no local dev simulation
 */
export async function createMultipartUpload(
  r2Bucket: R2Bucket | undefined,
  key: string,
  _metadata?: StorageMetadata,
): Promise<{ uploadId: string } | null> {
  try {
    // Production/Preview: Use R2 (REQUIRED for multipart)
    if (r2Bucket) {
      const upload = await r2Bucket.createMultipartUpload(key);
      return { uploadId: upload.uploadId };
    }

    // Multipart uploads require R2
    console.error('[Storage] R2 bucket required for multipart uploads');
    return null;
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
