/**
 * Projects Services - Domain Barrel Export
 *
 * Handles project-related business logic including auto-linking uploads
 * and instruction memory sync.
 */

export { type AutoLinkParams, autoLinkUploadsToProject } from './auto-link.service';
export { syncInstructionMemory, type SyncInstructionMemoryParams } from './instruction-memory.service';
