/**
 * Storage Service
 *
 * File storage operations using Cloudflare R2 following official patterns.
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
 * @see https://developers.cloudflare.com/workers/tutorials/upload-assets-with-r2/
 *
 * In production/preview: R2 bucket binding is REQUIRED
 * In local dev (next dev): Falls back to filesystem simulation
 *
 * @see /src/api/types/uploads.ts for type definitions
 */

import type { StorageMetadata, StorageResult } from '@/api/types/uploads';

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if running in Cloudflare Workers environment
 * Workers have `caches.default` which Node.js doesn't
 */
function isWorkersRuntime(): boolean {
  return typeof caches !== 'undefined' && 'default' in caches;
}

/**
 * Check if should use local filesystem storage
 * Forces local storage in local dev to avoid R2 proxy issues
 */
function shouldUseLocalStorage(r2Bucket: R2Bucket | undefined): boolean {
  // Check if running in local development
  // In Workers: NEXT_PUBLIC_WEBAPP_ENV is inlined at build time
  // In Node.js dev: Use NODE_ENV to detect development
  const isLocalDev = typeof caches === 'undefined'
    ? process.env.NODE_ENV === 'development'
    : false; // Workers always use R2 if available

  if (isLocalDev && !isWorkersRuntime()) {
    return true;
  }
  // No R2 bucket and not Workers = local fallback
  return !r2Bucket && !isWorkersRuntime();
}

/**
 * Check if in local development mode (no R2, not Workers)
 */
export function isLocalDevelopment(r2Bucket: R2Bucket | undefined): boolean {
  return shouldUseLocalStorage(r2Bucket);
}

// ============================================================================
// R2 STORAGE OPERATIONS (Official Cloudflare Patterns)
// ============================================================================

/**
 * Upload a file to R2 storage
 *
 * Following official pattern:
 * ```ts
 * await env.MY_BUCKET.put(key, request.body);
 * ```
 *
 * @see https://developers.cloudflare.com/r2/objects/upload-objects/
 */
export async function putFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  // Local development: use filesystem fallback (check first to avoid R2 proxy issues)
  if (shouldUseLocalStorage(r2Bucket)) {
    return putFileLocal(key, data, metadata);
  }

  // R2 available - use it (production/preview)
  if (r2Bucket) {
    try {
      await r2Bucket.put(key, data, {
        httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
        customMetadata: metadata?.customMetadata,
      });
      return { success: true, key };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'R2 upload failed';
      console.error(`[Storage] R2 put failed: ${message}`);
      return { success: false, error: message };
    }
  }

  // Workers runtime without R2 = configuration error
  if (isWorkersRuntime()) {
    const error = 'R2 bucket binding required. Check wrangler.jsonc UPLOADS_R2_BUCKET config.';
    console.error(`[Storage] ${error}`);
    return { success: false, error };
  }

  // Fallback (shouldn't reach here, but just in case)
  return putFileLocal(key, data, metadata);
}

