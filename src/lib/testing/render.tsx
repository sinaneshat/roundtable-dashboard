/**
 * Test Utilities for React Testing Library
 *
 * This file provides custom render and renderHook functions with provider setup for testing.
 * Wraps components and hooks with necessary providers (QueryClient, mocked i18n).
 */

import type { RenderHookOptions, RenderOptions } from '@testing-library/react';
import { render, renderHook as rtlRenderHook } from '@testing-library/react';
import type { ReactElement } from 'react';

import { TestProviders } from './test-providers';

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  // Add provider-specific options here as needed
};

/**
 * Custom render function for testing React components
 *
 * Usage:
 * ```tsx
 * import { customRender, screen } from '@/lib/testing';
 *
 * test('renders component', () => {
 *   customRender(<MyComponent />);
 *   expect(screen.getByText('Hello')).toBeInTheDocument();
 * });
 * ```
 *
 * Automatically wraps components with:
 * - QueryClientProvider (TanStack Query)
 * - Mocked i18n (next-intl)
 * - ChatStoreProvider (Zustand store)
 * - ThreadHeaderProvider
 * - TooltipProvider
 */
function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders>
        {children}
      </TestProviders>
    ),
    ...options,
  });
}

/**
 * Custom renderHook function for testing React hooks
 *
 * Usage:
 * ```tsx
 * import { renderHook } from '@/lib/testing';
 *
 * test('uses custom hook', () => {
 *   const { result } = renderHook(() => useMyHook());
 *   expect(result.current.value).toBe(true);
 * });
 * ```
 *
 * Automatically wraps hooks with all necessary providers.
 */
function customRenderHook<Result, Props>(
  render: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) {
  return rtlRenderHook(render, {
    wrapper: ({ children }) => (
      <TestProviders>
        {children}
      </TestProviders>
    ),
    ...options,
  });
}

// Re-export everything from React Testing Library except render and renderHook
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render and renderHook with custom versions
export { customRender as render, customRenderHook as renderHook };
