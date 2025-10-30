/**
 * Thread Screen Actions Hook
 *
 * Zustand v5 Pattern: Screen-specific action hook for thread screen
 * Consolidates thread-specific logic (participant sync, message refetch, pending message send)
 *
 * Location: /src/stores/chat/actions/thread-actions.ts
 * Used by: ChatThreadScreen
 */

'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { useChatStore } from '@/components/providers/chat-store-provider';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { calculateNextRoundNumber } from '@/lib/utils/round-utils';

export type UseThreadActionsOptions = {
  /** Thread slug for message refetch */
  slug: string;
  /** Whether round is currently in progress (streaming or creating analysis) */
  isRoundInProgress: boolean;
  /** Whether changelog is currently being fetched */
  isChangelogFetching: boolean;
};

export type UseThreadActionsReturn = {
  /** Handle mode change with config change tracking */
  handleModeChange: (mode: ChatModeId) => void;
  /** Handle participants change with config change tracking */
  handleParticipantsChange: (participants: ParticipantConfig[]) => void;
};

/**
 * Hook for managing thread screen actions
 *
 * Consolidates:
 * - Participant sync from context to form state
 * - Message refetch after initial load (handles race conditions)
 * - Pending message send orchestration
 * - Mode/participant change handlers with config tracking
 *
 * @example
 * const threadActions = useThreadActions({
 *   slug,
 *   isRoundInProgress,
 *   isChangelogFetching,
 * })
 *
 * <ChatModeSelector onModeChange={threadActions.handleModeChange} />
 */
