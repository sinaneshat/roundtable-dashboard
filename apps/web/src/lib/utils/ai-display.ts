/**
 * AI Display Utilities
 *
 * UI-ONLY UTILITIES: Provider icons, avatars, display formatting
 */

import { MessageRoles } from '@roundtable/shared';

// ============================================================================
// MODEL DISPLAY HELPERS
// ============================================================================

function getProviderFromModelId(modelId: string): string {
  return modelId.includes('/') ? (modelId.split('/')[0] || 'unknown') : 'unknown';
}

function getDisplayNameFromModelId(modelId: string): string {
  return modelId.includes('/') ? modelId.split('/').pop() || modelId : modelId;
}

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
// PROVIDER ICON UTILITIES
// ============================================================================

export function getProviderIcon(provider: string): string {
  const normalizedProvider = provider.toLowerCase().trim();
  const iconFileName = PROVIDER_ICON_MAP[normalizedProvider] || PROVIDER_ICON_MAP.openrouter;
  return `/static/icons/ai-models/${iconFileName}`;
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
      src: userImage || '/static/icons/user-avatar.svg',
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
