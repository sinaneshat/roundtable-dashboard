/**
 * Testing Utilities Barrel Export
 *
 * **SINGLE SOURCE OF TRUTH**: All testing utilities from @/lib/testing
 *
 * Includes:
 * - Custom render function with providers (React Testing Library)
 * - Test helper utilities (mocks, async utilities)
 * - Re-exports from React Testing Library and user-event
 *
 * @module lib/testing
 */

// ============================================================================
// API Response Mocks
// ============================================================================
export {
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
// Chat Test Factories
// ============================================================================
export * from './chat-test-factories';

// ============================================================================
// Test Helpers
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
