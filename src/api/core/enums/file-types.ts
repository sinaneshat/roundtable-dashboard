import { z } from '@hono/zod-openapi';

// ============================================================================
// CHAT ATTACHMENT STATUS (File Upload Processing)
// ============================================================================

export const CHAT_ATTACHMENT_STATUSES = [
  'uploading',
  'uploaded',
  'processing',
  'ready',
  'failed',
] as const;

export const DEFAULT_CHAT_ATTACHMENT_STATUS: ChatAttachmentStatus = 'uploaded';

export const ChatAttachmentStatusSchema = z.enum(CHAT_ATTACHMENT_STATUSES).openapi({
  description: 'File attachment upload/processing lifecycle status',
  example: 'ready',
});

export type ChatAttachmentStatus = z.infer<typeof ChatAttachmentStatusSchema>;

export const ChatAttachmentStatuses = {
  UPLOADING: 'uploading' as const,
  UPLOADED: 'uploaded' as const,
  PROCESSING: 'processing' as const,
  READY: 'ready' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// ALLOWED MIME TYPES (File Upload Validation)
// ============================================================================

export const ALLOWED_MIME_TYPES = [
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/javascript',
  // Code
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-typescript',
] as const;

export const AllowedMimeTypeSchema = z.enum(ALLOWED_MIME_TYPES).openapi({
  description: 'MIME types allowed for file uploads',
  example: 'image/png',
});

export type AllowedMimeType = z.infer<typeof AllowedMimeTypeSchema>;

// ============================================================================
// IMAGE MIME TYPES
// ============================================================================

export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/bmp',
  'image/tiff',
] as const;

export const ImageMimeTypeSchema = z.enum(IMAGE_MIME_TYPES).openapi({
  description: 'Image MIME types',
  example: 'image/png',
});

export type ImageMimeType = z.infer<typeof ImageMimeTypeSchema>;

export const ImageMimeTypes = {
  PNG: 'image/png' as const,
  JPEG: 'image/jpeg' as const,
  GIF: 'image/gif' as const,
  WEBP: 'image/webp' as const,
  SVG: 'image/svg+xml' as const,
  AVIF: 'image/avif' as const,
  HEIC: 'image/heic' as const,
  HEIF: 'image/heif' as const,
  BMP: 'image/bmp' as const,
  TIFF: 'image/tiff' as const,
} as const;

// ============================================================================
// DOCUMENT MIME TYPES
// ============================================================================

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const DocumentMimeTypeSchema = z.enum(DOCUMENT_MIME_TYPES).openapi({
  description: 'Document MIME types',
  example: 'application/pdf',
});

export type DocumentMimeType = z.infer<typeof DocumentMimeTypeSchema>;

export const DocumentMimeTypes = {
  PDF: 'application/pdf' as const,
  DOC: 'application/msword' as const,
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const,
  XLS: 'application/vnd.ms-excel' as const,
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const,
  PPT: 'application/vnd.ms-powerpoint' as const,
  PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' as const,
} as const;

// ============================================================================
// TEXT MIME TYPES
// ============================================================================

export const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
] as const;

export const TextMimeTypeSchema = z.enum(TEXT_MIME_TYPES).openapi({
  description: 'Text MIME types',
  example: 'text/plain',
});

export type TextMimeType = z.infer<typeof TextMimeTypeSchema>;

export const TextMimeTypes = {
  PLAIN: 'text/plain' as const,
  MARKDOWN: 'text/markdown' as const,
  CSV: 'text/csv' as const,
  HTML: 'text/html' as const,
  JSON: 'application/json' as const,
} as const;

// ============================================================================
// CODE MIME TYPES
// ============================================================================

export const CODE_MIME_TYPES = [
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
] as const;

export const CodeMimeTypeSchema = z.enum(CODE_MIME_TYPES).openapi({
  description: 'Code MIME types',
  example: 'text/javascript',
});

export type CodeMimeType = z.infer<typeof CodeMimeTypeSchema>;

