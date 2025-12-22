'use client';

/**
 * Message Sync Hook
 *
 * Syncs messages between AI SDK hook and Zustand store.
 * Handles deduplication, race conditions, and streaming updates.
 *
 * ✅ OPTIMIZATION: Uses specific dependencies instead of entire chat object
 * to prevent excessive effect runs during streaming.
 */

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

import { MessageRoles } from '@/api/core/enums';
import { devLog } from '@/lib/utils/dev-logger';
import { getRoundNumber } from '@/lib/utils/metadata';
import type { ChatStoreApi } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseMessageSyncParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

/**
 * ✅ OPTIMIZATION: Fast content comparison for streaming messages
 * Only compares text length first (O(1)) before full comparison
 */
function hasLastMessageContentChanged(
  chatMessages: UIMessage[],
  storeMessages: UIMessage[],
): boolean {
  if (chatMessages.length === 0)
    return false;

  const lastChatMsg = chatMessages[chatMessages.length - 1];
  if (!lastChatMsg)
    return false;

  const correspondingStoreMsg = storeMessages.find(m => m.id === lastChatMsg.id);
  if (!correspondingStoreMsg)
    return true; // New message

  // Quick length check first (O(1))
  const chatParts = lastChatMsg.parts;
  const storeParts = correspondingStoreMsg.parts;

  if (!chatParts || !storeParts)
    return chatParts !== storeParts;
  if (chatParts.length !== storeParts.length)
    return true;

  // Compare text content of last text part (most common streaming case)
  for (let i = chatParts.length - 1; i >= 0; i--) {
    const chatPart = chatParts[i];
    const storePart = storeParts[i];

    if (chatPart?.type === 'text' && storePart?.type === 'text') {
      if ('text' in chatPart && 'text' in storePart) {
        // Quick length check before string comparison
        if (chatPart.text.length !== storePart.text.length)
          return true;
        if (chatPart.text !== storePart.text)
          return true;
      }
    } else if (chatPart?.type === 'reasoning' && storePart?.type === 'reasoning') {
      if ('text' in chatPart && 'text' in storePart) {
        if (chatPart.text.length !== storePart.text.length)
          return true;
        if (chatPart.text !== storePart.text)
          return true;
      }
    }
  }

  return false;
}

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

  // ✅ OPTIMIZATION: Increased throttle interval to reduce update frequency
  const lastStreamSyncRef = useRef<number>(0);
  const STREAM_SYNC_THROTTLE_MS = 250; // Increased from 150ms for better batching

  // ✅ RACE FIX: Track previous streaming state to detect transitions
  // When streaming ends (true → false), we must bypass throttle for final sync
  const prevStreamingRef = useRef<boolean>(false);

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

  // ✅ OPTIMIZATION: Extract values from chat for stable dependency comparison
  const chatMessages = chat.messages;
  const chatIsStreaming = chat.isStreaming;
  const chatSetMessages = chat.setMessages;

  // ✅ OPTIMIZATION: Ref-based change detection to prevent excessive effect runs
  // AI SDK creates new array reference on every chunk, but content may not have changed
  const prevChatMessagesLengthRef = useRef(0);
  const prevLastMessageTextLengthRef = useRef(0);

  // Main sync effect
  // ✅ OPTIMIZATION: Uses specific values instead of entire chat object
  useEffect(() => {
    const currentStoreMessages = store.getState().messages;
    const currentStoreState = store.getState();
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

    // ✅ OPTIMIZATION: Fast path - check if anything actually changed before processing
    // This prevents the excessive update warning during streaming
    const currentMsgCount = chatMessages.length;
    const lastChatMsg = chatMessages[chatMessages.length - 1];
    const currentTextLength = lastChatMsg?.parts?.reduce((len, p) => {
      if (p.type === 'text' && 'text' in p && typeof p.text === 'string') {
        return len + p.text.length;
      }
      if (p.type === 'reasoning' && 'text' in p && typeof p.text === 'string') {
        return len + p.text.length;
      }
      return len;
    }, 0) ?? 0;

    // Skip if message count and text length are unchanged (ref-based check)
    const msgCountUnchanged = currentMsgCount === prevChatMessagesLengthRef.current;
    const textLengthUnchanged = currentTextLength === prevLastMessageTextLengthRef.current;
    if (msgCountUnchanged && textLengthUnchanged && chatIsStreaming) {
      return; // Fast path - nothing changed, skip all processing
    }

    // Update refs for next comparison
    prevChatMessagesLengthRef.current = currentMsgCount;
    prevLastMessageTextLengthRef.current = currentTextLength;

    // ✅ RACE FIX: Detect streaming end transition (true → false)
    // When streaming ends, we MUST bypass throttle for final sync
    // This ensures UI has the final state before moderator triggers
    const streamingJustEnded = prevStreamingRef.current && !chatIsStreaming;
    prevStreamingRef.current = chatIsStreaming;

    // ✅ OPTIMIZATION: Early return during streaming if throttled
    // This prevents expensive processing on every chunk
    // BUT: Never throttle when streaming just ended - we need final sync
    if (chatIsStreaming && !streamingJustEnded) {
      const now = Date.now();
      if (now - lastStreamSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
        // Still throttled - skip this update entirely
        return;
      }

      // ✅ OPTIMIZATION: Quick content check before expensive processing
      if (!hasLastMessageContentChanged(chatMessages, currentStoreMessages)) {
        // Content hasn't changed - skip update
        return;
      }
    }

    // Prevent circular updates - only sync when ACTUAL CONTENT changes
    // AI SDK returns new array reference on every render

    // ✅ STREAMING FIX: Don't block sync when AI SDK has fewer messages
    // Previously returned early when chatMessages.length < currentStoreMessages.length
    // This blocked syncing NEW streaming messages when AI SDK wasn't fully hydrated
    // Bug: AI SDK receives streaming responses but store never updates
    // Fix: Merge new messages from AI SDK into store instead of blocking

    // Validate thread ID before syncing to prevent stale messages
    // ✅ BUG FIX: Don't clear messages during active streaming or recent streaming
    // The original check was too aggressive and would clear messages during the
    // transition between participants (after one finishes, before next starts).
    // This caused the "disappearing messages" bug where the entire chat would
    // briefly vanish after a model (especially Grok) finished streaming.
    //
    // Fix: Only clear messages when we're NOT streaming AND there's a genuine
    // thread mismatch. During streaming transitions, preserve messages.
    if (currentThreadId && chatMessages.length > 0 && !chatIsStreaming) {
      const firstAssistantMsg = chatMessages.find(m => m.role === MessageRoles.ASSISTANT);
      if (firstAssistantMsg?.id) {
        const threadIdPrefix = `${currentThreadId}_r`;
        const hasOurFormat = firstAssistantMsg.id.includes('_r') && firstAssistantMsg.id.includes('_p');

        if (hasOurFormat) {
          // ✅ Additional check: Only clear if ALL assistant messages have wrong thread ID
          // This prevents clearing during transitions where some messages might be updating
          const allAssistantMsgs = chatMessages.filter(m => m.role === MessageRoles.ASSISTANT);
          const allHaveWrongThread = allAssistantMsgs.every((msg) => {
            const msgHasOurFormat = msg.id?.includes('_r') && msg.id?.includes('_p');
            if (!msgHasOurFormat)
              return false;
            return !msg.id?.startsWith(threadIdPrefix) && !msg.id?.startsWith('optimistic-');
          });

          if (allHaveWrongThread && allAssistantMsgs.length > 0) {
            chatSetMessages?.([]);
            return;
          }
        }
      }
    }

    // Detect changes
    const countChanged = chatMessages.length !== prevMessageCountRef.current;
    // 🐛 BUG FIX: Also detect when chat has more messages than store
    // Previously only compared against ref, missing cases where store falls behind
    const chatAheadOfStore = chatMessages.length > currentStoreMessages.length;

    // ✅ STREAMING FIX: Detect when AI SDK has messages that store doesn't have
    // This handles the case where AI SDK has fewer total messages but some are NEW
    // (e.g., AI SDK has streaming messages but wasn't fully hydrated with history)
    const storeMessageIds = new Set(currentStoreMessages.map(m => m.id));
    const chatHasNewMessages = chatMessages.some(m => !storeMessageIds.has(m.id));

    let contentChanged = false;
    let shouldThrottle = false;

    if (chatIsStreaming && chatMessages.length > 0) {
      const lastHookMessage = chatMessages[chatMessages.length - 1];
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

    // ✅ STREAMING FIX: Include chatHasNewMessages in sync decision
    // This ensures new streaming messages get synced even when AI SDK has fewer total messages
    const shouldSync = countChanged || chatAheadOfStore || chatHasNewMessages || (contentChanged && !shouldThrottle);

    if (shouldSync) {
      const state = store.getState();
      if (state.hasEarlyOptimisticMessage)
        return;

      // Filter out internal messages that shouldn't be in the store
      const filteredMessages = chatMessages.filter((m) => {
        // ✅ FIX: Filter out pre-search placeholder messages
        if (m.id?.startsWith('pre-search-')) {
          return false;
        }

        // ✅ FIX: Filter out corrupted moderator messages
        // These are messages where ID has _moderator suffix but metadata has participant fields
        // This happens when AI SDK incorrectly updates the moderator message during streaming
        if (m.role === MessageRoles.ASSISTANT && m.id?.includes('_moderator')) {
          const metadata = m.metadata;
          const hasModeratorFlag = metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true;
          const hasParticipantMetadata = metadata && typeof metadata === 'object' && 'participantIndex' in metadata && typeof (metadata as { participantIndex?: number }).participantIndex === 'number';

          // If ID says moderator but metadata says participant, this is corrupted - filter out
          if (!hasModeratorFlag && hasParticipantMetadata) {
            return false;
          }
        }

        // Filter out isParticipantTrigger messages
        if (m.role === MessageRoles.USER) {
          const metadata = m.metadata;
          if (metadata && typeof metadata === 'object' && 'isParticipantTrigger' in metadata) {
            return metadata.isParticipantTrigger !== true;
          }
        }

        // ✅ FIX: Filter out moderator placeholder messages (streaming state only)
        // Keep moderator messages that have actual content (from DB after stream completes)
        const metadata = m.metadata;
        if (metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true) {
          // During streaming, moderator messages may be placeholders - filter them out
          // After streaming completes, they should have content from the DB
          const hasParts = m.parts && m.parts.length > 0;
          const hasContent = m.parts?.some(p =>
            (p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0),
          );
          // Only keep moderator messages with actual content
          return hasParts && hasContent;
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

        // ✅ FIX: Skip pre-search placeholder messages from store
        if (m.id?.startsWith('pre-search-'))
          return false;

        // Skip optimistic messages (handled separately)
        const metadata = m.metadata;
        if (metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic === true)
          return false;

        // ✅ RACE CONDITION FIX: Always preserve moderator messages with content from store
        // Previously only preserved during isModeratorStreaming=true, which caused:
        // 1. Round 0 moderator completes, isModeratorStreaming=false
        // 2. Round 1 starts, but chatIsStreaming not yet true
        // 3. Sync runs in this gap, moderator with content gets filtered out
        // 4. Empty moderator placeholder overwrites content
        // FIX: Always preserve moderator messages that have content, regardless of streaming state
        if (metadata && typeof metadata === 'object' && 'isModerator' in metadata && metadata.isModerator === true) {
          const hasParts = m.parts && m.parts.length > 0;
          const hasContent = m.parts?.some(p =>
            (p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0),
          );

          // During moderator streaming, preserve ALL moderator messages (including placeholders)
          const isModeratorStreaming = store.getState().isModeratorStreaming;
          if (isModeratorStreaming) {
            return true;
          }

          // Always preserve moderator messages WITH content (prevents race condition)
          if (hasParts && hasContent) {
            return true;
          }

          // Skip moderator messages without content (placeholders after streaming complete)
          return false;
        }

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

      // ✅ BUG FIX: Remove optimistic user messages when real user message exists for same round
      // Optimistic messages are created by form-actions.ts, real messages come from AI SDK
      // They have different IDs, so ID-based deduplication doesn't catch them
      const realUserMessageRounds = new Set(
        mergedMessages
          .filter(m =>
            m.role === MessageRoles.USER
            && !(m.metadata && typeof m.metadata === 'object' && 'isOptimistic' in m.metadata && m.metadata.isOptimistic),
          )
          .map(m => getRoundNumber(m.metadata))
          .filter(r => r !== null),
      );

      // Remove optimistic messages that have a real counterpart
      // ✅ BUG FIX: Mutate mergedMessages in place to avoid creating unused variable
      const filteredIndices: number[] = [];
      for (let i = 0; i < mergedMessages.length; i++) {
        const m = mergedMessages[i]!;
        if (m.role !== MessageRoles.USER) {
          filteredIndices.push(i);
          continue;
        }
        const metadata = m.metadata;
        const isOptimistic = metadata && typeof metadata === 'object' && 'isOptimistic' in metadata && metadata.isOptimistic;
        if (!isOptimistic) {
          filteredIndices.push(i);
          continue;
        }
        const round = getRoundNumber(metadata);
        // Keep optimistic only if no real message exists for this round
        if (round === null || !realUserMessageRounds.has(round)) {
          filteredIndices.push(i);
        }
      }
      // Rebuild mergedMessages array with only kept indices
      const roundDeduplicatedMsgs = filteredIndices.map(i => mergedMessages[i]!);
      mergedMessages.length = 0;
      mergedMessages.push(...roundDeduplicatedMsgs);

      // ✅ RACE CONDITION FIX: Never drop messages during streaming
      // If merge would result in fewer messages than store, abort this sync.
      // This prevents the oscillation bug where two sync paths fight each other.
      // Also applies during moderator streaming to prevent moderator placeholder from being dropped.
      const isModeratorStreaming = state.isModeratorStreaming;
      if ((chatIsStreaming || isModeratorStreaming) && mergedMessages.length < currentStoreMessages.length) {
        // Instead of dropping, ensure all store messages are preserved (except internal messages)
        const mergedIds = new Set(mergedMessages.map(m => m.id));
        for (const storeMsg of currentStoreMessages) {
          if (!mergedIds.has(storeMsg.id) && !storeMsg.id?.startsWith('pre-search-')) {
            mergedMessages.push(storeMsg);
          }
        }
      }

      // ✅ FIX: Sort messages by round number and participant index to maintain order
      // ✅ MODERATOR FIX: Handle negative participantIndex (-99) for moderator
      // Moderator should sort AFTER all regular participants (0, 1, 2, etc.)
      mergedMessages.sort((a, b) => {
        const roundA = getRoundNumber(a.metadata) ?? -1;
        const roundB = getRoundNumber(b.metadata) ?? -1;
        if (roundA !== roundB)
          return roundA - roundB;

        // Within same round: user messages first, then by participant index
        if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
          return -1;
        if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
          return 1;

        // ✅ MODERATOR FIX: Handle negative participantIndex
        // User messages (undefined pIdx) sort first (-1000)
        // Regular participants (0, 1, 2...) sort in order
        // Moderator (-99) sorts LAST (becomes 901 after adjustment)
        const pIdxA = (a.metadata as { participantIndex?: number })?.participantIndex;
        const pIdxB = (b.metadata as { participantIndex?: number })?.participantIndex;
        const adjustedIdxA = pIdxA === undefined ? -1000 : (pIdxA < 0 ? 1000 + pIdxA : pIdxA);
        const adjustedIdxB = pIdxB === undefined ? -1000 : (pIdxB < 0 ? 1000 + pIdxB : pIdxB);
        return adjustedIdxA - adjustedIdxB;
      });

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
      //
      // ✅ RESUMPTION FIX: Prefer MORE COMPLETE content over less complete
      // When prefetch has complete content and resume has partial, keep prefetch
      // When resume has more content than prefetch (continuation), use resume
      const messageDedupeMap = new Map<string, typeof mergedMessages[0]>();
      for (const msg of mergedMessages) {
        const existing = messageDedupeMap.get(msg.id);
        if (existing) {
          // Calculate content length for each
          const existingContentLength = existing.parts?.reduce((len, p) => {
            if (p.type === 'text' && 'text' in p && typeof p.text === 'string') {
              return len + p.text.length;
            }
            return len;
          }, 0) || 0;
          const newContentLength = msg.parts?.reduce((len, p) => {
            if (p.type === 'text' && 'text' in p && typeof p.text === 'string') {
              return len + p.text.length;
            }
            return len;
          }, 0) || 0;

          // Check finish reason - completed messages are more authoritative
          const existingFinishReason = existing.metadata && typeof existing.metadata === 'object' && 'finishReason' in existing.metadata
            ? existing.metadata.finishReason
            : null;
          const newFinishReason = msg.metadata && typeof msg.metadata === 'object' && 'finishReason' in msg.metadata
            ? msg.metadata.finishReason
            : null;

          const existingIsComplete = existingFinishReason === 'stop' || existingFinishReason === 'length';
          const newIsComplete = newFinishReason === 'stop' || newFinishReason === 'length';

          // ✅ RACE CONDITION FIX: Explicit moderator protection
          // Moderator messages with content must NEVER be overwritten by empty placeholders
          const existingIsModerator = existing.metadata && typeof existing.metadata === 'object'
            && 'isModerator' in existing.metadata && existing.metadata.isModerator === true;
          const newIsModerator = msg.metadata && typeof msg.metadata === 'object'
            && 'isModerator' in msg.metadata && msg.metadata.isModerator === true;

          if (existingIsModerator && newIsModerator && existingContentLength > 0 && newContentLength === 0) {
            // Existing moderator has content, new is empty placeholder - ALWAYS keep existing
            continue;
          }

          // Determine which message to keep
          // Priority: 1. Complete > incomplete, 2. More content > less content
          let keepExisting = false;

          if (existingIsComplete && !newIsComplete) {
            // Existing is complete, new is incomplete - keep existing
            keepExisting = true;
          } else if (!existingIsComplete && newIsComplete) {
            // New is complete, existing is incomplete - use new
            keepExisting = false;
          } else if (existingContentLength > newContentLength && existingContentLength > 0) {
            // Same completion status, but existing has more content - keep existing
            // This handles the case where prefetch has more content than KV buffer
            keepExisting = true;
          } else if (existingContentLength > 0 && newContentLength === 0) {
            // Existing has content, new is empty - keep existing
            keepExisting = true;
          }
          // Otherwise, use new (default behavior for updates)

          if (keepExisting) {
            // ✅ DEBUG: Log when existing content is preserved over new content
            // eslint-disable-next-line no-console
            console.log('[SYNC-KEEP]', JSON.stringify({
              id: msg.id,
              existLen: existingContentLength,
              newLen: newContentLength,
              existComplete: existingIsComplete,
              newComplete: newIsComplete,
            }));
            continue; // Skip this message, keep existing
          }
        }
        // ✅ DEBUG: Log when message content is updated
        if (existing) {
          const existingTextPart = existing.parts?.find(p => p.type === 'text' && 'text' in p);
          const newTextPart = msg.parts?.find(p => p.type === 'text' && 'text' in p);
          const existingText = existingTextPart && 'text' in existingTextPart ? String(existingTextPart.text || '').slice(0, 30) : '';
          const newText = newTextPart && 'text' in newTextPart ? String(newTextPart.text || '').slice(0, 30) : '';
          // eslint-disable-next-line no-console
          console.log('[SYNC-REPLACE]', JSON.stringify({
            id: msg.id,
            from: existingText,
            to: newText,
          }));
        }
        messageDedupeMap.set(msg.id, msg);
      }

      // ✅ BUG FIX: Validate and correct ID/metadata mismatch
      // Bug patterns found in state dumps:
      // 1. message ID has _r0_ but metadata has roundNumber: 1
      // 2. message ID has _p1 but metadata has participantIndex: 0
      // 3. message ID has _moderator but metadata has participantIndex (corrupted moderator)
      // These cause participants from round 0 to disappear because timeline
      // groups by metadata.roundNumber, not by ID
      const validatedMessages = Array.from(messageDedupeMap.values())
        // ✅ FILTER: Remove corrupted moderator messages
        // A corrupted moderator has _moderator suffix but participant metadata (no isModerator flag)
        .filter((msg) => {
          if (msg.role !== MessageRoles.ASSISTANT)
            return true;

          // Check for corrupted moderator: ID has _moderator but metadata lacks isModerator
          const isModeratorId = msg.id.includes('_moderator');
          const hasModeratorFlag = msg.metadata && typeof msg.metadata === 'object' && 'isModerator' in msg.metadata && msg.metadata.isModerator === true;
          const hasParticipantMetadata = msg.metadata && typeof msg.metadata === 'object' && 'participantIndex' in msg.metadata && typeof msg.metadata.participantIndex === 'number';

          // If ID says moderator but metadata says participant, this is corrupted - filter out
          if (isModeratorId && !hasModeratorFlag && hasParticipantMetadata) {
            return false; // Remove this corrupted message
          }

          return true;
        })
        .map((msg) => {
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
          const shouldCompareContent = isLastMessage && chatIsStreaming;
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
        // ✅ RACE CONDITION FIX: Preserve moderator messages with content from store
        // The AI SDK only has participant messages, but we add moderator messages separately
        // We need to merge the AI SDK messages with moderator messages from the store,
        // ALWAYS preferring the version with content over empty placeholders
        const moderatorMessagesFromStore = currentStoreMessages.filter(msg =>
          msg.metadata && typeof msg.metadata === 'object' && 'isModerator' in msg.metadata && msg.metadata.isModerator === true,
        );

        // Build a map of store moderators by ID for quick lookup
        const storeModeratorMap = new Map(moderatorMessagesFromStore.map(m => [m.id, m]));

        // ✅ RACE CONDITION FIX: Replace empty moderators in dedup with store versions that have content
        const updatedDeduplicatedMessages = deduplicatedMessages.map((msg) => {
          const isModerator = msg.metadata && typeof msg.metadata === 'object'
            && 'isModerator' in msg.metadata && msg.metadata.isModerator === true;

          if (!isModerator)
            return msg;

          // Check if this moderator is empty
          const msgHasContent = msg.parts?.some(p =>
            p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
          ) ?? false;

          if (msgHasContent)
            return msg; // Already has content, keep it

          // Check if store has a version with content
          const storeVersion = storeModeratorMap.get(msg.id);
          if (!storeVersion)
            return msg;

          const storeHasContent = storeVersion.parts?.some(p =>
            p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
          ) ?? false;

          if (storeHasContent) {
            // Store has content, dedup is empty - use store version
            return storeVersion;
          }

          return msg;
        });

        // Get IDs of moderator messages already in updated deduplicatedMessages
        const moderatorIdsInDedup = new Set(
          updatedDeduplicatedMessages
            .filter(msg => msg.metadata && typeof msg.metadata === 'object' && 'isModerator' in msg.metadata && msg.metadata.isModerator === true)
            .map(msg => msg.id),
        );

        // Add store moderator messages that aren't already in deduplicatedMessages
        const moderatorsToPreserve = moderatorMessagesFromStore.filter(msg => !moderatorIdsInDedup.has(msg.id));

        // Merge: updated messages + preserved moderators
        const mergedMessages = [...updatedDeduplicatedMessages, ...moderatorsToPreserve];

        // ✅ CRITICAL FIX: Sort messages to ensure stable ordering
        // Order: by round number, then by participantIndex (moderator -99 comes AFTER regular participants)
        // This prevents message flip-flopping that causes excessive re-renders
        const getMessageSortKey = (msg: UIMessage): string => {
          const round = getRoundNumber(msg.metadata) ?? 0;
          const pIdx = (msg.metadata as { participantIndex?: number })?.participantIndex;
          // User messages (no participantIndex) sort first within round
          // Moderator (-99) sorts after all regular participants
          const adjustedIdx = pIdx === undefined ? -1000 : (pIdx < 0 ? 1000 + pIdx : pIdx);
          return `${String(round).padStart(5, '0')}_${String(adjustedIdx + 1000).padStart(5, '0')}`;
        };

        // Check if already sorted to avoid unnecessary updates
        const originalOrder = mergedMessages.map(m => m.id).join(',');

        mergedMessages.sort((a, b) => {
          const keyA = getMessageSortKey(a);
          const keyB = getMessageSortKey(b);
          return keyA.localeCompare(keyB);
        });

        const sortedOrder = mergedMessages.map(m => m.id).join(',');

        // ✅ OPTIMIZATION: Skip setMessages if order didn't change and content is same
        if (originalOrder === sortedOrder && isSameMessages) {
          prevMessageCountRef.current = chatMessages.length;
          prevChatMessagesRef.current = chatMessages;
          return;
        }

        // Debug: Track message sync (debounced)
        devLog.msg('sync', mergedMessages.length - prevMessageCountRef.current);

        prevMessageCountRef.current = chatMessages.length;
        prevChatMessagesRef.current = chatMessages;
        store.getState().setMessages(structuredClone(mergedMessages));
        lastStreamActivityRef.current = Date.now();
        lastStreamSyncRef.current = Date.now();
      } else {
        prevMessageCountRef.current = chatMessages.length;
        prevChatMessagesRef.current = chatMessages;
      }
    }
    // ✅ OPTIMIZATION: Use specific values as dependencies instead of entire chat object
    // This prevents the effect from running on every message chunk during streaming
  }, [chatMessages, chatIsStreaming, chatSetMessages, store]);

  // Polling for content updates during streaming
  // ✅ OPTIMIZATION: Increased polling interval to reduce update frequency
  useEffect(() => {
    if (!chatIsStreaming) {
      return;
    }

    // ✅ OPTIMIZATION: Use 300ms interval instead of 200ms
    // Combined with 250ms throttle, this significantly reduces update frequency
    const POLL_INTERVAL_MS = 300;

    const syncInterval = setInterval(() => {
      if (!chatIsStreaming || chatMessages.length === 0)
        return;

      // ✅ OPTIMIZATION: Skip if we just synced (throttle)
      const now = Date.now();
      if (now - lastStreamSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
        return;
      }

      const currentStoreMessages = store.getState().messages;
      const lastHookMessage = chatMessages[chatMessages.length - 1];
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
            // ✅ OPTIMIZATION: Update last sync time after insert
            lastStreamSyncRef.current = Date.now();
          }
        } else {
          // ✅ BUG FIX: Never overwrite moderator content with empty parts
          // The AI SDK may have stale empty moderator from hydration,
          // while the store has actual content from moderator streaming.
          // This prevents round N moderator content from being cleared when round N+1 starts.
          const storeIsModerator = correspondingStoreMessage.metadata
            && typeof correspondingStoreMessage.metadata === 'object'
            && 'isModerator' in correspondingStoreMessage.metadata
            && correspondingStoreMessage.metadata.isModerator === true;

          if (storeIsModerator) {
            // Check if store has content but hook doesn't
            const storeHasContent = correspondingStoreMessage.parts?.some(p =>
              p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
            ) ?? false;
            const hookHasContent = lastHookMessage.parts?.some(p =>
              p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
            ) ?? false;

            if (storeHasContent && !hookHasContent) {
              // Store has content, hook is empty - DO NOT overwrite
              // Skip this sync to preserve moderator content
              return;
            }
          }

          store.getState().setMessages(
            currentStoreMessages.map((msg, idx) =>
              idx === storeMessageIndex
                ? { ...msg, parts: structuredClone(lastHookMessage.parts) }
                : msg,
            ),
          );
          // ✅ OPTIMIZATION: Update last sync time after polling update
          lastStreamSyncRef.current = Date.now();
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(syncInterval);
    // ✅ OPTIMIZATION: Use extracted values for stable dependencies
  }, [chatIsStreaming, chatMessages, store]);

  return { lastStreamActivityRef };
}
