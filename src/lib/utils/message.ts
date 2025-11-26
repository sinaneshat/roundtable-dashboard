/**
 * Message Utilities - Barrel Export
 *
 * **CONSOLIDATED MODULE**: Single entry point for all message operations.
 * Re-exports from specialized modules for clean imports.
 *
 * Import structure:
 * - `message-transforms.ts` - Format conversion, filtering, validation
 * - `message-status.ts` - Status determination, parts analysis
 * - `metadata.ts` - Type-safe metadata extraction (kept separate)
 *
 * @module lib/utils/message
 */

// Status and parts analysis
export * from './message-status';

// Core transformations and filtering
export * from './message-transforms';

// NOTE: Metadata utilities exported separately via index.ts
// Import from @/lib/utils/metadata directly for single source of truth
