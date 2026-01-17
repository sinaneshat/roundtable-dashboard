/**
 * PDF Text Extraction Service
 *
 * Extracts text from PDF files using unpdf (serverless PDF.js build).
 * Designed for Cloudflare Workers with memory-safe processing.
 *
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

/** Maximum file size to process (50MB - matches base64 limit) */
const MAX_PDF_SIZE_FOR_EXTRACTION = 50 * 1024 * 1024;

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
 * Check if a file should have PDF text extraction.
 */
export function shouldExtractPdfText(mimeType: string, fileSize: number): boolean {
  return mimeType === PDF_MIME_TYPE && fileSize <= MAX_PDF_SIZE_FOR_EXTRACTION;
}

/**
 * Process PDF upload and extract text.
 *
 * This function:
 * 1. Validates the upload is a PDF within size limits
 * 2. Fetches the file from R2
 * 3. Extracts text using unpdf
 * 4. Updates the upload record with extracted text in metadata
 *
 * Designed to be called in background (waitUntil) after upload completion.
 */
export async function processPdfUpload(params: ProcessPdfUploadParams): Promise<PdfExtractionResult> {
  const { uploadId, r2Key, fileSize, mimeType, r2Bucket, db } = params;

  // Skip non-PDFs
  if (mimeType !== PDF_MIME_TYPE) {
    return { success: true, text: undefined };
  }

  // Skip oversized files
  if (fileSize > MAX_PDF_SIZE_FOR_EXTRACTION) {
    return {
      success: false,
      error: `File too large for text extraction (max ${MAX_PDF_SIZE_FOR_EXTRACTION / 1024 / 1024}MB)`,
    };
  }

  try {
    // Fetch file from R2
    const { data } = await getFile(r2Bucket, r2Key);

    if (!data) {
      return {
        success: false,
        error: 'File not found in storage',
      };
    }

    // Extract text
    const result = await extractPdfText(data);

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
