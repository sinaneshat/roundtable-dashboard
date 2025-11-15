/**
 * Test Utilities for React Testing Library
 *
 * This file provides a custom render function with provider setup for testing.
 * Wraps components with necessary providers (QueryClient, mocked i18n).
 */

import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
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

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render method with custom render
export { customRender as render };
