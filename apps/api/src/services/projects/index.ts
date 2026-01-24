/**
 * Projects Services - Domain Barrel Export
 *
 * Handles project-related business logic including auto-linking uploads,
 * automatic memory extraction from conversations, and instruction memory sync.
 */

export { type AutoLinkParams, autoLinkUploadsToProject } from './auto-link.service';
export { syncInstructionMemory, type SyncInstructionMemoryParams } from './instruction-memory.service';
export { extractMemoriesFromRound, type MemoryExtractionParams } from './memory-extraction.service';
