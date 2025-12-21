/**
 * Testing Utilities Barrel Export
 *
 * Consolidated testing utilities for React Testing Library, TanStack Query, and Zustand store testing.
 *
 * @module lib/testing
 */

// ============================================================================
// API Response Mocks (low-level factories)
// ============================================================================
// Note: createMockParticipant and createMockThread are NOT exported here
// because chat-test-factories exports wrapped versions with better defaults
export {
  createMockAssistantMessage,
  createMockMessage,
  createMockMessagesListResponse,
  createMockPreSearch,
  createMockPreSearchesListResponse,
  createMockThreadDetailResponse,
} from './api-mocks';

// ============================================================================
// Other Testing Utilities
// ============================================================================
export * from './chat-store-helpers';

// ============================================================================
// Chat Test Factories (preferred high-level factories with test-friendly defaults)
// ============================================================================
// Export these FIRST so they take precedence over api-mocks versions
export * from './chat-test-factories';
export * from './helpers';
export { render, renderHook } from './render';
export { testLocale, testTimeZone } from './test-messages';
export * from './test-providers';
