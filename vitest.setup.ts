/**
 * Root Vitest Setup
 *
 * Minimal setup for root-level script tests only.
 * Each app has its own vitest.setup.ts with appropriate mocks.
 */

import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

import { afterAll, afterEach, vi } from 'vitest';

// TextEncoder/TextDecoder polyfills (needed for some scripts)
Object.defineProperty(globalThis, 'TextDecoder', {
  value: NodeTextDecoder,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'TextEncoder', {
  value: NodeTextEncoder,
  writable: true,
  configurable: true,
});

// Cleanup
afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});
