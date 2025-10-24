/**
 * Chat Components - Reusable UI components for AI chat interface
 *
 * This module exports all chat-related components following the established
 * frontend patterns documented in /docs/frontend-patterns.md
 *
 * Component Categories:
 * - Participant Display: ParticipantBadge
 * - Status Indicators: StatusIndicator, MessageStatusBadge
 * - Model Selection: ModelItem, RoleSelector
 * - Main Components: ChatParticipantsList, ParticipantsPreview
 */

// Main components (kept for backward compatibility)
export { ChatParticipantsList, ParticipantsPreview } from './chat-participants-list';
// Exported components (alphabetical order)
export type { MessageStatusBadgeProps, MessageStatusType, TokenMetadata } from './message-status-badge';
export { MessageStatusBadge } from './message-status-badge';
export type { ModelItemProps, OrderedModel } from './model-item';
export { ModelItem } from './model-item';
export type { ParticipantBadgeProps } from './participant-badge';
export { ParticipantBadge } from './participant-badge';
export type { RoleSelectorProps } from './role-selector';
export { RoleSelector } from './role-selector';
export type { StatusIndicatorProps, StatusIndicatorStatus } from './status-indicator';
export { StatusIndicator } from './status-indicator';
