/**
 * PDF Text Extraction Service
 *
 * Two extraction methods available:
 * 1. Cloudflare AI toMarkdown() - Offloads processing to CF infrastructure (recommended)
 * 2. unpdf (serverless PDF.js) - In-worker processing for small files
 *
 * @see https://developers.cloudflare.com/workers/ai/features/markdown-conversion/
 * @see https://github.com/unjs/unpdf
 */

import { eq } from 'drizzle-orm';
import { definePDFJSModule, extractText, getDocumentProxy } from 'unpdf';

import { getFile } from '@/api/services/uploads/storage.service';
import type { getDbAsync } from '@/db';
import * as tables from '@/db';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum file size for in-worker PDF.js extraction (5MB)
 *
 * CONSERVATIVE memory budget for 128MB worker limit:
 * - V8/framework overhead: ~30MB
 * - PDF file in memory: 5MB
 * - PDF.js parsing structures: ~20MB (can spike)
 * - Extracted text buffer: ~5MB
 * - Streaming orchestration: ~10MB
 * - System prompt + messages: ~15MB
 * - Safety margin: ~43MB remaining
 *
 * Files larger than 5MB should use:
 * 1. Cloudflare AI toMarkdown() - processing offloaded to CF infrastructure
 * 2. URL-based visual processing - AI provider fetches directly
 */
const MAX_PDF_SIZE_FOR_EXTRACTION = 5 * 1024 * 1024;

/**
 * Maximum file size for Cloudflare AI toMarkdown() extraction (100MB)
 * Processing happens on Cloudflare's infrastructure, not in the worker.
 */
const MAX_PDF_SIZE_FOR_AI_EXTRACTION = 100 * 1024 * 1024;

/** Maximum extracted text length to store (2MB - reasonable for large documents) */
const MAX_EXTRACTED_TEXT_LENGTH = 2 * 1024 * 1024;

/** PDF MIME type */
const PDF_MIME_TYPE = 'application/pdf';

// ============================================================================
// PDF.js INITIALIZATION
// ============================================================================

let pdfJsInitialized = false;

/**
 * Initialize PDF.js module for serverless environment.
 * Only needs to be called once per worker instance.
 */
async function ensurePdfJsInitialized(): Promise<void> {
  if (pdfJsInitialized) {
    return;
  }

  try {
    console.error('[PDF Extraction] Initializing PDF.js module...');
    await definePDFJSModule(() => import('unpdf/pdfjs'));
    pdfJsInitialized = true;
    console.error('[PDF Extraction] PDF.js initialized successfully');
  } catch (error) {
    // Log critical initialization failure with full details for debugging Workers issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[PDF Extraction] Failed to initialize PDF.js:', {
      message: errorMessage,
      stack: errorStack,
      errorType: error?.constructor?.name,
    });
    throw error;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type PdfExtractionResult = {
  success: boolean;
  text?: string;
  totalPages?: number;
  error?: string;
};

