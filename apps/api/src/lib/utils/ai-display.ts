/**
 * AI Display Utilities
 *
 * UI-ONLY UTILITIES: Provider icons, avatars, display formatting
 */

import { MessageRoles } from '@roundtable/shared/enums';

// ============================================================================
// Safe Property Access Helper
// ============================================================================

/**
 * Safely get a property from a string-keyed Record
 * This satisfies TS4111 noPropertyAccessFromIndexSignature
 */
function getMapValue(map: Record<string, string>, key: string): string | undefined {
  return map[key];
}

// ============================================================================
// MODEL DISPLAY HELPERS
// ============================================================================

export function getProviderFromModelId(modelId: string): string {
  return modelId.includes('/') ? (modelId.split('/')[0] || 'unknown') : 'unknown';
}

export function getDisplayNameFromModelId(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
}

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

const PROVIDER_ICON_MAP: Record<string, string> = {
  'anthropic': 'claude.png',
  'claude': 'claude.png',
  'deepseek': 'deepseek.png',
  'gemini': 'google.png',
  'google': 'google.png',
  'gpt': 'openai.png',
  'grok': 'grok.png',
  'meta': 'meta.png',
  'meta-llama': 'meta.png',
  'microsoft': 'microsoft.png',
  'mistral': 'mistral.png',
  'mistralai': 'mistral.png',
  'moonshotai': 'kimi.png',
  'openai': 'openai.png',
  'openrouter': 'openrouter.png',
  'qwen': 'qwen.png',
  'x-ai': 'grok.png',
  'xai': 'grok.png',
};

// ============================================================================
// PROVIDER NAME FORMATTING (Dynamic with minimal overrides)
// ============================================================================

const PROVIDER_NAME_OVERRIDES: Record<string, string> = {
  'deepseek': 'DeepSeek',
  'microsoft': 'Microsoft',
  'mistral': 'Mistral',
  'mistralai': 'Mistral AI',
  'openai': 'OpenAI',
  'openrouter': 'OpenRouter',
  'x-ai': 'xAI',
  'xai': 'xAI',
};

// ============================================================================
// PROVIDER ICON UTILITIES
// ============================================================================

export function getProviderIcon(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();
  const iconFileName = getMapValue(PROVIDER_ICON_MAP, normalizedProvider) || getMapValue(PROVIDER_ICON_MAP, 'openrouter');
  return `/static/icons/ai-models/${iconFileName}`;
}

export function getProviderName(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();

  if (PROVIDER_NAME_OVERRIDES[normalizedProvider]) {
    return PROVIDER_NAME_OVERRIDES[normalizedProvider];
  }

  return provider
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getModelIconInfo(modelId: string): {
  icon: string;
  providerName: string;
  provider: string;
} {
  const providerPart = modelId.includes('/') ? modelId.split('/')[0] : modelId;
  const provider = providerPart?.toLowerCase().trim() || 'openrouter';

  return {
    icon: getProviderIcon(provider),
    provider,
    providerName: getProviderName(provider),
  };
}

// ============================================================================
// MODEL COLOR THEMING (Tailwind Color Classes)
// ============================================================================

export function getModelColorClass(avatarSrc: string, isUser = false): string {
  if (isUser) {
    return 'blue-500';
  }

  const lowerSrc = avatarSrc.toLowerCase();

  if (lowerSrc.includes('claude') || lowerSrc.includes('anthropic')) {
    return 'orange-500';
  }
  if (lowerSrc.includes('gpt') || lowerSrc.includes('openai')) {
    return 'emerald-500';
  }
  if (lowerSrc.includes('gemini') || lowerSrc.includes('google')) {
    return 'purple-500';
  }
  if (lowerSrc.includes('llama') || lowerSrc.includes('meta')) {
    return 'blue-600';
  }
  if (lowerSrc.includes('mistral')) {
    return 'orange-600';
  }
  if (lowerSrc.includes('cohere')) {
    return 'violet-500';
  }
  if (lowerSrc.includes('deepseek')) {
    return 'cyan-500';
  }
  if (lowerSrc.includes('qwen')) {
    return 'red-500';
  }
  if (lowerSrc.includes('xai')) {
    return 'slate-400';
  }
  if (lowerSrc.includes('kimi') || lowerSrc.includes('moonshotai')) {
    return 'teal-500';
  }

  return 'muted-foreground';
}

// ============================================================================
// AVATAR HELPERS
// ============================================================================

export type AvatarProps = {
  src: string;
  name: string;
};

export function getAvatarPropsFromModelId(
  role: typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT,
  modelId?: string,
  userImage?: string | null,
  userName?: string | null,
): AvatarProps {
  if (role === MessageRoles.USER) {
    return {
      name: userName || 'User',
      src: userImage || '/static/icons/user-avatar.png',
    };
  }

  if (modelId) {
    const provider = getProviderFromModelId(modelId);
    const displayName = getDisplayNameFromModelId(modelId);

    return {
      name: displayName,
      src: getProviderIcon(provider),
    };
  }

  return {
    name: 'AI',
    src: '/static/icons/ai-models/openrouter.png',
  };
}
