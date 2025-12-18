/**
 * File Capability Utilities
 *
 * ✅ SINGLE SOURCE OF TRUTH: Utilities for checking model compatibility with file types
 * ✅ FRONTEND COMPATIBLE: Can be imported by React components
 *
 * Used to determine which models can/cannot process certain file types
 * and to auto-filter model selection based on uploaded files.
 */

// ============================================================================
// VISION-REQUIRED MIME TYPES
// ============================================================================

/**
 * MIME types that require vision capability to process
 * ✅ MIRRORS: Backend VISION_REQUIRED_MIME_TYPES from src/api/core/enums.ts
 *
 * Models without vision capability will have these file types filtered out
 * on the backend. We expose this on frontend to proactively disable selection.
 */
export const VISION_REQUIRED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  // PDFs (rendered visually by providers)
  'application/pdf',
] as const;

export type VisionRequiredMimeType = (typeof VISION_REQUIRED_MIME_TYPES)[number];

/** Set for O(1) lookup performance */
const VISION_REQUIRED_SET = new Set<string>(VISION_REQUIRED_MIME_TYPES);

/**
 * Check if a MIME type requires vision capability
 * @param mimeType - MIME type to check
 * @returns true if the MIME type requires vision capability
 */
export function isVisionRequiredMimeType(mimeType: string): boolean {
  return VISION_REQUIRED_SET.has(mimeType);
}

// ============================================================================
// FILE CAPABILITY CHECKING
// ============================================================================

/**
 * Represents a file for capability checking
 */
export type FileForCapabilityCheck = {
  /** MIME type of the file (e.g., 'image/png', 'application/pdf') */
  mimeType: string;
};

/**
 * Model capabilities relevant for file processing
 */
export type ModelFileCapabilities = {
  /** Whether the model supports vision/image inputs */
  vision: boolean;
};

/**
 * Check if any files in a list require vision capability
 *
 * @param files - Array of files to check
 * @returns true if any file requires vision capability
 */
export function filesRequireVision(files: FileForCapabilityCheck[]): boolean {
  return files.some(file => isVisionRequiredMimeType(file.mimeType));
}

/**
 * Check if a model is compatible with a set of files
 *
 * @param modelCapabilities - The model's capabilities
 * @param files - Files to check compatibility with
 * @returns true if the model can process all files
 */
export function isModelCompatibleWithFiles(
  modelCapabilities: ModelFileCapabilities,
  files: FileForCapabilityCheck[],
): boolean {
  // If files require vision and model doesn't support it, incompatible
  if (filesRequireVision(files) && !modelCapabilities.vision) {
    return false;
  }
  return true;
}

/**
 * Get the reason why a model is incompatible with files
 *
 * @param modelCapabilities - The model's capabilities
 * @param files - Files to check compatibility with
 * @returns Reason string or null if compatible
 */
export function getIncompatibilityReason(
  modelCapabilities: ModelFileCapabilities,
  files: FileForCapabilityCheck[],
): string | null {
  if (filesRequireVision(files) && !modelCapabilities.vision) {
    return 'noVision';
  }
  return null;
}

/**
 * Filter models to only those compatible with given files
 *
 * @param models - Array of models with capabilities
 * @param files - Files that must be processable
 * @returns Filtered array of compatible models
 */
export function filterCompatibleModels<T extends { capabilities: ModelFileCapabilities }>(
  models: T[],
  files: FileForCapabilityCheck[],
): T[] {
  return models.filter(model => isModelCompatibleWithFiles(model.capabilities, files));
}

/**
 * Get IDs of models that are incompatible with given files
 *
 * @param models - Array of models with id and capabilities
 * @param files - Files that must be processable
 * @returns Set of model IDs that cannot process the files
 */
export function getIncompatibleModelIds<T extends { id: string; capabilities: ModelFileCapabilities }>(
  models: T[],
  files: FileForCapabilityCheck[],
): Set<string> {
  const incompatibleIds = new Set<string>();

  // No files = no incompatibilities
  if (files.length === 0) {
    return incompatibleIds;
  }

  for (const model of models) {
    if (!isModelCompatibleWithFiles(model.capabilities, files)) {
      incompatibleIds.add(model.id);
    }
  }

  return incompatibleIds;
}

// ============================================================================
// THREAD-LEVEL FILE CHECKING
// ============================================================================

/**
 * Check if thread messages contain vision-required files
 * Used to determine if non-vision models should be disabled for entire thread
 *
 * @param messages - Array of messages with optional parts
 * @returns true if any message contains vision-required files (images/PDFs)
 */
export function threadHasVisionRequiredFiles(
  messages: Array<{ parts?: unknown[] }>,
): boolean {
  return messages.some((msg) => {
    if (!msg.parts)
      return false;
    return msg.parts.some((part) => {
      if (typeof part !== 'object' || part === null)
        return false;
      if (!('type' in part) || part.type !== 'file')
        return false;
      if (!('mediaType' in part))
        return false;
      return isVisionRequiredMimeType(part.mediaType as string);
    });
  });
}
