/**
 * Custom React Testing Library render functions
 *
 * Provides render and renderHook with provider setup for testing.
 */

import type { RenderHookOptions, RenderOptions } from '@testing-library/react';
import { render, renderHook as rtlRenderHook } from '@testing-library/react';
import type { ReactElement } from 'react';

import { TestProviders } from './test-providers';

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>;

function customRender(ui: ReactElement, options?: CustomRenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...options,
  });
}

function customRenderHook<Result, Props>(
  render: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) {
  return rtlRenderHook(render, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...options,
  });
}

export { customRender as render, customRenderHook as renderHook };
