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
// Re-export everything EXCEPT createMockThread, createMockParticipant, createMockAnalysis
// Those are re-exported from chat-test-factories with test-friendly defaults
// ============================================================================
export {
  createMockAnalysesListResponse,
  createMockAssistantMessage,
  createMockChangelogListResponse,
  createMockFetchError,
  createMockFetchResponse,
  createMockMessage,
  createMockMessagesListResponse,
  createMockParticipantDetailResponse,
  createMockPreSearch,
  createMockPreSearchesListResponse,
  createMockThreadDetailResponse,
  createMockThreadListResponse,
} from './api-mocks';

// ============================================================================
// Chat Store Test Helpers
// ============================================================================
export * from './chat-store-helpers';

// ============================================================================
// Chat Test Factories (Mock data creators)
// These export test-friendly versions of createMockThread, createMockParticipant, createMockAnalysis
// with defaults like id: 'thread-123', indexed participants
// ============================================================================
export * from './chat-test-factories';

// ============================================================================
// Test Helper Utilities
// ============================================================================
export * from './helpers';

// ============================================================================
// React Testing Library & Custom Render
// ============================================================================
export * from './render';

// ============================================================================
// Test Messages (next-intl)
// ============================================================================
export * from './test-messages';

// ============================================================================
// Test Providers
// ============================================================================
export * from './test-providers';