/**
 * Fetch a file from R2 with streaming support
 *
 * Following official pattern for download responses:
 * ```ts
 * const object = await env.MY_BUCKET.get(key);
 * if (!object) return new Response("Not Found", { status: 404 });
 *
 * const headers = new Headers();
 * object.writeHttpMetadata(headers);
 * headers.set("etag", object.httpEtag);
 *
 * return new Response(object.body, { headers });
 * ```
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
 */
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

  // Local development: use filesystem fallback (check first to avoid R2 proxy issues)
  if (shouldUseLocalStorage(r2Bucket)) {
    return getFileStreamLocal(key);
  }

  // R2 available - use official pattern
  if (r2Bucket) {
    try {
      const object = await r2Bucket.get(key, {
        onlyIf: options?.onlyIf,
        range: options?.range,
      });

      if (!object)
        return notFound;

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

  // Workers without R2 = config error
  if (isWorkersRuntime()) {
    console.error('[Storage] R2 bucket required for file streaming');
    return notFound;
  }

  // Local development: filesystem fallback
  return getFileStreamLocal(key);
}

/**
 * Result type for streaming file retrieval
 * Matches R2Object interface for consistency
 */
export type R2StreamResult = {
  found: boolean;
  body: ReadableStream | null;
  writeHttpMetadata: (headers: Headers) => void;
  httpEtag: string;
  size: number;
  customMetadata?: Record<string, string>;
};

/**
 * Get file content as ArrayBuffer (buffers entire file)
 *
 * Use for: AI processing, file copies, small files
 * For HTTP downloads, prefer getFileStream()
 */
export async function getFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<{ data: ArrayBuffer | null; metadata?: StorageMetadata }> {
  // Local development: use filesystem fallback (check first)
  if (shouldUseLocalStorage(r2Bucket)) {
    return getFileLocal(key);
  }

  // R2 available
  if (r2Bucket) {
    try {
      const object = await r2Bucket.get(key);
      if (!object)
        return { data: null };

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

  // Workers without R2
  if (isWorkersRuntime()) {
    console.error('[Storage] R2 bucket required');
    return { data: null };
  }

  // Fallback
  return getFileLocal(key);
}

/**
 * Delete a file from R2
 *
 * Following official pattern:
 * ```ts
 * await env.MY_BUCKET.delete(key);
 * ```
 */
export async function deleteFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<StorageResult> {
  // Local development: use filesystem fallback (check first)
  if (shouldUseLocalStorage(r2Bucket)) {
    return deleteFileLocal(key);
  }

  if (r2Bucket) {
    try {
      await r2Bucket.delete(key);
      return { success: true, key };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'R2 delete failed';
      console.error(`[Storage] R2 delete failed: ${message}`);
      return { success: false, error: message };
    }
  }

  if (isWorkersRuntime()) {
    const error = 'R2 bucket required for deletion';
    console.error(`[Storage] ${error}`);
    return { success: false, error };
  }

  return deleteFileLocal(key);
}

/**
 * Check if a file exists in R2
 *
 * Following official pattern using head():
 * ```ts
 * const object = await env.MY_BUCKET.head(key);
 * return object !== null;
 * ```
 */
export async function fileExists(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<boolean> {
  // Local development: use filesystem fallback (check first)
  if (shouldUseLocalStorage(r2Bucket)) {
    return fileExistsLocal(key);
  }

  if (r2Bucket) {
    try {
      const object = await r2Bucket.head(key);
      return object !== null;
    } catch {
      return false;
    }
  }

  if (isWorkersRuntime()) {
    console.error('[Storage] R2 bucket required');
    return false;
  }

  return fileExistsLocal(key);
}

/**
 * Copy a file within storage
 */
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

/**
 * Create multipart upload (R2 only - no local fallback)
 */
export async function createMultipartUpload(
  r2Bucket: R2Bucket | undefined,
  key: string,
  metadata?: StorageMetadata,
): Promise<{ uploadId: string } | null> {
  if (!r2Bucket) {
    console.error('[Storage] R2 required for multipart uploads');
    return null;
  }

  try {
    const upload = await r2Bucket.createMultipartUpload(key, {
      httpMetadata: metadata?.contentType ? { contentType: metadata.contentType } : undefined,
      customMetadata: metadata?.customMetadata,
    });
    return { uploadId: upload.uploadId };
  } catch (error) {
    console.error('[Storage] Multipart upload creation failed:', error);
    return null;
  }
}

/**
 * Generate download URL for a file
 */
export function getPublicUrl(key: string, baseUrl: string): string {
  return `${baseUrl}/api/v1/uploads/${encodeURIComponent(key)}/download`;
}

// ============================================================================
// LOCAL FILESYSTEM FALLBACK (Development Only)
// ============================================================================

const LOCAL_DIR = '.local-uploads';
// Wrangler stores R2 objects in this directory when using `pnpm preview`
const WRANGLER_R2_DIR = '.wrangler/state/r2/roundtable-dashboard-r2-uploads-local';

/**
 * Cross-realm safe ArrayBuffer check
 * instanceof can fail for ArrayBuffers from different JS contexts
 */
function isArrayBuffer(value: unknown): value is ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return true;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    return proto?.constructor?.name === 'ArrayBuffer';
  }
  return false;
}

/**
 * Type guard for ReadableStream
 * ✅ TYPE-SAFE: Replaces `as ReadableStream` casting
 */
function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    value != null
    && typeof value === 'object'
    && 'getReader' in value
    && typeof value.getReader === 'function'
  );
}

