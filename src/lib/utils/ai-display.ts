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

import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

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
// PROVIDER ICON MAPPING
// ============================================================================

/**
 * Provider icon mapping
 * Maps OpenRouter provider slugs to icon filenames in public/static/icons/ai-models/
 *
 * ✅ DYNAMIC: Add new providers here as they become available
 * Icons are sourced from reliable CDN and optimized for web use
 */
const PROVIDER_ICON_MAP: Record<string, string> = {
  // ============================================================================
  // MAJOR AI LABS & COMPANIES
  // ============================================================================

  // US-based AI Labs
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

  // Cloud Providers
  'amazon': 'aws.png',
  'aws': 'aws.png',
  'azure': 'azure.png',

  // ============================================================================
  // CHINESE AI COMPANIES
  // ============================================================================

  'alibaba': 'alibaba.png',
  'baidu': 'baidu.png',
  'bytedance': 'bytedance.png',
  'tencent': 'bytedance.png', // Using ByteDance as closest match
  'baichuan': 'baichuan.png',
  'zhipu': 'zhipu.png',
  'moonshot': 'moonshot.png',
  'moonshotai': 'moonshot.png',
  'qwen': 'qwen.png',
  'deepseek': 'deepseek.png',
  'yi': 'yi.png',
  '01-ai': 'yi.png', // Yi is from 01.AI
  '01ai': 'yi.png',
  'minimax': 'minimax.png',
  'hunyuan': 'hunyuan.png',
  'kimi': 'kimi.png',

  // ============================================================================
  // SPECIALIZED AI COMPANIES
  // ============================================================================

  'perplexity': 'perplexity.png',
  'x-ai': 'xai.png',
  'xai': 'xai.png',
  'mistral': 'mistral.png',
  'mistralai': 'mistral.png',
  'liquid': 'liquid.png',
  'groq': 'groq.png',
  'replicate': 'replicate.png',
  'together': 'together.png',

  // ============================================================================
  // MODEL-SPECIFIC ALIASES
  // ============================================================================

  'claude': 'anthropic.png', // Claude is Anthropic's model
  'gemini': 'google.png', // Gemini is Google's model
  'gpt': 'openai.png', // GPT is OpenAI's model series

  // ============================================================================
  // FALLBACK
  // ============================================================================

  'openrouter': 'openrouter.png', // Generic OpenRouter logo for unknown providers
};

// ============================================================================
// PROVIDER NAME MAPPING
// ============================================================================

/**
 * Provider name display mapping
 * Maps provider slugs to human-readable names
 *
 * ✅ DYNAMIC: Covers all major AI providers from OpenRouter
 */