export const CodeMimeTypes = {
  JAVASCRIPT: 'text/javascript' as const,
  JAVASCRIPT_APP: 'application/javascript' as const,
  TYPESCRIPT: 'text/typescript' as const,
  PYTHON: 'text/x-python' as const,
  JAVA: 'text/x-java-source' as const,
  C: 'text/x-c' as const,
  CPP: 'text/x-c++' as const,
} as const;

// ============================================================================
// MIME TYPE CATEGORIES (for categorization and validation)
// ============================================================================

export const MIME_TYPE_CATEGORIES = {
  image: IMAGE_MIME_TYPES,
  document: DOCUMENT_MIME_TYPES,
  text: TEXT_MIME_TYPES,
  code: CODE_MIME_TYPES,
} as const;

export const IMAGE_MIMES: readonly string[] = IMAGE_MIME_TYPES;
export const DOCUMENT_MIMES: readonly string[] = DOCUMENT_MIME_TYPES;
export const TEXT_MIMES: readonly string[] = TEXT_MIME_TYPES;
export const CODE_MIMES: readonly string[] = CODE_MIME_TYPES;

// ============================================================================
// TEXT EXTRACTABLE MIME TYPES (RAG Content Extraction)
// ============================================================================

export const TEXT_EXTRACTABLE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'application/javascript',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-c++',
  'text/x-typescript',
] as const;

export const TextExtractableMimeTypeSchema = z.enum(TEXT_EXTRACTABLE_MIME_TYPES).openapi({
  description: 'MIME types that support text extraction for RAG',
  example: 'text/plain',
});

export type TextExtractableMimeType = z.infer<typeof TextExtractableMimeTypeSchema>;

export const MAX_TEXT_CONTENT_SIZE = 100 * 1024;

// ============================================================================
// VISUAL MIME TYPES (Images and PDFs)
// ============================================================================

export const VISUAL_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
] as const;

export const VisualMimeTypeSchema = z.enum(VISUAL_MIME_TYPES).openapi({
  description: 'MIME types that can be visually rendered (images and PDFs)',
  example: 'image/png',
});

export type VisualMimeType = z.infer<typeof VisualMimeTypeSchema>;

export function isVisualMimeType(mimeType: unknown): mimeType is VisualMimeType {
  return VisualMimeTypeSchema.safeParse(mimeType).success;
}

// ============================================================================
// AI MODEL PROCESSABLE MIME TYPES
// All file types that should be converted to data URLs for AI consumption.
// External AI providers cannot access localhost URLs, so ALL attachments
// must be converted to base64 data URLs before sending to models.
// ============================================================================

export const AI_PROCESSABLE_MIME_TYPES = [
  // Visual types (images + PDF)
  ...IMAGE_MIME_TYPES,
  'application/pdf',
  // Text extractable types
  ...TEXT_EXTRACTABLE_MIME_TYPES,
] as const;

// De-duplicated set for runtime checks
export const AI_PROCESSABLE_MIME_SET = new Set<string>(AI_PROCESSABLE_MIME_TYPES);

export function isAiProcessableMimeType(mimeType: string): boolean {
  return AI_PROCESSABLE_MIME_SET.has(mimeType);
}

// ============================================================================
// INCOMPATIBILITY REASON ENUM (5-part pattern)
// ============================================================================

