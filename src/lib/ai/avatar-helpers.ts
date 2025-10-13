/**
 * Avatar Helpers - Shared utilities for chat avatars
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses provider icons and model IDs directly
 * No dependency on legacy model config
 */

import { getDisplayNameFromModelId, getProviderFromModelId } from '@/lib/ai/models-config';
import { getProviderIcon } from '@/lib/ai/provider-icons';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

// ============================================================================
// Avatar Props Types
// ============================================================================

export type AvatarProps = {
  src: string;
  name: string;
};

// ============================================================================
// Avatar Helpers
// ============================================================================

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
