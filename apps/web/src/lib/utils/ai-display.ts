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
      src: userImage || '/static/icons/user-avatar.svg',
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
