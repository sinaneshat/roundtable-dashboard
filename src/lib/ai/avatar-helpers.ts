/**
 * Avatar Helpers - Shared utilities for chat avatars
 *
 * OFFICIAL AI SDK PATTERN: Avatar configuration for message rendering
 * Reusable across all chat screens
 */

import { getModelById } from '@/lib/ai/models-config';
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
 * Get avatar props for a participant based on model configuration
 *
 * OFFICIAL PATTERN: Consistent avatar display across all chat screens
 * - User messages: Use authenticated user's image and name
 * - Assistant messages: Use AI model icon and name from config
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

  // For assistant messages, find the participant and get model info from config
  if (participantIndex !== undefined && participants[participantIndex]) {
    const participant = participants[participantIndex];
    const model = getModelById(participant.modelId);

    if (model) {
      return {
        src: model.metadata.icon || '/static/icons/ai-models/default.png',
        name: model.name,
      };
    }
  }

  // Fallback for assistant messages without participant info
  return {
    src: '/static/icons/ai-models/default.png',
    name: 'AI',
  };
}
