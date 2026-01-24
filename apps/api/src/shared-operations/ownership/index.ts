/**
 * Ownership Operations - Barrel Export
 *
 * Composable resource ownership verification for handlers.
 */

export * from './verify-project-ownership';
export * from './verify-upload-ownership';

// Re-export from common/permissions for backwards compatibility
export {
  verifyCustomRoleOwnership,
  verifyParticipantOwnership,
  verifyThreadOwnership,
} from '@/common/permissions';
export type {
  ParticipantWithThread,
  ProjectWithAttachments,
  ProjectWithCounts,
  ProjectWithMemories,
  ProjectWithThreads,
  ThreadWithParticipants,
} from '@/common/permissions-schemas';