export function useThreadActions(options: UseThreadActionsOptions): UseThreadActionsReturn {
  const { slug, isRoundInProgress, isChangelogFetching } = options;

  // Batch related state selectors with useShallow for performance
  const contextParticipants = useChatStore(s => s.participants);
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const sendMessage = useChatStore(s => s.sendMessage);
  const chatSetMessages = useChatStore(s => s.chatSetMessages);

  // Flags - batch with useShallow
  const flags = useChatStore(useShallow(s => ({
    hasInitiallyLoaded: s.hasInitiallyLoaded,
    hasPendingConfigChanges: s.hasPendingConfigChanges,
    hasRefetchedMessages: s.hasRefetchedMessages,
    isWaitingForChangelog: s.isWaitingForChangelog,
  })));

  // Data - batch with useShallow
  const data = useChatStore(useShallow(s => ({
    pendingMessage: s.pendingMessage,
    expectedParticipantIds: s.expectedParticipantIds,
  })));

  const hasSentPendingMessage = useChatStore(s => s.hasSentPendingMessage);

  // Actions - batch with useShallow
  const actions = useChatStore(useShallow(s => ({
    setSelectedParticipants: s.setSelectedParticipants,
    setSelectedMode: s.setSelectedMode,
    setHasPendingConfigChanges: s.setHasPendingConfigChanges,
    setHasRefetchedMessages: s.setHasRefetchedMessages,
    setIsWaitingForChangelog: s.setIsWaitingForChangelog,
    setStreamingRoundNumber: s.setStreamingRoundNumber,
    setHasSentPendingMessage: s.setHasSentPendingMessage,
  })));

  // Use local refs for tracking values that don't need re-renders
  const lastSyncedContextRef = useRef<string>('');
  const hasInitiallyLoadedRef = useRef(flags.hasInitiallyLoaded);
  const hasRefetchedMessagesRef = useRef(flags.hasRefetchedMessages);

  // Sync refs with state changes
  useEffect(() => {
    hasInitiallyLoadedRef.current = flags.hasInitiallyLoaded;
  }, [flags.hasInitiallyLoaded]);

  useEffect(() => {
    hasRefetchedMessagesRef.current = flags.hasRefetchedMessages;
  }, [flags.hasRefetchedMessages]);

  /**
   * Sync local participants with context when no pending changes
   * Allows users to modify participants and have changes staged until next message
   */
  useEffect(() => {
    if (contextParticipants.length === 0) {
      return;
    }

    if (isRoundInProgress || flags.hasPendingConfigChanges) {
      return;
    }

    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      return;
    }

    const contextKey = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => `${p.id}:${p.modelId}:${p.priority}`)
      .join('|');

    if (contextKey === lastSyncedContextRef.current) {
      return;
    }

    const syncedParticipants: ParticipantConfig[] = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));

    lastSyncedContextRef.current = contextKey;
    actions.setSelectedParticipants(syncedParticipants);
  }, [contextParticipants, isRoundInProgress, flags.hasPendingConfigChanges, actions]);

  /**
   * One-time message refetch to handle race condition
   * After initial load completes, refetch when browser is idle to ensure all messages displayed
   */
  useEffect(() => {
    // Use refs to check flags without re-rendering on every change
    if (
      hasInitiallyLoadedRef.current
      && !hasRefetchedMessagesRef.current
      && messages.length > 0
      && !isStreaming
      && !flags.hasPendingConfigChanges
    ) {
      const refetchCallback = async () => {
        try {
          const { getThreadBySlugService } = await import('@/services/api');
          const result = await getThreadBySlugService({ param: { slug } });

          if (result.success && result.data.messages.length > messages.length) {
            const freshMessages = result.data.messages.map(m => ({
              ...m,
              createdAt: new Date(m.createdAt),
            }));

            const { chatMessagesToUIMessages } = await import('@/lib/utils/message-transforms');
            const uiMessages = chatMessagesToUIMessages(freshMessages, result.data.participants);

            chatSetMessages?.(uiMessages);
          }
        } catch {
          // Silently fail - safety net
        } finally {
          actions.setHasRefetchedMessages(true);
        }
      };

      const idleHandle = typeof requestIdleCallback !== 'undefined'
        ? requestIdleCallback(refetchCallback, { timeout: 2000 })
        : (requestAnimationFrame(refetchCallback) as unknown as number);

      return () => {
        if (typeof cancelIdleCallback !== 'undefined') {
          cancelIdleCallback(idleHandle);
        } else {
          cancelAnimationFrame(idleHandle);
        }
      };
    }
    return undefined;
  }, [
    messages.length,
    isStreaming,
    flags.hasPendingConfigChanges,
    slug,
    chatSetMessages,
    actions,
  ]);

  /**
   * Send pending message when participants match expected IDs
   * Orchestrates changelog wait → participant match → message send
   */
  useEffect(() => {
    if (!data.pendingMessage || !data.expectedParticipantIds || hasSentPendingMessage) {
      return;
    }

    if (isStreaming) {
      return;
    }

    const currentModelIds = contextParticipants.map(p => p.modelId).sort().join(',');
    const expectedModelIds = data.expectedParticipantIds.sort().join(',');

    if (currentModelIds !== expectedModelIds) {
      return;
    }

    if (flags.isWaitingForChangelog && isChangelogFetching) {
      return;
    }

    if (flags.isWaitingForChangelog) {
      actions.setIsWaitingForChangelog(false);
    }

    actions.setHasSentPendingMessage(true);

    const newRoundNumber = calculateNextRoundNumber(messages);
    actions.setStreamingRoundNumber(newRoundNumber);

    sendMessage?.(data.pendingMessage);
    actions.setHasPendingConfigChanges(false);
  }, [
    data,
    flags.isWaitingForChangelog,
    hasSentPendingMessage,
    contextParticipants,
    sendMessage,
    messages,
    isChangelogFetching,
    isStreaming,
    actions,
  ]);

  /**
   * Handle mode change with config change tracking
   */
  const handleModeChange = useCallback((mode: ChatModeId) => {
    if (isRoundInProgress)
      return;
    actions.setSelectedMode(mode);
    actions.setHasPendingConfigChanges(true);
  }, [isRoundInProgress, actions]);

  /**
   * Handle participants change with config change tracking
   */
  const handleParticipantsChange = useCallback((participants: ParticipantConfig[]) => {
    if (isRoundInProgress)
      return;
    actions.setSelectedParticipants(participants);
    actions.setHasPendingConfigChanges(true);
  }, [isRoundInProgress, actions]);

  return useMemo(() => ({
    handleModeChange,
    handleParticipantsChange,
  }), [handleModeChange, handleParticipantsChange]);
}
