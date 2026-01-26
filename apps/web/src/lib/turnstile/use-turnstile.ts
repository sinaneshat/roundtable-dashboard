/**
 * useTurnstile Hook
 *
 * Custom hook to access Turnstile context.
 * Separated from provider component to ensure Fast Refresh compatibility.
 */

import { use } from 'react';

import type { TurnstileContextValue } from './turnstile-constants';
import { TurnstileContext } from './turnstile-context';

export function useTurnstile(): TurnstileContextValue {
  const context = use(TurnstileContext);
  if (!context) {
    // Return a no-op context when not inside provider (e.g., SSR)
    return {
      error: null,
      getToken: () => null,
      isLoading: false,
      isReady: false,
      refreshToken: () => {},
      token: null,
    };
  }
  return context;
}