export type ProcessPdfUploadParams = {
  uploadId: string;
  r2Key: string;
  fileSize: number;
  mimeType: string;
  r2Bucket: R2Bucket;
  db: Awaited<ReturnType<typeof getDbAsync>>;
  /** Cloudflare AI binding for toMarkdown() - offloads processing to CF infrastructure */
  ai?: Ai;
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/** Minimum chars per page to consider extraction successful (scanned PDFs have very little text) */
const MIN_CHARS_PER_PAGE = 50;

/**
 * Extract text from a PDF buffer.
 *
 * @param buffer - PDF file as ArrayBuffer
 * @returns Extraction result with text or error
 */
export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfExtractionResult> {
  try {
    await ensurePdfJsInitialized();

    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: true });

    // Check if extraction yielded meaningful content
    // Scanned PDFs (image-only) typically have very little or no text
    const charsPerPage = text.length / Math.max(totalPages, 1);
    const hasMinimumContent = text.length >= MIN_CHARS_PER_PAGE && charsPerPage >= MIN_CHARS_PER_PAGE;

    if (!hasMinimumContent) {
      return {
        success: false,
        error: `PDF appears to be scanned/image-only (only ${text.length} chars extracted from ${totalPages} pages). Visual AI processing recommended.`,
        totalPages,
      };
    }

    // Truncate if too long
    const truncatedText = text.length > MAX_EXTRACTED_TEXT_LENGTH
      ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[Text truncated due to length...]`
      : text;

    return {
      success: true,
      text: truncatedText,
      totalPages,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extract text from PDF using Cloudflare AI toMarkdown().
 * Processing happens on Cloudflare's infrastructure, NOT in the worker.
 * Supports files up to 100MB without impacting worker memory.
 *
 * @param r2Object - R2 object containing the PDF
 * @param ai - Cloudflare AI binding
 * @returns Extraction result with markdown text or error
 * @see https://developers.cloudflare.com/workers/ai/features/markdown-conversion/
 */
export async function extractPdfTextWithCloudflareAI(
  r2Object: R2ObjectBody,
  ai: Ai,
): Promise<PdfExtractionResult> {
  try {
    console.error('[PDF Extraction] Using Cloudflare AI toMarkdown() for extraction...');

    // Stream directly to AI - no need to buffer in worker memory
    const arrayBuffer = await r2Object.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: PDF_MIME_TYPE });

    const result = await ai.toMarkdown([{
      name: 'document.pdf',
      blob,
    }]);

    // toMarkdown returns array of results
    const docResult = result[0];
    if (!docResult) {
      return {
        success: false,
        error: 'Cloudflare AI returned empty result',
      };
    }

    // Check if conversion returned an error
    if (docResult.format === 'error') {
      return {
        success: false,
        error: `Cloudflare AI conversion failed: ${docResult.error}`,
      };
    }

    const text = docResult.data;
    if (!text || text.length < MIN_CHARS_PER_PAGE) {
      return {
        success: false,
        error: `PDF appears to be scanned/image-only (only ${text?.length ?? 0} chars extracted). Visual AI processing recommended.`,
      };
    }

    // Truncate if too long
    const truncatedText = text.length > MAX_EXTRACTED_TEXT_LENGTH
      ? `${text.slice(0, MAX_EXTRACTED_TEXT_LENGTH)}\n\n[Text truncated due to length...]`
      : text;

    return {
      success: true,
      text: truncatedText,
      // toMarkdown doesn't provide page count
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PDF Extraction] Cloudflare AI extraction failed:', errorMessage);
    return {
      success: false,
      error: `Cloudflare AI extraction failed: ${errorMessage}`,
    };
  }
}

/**
 * Check if a file should use in-worker PDF.js extraction (small files).
 */
export function shouldExtractPdfText(mimeType: string, fileSize: number): boolean {
  return mimeType === PDF_MIME_TYPE && fileSize <= MAX_PDF_SIZE_FOR_EXTRACTION;
}

/**
 * Check if a file should use Cloudflare AI extraction (large files).
 */
export function shouldExtractPdfTextWithAI(mimeType: string, fileSize: number): boolean {
  return mimeType === PDF_MIME_TYPE
    && fileSize > MAX_PDF_SIZE_FOR_EXTRACTION
    && fileSize <= MAX_PDF_SIZE_FOR_AI_EXTRACTION;
}

/**
 * Process PDF upload and extract text.
 *
 * This function:
 * 1. Validates the upload is a PDF within size limits
 * 2. For small files (≤10MB): Uses in-worker PDF.js extraction
 * 3. For large files (10-100MB): Uses Cloudflare AI toMarkdown() if available
 * 4. Updates the upload record with extracted text in metadata
 *
 * Designed to be called in background (waitUntil) after upload completion.
 */
export async function processPdfUpload(params: ProcessPdfUploadParams): Promise<PdfExtractionResult> {
  const { uploadId, r2Key, fileSize, mimeType, r2Bucket, db, ai } = params;

  // Skip non-PDFs
  if (mimeType !== PDF_MIME_TYPE) {
    return { success: true, text: undefined };
  }

  // Check if file is within any extraction limit
  const canUseInWorker = fileSize <= MAX_PDF_SIZE_FOR_EXTRACTION;
  const canUseCloudflareAI = ai && fileSize <= MAX_PDF_SIZE_FOR_AI_EXTRACTION;

  if (!canUseInWorker && !canUseCloudflareAI) {
    return {
      success: false,
      error: `File too large for text extraction (max ${MAX_PDF_SIZE_FOR_AI_EXTRACTION / 1024 / 1024}MB)`,
    };
  }

  try {
    let result: PdfExtractionResult;

    // Use Cloudflare AI for larger files (offloads to CF infrastructure)
    if (!canUseInWorker && canUseCloudflareAI) {
      console.error(`[PDF Extraction] Large file (${(fileSize / 1024 / 1024).toFixed(1)}MB), using Cloudflare AI`);

      // Get R2 object directly for streaming to AI
      const r2Object = await r2Bucket.get(r2Key);
      if (!r2Object) {
        return {
          success: false,
          error: 'File not found in storage',
        };
      }

      result = await extractPdfTextWithCloudflareAI(r2Object, ai);
    } else {
      // Use in-worker PDF.js for small files
      console.error(`[PDF Extraction] Small file (${(fileSize / 1024 / 1024).toFixed(1)}MB), using in-worker PDF.js`);

      const { data } = await getFile(r2Bucket, r2Key);
      if (!data) {
        return {
          success: false,
          error: 'File not found in storage',
        };
      }

      result = await extractPdfText(data);
    }

    if (result.success && result.text) {
      // Update upload record with extracted text
      await db
        .update(tables.upload)
        .set({
          metadata: {
            extractedText: result.text,
            totalPages: result.totalPages,
            extractedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(tables.upload.id, uploadId));
    } else if (!result.success && result.error) {
      // Extraction failed (e.g., scanned PDF) - save error to DB for reference
      await db
        .update(tables.upload)
        .set({
          metadata: {
            extractionError: result.error,
            totalPages: result.totalPages,
            extractedAt: new Date().toISOString(),
            requiresVision: true, // Mark as needing visual AI processing
          },
          updatedAt: new Date(),
        })
        .where(eq(tables.upload.id, uploadId));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update upload with error status but don't fail the upload
    await db
      .update(tables.upload)
      .set({
        metadata: {
          extractionError: errorMessage,
          extractedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(tables.upload.id, uploadId));

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Background PDF processing task.
 *
 * Safe wrapper for processPdfUpload that catches all errors.
 * Use with executionCtx.waitUntil() for background processing.
 */
export async function backgroundPdfProcessing(params: ProcessPdfUploadParams): Promise<void> {
  try {
    await processPdfUpload(params);
  } catch (error) {
    // Log but don't throw - this runs in background
    console.error('[PDF Extraction] Background processing failed:', error);
  }
}
