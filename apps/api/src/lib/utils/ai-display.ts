/**
 * AI Display Utilities
 *
 * UI-ONLY UTILITIES: Provider icons, avatars, display formatting
 */

import { MessageRoles } from '@roundtable/shared/enums';

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
  'openai': 'openai.png',
  'google': 'google.png',
  'meta': 'meta.png',
  'meta-llama': 'meta.png',
  'x-ai': 'grok.png',
  'xai': 'grok.png',
  'deepseek': 'deepseek.png',
  'qwen': 'qwen.png',
  'moonshotai': 'kimi.png',
  'mistralai': 'mistral.png',
  'mistral': 'mistral.png',
  'microsoft': 'microsoft.png',
  'claude': 'claude.png',
  'grok': 'grok.png',
  'gemini': 'google.png',
  'gpt': 'openai.png',
  'openrouter': 'openrouter.png',
};

// ============================================================================
// PROVIDER NAME FORMATTING (Dynamic with minimal overrides)
// ============================================================================

const PROVIDER_NAME_OVERRIDES: Record<string, string> = {
  'openai': 'OpenAI',
  'xai': 'xAI',
  'x-ai': 'xAI',
  'openrouter': 'OpenRouter',
  'deepseek': 'DeepSeek',
  'mistralai': 'Mistral AI',
  'mistral': 'Mistral',
  'microsoft': 'Microsoft',
};

// ============================================================================
// PROVIDER ICON UTILITIES
// ============================================================================

export function getProviderIcon(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();
  const iconFileName = PROVIDER_ICON_MAP[normalizedProvider] || PROVIDER_ICON_MAP.openrouter;
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
    providerName: getProviderName(provider),
    provider,
  };
}

// ============================================================================
// MODEL COLOR THEMING (Tailwind Color Classes)
// ============================================================================

export function getModelColorClass(avatarSrc: string, isUser: boolean = false): string {
  if (isUser)
    return 'blue-500';

  const lowerSrc = avatarSrc.toLowerCase();

  if (lowerSrc.includes('claude') || lowerSrc.includes('anthropic'))
    return 'orange-500';
  if (lowerSrc.includes('gpt') || lowerSrc.includes('openai'))
    return 'emerald-500';
  if (lowerSrc.includes('gemini') || lowerSrc.includes('google'))
    return 'purple-500';
  if (lowerSrc.includes('llama') || lowerSrc.includes('meta'))
    return 'blue-600';
  if (lowerSrc.includes('mistral'))
    return 'orange-600';
  if (lowerSrc.includes('cohere'))
    return 'violet-500';
  if (lowerSrc.includes('deepseek'))
    return 'cyan-500';
  if (lowerSrc.includes('qwen'))
    return 'red-500';
  if (lowerSrc.includes('xai'))
    return 'slate-400';
  if (lowerSrc.includes('kimi') || lowerSrc.includes('moonshotai'))
    return 'teal-500';

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
      src: userImage || '/static/icons/user-avatar.png',
      name: userName || 'User',
    };
  }

  if (modelId) {
    const provider = getProviderFromModelId(modelId);
    const displayName = getDisplayNameFromModelId(modelId);

    return {
      src: getProviderIcon(provider),
      name: displayName,
    };
  }

  return {
    src: '/static/icons/ai-models/openrouter.png',
    name: 'AI',
  };
}
