'use client';

/**
 * Message Sync Hook
 *
 * Syncs messages between AI SDK hook and Zustand store.
 * Handles deduplication, race conditions, and streaming updates.
 */

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

import { MessageRoles } from '@/api/core/enums';
import { getRoundNumber } from '@/lib/utils/metadata';
import type { ChatStoreApi } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseMessageSyncParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

/**
 * Sync AI SDK hook messages to store during streaming
 *
 * The hook's internal messages get updated during streaming, but the store's messages don't.
 * This causes the overview screen to show only the user message while streaming
 * because it reads from store.messages, not from the hook's messages.
 */
export function useMessageSync({ store, chat }: UseMessageSyncParams) {
  // Track previous messages for change detection
  const prevChatMessagesRef = useRef<UIMessage[]>([]);
  const prevMessageCountRef = useRef<number>(0);

  // Track last stream activity to detect stuck streams

  const lastStreamActivityRef = useRef<number>(Date.now());

  // Streaming throttle to avoid race conditions
  const lastStreamSyncRef = useRef<number>(0);
  const STREAM_SYNC_THROTTLE_MS = 100;

  // Track hydration to prevent duplicate hydration attempts
  const hasHydratedRef = useRef<string | null>(null);

  // ============================================================================
  // HYDRATION EFFECT: Store → AI SDK (on initial load/navigation)
  // ============================================================================
  // When AI SDK has 0 messages but store has messages, hydrate AI SDK from store.
  // This enables resumption by making chat.isReady = true.
  useEffect(() => {
    const currentStoreState = store.getState();
    const currentStoreMessages = currentStoreState.messages;
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

    // Only hydrate if:
    // 1. AI SDK has 0 messages
    // 2. Store has messages
    // 3. We have a thread ID
    // 4. We haven't already hydrated for this thread
    if (
      chat.messages.length === 0
      && currentStoreMessages.length > 0
      && currentThreadId
      && hasHydratedRef.current !== currentThreadId
    ) {
      hasHydratedRef.current = currentThreadId;
      chat.setMessages?.(structuredClone(currentStoreMessages));
    }

    // Reset hydration tracking when thread changes
    if (currentThreadId && hasHydratedRef.current && hasHydratedRef.current !== currentThreadId) {
      hasHydratedRef.current = null;
    }
  }, [chat, store, chat.messages.length]);

  // Main sync effect
  useEffect(() => {
    const currentStoreMessages = store.getState().messages;
    const currentStoreState = store.getState();
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

    // Prevent circular updates - only sync when ACTUAL CONTENT changes
    // AI SDK returns new array reference on every render

    // Never sync if AI SDK has FEWER messages than store
    // Prevents message loss during navigation/initialization
    if (chat.messages.length < currentStoreMessages.length) {
      return;
    }

    // Validate thread ID before syncing to prevent stale messages
    if (currentThreadId && chat.messages.length > 0) {
      const firstAssistantMsg = chat.messages.find(m => m.role === MessageRoles.ASSISTANT);
      if (firstAssistantMsg?.id) {
        const threadIdPrefix = `${currentThreadId}_r`;
        const hasOurFormat = firstAssistantMsg.id.includes('_r') && firstAssistantMsg.id.includes('_p');

        if (hasOurFormat) {
          if (!firstAssistantMsg.id.startsWith(threadIdPrefix) && !firstAssistantMsg.id.startsWith('optimistic-')) {
            chat.setMessages?.([]);
            return;
          }
        }
      }
    }

    // Detect changes
    const countChanged = chat.messages.length !== prevMessageCountRef.current;
    let contentChanged = false;
    let shouldThrottle = false;

    if (chat.isStreaming && chat.messages.length > 0) {
      const lastHookMessage = chat.messages[chat.messages.length - 1];
      if (!lastHookMessage)
        return;

      const correspondingStoreMessage = currentStoreMessages.find(m => m.id === lastHookMessage.id);

      if (lastHookMessage?.parts && correspondingStoreMessage?.parts) {
        for (let j = 0; j < lastHookMessage.parts.length; j++) {
          const hookPart = lastHookMessage.parts[j];
          const storePart = correspondingStoreMessage.parts[j];
          if (hookPart?.type === 'text' && storePart?.type === 'text') {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              contentChanged = true;
              break;
            }
          }
          if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              contentChanged = true;
              break;
            }
          }
        }
        if (lastHookMessage.parts.length !== correspondingStoreMessage.parts.length) {
          contentChanged = true;
        }
      } else if (lastHookMessage?.parts && !correspondingStoreMessage) {
        contentChanged = true;
      }

      if (contentChanged) {
        lastStreamActivityRef.current = Date.now();
        const now = Date.now();
        if (now - lastStreamSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
          shouldThrottle = true;
        }
      }
    }

    const shouldSync = countChanged || (contentChanged && !shouldThrottle);

    if (shouldSync) {
      const state = store.getState();
      if (state.hasEarlyOptimisticMessage)
        return;

      // Filter out isParticipantTrigger messages
      const filteredMessages = chat.messages.filter((m) => {
        if (m.role !== MessageRoles.USER)
          return true;
        const metadata = m.metadata;
        if (metadata && typeof metadata === 'object' && 'isParticipantTrigger' in metadata) {
          return metadata.isParticipantTrigger !== true;
        }
        return true;
      });

      // Preserve optimistic messages from store
      const optimisticMessagesFromStore = currentStoreMessages.filter((m) => {
        const metadata = m.metadata;
        return metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true;
      });

      // ✅ BUG FIX: Preserve messages from store that AI SDK doesn't have
      // When participants change between rounds, AI SDK may not have messages from
      // old participants. These need to be preserved from the store.
      // IMPORTANT: Preserve ALL missing messages, not just previous rounds.
      // The old logic (msgRound < currentRound) failed when AI SDK only had round 0
      // messages - it would compute currentRound=0 and drop r0_p1 since 0 < 0 is false.
      const chatMessageIds = new Set(filteredMessages.map(m => m.id));

      const missingMessagesFromStore = currentStoreMessages.filter((m) => {
        // Skip if already in chat messages
        if (chatMessageIds.has(m.id))
          return false;

        // Skip optimistic messages (handled separately)
        const metadata = m.metadata;
        if (metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true)
          return false;

        // ✅ BUG FIX: Skip isParticipantTrigger messages from store
        // These are internal trigger messages that should never persist in the store.
        // Bug: trigger messages could get into store, then get re-added here even
        // after filteredMessages correctly excludes them from AI SDK messages.
        if (m.role === MessageRoles.USER && metadata && typeof metadata === 'object' && 'isParticipantTrigger' in metadata) {
          if (metadata.isParticipantTrigger === true)
            return false;
        }

        // Keep ALL messages not in AI SDK
        return true;
      });

      const mergedMessages = [...missingMessagesFromStore, ...filteredMessages];

      for (const optimisticMsg of optimisticMessagesFromStore) {
        const optimisticRound = getRoundNumber(optimisticMsg.metadata);
        const hasRealMessage = filteredMessages.some((m) => {
          if (m.role !== MessageRoles.USER)
            return false;
          return getRoundNumber(m.metadata) === optimisticRound;
        });

        if (!hasRealMessage && optimisticRound !== null) {
          const insertIndex = mergedMessages.findIndex((m) => {
            const msgRound = getRoundNumber(m.metadata);
            if (msgRound === null)
              return false;
            if (msgRound > optimisticRound)
              return true;
            if (msgRound === optimisticRound && m.role === MessageRoles.ASSISTANT)
              return true;
            return false;
          });

          if (insertIndex === -1) {
            const alreadyExists = mergedMessages.some(m => m.id === optimisticMsg.id);
            if (!alreadyExists)
              mergedMessages.push(optimisticMsg);
          } else {
            const alreadyExists = mergedMessages.some(m => m.id === optimisticMsg.id);
            if (!alreadyExists)
              mergedMessages.splice(insertIndex, 0, optimisticMsg);
          }
        }
      }

      // Deduplicate by ID with content preservation
      // ✅ BUG FIX: Don't overwrite messages that have content with empty ones
      // Bug pattern: round 1 participant incorrectly targets round 0 message ID,
      // causing original content to be replaced with empty streaming message
      const messageDedupeMap = new Map<string, typeof mergedMessages[0]>();
      for (const msg of mergedMessages) {
        const existing = messageDedupeMap.get(msg.id);
        if (existing) {
          // Check if existing has content
          const existingHasContent = existing.parts?.some(
            p => p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
          ) || false;
          const newHasContent = msg.parts?.some(
            p => p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0,
          ) || false;

          // Don't replace message with content with one without content
          // UNLESS they're from the same participant (legitimate update)
          if (existingHasContent && !newHasContent) {
            const existingParticipantId = existing.metadata && typeof existing.metadata === 'object' && 'participantId' in existing.metadata
              ? existing.metadata.participantId
              : null;
            const newParticipantId = msg.metadata && typeof msg.metadata === 'object' && 'participantId' in msg.metadata
              ? msg.metadata.participantId
              : null;

            // If different participants, keep the one with content
            if (existingParticipantId !== newParticipantId) {
              continue; // Keep existing, don't overwrite
            }
          }
        }
        messageDedupeMap.set(msg.id, msg);
      }

      // ✅ BUG FIX: Validate and correct ID/metadata mismatch
      // Bug patterns found in state dumps:
      // 1. message ID has _r0_ but metadata has roundNumber: 1
      // 2. message ID has _p1 but metadata has participantIndex: 0
      // These cause participants from round 0 to disappear because timeline
      // groups by metadata.roundNumber, not by ID
      const validatedMessages = Array.from(messageDedupeMap.values()).map((msg) => {
        if (msg.role !== MessageRoles.ASSISTANT)
          return msg;

        // Extract round and participant from ID
        const idMatch = msg.id.match(/_r(\d+)_p(\d+)/);
        if (!idMatch)
          return msg;

        const roundFromId = Number.parseInt(idMatch[1]!, 10);
        const participantIndexFromId = Number.parseInt(idMatch[2]!, 10);
        const roundFromMetadata = getRoundNumber(msg.metadata);
        const participantIndexFromMetadata = msg.metadata && typeof msg.metadata === 'object' && 'participantIndex' in msg.metadata
          ? (msg.metadata as { participantIndex?: number }).participantIndex
          : null;

        // Check for ANY mismatch
        const roundMismatch = roundFromMetadata !== null && roundFromId !== roundFromMetadata;
        const participantMismatch = participantIndexFromMetadata !== null
          && participantIndexFromMetadata !== undefined
          && participantIndexFromId !== participantIndexFromMetadata;

        if (roundMismatch || participantMismatch) {
          // Correct metadata to match ID (ID is source of truth from backend)
          return {
            ...msg,
            metadata: {
              ...(msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}),
              roundNumber: roundFromId,
              participantIndex: participantIndexFromId,
            },
          };
        }

        return msg;
      });

      const deduplicatedMessages = validatedMessages.map((msg) => {
        if (msg.role !== MessageRoles.ASSISTANT || !msg.parts || msg.parts.length <= 1) {
          return msg;
        }

        const seenParts = new Map<string, typeof msg.parts[0]>();
        for (const part of msg.parts) {
          let key: string;
          if (part.type === 'text' && 'text' in part) {
            key = `text:${part.text}`;
          } else if (part.type === 'reasoning' && 'text' in part) {
            key = `reasoning:${part.text}`;
          } else if (part.type === 'step-start') {
            key = 'step-start';
          } else {
            key = `other:${Math.random()}`;
          }

          const existing = seenParts.get(key);
          if (!existing) {
            seenParts.set(key, part);
          } else {
            const existingHasState = 'state' in existing && existing.state === 'done';
            const currentHasState = 'state' in part && part.state === 'done';
            if (currentHasState && !existingHasState) {
              seenParts.set(key, part);
            }
          }
        }

        const uniqueParts = Array.from(seenParts.values());
        if (uniqueParts.length === msg.parts.length)
          return msg;
        return { ...msg, parts: uniqueParts };
      });

      // Check if messages actually changed (no sorting - preserve original order)
      const isSameMessages = deduplicatedMessages.length === currentStoreMessages.length
        && deduplicatedMessages.every((m, i) => {
          const storeMsg = currentStoreMessages[i];
          if (m.id !== storeMsg?.id)
            return false;
          if (m.parts?.length !== storeMsg?.parts?.length)
            return false;

          const isLastMessage = i === deduplicatedMessages.length - 1;
          const shouldCompareContent = isLastMessage && chat.isStreaming;
          if (shouldCompareContent && m.parts && m.parts.length > 0 && storeMsg?.parts && storeMsg.parts.length > 0) {
            for (let j = 0; j < m.parts.length; j++) {
              const hookPart = m.parts[j];
              const storePart = storeMsg.parts[j];
              if (hookPart?.type === 'text' && storePart?.type === 'text') {
                if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
                  return false;
                }
              }
              if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
                if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
                  return false;
                }
              }
            }
          }
          return true;
        });

      if (!isSameMessages) {
        prevMessageCountRef.current = chat.messages.length;
        prevChatMessagesRef.current = chat.messages;
        store.getState().setMessages(structuredClone(deduplicatedMessages));
        lastStreamActivityRef.current = Date.now();
        lastStreamSyncRef.current = Date.now();
      } else {
        prevMessageCountRef.current = chat.messages.length;
        prevChatMessagesRef.current = chat.messages;
      }
    }
  }, [chat, store]);

  // Polling for content updates during streaming
  useEffect(() => {
    if (!chat.isStreaming)
      return;

    const syncInterval = setInterval(() => {
      if (!chat.isStreaming || chat.messages.length === 0)
        return;

      const currentStoreMessages = store.getState().messages;
      const lastHookMessage = chat.messages[chat.messages.length - 1];
      if (!lastHookMessage)
        return;

      const storeMessageIndex = currentStoreMessages.findIndex(m => m.id === lastHookMessage.id);
      const correspondingStoreMessage = storeMessageIndex >= 0 ? currentStoreMessages[storeMessageIndex] : null;

      let needsSync = false;
      if (!correspondingStoreMessage) {
        needsSync = true;
      } else if (lastHookMessage.parts && correspondingStoreMessage.parts) {
        for (let j = 0; j < lastHookMessage.parts.length; j++) {
          const hookPart = lastHookMessage.parts[j];
          const storePart = correspondingStoreMessage.parts[j];
          if (hookPart?.type === 'text' && storePart?.type === 'text') {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              needsSync = true;
              break;
            }
          }
          if (hookPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              needsSync = true;
              break;
            }
          }
        }
        if (lastHookMessage.parts.length !== correspondingStoreMessage.parts.length) {
          needsSync = true;
        }
      }

      if (needsSync) {
        lastStreamActivityRef.current = Date.now();
        if (!correspondingStoreMessage) {
          // ✅ BUG FIX: MERGE new message instead of replacing ALL messages
          // When participants change between rounds, AI SDK may not have messages
          // from previous rounds (old participants). Replacing all messages loses them.
          // Instead, merge the new streaming message with existing store messages.
          const newMessageRound = getRoundNumber(lastHookMessage.metadata);

          // Find where to insert the new message (after user message of same round)
          // or at the end if no position found
          let insertIndex = currentStoreMessages.length;

          if (newMessageRound !== null) {
            // Find the last message of the same or earlier round
            for (let i = currentStoreMessages.length - 1; i >= 0; i--) {
              const storeMsg = currentStoreMessages[i];
              const storeMsgRound = getRoundNumber(storeMsg?.metadata);

              if (storeMsgRound !== null && storeMsgRound <= newMessageRound) {
                insertIndex = i + 1;
                break;
              }
            }
          }

          // Check if message already exists by ID (prevent duplicates)
          const messageExists = currentStoreMessages.some(m => m.id === lastHookMessage.id);
          if (!messageExists) {
            const newMessages = [...currentStoreMessages];
            newMessages.splice(insertIndex, 0, structuredClone(lastHookMessage));
            store.getState().setMessages(newMessages);
          }
        } else {
          store.getState().setMessages(
            currentStoreMessages.map((msg, idx) =>
              idx === storeMessageIndex
                ? { ...msg, parts: structuredClone(lastHookMessage.parts) }
                : msg,
            ),
          );
        }
      }
    }, 100);

    return () => clearInterval(syncInterval);
  }, [chat.isStreaming, chat.messages, store]);

  return { lastStreamActivityRef };
}
