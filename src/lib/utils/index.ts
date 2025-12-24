/**
 * Utils Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All utility exports from @/lib/utils
 * **TYPE-SAFE**: No Record<string, unknown> or forced type casts
 * **ARCHITECTURE**: Only exports from this directory
 *
 * Import other lib modules directly:
 * - Styling: `@/lib/ui`
 * - Formatting: `@/lib/format`
 * - AI: `@/lib/ai`
 *
 * @module lib/utils
 */

// ============================================================================
// AI & Display
// ============================================================================
export * from './ai-display';

// ============================================================================
// Data & Caching
// ============================================================================
export * from './cache-helpers';
// ============================================================================
// Domain Utilities
// ============================================================================
export * from './citation-parser';
export * from './date-transforms';
// ============================================================================
// Development & Debugging
// ============================================================================
export * from './dev-logger';

// ============================================================================
// Error Handling
// ============================================================================
export * from './error-handling';
export * from './error-metadata-builders';

// ============================================================================
// File Utilities
// ============================================================================
export * from './file-capability';

// ============================================================================
// Performance
// ============================================================================
export * from './memo-utils';
export * from './message-status';
export * from './message-transforms';
export * from './metadata';
export * from './metadata-builder';
export * from './moderator-utils';
export * from './participant';
export * from './participant-message-lookup';
// ============================================================================
// Resumption Debug (Development)
// ============================================================================
export * from './resumption-debug';
export * from './role-colors';
export * from './round-utils';

// ============================================================================
// State Management
// ============================================================================
export * from './state-merge';

// ============================================================================
// Type Utilities
// ============================================================================
export * from './type-guards';
export * from './web-search-utils';
