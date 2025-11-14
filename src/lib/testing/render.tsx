/**
 * Test Utilities for React Testing Library
 *
 * This file provides a custom render function with simplified provider setup for testing.
 * For full provider integration (QueryClient, i18n, etc.), uncomment the provider imports
 * and TestProviders implementation below once ESM module transformation is configured.
 */

import type { RenderOptions } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

// TODO: Uncomment these imports when ESM module support is fully configured
// import type { AbstractIntlMessages } from 'next-intl';
// import { NextIntlClientProvider } from 'next-intl';
// import { NuqsAdapter } from 'nuqs/adapters/next/app';
// import { ChatStoreProvider } from '@/components/providers/chat-store-provider';
// import QueryClientProvider from '@/components/providers/query-client-provider';

// Simplified render for basic component testing
// When you need full providers, uncomment the TestProviders implementation below

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
 * Note: This is a simplified version. To test components that require providers
 * (QueryClient, i18n, Zustand stores), uncomment the TestProviders implementation
 * and configure ESM module transformation in jest.config.ts.
 */
function customRender(
  ui: ReactElement,
  options?: CustomRenderOptions,
) {
  // Simple render without providers for now
  // Uncomment the wrapper version below when providers are needed
  return render(ui, options);

  /* Full provider version - uncomment when ESM modules work:
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders>
        {children}
      </TestProviders>
    ),
    ...options,
  });
  */
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';

// Override render method with custom render
export { customRender as render };
