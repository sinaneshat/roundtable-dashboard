/**
 * AI Display Utilities
 *
 * ✅ UI-ONLY UTILITIES: Provider icons, avatars, display formatting
 * ✅ NO VALIDATION: Validation logic now lives in @/api/routes/chat/schema
 * ✅ NO SCHEMAS: All schemas are defined in API layer
 *
 * For validation functions (isValidModelId, extractModelName), see:
 * @see @/api/routes/chat/schema - Model ID validation and extraction
 */

// ============================================================================
// MODEL DISPLAY HELPERS
// ============================================================================

/**
 * Get provider name from model ID
 * e.g., "anthropic/claude-4" → "anthropic"
 */
export function getProviderFromModelId(modelId: string): string {
  return modelId.includes('/') ? (modelId.split('/')[0] || 'unknown') : 'unknown';
}

/**
 * Get display name from model ID
 * e.g., "anthropic/claude-4" → "claude-4"
 */
export function getDisplayNameFromModelId(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
}

/**
 * Extract formatted model name from model ID
 * e.g., "anthropic/claude-sonnet-4.5" → "Claude Sonnet 4.5"
 *
 * Used by API services and schemas for displaying user-friendly model names
 */
export function extractModelName(modelId: string): string {
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ============================================================================
// ROLE DEFINITIONS (UI Constants Only)
// ============================================================================

/**
 * Default role options for participants
 * These are UI suggestions and don't affect backend logic
 */
export const DEFAULT_ROLES = [
  'The Ideator',
  'Devil\'s Advocate',
  'Builder',
  'Practical Evaluator',
  'Visionary Thinker',
  'Domain Expert',
  'User Advocate',
  'Implementation Strategist',
  'The Data Analyst',
] as const;

export type DefaultRole = typeof DEFAULT_ROLES[number];

// ============================================================================
// PROVIDER ICON MAPPING (UI Preferences Only)
// ============================================================================

/**
 * ✅ 100% OPTIONAL UI PREFERENCES: Icon mappings for visual polish only
 *
 * IMPORTANT:
 * - This is NOT validation or provider filtering
 * - This does NOT limit which providers work
 * - ALL providers from OpenRouter work automatically with fallback icon
 * - This map is purely for UI polish for common providers we have icons for
 *
 * To add a new icon:
 * 1. Add icon file to public/static/icons/ai-models/[provider].png
 * 2. Add mapping below (optional - not required for provider to work)
 *
 * Icons are auto-discovered from OpenRouter API provider slugs
 */
const PROVIDER_ICON_MAP: Record<string, string> = {
  // Only map providers we actually have icon files for
  // If a provider is not in this list, it automatically gets the OpenRouter fallback icon
  'anthropic': 'anthropic.png',
  'openai': 'openai.png',
  'google': 'google.png',
  'microsoft': 'microsoft.png',
  'meta': 'meta.png',
  'meta-llama': 'meta.png',
  'nvidia': 'nvidia.png',
  'cohere': 'cohere.png',
  'inflection': 'inflection.png',
  'ai21': 'ai21.png',
  'amazon': 'aws.png',
  'aws': 'aws.png',
  'azure': 'azure.png',
  'alibaba': 'alibaba.png',
  'baidu': 'baidu.png',
  'bytedance': 'bytedance.png',
  'tencent': 'bytedance.png',
  'baichuan': 'baichuan.png',
  'zhipu': 'zhipu.png',
  'moonshot': 'moonshot.png',
  'moonshotai': 'moonshot.png',
  'qwen': 'qwen.png',
  'deepseek': 'deepseek.png',
  'yi': 'yi.png',
  '01-ai': 'yi.png',
  '01ai': 'yi.png',
  'minimax': 'minimax.png',
  'hunyuan': 'hunyuan.png',
  'kimi': 'kimi.png',
  'perplexity': 'perplexity.png',
  'x-ai': 'xai.png',
  'xai': 'xai.png',
  'mistral': 'mistral.png',
  'mistralai': 'mistral.png',
  'liquid': 'liquid.png',
  'groq': 'groq.png',
  'replicate': 'replicate.png',
  'together': 'together.png',

  // Model name aliases (for backward compatibility)
  'claude': 'anthropic.png',
  'gemini': 'google.png',
  'gpt': 'openai.png',

  // Fallback icon for ALL unknown providers
  'openrouter': 'openrouter.png',
};

// ============================================================================
// PROVIDER NAME FORMATTING (Dynamic with minimal overrides)
// ============================================================================

/**
 * ✅ MINIMAL OVERRIDES: Only for providers that need special capitalization
 *
 * IMPORTANT:
 * - This is NOT validation or limiting which providers work
 * - ALL providers work automatically - auto-formatted as title case
 * - This map only exists for special cases (e.g., "OpenAI" not "Openai")
 * - New providers from OpenRouter automatically work without updates here
 */
const PROVIDER_NAME_OVERRIDES: Record<string, string> = {
  // Only include providers that need special capitalization/branding
  'openai': 'OpenAI',
  'nvidia': 'NVIDIA',
  'ai21': 'AI21 Labs',
  'aws': 'AWS',
  'xai': 'xAI',
  'x-ai': 'xAI',
  '01-ai': '01.AI',
  '01ai': '01.AI',
  'openrouter': 'OpenRouter',
};

// ============================================================================
// PROVIDER ICON UTILITIES
// ============================================================================

/**
 * Get icon path for a provider with fallback support
 *
 * ✅ DYNAMIC: Returns path to PNG icon, automatically falls back to OpenRouter logo
 *
 * @param provider - Provider slug from OpenRouter (e.g., "anthropic", "openai")
 * @returns Icon path relative to public directory
 *
 * @example
 * getProviderIcon('anthropic') // returns '/static/icons/ai-models/anthropic.png'
 * getProviderIcon('unknown-provider') // returns '/static/icons/ai-models/openrouter.png'
 */
export function getProviderIcon(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();
  const iconFileName = PROVIDER_ICON_MAP[normalizedProvider] || PROVIDER_ICON_MAP.openrouter;
  return `/static/icons/ai-models/${iconFileName}`;
}

/**
 * ✅ 100% DYNAMIC: Get human-readable provider name with auto-formatting
 *
 * IMPORTANT:
 * - ALL providers from OpenRouter work automatically
 * - Auto-formats any provider slug to Title Case
 * - Only uses overrides for special capitalization (OpenAI, NVIDIA, etc.)
 * - Does NOT limit which providers are supported
 *
 * @param provider - Provider slug from OpenRouter (e.g., "anthropic")
 * @returns Human-readable provider name
 *
 * @example
 * getProviderName('anthropic') // returns 'Anthropic' (auto-formatted)
 * getProviderName('openai') // returns 'OpenAI' (override for correct caps)
 * getProviderName('unknown-provider') // returns 'Unknown Provider' (auto-formatted)
 * getProviderName('new-ai-company') // returns 'New Ai Company' (auto-formatted, works immediately)
 */
export function getProviderName(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();

  // Check for special capitalization override
  if (PROVIDER_NAME_OVERRIDES[normalizedProvider]) {
    return PROVIDER_NAME_OVERRIDES[normalizedProvider];
  }

  // ✅ FULLY DYNAMIC: Auto-format any provider slug as title case
  // This means ANY provider from OpenRouter works immediately
  return provider
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get icon path and provider name for a model ID
 *
 * ✅ DYNAMIC: Parses OpenRouter model IDs and returns complete icon info
 *
 * @param modelId - OpenRouter model ID (e.g., "anthropic/claude-3")
 * @returns Object with icon path and provider name
 *
 * @example
 * getModelIconInfo('anthropic/claude-3')
 * // returns { icon: '/static/icons/ai-models/anthropic.png', providerName: 'Anthropic', provider: 'anthropic' }
 */
export function getModelIconInfo(modelId: string): {
  icon: string;
  providerName: string;
  provider: string;
} {
  const providerPart = modelId.includes('/') ? modelId.split('/')[0] : modelId;
  const provider = providerPart?.toLowerCase().trim() || 'openrouter';

  return {
    icon: getProviderIcon(provider),
    providerName: getProviderName(provider),
    provider,
  };
}

// ============================================================================
// AVATAR HELPERS
// ============================================================================

/**
 * Avatar props type
 */
export type AvatarProps = {
  src: string;
  name: string;
};

/**
 * Get avatar props directly from modelId (for historical messages)
 *
 * ✅ CRITICAL: Use this for historical messages to remain independent of current participant config
 * When participants are reordered/added/removed, avatars should show the model that generated the message
 *
 * @param role - Message role ('user' or 'assistant')
 * @param modelId - Direct model ID from message metadata
 * @param userImage - Authenticated user's image URL (optional)
 * @param userName - Authenticated user's name (optional)
 * @returns Avatar props with src and name
 */
export function getAvatarPropsFromModelId(
  role: 'user' | 'assistant',
  modelId?: string,
  userImage?: string | null,
  userName?: string | null,
): AvatarProps {
  if (role === 'user') {
    return {
      src: userImage || '/static/icons/user-avatar.png',
      name: userName || 'User',
    };
  }

  // For assistant messages, derive info from model ID
  if (modelId) {
    const provider = getProviderFromModelId(modelId);
    const displayName = getDisplayNameFromModelId(modelId);

    return {
      src: getProviderIcon(provider),
      name: displayName,
    };
  }

  // Fallback for assistant messages without model info
  return {
    src: '/static/icons/ai-models/default.png',
    name: 'AI',
  };
}
