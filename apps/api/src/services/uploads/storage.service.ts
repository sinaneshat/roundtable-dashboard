/**
 * Storage Service
 *
 * R2 storage operations following official Cloudflare patterns.
 * Includes local file storage fallback for development when R2 is unavailable.
 *
 * @see https://developers.cloudflare.com/r2/api/workers/workers-api-usage/
 */

import { Buffer } from 'node:buffer';

import type { StorageMetadata, StorageResult } from '@/types/uploads';

// ============================================================================
// R2 RETRY LOGIC (Platform Outage Resilience)
// ============================================================================

/**
 * Retry R2 operations with exponential backoff.
 * R2 can experience transient failures (5xx, timeouts) - retry logic is critical.
 *
 * @see cloudflare-r2 skill - Issue #13 platform outages
 */
async function r2WithRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message;

      // Check if error is transient/retryable
      const is5xxError
        = message.includes('500')
          || message.includes('502')
          || message.includes('503')
          || message.includes('504');

      const isRetryable
        = is5xxError
          || message.includes('network')
          || message.includes('timeout')
          || message.includes('temporarily unavailable');

      if (!isRetryable || attempt === maxRetries - 1) {
        throw lastError;
      }

      // Exponential backoff: 100ms, 200ms, 400ms (max ~700ms total)
      const delay = 100 * 2 ** attempt;
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }
  }

  throw lastError ?? new Error('R2 operation failed after retries');
}

// ============================================================================
// LOCAL FILE STORAGE FALLBACK (Development Only)
// ============================================================================

const LOCAL_STORAGE_DIR = '.uploads';
const IS_LOCAL_DEV = process.env.WEBAPP_ENV === 'local' || process.env.NODE_ENV === 'development';

/**
 * Get local file path for a storage key
 */
function getLocalPath(key: string) {
  // Sanitize key to prevent path traversal
  const sanitized = key.replace(/\.\./g, '').replace(/^\/+/, '');
  return `${LOCAL_STORAGE_DIR}/${sanitized}`;
}

/**
 * Dynamically import fs/promises (only works in Node.js environment)
 */
async function getFs(): Promise<typeof import('node:fs/promises') | null> {
  try {
    return await import('node:fs/promises');
  } catch {
    return null;
  }
}

/**
 * Dynamically import path module
 */
async function getPath(): Promise<typeof import('node:path') | null> {
  try {
    return await import('node:path');
  } catch {
    return null;
  }
}

/**
 * Store metadata alongside file
 */
async function writeMetadata(filePath: string, metadata: StorageMetadata | undefined): Promise<void> {
  if (!metadata) {
    return;
  }
  const fs = await getFs();
  if (!fs) {
    return;
  }
  try {
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify(metadata), 'utf-8');
  } catch {
    // Ignore metadata write failures
  }
}

/**
 * Read metadata for a file
 */