// 1. ARRAY CONSTANT - Source of truth
export const INCOMPATIBILITY_REASONS = ['noVision'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_INCOMPATIBILITY_REASON: IncompatibilityReason = 'noVision';

// 3. ZOD SCHEMA - Runtime validation + OpenAPI docs
export const IncompatibilityReasonSchema = z.enum(INCOMPATIBILITY_REASONS).openapi({
  description: 'Reason why a model is incompatible with attached files',
  example: 'noVision',
});

// 4. TYPESCRIPT TYPE - Inferred from Zod schema
export type IncompatibilityReason = z.infer<typeof IncompatibilityReasonSchema>;

// 5. CONSTANT OBJECT - For usage in code (prevents typos)
export const IncompatibilityReasons = {
  NO_VISION: 'noVision' as const,
} as const;

// ============================================================================
// FILE TYPE LABELS (Human-Readable File Type Display)
// ============================================================================

export const FILE_TYPE_LABELS = {
  // Images
  'image/png': 'PNG Image',
  'image/jpeg': 'JPEG Image',
  'image/gif': 'GIF Image',
  'image/webp': 'WebP Image',
  'image/svg+xml': 'SVG Image',
  // Documents
  'application/pdf': 'PDF Document',
  'application/msword': 'Word Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.ms-excel': 'Excel Spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  // Text
  'text/plain': 'Text File',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV File',
  'text/html': 'HTML File',
  'application/json': 'JSON File',
  // Code
  'text/javascript': 'JavaScript',
  'application/javascript': 'JavaScript',
  'text/typescript': 'TypeScript',
  'text/x-python': 'Python',
  'text/x-java-source': 'Java',
  'text/x-c': 'C',
  'text/x-c++': 'C++',
} as const satisfies Partial<Record<AllowedMimeType | 'text/typescript' | 'text/x-java-source' | 'text/x-c++', string>>;

export type FileTypeLabelMimeType = keyof typeof FILE_TYPE_LABELS;

export function getFileTypeLabelFromMime(mimeType: string): string {
  return FILE_TYPE_LABELS[mimeType as FileTypeLabelMimeType] ?? 'File';
}

// ============================================================================
// UPLOAD SIZE CONSTANTS (R2/S3 Limits)
// ============================================================================

export const MAX_SINGLE_UPLOAD_SIZE = 100 * 1024 * 1024;
export const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;
export const RECOMMENDED_PART_SIZE = 10 * 1024 * 1024;
export const MAX_TOTAL_FILE_SIZE = 5 * 1024 * 1024 * 1024;
export const MAX_FILENAME_LENGTH = 255;
export const MAX_MULTIPART_PARTS = 10000;

/**
 * Threshold for switching from base64 to URL-based file delivery.
 *
 * Files at or below this size use base64 encoding (fast, reliable).
 * Files above this size use signed public URLs for AI provider access.
 *
 * This limit exists because base64 encoding requires significant memory
 * in Cloudflare Workers (128MB limit):
 * - 4MB file → ~5.3MB base64 string (33% larger)
 * - Plus Uint8Array copy: ~4MB
 * - Plus ArrayBuffer: ~4MB
 * - Total per file: ~13.3MB
 *
 * @see MAX_BASE64_FILE_SIZE in src/api/types/uploads.ts (backend equivalent)
 */
export const URL_FILE_SIZE_THRESHOLD = 4 * 1024 * 1024; // 4MB

/**
 * Maximum image file size when using URL-based delivery.
 * AI providers (OpenAI, Anthropic, Google) can fetch images from URLs.
 * ChatGPT supports ~20MB images.
 */
export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Maximum PDF file size when using URL-based delivery.
 * AI providers can fetch PDFs from URLs for document analysis.
 */
export const MAX_PDF_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// ============================================================================
// UPLOAD STATUS (Frontend Upload Lifecycle)
// ============================================================================

export const UPLOAD_STATUSES = [
  'pending',
  'validating',
  'uploading',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

export const DEFAULT_UPLOAD_STATUS: UploadStatus = 'pending';

export const UploadStatusSchema = z.enum(UPLOAD_STATUSES).openapi({
  description: 'Frontend upload operation lifecycle status',
  example: 'uploading',
});

export type UploadStatus = z.infer<typeof UploadStatusSchema>;

export const UploadStatuses = {
  PENDING: 'pending' as const,
  VALIDATING: 'validating' as const,
  UPLOADING: 'uploading' as const,
  PROCESSING: 'processing' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  CANCELLED: 'cancelled' as const,
} as const;

// ============================================================================
// UPLOAD STRATEGY (Single vs Multipart)
// ============================================================================

export const UPLOAD_STRATEGIES = ['single', 'multipart'] as const;

export const DEFAULT_UPLOAD_STRATEGY: UploadStrategy = 'single';

export const UploadStrategySchema = z.enum(UPLOAD_STRATEGIES).openapi({
  description: 'Upload method based on file size',
  example: 'single',
});

export type UploadStrategy = z.infer<typeof UploadStrategySchema>;

export const UploadStrategies = {
  SINGLE: 'single' as const,
  MULTIPART: 'multipart' as const,
} as const;

// ============================================================================
// FILE PREVIEW TYPE (Client-Side Preview Categories)
// Also used as high-level file category classification
// ============================================================================

export const FILE_PREVIEW_TYPES = [
  'image',
  'pdf',
  'text',
  'code',
  'document',
  'unknown',
] as const;

export const DEFAULT_FILE_PREVIEW_TYPE: FilePreviewType = 'unknown';

export const FilePreviewTypeSchema = z.enum(FILE_PREVIEW_TYPES).openapi({
  description: 'File type category for preview generation',
  example: 'image',
});

export type FilePreviewType = z.infer<typeof FilePreviewTypeSchema>;

export const FilePreviewTypes = {
  IMAGE: 'image' as const,
  PDF: 'pdf' as const,
  TEXT: 'text' as const,
  CODE: 'code' as const,
  DOCUMENT: 'document' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export const FILE_PREVIEW_TYPE_LABELS: Record<FilePreviewType, string> = {
  [FilePreviewTypes.IMAGE]: 'Image',
  [FilePreviewTypes.PDF]: 'PDF',
  [FilePreviewTypes.TEXT]: 'Text',
  [FilePreviewTypes.CODE]: 'Code',
  [FilePreviewTypes.DOCUMENT]: 'Document',
  [FilePreviewTypes.UNKNOWN]: 'File',
};

// ============================================================================
// FILE CATEGORY
// ============================================================================

export const FILE_CATEGORIES = ['image', 'document', 'text', 'code', 'other'] as const;

export const DEFAULT_FILE_CATEGORY: FileCategory = 'other';

export const FileCategorySchema = z.enum(FILE_CATEGORIES).openapi({
  description: 'High-level file type classification',
  example: 'image',
});

export type FileCategory = z.infer<typeof FileCategorySchema>;

export const FileCategories = {
  IMAGE: 'image' as const,
  DOCUMENT: 'document' as const,
  TEXT: 'text' as const,
  CODE: 'code' as const,
  OTHER: 'other' as const,
} as const;

// ============================================================================
// FILE VALIDATION ERROR CODE
// ============================================================================

export const FILE_VALIDATION_ERROR_CODES = [
  'file_too_large',
  'visual_file_too_large',
  'invalid_type',
  'empty_file',
  'filename_too_long',
] as const;

export const FileValidationErrorCodeSchema = z.enum(FILE_VALIDATION_ERROR_CODES).openapi({
  description: 'File validation failure reason code',
  example: 'file_too_large',
});

export type FileValidationErrorCode = z.infer<typeof FileValidationErrorCodeSchema>;

export const FileValidationErrorCodes = {
  FILE_TOO_LARGE: 'file_too_large' as const,
  VISUAL_FILE_TOO_LARGE: 'visual_file_too_large' as const,
  INVALID_TYPE: 'invalid_type' as const,
  EMPTY_FILE: 'empty_file' as const,
  FILENAME_TOO_LONG: 'filename_too_long' as const,
} as const;

// ============================================================================
// FILE ICON NAME (Lucide icon names for file type visualization)
// ============================================================================

export const FILE_ICON_NAMES = [
  'image',
  'file-text',
  'file-code',
  'file',
] as const;

export const DEFAULT_FILE_ICON_NAME: FileIconName = 'file';

export const FileIconNameSchema = z.enum(FILE_ICON_NAMES).openapi({
  description: 'Lucide icon name for file type visualization',
  example: 'file-text',
});

export type FileIconName = z.infer<typeof FileIconNameSchema>;

export const FileIconNames = {
  IMAGE: 'image' as const,
  FILE_TEXT: 'file-text' as const,
  FILE_CODE: 'file-code' as const,
  FILE: 'file' as const,
} as const;

export const FILE_TYPE_TO_ICON: Record<FilePreviewType, FileIconName> = {
  [FilePreviewTypes.IMAGE]: FileIconNames.IMAGE,
  [FilePreviewTypes.PDF]: FileIconNames.FILE_TEXT,
  [FilePreviewTypes.TEXT]: FileIconNames.FILE_TEXT,
  [FilePreviewTypes.CODE]: FileIconNames.FILE_CODE,
  [FilePreviewTypes.DOCUMENT]: FileIconNames.FILE,
  [FilePreviewTypes.UNKNOWN]: FileIconNames.FILE,
};

// ============================================================================
// SINGLE SOURCE OF TRUTH: FILE CATEGORY DETECTION
// ============================================================================

/**
 * Get file category from MIME type - SINGLE SOURCE OF TRUTH
 * Use this for file validation classification
 */
export function getFileCategoryFromMime(mimeType: string): FileCategory {
  if (IMAGE_MIMES.includes(mimeType))
    return FileCategories.IMAGE;
  if (DOCUMENT_MIMES.includes(mimeType))
    return FileCategories.DOCUMENT;
  if (TEXT_MIMES.includes(mimeType))
    return FileCategories.TEXT;
  if (CODE_MIMES.includes(mimeType))
    return FileCategories.CODE;
  return FileCategories.OTHER;
}

/**
 * Get preview type from MIME type - SINGLE SOURCE OF TRUTH
 * Use this for UI preview rendering
 */
export function getPreviewTypeFromMime(mimeType: string): FilePreviewType {
  if (IMAGE_MIMES.includes(mimeType))
    return FilePreviewTypes.IMAGE;
  if (mimeType === 'application/pdf')
    return FilePreviewTypes.PDF;
  if (DOCUMENT_MIMES.includes(mimeType))
    return FilePreviewTypes.DOCUMENT;
  if (TEXT_MIMES.includes(mimeType))
    return FilePreviewTypes.TEXT;
  if (CODE_MIMES.includes(mimeType))
    return FilePreviewTypes.CODE;
  return FilePreviewTypes.UNKNOWN;
}

// ============================================================================
// FILE TYPE COLOR (UI color classification for file type badges)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const FILE_TYPE_COLORS = [
  'red',
  'purple',
  'yellow',
  'blue',
  'zinc',
] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_FILE_TYPE_COLOR: FileTypeColor = 'zinc';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const FileTypeColorSchema = z.enum(FILE_TYPE_COLORS).openapi({
  description: 'Tailwind color name for file type badge background',
  example: 'blue',
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type FileTypeColor = z.infer<typeof FileTypeColorSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const FileTypeColors = {
  RED: 'red' as const,
  PURPLE: 'purple' as const,
  YELLOW: 'yellow' as const,
  BLUE: 'blue' as const,
  ZINC: 'zinc' as const,
} as const;

// 6️⃣ CSS CLASS MAPPING - Tailwind background classes for each color
export const FILE_TYPE_COLOR_CLASSES: Record<FileTypeColor, string> = {
  [FileTypeColors.RED]: 'bg-red-500',
  [FileTypeColors.PURPLE]: 'bg-purple-500',
  [FileTypeColors.YELLOW]: 'bg-yellow-500',
  [FileTypeColors.BLUE]: 'bg-blue-500',
  [FileTypeColors.ZINC]: 'bg-zinc-600',
};

/**
 * Get Tailwind color name for file type badge
 * SINGLE SOURCE OF TRUTH for file type color classification
 */
export function getFileTypeColor(mimeType: string): FileTypeColor {
  if (mimeType === DocumentMimeTypes.PDF)
    return FileTypeColors.RED;
  if (IMAGE_MIMES.includes(mimeType))
    return FileTypeColors.PURPLE;
  if (mimeType.startsWith('text/javascript') || mimeType.startsWith('application/javascript'))
    return FileTypeColors.YELLOW;
  if (mimeType.startsWith('text/') || mimeType.includes('json'))
    return FileTypeColors.BLUE;
  return FileTypeColors.ZINC;
}

/**
 * Get Tailwind CSS background class for file type badge
 * Combines getFileTypeColor with class mapping for convenience
 */
export function getFileTypeColorClass(mimeType: string): string {
  return FILE_TYPE_COLOR_CLASSES[getFileTypeColor(mimeType)];
}
