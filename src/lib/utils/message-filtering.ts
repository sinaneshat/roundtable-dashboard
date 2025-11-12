/**
 * Message Filtering Utilities - DEPRECATED
 *
 * **⚠️ DEPRECATED**: This module has been consolidated into message-transforms.ts
 *
 * All functionality from this file is now available in:
 * - `message-transforms.ts` - Core filtering and type guards
 * - `metadata.ts` - Type-safe metadata extraction
 *
 * Migration guide:
 * ```typescript
 * // OLD: import from message-filtering
 * import { isPreSearchMessage, filterToParticipantMessages } from '@/lib/utils/message-filtering';
 *
 * // NEW: import from message (barrel) or message-transforms
 * import { isPreSearchMessage, filterToParticipantMessages } from '@/lib/utils/message';
 * // OR
 * import { isPreSearchMessage, filterToParticipantMessages } from '@/lib/utils/message-transforms';
 * ```
 *
 * @deprecated Use message-transforms.ts instead
 * @module lib/utils/message-filtering
 */

// Re-export everything from message-transforms for backward compatibility
export * from './message-transforms';
