/**
 * Custom React Testing Library render functions
 *
 * Provides render and renderHook with provider setup for testing.
 */

import type { RenderHookOptions, RenderOptions } from '@testing-library/react';
import {
  render as rtlRender,
  renderHook as rtlRenderHook,
} from '@testing-library/react';
import type { ReactElement } from 'react';

import { TestProviders } from './test-providers';

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'>;

export function render(ui: ReactElement, options?: CustomRenderOptions) {
  return rtlRender(ui, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...options,
  });
}

export function renderHook<Result, Props>(
  renderFn: (initialProps: Props) => Result,
  options?: Omit<RenderHookOptions<Props>, 'wrapper'>,
) {
  return rtlRenderHook(renderFn, {
    wrapper: ({ children }) => <TestProviders>{children}</TestProviders>,
    ...options,
  });
}
