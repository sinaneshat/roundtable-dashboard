/**
 * Turnstile Constants and Types
 *
 * Non-component exports for Turnstile integration.
 * Separated from component file to ensure Fast Refresh compatibility.
 */

export type TurnstileContextValue = {
  token: string | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  refreshToken: () => void;
  getToken: () => string | null;
};

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
export const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes (tokens expire at 5 min)
