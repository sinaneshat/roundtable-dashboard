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
// Billing & Pricing Test Factories
// ============================================================================
export * from './billing-test-factories';

// ============================================================================
// Subscription Test Mocks
// ============================================================================
export * from './subscription-mocks';

// ============================================================================
// Chat Store Testing Utilities
// ============================================================================
export { createStoreWrapper, createTestChatStore, getStoreState, resetStoreToDefaults } from './chat-store-helpers';

// ============================================================================
// Chat Test Factories (high-level factories with test-friendly defaults)
// ============================================================================
export * from './chat-test-factories';
export * from './helpers';
export { render, renderHook } from './render';
export { testLocale, testTimeZone } from './test-messages';
export * from './test-providers';
// ============================================================================
// Testing Library Utilities (imported from canonical sources)
// ============================================================================
export { act, screen, waitFor, within } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
