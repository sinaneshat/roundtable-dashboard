/**
 * File Capability Utilities
 *
 * ✅ SINGLE SOURCE OF TRUTH: Utilities for checking model compatibility with file types
 * ✅ FRONTEND COMPATIBLE: Can be imported by React components
 * ✅ DERIVES FROM: Uses VISUAL_MIME_TYPES from @/api/core/enums/file-types
 *
 * Used to determine which models can/cannot process certain file types
 * and to auto-filter model selection based on uploaded files.
 */

import type { IncompatibilityReason } from '@/api/core/enums';
import {
  IncompatibilityReasons,
  isDocumentMimeType,
  isImageMimeType,
  isVisualMimeType,
} from '@/api/core/enums';

/**
 * Check if a MIME type requires vision capability.
 * Domain-specific wrapper around isVisualMimeType.
 *
 * @param mimeType - MIME type to check
 * @returns true if the MIME type requires vision capability
 */
export function isVisionRequiredMimeType(mimeType: string): boolean {
  return isVisualMimeType(mimeType);
}

/**
 * ✅ GRANULAR: Check if MIME type is an image (requires supports_vision)
 */
export function isImageFile(mimeType: string): boolean {
  return isImageMimeType(mimeType);
}

/**
 * ✅ GRANULAR: Check if MIME type is a document/PDF (requires supports_file)
 */
export function isDocumentFile(mimeType: string): boolean {
  return isDocumentMimeType(mimeType);
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
 * ✅ GRANULAR: Separates vision (images) from file (PDFs/documents)
 */
export type ModelFileCapabilities = {
  /** Whether the model supports vision/image inputs */
  vision: boolean;
  /** Whether the model supports file/document inputs (PDFs, DOC, etc.) */
  file?: boolean;
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
 * ✅ GRANULAR: Check if any files are images (require supports_vision)
 */
export function filesHaveImages(files: FileForCapabilityCheck[]): boolean {
  return files.some(file => isImageFile(file.mimeType));
}

/**
 * ✅ GRANULAR: Check if any files are documents/PDFs (require supports_file)
 */
export function filesHaveDocuments(files: FileForCapabilityCheck[]): boolean {
  return files.some(file => isDocumentFile(file.mimeType));
}

/**
 * Check if a model is compatible with a set of files
 * ✅ GRANULAR: Checks both vision (images) and file (documents) capabilities
 *
 * @param modelCapabilities - The model's capabilities
 * @param files - Files to check compatibility with
 * @returns true if the model can process all files
 */
export function isModelCompatibleWithFiles(
  modelCapabilities: ModelFileCapabilities,
  files: FileForCapabilityCheck[],
): boolean {
  // Check image compatibility (requires supports_vision)
  if (filesHaveImages(files) && !modelCapabilities.vision) {
    return false;
  }
  // Check document compatibility (requires supports_file)
  if (filesHaveDocuments(files) && !modelCapabilities.file) {
    return false;
  }
  return true;
}

/**
 * Get the reason why a model is incompatible with files
 * ✅ GRANULAR: Differentiates between vision (images) and file (documents) incompatibility
 *
 * @param modelCapabilities - The model's capabilities
 * @param files - Files to check compatibility with
 * @returns Reason string or null if compatible
 */
export function getIncompatibilityReason(
  modelCapabilities: ModelFileCapabilities,
  files: FileForCapabilityCheck[],
): IncompatibilityReason | null {
  // Check image incompatibility first
  if (filesHaveImages(files) && !modelCapabilities.vision) {
    return IncompatibilityReasons.NO_VISION;
  }
  // Check document/file incompatibility
  if (filesHaveDocuments(files) && !modelCapabilities.file) {
    return IncompatibilityReasons.NO_FILE_SUPPORT;
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
      // Type guard: check if part is a file part with mediaType
      if (typeof part !== 'object' || part === null)
        return false;
      if (!('type' in part) || part.type !== 'file')
        return false;
      if (!('mediaType' in part) || typeof part.mediaType !== 'string')
        return false;
      return isVisionRequiredMimeType(part.mediaType);
    });
  });
}
