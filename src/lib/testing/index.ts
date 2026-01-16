/**
 * Testing Utilities Barrel Export
 *
 * Consolidated testing utilities for React Testing Library, TanStack Query, and Zustand store testing.
 *
 * @module lib/testing
 */

// ============================================================================
// API Response Mocks (low-level base factories)
// ============================================================================
export {
  createBaseMockParticipant,
  createBaseMockThread,
  createMockAssistantMessage,
  createMockMessage,
  createMockMessagesListResponse,
  createMockPreSearch,
  createMockPreSearchesListResponse,
  createMockThreadDetailResponse,
} from './api-mocks';

// ============================================================================
// API Test Mocks (backend testing utilities)
// ============================================================================
export * from './api-test-mocks';

// ============================================================================
// Billing & Pricing Test Factories
// ============================================================================
export * from './billing-test-factories';

// ============================================================================
// Chat Store Testing Utilities
// ============================================================================
export { createStoreWrapper, createTestChatStore, getStoreState, resetStoreToDefaults } from './chat-store-helpers';

// ============================================================================
// Chat Test Factories (high-level factories with test-friendly defaults)
// ============================================================================
export * from './chat-test-factories';

// ============================================================================
// Testing Enums (5-part pattern enums for test utilities)
// ============================================================================
export * from './enums';
export * from './helpers';
// ============================================================================
// Metadata Helpers (type-safe metadata extraction for tests)
// ============================================================================
export * from './metadata-helpers';
export { render, renderHook } from './render';
// ============================================================================
// Stripe Test Mocks (Stripe API types)
// ============================================================================
export * from './stripe-test-mocks';

// ============================================================================
// Subscription Test Mocks
// ============================================================================
export * from './subscription-mocks';
export { testLocale, testTimeZone } from './test-messages';
export * from './test-providers';
// ============================================================================
// Typed Test Mocks (type-safe mock factories)
// ============================================================================
export * from './typed-test-mocks';
// ============================================================================
// Testing Library Utilities (imported from canonical sources)
// ============================================================================
export { act, screen, waitFor, within } from '@testing-library/react';
// Exception: Re-exporting default export as named export is acceptable for testing utilities
// This centralizes test imports and follows testing-library community conventions
export { default as userEvent } from '@testing-library/user-event';
