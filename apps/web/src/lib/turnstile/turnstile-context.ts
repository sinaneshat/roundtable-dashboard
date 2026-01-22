/**
 * Turnstile Context
 *
 * React context for Turnstile state.
 * Separated from provider component to ensure Fast Refresh compatibility.
 */

import { createContext } from 'react';

import type { TurnstileContextValue } from './turnstile-constants';

export const TurnstileContext = createContext<TurnstileContextValue | null>(null);