async function readMetadata(filePath: string): Promise<StorageMetadata | undefined> {
  const fs = await getFs();
  if (!fs) {
    return undefined;
  }
  try {
    const data = await fs.readFile(`${filePath}.meta.json`, 'utf-8');
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Local file storage: put file to filesystem
 */
async function putFileLocal(
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  const fs = await getFs();
  const path = await getPath();
  if (!fs || !path) {
    return { error: 'Local storage not available (Node.js fs module required)', success: false };
  }

  try {
    const filePath = getLocalPath(key);
    const dir = path.dirname(filePath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Convert data to Buffer
    let buffer: Buffer;
    if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else if (data instanceof Uint8Array) {
      buffer = Buffer.from(data);
    } else if (typeof data === 'string') {
      buffer = Buffer.from(data);
    } else if ('getReader' in data) {
      // ReadableStream - collect all chunks
      const reader = data.getReader();
      const chunks: Uint8Array[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        if (result.value) {
          chunks.push(result.value);
        }
        done = result.done;
      }
      buffer = Buffer.concat(chunks);
    } else {
      return { error: 'Unsupported data type', success: false };
    }

    await fs.writeFile(filePath, buffer);
    await writeMetadata(filePath, metadata);

    return { key, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local storage write failed';
    return { error: message, success: false };
  }
}

/**
 * Local file storage: get file stream from filesystem
 */
async function getFileStreamLocal(
  key: string,
): Promise<R2StreamResult> {
  const fs = await getFs();
  if (!fs) {
    return { body: null, found: false, httpEtag: '', size: 0, writeHttpMetadata: () => {} };
  }

  try {
    const filePath = getLocalPath(key);
    const stat = await fs.stat(filePath);
    const data = await fs.readFile(filePath);
    const metadata = await readMetadata(filePath);

    // Create a simple hash for ETag
    const hash = Buffer.from(data).toString('base64').slice(0, 32);
    const etag = `"${hash}"`;

    // Convert to ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(data));
        controller.close();
      },
    });

    return {
      body: stream,
      customMetadata: metadata?.customMetadata,
      found: true,
      httpEtag: etag,
      size: stat.size,
      writeHttpMetadata: (headers: Headers) => {
        if (metadata?.contentType) {
          headers.set('content-type', metadata.contentType);
        }
      },
    };
  } catch {
    return { body: null, found: false, httpEtag: '', size: 0, writeHttpMetadata: () => {} };
  }
}

/**
 * Local file storage: delete file from filesystem
 */
async function deleteFileLocal(key: string): Promise<StorageResult> {
  const fs = await getFs();
  if (!fs) {
    return { error: 'Local storage not available', success: false };
  }

  try {
    const filePath = getLocalPath(key);
    await fs.unlink(filePath);
    // Also try to delete metadata
    try {
      await fs.unlink(`${filePath}.meta.json`);
    } catch {
      // Ignore
    }
    return { key, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local storage delete failed';
    return { error: message, success: false };
  }
}

/**
 * Local file storage: check if file exists
 */
async function fileExistsLocal(key: string): Promise<boolean> {
  const fs = await getFs();
  if (!fs) {
    return false;
  }

  try {
    const filePath = getLocalPath(key);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// R2 STORAGE OPERATIONS (with local fallback)
// ============================================================================

export async function putFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
  data: ArrayBuffer | ReadableStream | string | Uint8Array,
  metadata?: StorageMetadata,
): Promise<StorageResult> {
  // Use local storage fallback in development when R2 is unavailable
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      return await putFileLocal(key, data, metadata);
    }
    return { error: 'R2 bucket binding required', success: false };
  }

  try {
    const putOptions: R2PutOptions = {};
    if (metadata?.customMetadata !== undefined) {
      putOptions.customMetadata = metadata.customMetadata;
    }
    if (metadata?.contentType !== undefined) {
      putOptions.httpMetadata = { contentType: metadata.contentType };
    }
    await r2WithRetry(async () => await r2Bucket.put(key, data, putOptions));
    return { key, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 upload failed';
    return { error: message, success: false };
  }
}

export async function getFileStream(
  r2Bucket: R2Bucket | undefined,
  key: string,
  options?: { onlyIf?: Headers; range?: Headers },
): Promise<R2StreamResult> {
  const notFound: R2StreamResult = {
    body: null,
    found: false,
    httpEtag: '',
    size: 0,
    writeHttpMetadata: () => {},
  };

  // Use local storage fallback in development when R2 is unavailable
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      return await getFileStreamLocal(key);
    }
    return notFound;
  }

  try {
    const getOptions: R2GetOptions = {};
    if (options?.onlyIf !== undefined) {
      getOptions.onlyIf = options.onlyIf;
    }
    if (options?.range !== undefined) {
      getOptions.range = options.range;
    }
    const object = await r2WithRetry(async () => await r2Bucket.get(key, getOptions));

    if (!object) {
      return notFound;
    }

    const result: R2StreamResult = {
      body: object.body,
      found: true,
      httpEtag: object.httpEtag,
      size: object.size,
      writeHttpMetadata: (headers: Headers) => object.writeHttpMetadata(headers),
    };
    if (object.customMetadata !== undefined) {
      result.customMetadata = object.customMetadata;
    }
    return result;
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
  customMetadata?: Record<string, string> | undefined;
};

export async function getFile(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<{ data: ArrayBuffer | null; metadata?: StorageMetadata | undefined }> {
  // Use local storage fallback in development when R2 is unavailable
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      const fs = await getFs();
      if (fs) {
        try {
          const filePath = getLocalPath(key);
          const data = await fs.readFile(filePath);
          const metadata = await readMetadata(filePath);
          return { data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), metadata };
        } catch {
          return { data: null };
        }
      }
    }
    return { data: null };
  }

  try {
    const object = await r2WithRetry(async () => await r2Bucket.get(key));
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
  // Use local storage fallback in development when R2 is unavailable
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      return await deleteFileLocal(key);
    }
    return { error: 'R2 bucket required', success: false };
  }

  try {
    await r2WithRetry(async () => await r2Bucket.delete(key));
    return { key, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'R2 delete failed';
    return { error: message, success: false };
  }
}

export async function fileExists(
  r2Bucket: R2Bucket | undefined,
  key: string,
): Promise<boolean> {
  // Use local storage fallback in development when R2 is unavailable
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      return await fileExistsLocal(key);
    }
    return false;
  }

  try {
    const object = await r2WithRetry(async () => await r2Bucket.head(key));
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
    return { error: `Source not found: ${sourceKey}`, success: false };
  }

  return await putFile(r2Bucket, destKey, data, metadata);
}

export async function createMultipartUpload(
  r2Bucket: R2Bucket | undefined,
  key: string,
  metadata?: StorageMetadata,
): Promise<{ uploadId: string } | null> {
  // Multipart uploads require R2 - no local fallback for multipart
  // Single-file uploads use putFile which has local fallback
  if (!r2Bucket) {
    if (IS_LOCAL_DEV) {
      console.error('[Storage] Multipart uploads not supported in local dev without R2. Use single-file upload instead.');
    }
    return null;
  }

  try {
    const multipartOptions: R2MultipartOptions = {};
    if (metadata?.customMetadata !== undefined) {
      multipartOptions.customMetadata = metadata.customMetadata;
    }
    if (metadata?.contentType !== undefined) {
      multipartOptions.httpMetadata = { contentType: metadata.contentType };
    }
    const upload = await r2WithRetry(async () => await r2Bucket.createMultipartUpload(key, multipartOptions));
    return { uploadId: upload.uploadId };
  } catch {
    return null;
  }
}

export function getPublicUrl(key: string, baseUrl: string) {
  return `${baseUrl}/api/v1/uploads/${encodeURIComponent(key)}/download`;
}

export function isLocalDevelopment(r2Bucket: R2Bucket | undefined) {
  return !r2Bucket;
}