async function putFileLocal(
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  try {
    const { Buffer } = await import('node:buffer');
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    await fs.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));

    // Convert to buffer (cross-realm safe checks)
    let buffer: Uint8Array;
    if (Buffer.isBuffer(data)) {
      // Buffer extends Uint8Array - assign directly
      buffer = data;
    } else if (isArrayBuffer(data)) {
      buffer = Buffer.from(data);
    } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
      buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else if (isReadableStream(data)) {
      // ✅ TYPE-SAFE: Use type guard instead of force casting
      const chunks: Uint8Array[] = [];
      const reader = data.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        if (value)
          chunks.push(value);
      }
      buffer = Buffer.concat(chunks);
    } else {
      throw new TypeError(`Unsupported data type: ${typeof data}`);
    }

    await fs.writeFile(filePath, buffer);

    if (metadata) {
      await fs.writeFile(`${filePath}.meta.json`, JSON.stringify(metadata, null, 2));
    }

    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local write failed';
    console.error(`[Storage] Local put failed: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Try to read file from Wrangler R2 state directory
 * Wrangler stores R2 objects with their original key path structure
 */
async function tryReadFromWranglerR2(key: string): Promise<Uint8Array | null> {
  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    // Wrangler stores files with their original path structure
    const filePath = path.join(WRANGLER_R2_DIR, key);
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

async function getFileStreamLocal(key: string): Promise<R2StreamResult> {
  const notFound: R2StreamResult = {
    found: false,
    body: null,
    writeHttpMetadata: () => {},
    httpEtag: '',
    size: 0,
  };

  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    // First try LOCAL_DIR (pnpm dev uploads)
    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
    let fileBuffer: Uint8Array;
    let metadata: StorageMetadata | undefined;

    try {
      fileBuffer = await fs.readFile(filePath);
      // Try to read metadata
      try {
        const metaData = await fs.readFile(`${filePath}.meta.json`, 'utf-8');
        metadata = JSON.parse(metaData);
      } catch {
        // No metadata
      }
    } catch {
      // File not found in LOCAL_DIR, try Wrangler R2 state (pnpm preview uploads)
      const wranglerBuffer = await tryReadFromWranglerR2(key);
      if (!wranglerBuffer) {
        return notFound;
      }
      fileBuffer = wranglerBuffer;
      // No metadata file for Wrangler R2 uploads - infer from key if possible
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(fileBuffer));
        controller.close();
      },
    });

    return {
      found: true,
      body: stream,
      writeHttpMetadata: (headers: Headers) => {
        if (metadata?.contentType) {
          headers.set('content-type', metadata.contentType);
        }
      },
      httpEtag: `"${fileBuffer.length.toString(16)}"`,
      size: fileBuffer.length,
      customMetadata: metadata?.customMetadata,
    };
  } catch {
    return notFound;
  }
}

async function getFileLocal(
  key: string,
): Promise<{ data: ArrayBuffer | null; metadata?: StorageMetadata }> {
  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    // First try LOCAL_DIR (pnpm dev uploads)
    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
    let fileBuffer: Uint8Array;
    let metadata: StorageMetadata | undefined;

    try {
      fileBuffer = await fs.readFile(filePath);
      // Try to read metadata
      try {
        const metaData = await fs.readFile(`${filePath}.meta.json`, 'utf-8');
        metadata = JSON.parse(metaData);
      } catch {
        // No metadata
      }
    } catch {
      // File not found in LOCAL_DIR, try Wrangler R2 state (pnpm preview uploads)
      const wranglerBuffer = await tryReadFromWranglerR2(key);
      if (!wranglerBuffer) {
        return { data: null };
      }
      fileBuffer = wranglerBuffer;
    }

    // Convert Uint8Array to ArrayBuffer
    // ✅ TYPE-SAFE: Proper conversion handling both buffer types
    // Create a new ArrayBuffer to ensure proper type (not SharedArrayBuffer)
    const arrayBuffer = new ArrayBuffer(fileBuffer.byteLength);
    const view = new Uint8Array(arrayBuffer);
    view.set(fileBuffer);

    return { data: arrayBuffer, metadata };
  } catch {
    return { data: null };
  }
}

async function deleteFileLocal(key: string): Promise<StorageResult> {
  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
    await fs.unlink(filePath);
    await fs.unlink(`${filePath}.meta.json`).catch(() => {});

    return { success: true, key };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local delete failed';
    console.error(`[Storage] Local delete failed: ${message}`);
    return { success: false, error: message };
  }
}

async function fileExistsLocal(key: string): Promise<boolean> {
  try {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');

    // First try LOCAL_DIR (pnpm dev uploads)
    const filePath = path.join(LOCAL_DIR, key.replace(/\//g, '_'));
    try {
      await fs.access(filePath);
      return true;
    } catch {
      // File not found in LOCAL_DIR, try Wrangler R2 state (pnpm preview uploads)
      const wranglerPath = path.join(WRANGLER_R2_DIR, key);
      await fs.access(wranglerPath);
      return true;
    }
  } catch {
    return false;
  }
}
