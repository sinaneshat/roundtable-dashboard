/**
 * useSyncedMessageRefs Hook
 *
 * React 19.2 Pattern: Synchronize refs with reactive state using useLayoutEffect
 *
 * Prevents stale closures in async callbacks by keeping refs in sync with state.
 * Uses useLayoutEffect for synchronous updates before browser paint, ensuring
 * refs are current when callbacks execute.
 *
 * Used by:
 * - ChatOverviewScreen: Sync messages, participants for onComplete callback
 * - ChatThreadScreen: Sync messages, participants, createPendingAnalysis
 * - useMultiParticipantChat: Sync callbacks and state values to prevent stale closures
 *
 * @module hooks/utils/use-synced-message-refs
 */

import type { UIMessage } from 'ai';
import { useLayoutEffect, useRef } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';

/**
 * Synchronize refs with messages and participants state
 *
 * Prevents stale closures in callbacks (onComplete, onRetry) by maintaining
 * up-to-date refs that can be read synchronously without triggering re-renders.
 *
 * Why useLayoutEffect:
 * - Runs synchronously after DOM mutations but before browser paint
 * - Ensures refs are updated BEFORE any effects that might read them
 * - Prevents race conditions in callback execution
 *
 * Why Refs Instead of State:
 * - Callbacks (onComplete, onRetry) are set once and don't update
 * - Reading state in callbacks creates stale closures
 * - Refs provide mutable values that callbacks can read without closure issues
 *
 * @param params - The hook parameters
 * @param params.messages - Current messages array from useChat
 * @param params.participants - Current participants array from context
 * @param params.createPendingAnalysis - Optional function to create pending analyses
 * @returns Stable refs synchronized with current state
 *
 * @example
 * ```typescript
 * const {
 *   messagesRef,
 *   participantsRef,
 *   createPendingAnalysisRef
 * } = useSyncedMessageRefs({
 *   messages,
 *   participants: contextParticipants,
 *   createPendingAnalysis
 * });
 *
 * // Use in callbacks without stale closure issues
 * setOnComplete(() => {
 *   const currentMessages = messagesRef.current;
 *   const currentParticipants = participantsRef.current;
 *   createPendingAnalysisRef.current?.(roundNumber, currentMessages, currentParticipants);
 * });
 * ```
 */
export function useSyncedMessageRefs({
  messages,
  participants,
  createPendingAnalysis,
}: {
  messages: UIMessage[];
  participants: ChatParticipant[];
  createPendingAnalysis?: (
    roundNumber: number,
    messages: UIMessage[],
    participants: ChatParticipant[],
    userQuestion: string,
  ) => void;
}): {
  messagesRef: React.MutableRefObject<UIMessage[]>;
  participantsRef: React.MutableRefObject<ChatParticipant[]>;
  createPendingAnalysisRef: React.MutableRefObject<
    | ((roundNumber: number, messages: UIMessage[], participants: ChatParticipant[], userQuestion: string) => void)
    | undefined
  >;
} {
  // Initialize refs
  const messagesRef = useRef(messages);
  const participantsRef = useRef(participants);
  const createPendingAnalysisRef = useRef(createPendingAnalysis);

  // React 19.2 Pattern: Use useLayoutEffect for synchronous ref updates
  // Ensures refs are current BEFORE browser paint, preventing stale closure issues
  useLayoutEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useLayoutEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);

  return {
    messagesRef,
    participantsRef,
    createPendingAnalysisRef,
  };
}