const PROVIDER_NAME_MAP: Record<string, string> = {
  // Major US Labs
  'anthropic': 'Anthropic',
  'openai': 'OpenAI',
  'google': 'Google',
  'microsoft': 'Microsoft',
  'meta': 'Meta',
  'meta-llama': 'Meta (Llama)',
  'nvidia': 'NVIDIA',
  'cohere': 'Cohere',
  'inflection': 'Inflection AI',
  'ai21': 'AI21 Labs',

  // Cloud Providers
  'amazon': 'Amazon (AWS)',
  'aws': 'Amazon Web Services',
  'azure': 'Microsoft Azure',

  // Chinese AI Companies
  'alibaba': 'Alibaba',
  'baidu': 'Baidu',
  'bytedance': 'ByteDance',
  'tencent': 'Tencent',
  'baichuan': 'Baichuan',
  'zhipu': 'Zhipu AI',
  'moonshot': 'Moonshot AI',
  'moonshotai': 'Moonshot AI',
  'qwen': 'Qwen (Alibaba)',
  'deepseek': 'DeepSeek',
  'yi': 'Yi (01.AI)',
  '01-ai': '01.AI',
  '01ai': '01.AI',
  'minimax': 'MiniMax',
  'hunyuan': 'Hunyuan (Tencent)',
  'kimi': 'Kimi',

  // Specialized Companies
  'perplexity': 'Perplexity AI',
  'x-ai': 'xAI',
  'xai': 'xAI',
  'mistral': 'Mistral AI',
  'mistralai': 'Mistral AI',
  'liquid': 'Liquid AI',
  'groq': 'Groq',
  'replicate': 'Replicate',
  'together': 'Together AI',

  // Model Aliases
  'claude': 'Claude (Anthropic)',
  'gemini': 'Gemini (Google)',
  'gpt': 'GPT (OpenAI)',

  // Fallback
  'openrouter': 'OpenRouter',

  // Additional Community Providers (no dedicated icons)
  'nousresearch': 'Nous Research',
  'cognitivecomputations': 'Cognitive Computations',
  'alpindale': 'Alpindale',
  'gryphe': 'Gryphe',
  'sao10k': 'Sao10k',
  'neversleep': 'NeverSleep',
  'undi95': 'Undi95',
  'thedrummer': 'The Drummer',
  'mancer': 'Mancer',
  'arcee-ai': 'Arcee AI',
  'eleutherai': 'EleutherAI',
  'allenai': 'Allen AI',
  'thudm': 'THU DMG',
  'opengvlab': 'OpenGVLab',
  'stepfun-ai': 'StepFun AI',
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
 * Get human-readable provider name with automatic formatting fallback
 *
 * ✅ DYNAMIC: Returns display name or formats slug as title case
 *
 * @param provider - Provider slug from OpenRouter (e.g., "anthropic")
 * @returns Human-readable provider name
 *
 * @example
 * getProviderName('anthropic') // returns 'Anthropic'
 * getProviderName('unknown-provider') // returns 'Unknown Provider'
 */
export function getProviderName(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();

  if (PROVIDER_NAME_MAP[normalizedProvider]) {
    return PROVIDER_NAME_MAP[normalizedProvider];
  }

  // Format slug as title case as fallback
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

/**
 * Check if a provider has a dedicated icon (not using fallback)
 *
 * @param provider - Provider slug
 * @returns True if we have a specific icon for this provider
 *
 * @example
 * hasProviderIcon('anthropic') // true
 * hasProviderIcon('unknown-provider') // false
 */
export function hasProviderIcon(provider: string): boolean {
  const normalizedProvider = provider.toLowerCase().trim();
  return normalizedProvider in PROVIDER_ICON_MAP && normalizedProvider !== 'openrouter';
}

/**
 * Get all providers that have mapped icons
 *
 * Useful for debugging and displaying supported providers
 *
 * @returns Array of provider slugs with icons
 *
 * @example
 * const providers = getProvidersWithIcons();
 * console.log(`${providers.length} providers with icons`);
 */
export function getProvidersWithIcons(): string[] {
  return Object.keys(PROVIDER_ICON_MAP).filter(p => p !== 'openrouter');
}

/**
 * Get total count of supported providers
 *
 * @returns Number of providers with dedicated icons
 */
export function getSupportedProviderCount(): number {
  return getProvidersWithIcons().length;
}

/**
 * Get all available providers (both with and without dedicated icons)
 *
 * @returns Array of all known provider slugs
 */
export function getAllKnownProviders(): string[] {
  return Object.keys(PROVIDER_NAME_MAP);
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
 * Get avatar props for a participant based on model ID
 *
 * ✅ SINGLE SOURCE: Derives all info from model ID directly
 * - User messages: Use authenticated user's image and name
 * - Assistant messages: Use provider icon and display name from model ID
 *
 * @param role - Message role ('user' or 'assistant')
 * @param participants - Array of participant configurations
 * @param userImage - Authenticated user's image URL (optional)
 * @param userName - Authenticated user's name (optional)
 * @param participantIndex - Index of the participant for assistant messages (optional)
 * @returns Avatar props with src and name
 */
export function getAvatarProps(
  role: 'user' | 'assistant',
  participants: ParticipantConfig[],
  userImage?: string | null,
  userName?: string | null,
  participantIndex?: number,
): AvatarProps {
  if (role === 'user') {
    return {
      src: userImage || '/static/icons/user-avatar.png',
      name: userName || 'User',
    };
  }

  // For assistant messages, get model info from participant
  if (participantIndex !== undefined && participants[participantIndex]) {
    const participant = participants[participantIndex];
    const provider = getProviderFromModelId(participant.modelId);
    const displayName = getDisplayNameFromModelId(participant.modelId);

    return {
      src: getProviderIcon(provider),
      name: displayName,
    };
  }

  // Fallback for assistant messages without participant info
  return {
    src: '/static/icons/ai-models/default.png',
    name: 'AI',
  };
}

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
