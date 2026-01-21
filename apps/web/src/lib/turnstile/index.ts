/**
 * Turnstile Integration - Managed/Invisible Mode
 *
 * Cloudflare Turnstile in "managed" appearance mode automatically:
 * - Runs invisibly for legitimate users
 * - Shows interactive challenge only when Cloudflare detects suspicious behavior
 * - Provides page-wide protection without per-form widgets
 *
 * Usage: Add <TurnstileProvider> to root layout, use useTurnstile() hook to get tokens
 */

export type { TurnstileContextValue } from './turnstile-provider';
export { TurnstileProvider, useTurnstile } from './turnstile-provider';
