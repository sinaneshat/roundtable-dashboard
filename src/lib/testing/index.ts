/**
 * Testing Utilities Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All testing utilities from @/lib/testing
 *
 * Includes:
 * - Custom render function with providers (React Testing Library)
 * - Test helper utilities (mocks, async utilities, etc.)
 * - Re-exports from React Testing Library and user-event
 *
 * Usage:
 * ```tsx
 * import { render, screen, userEvent } from '@/lib/testing';
 * import { createMockMessages, waitForAsync } from '@/lib/testing';
 * ```
 *
 * @module lib/testing
 */

// ============================================================================
// API Response Mocks for E2E Testing
// ============================================================================
export * from './api-mocks';

// ============================================================================
// Test Helper Utilities
// ============================================================================
export * from './helpers';

// ============================================================================
// React Testing Library & Custom Render
// ============================================================================
export * from './render';

// ============================================================================
// Test Providers
// ============================================================================
export * from './test-providers';
