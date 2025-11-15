/**
 * Utils Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All utility exports from @/lib/utils
 * **TYPE-SAFE**: No Record<string, unknown> or forced type casts
 * **ARCHITECTURE**: Only exports from this directory - no external re-exports
 *
 * Import other lib modules directly:
 * - Styling: `@/lib/ui`
 * - Formatting: `@/lib/format`
 * - AI: `@/lib/ai`
 *
 * @module lib/utils
 */

export * from './ai-display';
export * from './analysis-utils';
export * from './cache-helpers';
// ============================================================================
// Data & Formatting
// ============================================================================
export * from './date-transforms';
// ============================================================================
// Error Handling
// ============================================================================
export * from './error-handling';

// ============================================================================
// Performance Utilities
// ============================================================================
export * from './memo-utils';
// ============================================================================
// Domain Utilities (Consolidated)
// ============================================================================
export * from './message'; // message-filtering + message-transforms + message-status
export * from './metadata';
export * from './metadata-builder'; // ✅ TYPE-SAFE: Enforces all required fields at compile-time
export * from './participant'; // All participant operations (includes updates)
export * from './round-utils';
// ============================================================================
// State Management Utilities
// ============================================================================
export * from './state-merge';
// ============================================================================
// Core Type Utilities
// ============================================================================
export * from './type-guards';
export * from './web-search-utils'; // Web search URL parsing and utilities
