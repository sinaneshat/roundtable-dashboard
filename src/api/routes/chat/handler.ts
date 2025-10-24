/**
 * Chat Handlers - Main Export File
 *
 * Following backend-patterns.md: Refactored from monolithic 3768-line handler
 * into domain-specific modules for better maintainability.
 *
 * CRITICAL: This file maintains backward compatibility by re-exporting all handlers.
 * All existing imports continue to work without breaking changes.
 *
 * Handler Organization:
 * - handlers/thread.handler.ts - Thread CRUD operations (827 lines)
 * - handlers/message.handler.ts - Message and changelog operations (73 lines)
 * - handlers/participant.handler.ts - Participant operations (304 lines)
 * - handlers/role.handler.ts - Custom role CRUD (211 lines)
 * - handlers/feedback.handler.ts - Feedback operations (204 lines)
 * - handlers/analysis.handler.ts - Moderator analysis operations (612 lines)
 * - handlers/streaming.handler.ts - Real-time SSE streaming (1560 lines)
 * - handlers/helpers.ts - Shared utility functions (105 lines)
 *
 * Total: 3896 lines (including headers and comments)
 * Original: 3768 lines (monolithic)
 *
 * Benefits of Refactoring:
 * - Improved code organization and discoverability
 * - Easier to test individual handler domains
 * - Reduced cognitive load when working on specific features
 * - Better git diff and merge conflict resolution
 * - Follows established backend patterns for domain separation
 */

// ============================================================================
// Analysis Handlers - Moderator AI Analysis Operations
// ============================================================================
export {
  analyzeRoundHandler,
  getThreadAnalysesHandler,
} from './handlers/analysis.handler';

// ============================================================================
// Feedback Handlers - User Feedback on Analysis Rounds
// ============================================================================
export {
  getThreadFeedbackHandler,
  setRoundFeedbackHandler,
} from './handlers/feedback.handler';

// ============================================================================
// Shared Helpers - Exported for Internal Use
// ============================================================================
export {
  chatMessagesToUIMessages,
  verifyThreadOwnership,
} from './handlers/helpers';

// ============================================================================
// Message Handlers - Messages and Changelog
// ============================================================================
export {
  getThreadChangelogHandler,
  getThreadMessagesHandler,
} from './handlers/message.handler';

// ============================================================================
// Participant Handlers - AI Model Participant Operations
// ============================================================================
export {
  addParticipantHandler,
  deleteParticipantHandler,
  updateParticipantHandler,
} from './handlers/participant.handler';

// ============================================================================
// Role Handlers - Custom Role Template CRUD
// ============================================================================
export {
  createCustomRoleHandler,
  deleteCustomRoleHandler,
  getCustomRoleHandler,
  listCustomRolesHandler,
  updateCustomRoleHandler,
} from './handlers/role.handler';

// ============================================================================
// Streaming Handler - Real-time SSE AI Response Streaming
// ============================================================================
export {
  streamChatHandler,
} from './handlers/streaming.handler';

// ============================================================================
// Thread Handlers - Thread CRUD Operations
// ============================================================================
export {
  createThreadHandler,
  deleteThreadHandler,
  getPublicThreadHandler,
  getThreadBySlugHandler,
  getThreadHandler,
  listThreadsHandler,
  updateThreadHandler,
} from './handlers/thread.handler';
