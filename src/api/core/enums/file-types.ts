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

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// ============================================================================
// IMAGE MIME TYPES
// ============================================================================

export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

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

export type TextExtractableMimeType = (typeof TEXT_EXTRACTABLE_MIME_TYPES)[number];

export const MAX_TEXT_CONTENT_SIZE = 100 * 1024;

// ============================================================================
// VISUAL MIME TYPES (Images and PDFs)
// ============================================================================

export const VISUAL_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  'application/pdf',
] as const;

export type VisualMimeType = (typeof VISUAL_MIME_TYPES)[number];

const VISUAL_MIME_SET = new Set<string>(VISUAL_MIME_TYPES);

export function isVisualMimeType(mimeType: string): mimeType is VisualMimeType {
  return VISUAL_MIME_SET.has(mimeType);
}

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
