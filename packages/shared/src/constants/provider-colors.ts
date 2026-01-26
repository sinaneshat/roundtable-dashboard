/**
 * AI Provider Brand Colors
 *
 * Centralized color definitions for AI model providers.
 * Used for avatars, badges, and visual identification.
 *
 * Colors are Tailwind CSS class names (e.g., 'orange-500').
 * For hex values, see PROVIDER_HEX_COLORS below.
 */

/**
 * Provider brand colors as Tailwind class names
 * These can be used directly in className attributes
 */
export const PROVIDER_COLORS = {
  // Anthropic / Claude - signature orange
  'anthropic': 'orange-500',
  'claude': 'orange-500',

  // Cohere - violet
  'cohere': 'violet-500',
  // DeepSeek - cyan
  'deepseek': 'cyan-500',

  'gemini': 'purple-500',
  // Google / Gemini - purple
  'google': 'purple-500',

  'gpt': 'emerald-500',
  'grok': 'slate-400',
  'kimi': 'teal-500',

  'llama': 'blue-600',
  // Meta / Llama - blue
  'meta': 'blue-600',
  'meta-llama': 'blue-600',

  // Microsoft - blue
  'microsoft': 'blue-500',
  'mistral': 'orange-600',

  // Mistral AI - orange variant
  'mistralai': 'orange-600',

  // Moonshot / Kimi - teal
  'moonshotai': 'teal-500',

  // OpenAI / GPT - signature green
  'openai': 'emerald-500',
  // OpenRouter (fallback) - muted
  'openrouter': 'muted-foreground',

  // Qwen - red
  'qwen': 'red-500',

  // User avatar color
  'user': 'blue-500',

  // xAI / Grok - neutral slate
  'x-ai': 'slate-400',

  'xai': 'slate-400',
} as const;

/**
 * Provider brand colors as hex values
 * For use in contexts where CSS classes don't work (e.g., OG images, canvas)
 */
export const PROVIDER_HEX_COLORS = {
  // Anthropic / Claude
  'anthropic': '#f97316', // orange-500
  'claude': '#f97316',

  // Cohere
  'cohere': '#8b5cf6', // violet-500
  // DeepSeek
  'deepseek': '#06b6d4', // cyan-500

  'gemini': '#a855f7',
  // Google / Gemini
  'google': '#a855f7', // purple-500

  'gpt': '#10b981',
  'grok': '#94a3b8',
  'kimi': '#14b8a6',

  'llama': '#2563eb',
  // Meta / Llama
  'meta': '#2563eb', // blue-600
  'meta-llama': '#2563eb',

  // Microsoft
  'microsoft': '#3b82f6', // blue-500
  'mistral': '#ea580c',

  // Mistral AI
  'mistralai': '#ea580c', // orange-600

  // Moonshot / Kimi
  'moonshotai': '#14b8a6', // teal-500

  // OpenAI / GPT
  'openai': '#10b981', // emerald-500
  // OpenRouter (fallback)
  'openrouter': '#6b7280', // gray-500

  // Qwen
  'qwen': '#ef4444', // red-500

  // User
  'user': '#3b82f6', // blue-500

  // xAI / Grok
  'x-ai': '#94a3b8', // slate-400

  'xai': '#94a3b8',
} as const;

export type ProviderColorKey = keyof typeof PROVIDER_COLORS;
export type ProviderHexColorKey = keyof typeof PROVIDER_HEX_COLORS;

/**
 * Check if a string is a valid provider color key
 */
function isProviderColorKey(key: string): key is ProviderColorKey {
  return key in PROVIDER_COLORS;
}

/**
 * Check if a string is a valid provider hex color key
 */
function isProviderHexColorKey(key: string): key is ProviderHexColorKey {
  return key in PROVIDER_HEX_COLORS;
}

/**
 * Get provider color class from provider name
 */
export function getProviderColor(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  if (isProviderColorKey(normalized)) {
    return PROVIDER_COLORS[normalized];
  }
  return PROVIDER_COLORS.openrouter;
}

/**
 * Get provider hex color from provider name
 */
export function getProviderHexColor(provider: string): string {
  const normalized = provider.toLowerCase().trim();
  if (isProviderHexColorKey(normalized)) {
    return PROVIDER_HEX_COLORS[normalized];
  }
  return PROVIDER_HEX_COLORS.openrouter;
}
