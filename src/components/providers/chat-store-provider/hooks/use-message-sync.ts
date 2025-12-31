'use client';

import type { UIMessage } from 'ai';
import { useEffect, useRef } from 'react';

import { DevLogMsgEvents, FinishReasons, MessagePartTypes, MessageRoles, TextPartStates } from '@/api/core/enums';
import { devLog, getParticipantIndex, getRoundNumber, rlog } from '@/lib/utils';
import { getMessageMetadata } from '@/lib/utils/metadata';
import type { ChatStoreApi } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseMessageSyncParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

function hasLastMessageContentChanged(
  chatMessages: readonly UIMessage[],
  storeMessages: readonly UIMessage[],
): boolean {
  if (chatMessages.length === 0) {
    return false;
  }

  const lastChatMsg = chatMessages[chatMessages.length - 1];
  if (!lastChatMsg) {
    return false;
  }

  const correspondingStoreMsg = storeMessages.find(m => m.id === lastChatMsg.id);
  if (!correspondingStoreMsg) {
    return true;
  }

  const chatParts = lastChatMsg.parts;
  const storeParts = correspondingStoreMsg.parts;

  if (!chatParts || !storeParts) {
    return chatParts !== storeParts;
  }
  if (chatParts.length !== storeParts.length) {
    return true;
  }

  for (let i = chatParts.length - 1; i >= 0; i--) {
    const chatPart = chatParts[i];
    const storePart = storeParts[i];

    if (chatPart?.type === MessagePartTypes.TEXT && storePart?.type === MessagePartTypes.TEXT) {
      if ('text' in chatPart && 'text' in storePart) {
        if (chatPart.text.length !== storePart.text.length)
          return true;
        if (chatPart.text !== storePart.text)
          return true;
      }
    } else if (chatPart?.type === MessagePartTypes.REASONING && storePart?.type === MessagePartTypes.REASONING) {
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

export function useMessageSync({ store, chat }: UseMessageSyncParams) {
  const prevChatMessagesRef = useRef<UIMessage[]>([]);
  const prevMessageCountRef = useRef<number>(0);
  const lastStreamActivityRef = useRef<number>(Date.now());
  const lastStreamSyncRef = useRef<number>(0);
  const STREAM_SYNC_THROTTLE_MS = 250;
  const prevStreamingRef = useRef<boolean>(false);
  const hasHydratedRef = useRef<string | null>(null);

  useEffect(() => {
    const currentStoreState = store.getState();
    const currentStoreMessages = currentStoreState.messages;
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

    if (
      chat.messages.length === 0
      && currentStoreMessages.length > 0
      && currentThreadId
      && hasHydratedRef.current !== currentThreadId
    ) {
      hasHydratedRef.current = currentThreadId;
      const storeIds = currentStoreMessages.map(m => m.id.replace(/^01[A-Z0-9]+_/, '')).join(',');
      rlog.msg('hydrate', `SDK←store ${currentStoreMessages.length}msgs ids=[${storeIds}]`);
      chat.setMessages?.(structuredClone(currentStoreMessages));
    }

    if (currentThreadId && hasHydratedRef.current && hasHydratedRef.current !== currentThreadId) {
      hasHydratedRef.current = null;
    }
  }, [chat, store, chat.messages.length]);

  const chatMessages = chat.messages;
  const chatIsStreaming = chat.isStreaming;
  const chatSetMessages = chat.setMessages;

  const prevChatMessagesLengthRef = useRef(0);
  const prevLastMessageTextLengthRef = useRef(0);

  useEffect(() => {
    const currentStoreMessages = store.getState().messages;
    const currentStoreState = store.getState();
    const currentThreadId = currentStoreState.thread?.id || currentStoreState.createdThreadId;

    const currentMsgCount = chatMessages.length;
    const lastChatMsg = chatMessages[chatMessages.length - 1];
    const currentTextLength = lastChatMsg?.parts?.reduce((len, p) => {
      if (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string') {
        return len + p.text.length;
      }
      if (p.type === MessagePartTypes.REASONING && 'text' in p && typeof p.text === 'string') {
        return len + p.text.length;
      }
      return len;
    }, 0) ?? 0;

    const msgCountUnchanged = currentMsgCount === prevChatMessagesLengthRef.current;
    const textLengthUnchanged = currentTextLength === prevLastMessageTextLengthRef.current;
    if (msgCountUnchanged && textLengthUnchanged && chatIsStreaming) {
      return;
    }

    prevChatMessagesLengthRef.current = currentMsgCount;
    prevLastMessageTextLengthRef.current = currentTextLength;

    const streamingJustEnded = prevStreamingRef.current && !chatIsStreaming;
    prevStreamingRef.current = chatIsStreaming;

    if (chatIsStreaming && !streamingJustEnded) {
      const now = Date.now();
      if (now - lastStreamSyncRef.current < STREAM_SYNC_THROTTLE_MS) {
        return;
      }

      if (!hasLastMessageContentChanged(chatMessages, currentStoreMessages)) {
        return;
      }
    }
    if (currentThreadId && chatMessages.length > 0 && !chatIsStreaming) {
      const firstAssistantMsg = chatMessages.find(m => m.role === MessageRoles.ASSISTANT);
      if (firstAssistantMsg?.id) {
        const threadIdPrefix = `${currentThreadId}_r`;
        const hasOurFormat = firstAssistantMsg.id.includes('_r') && firstAssistantMsg.id.includes('_p');

        if (hasOurFormat) {
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

    const countChanged = chatMessages.length !== prevMessageCountRef.current;
    const chatAheadOfStore = chatMessages.length > currentStoreMessages.length;
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
          if (hookPart?.type === MessagePartTypes.TEXT && storePart?.type === MessagePartTypes.TEXT) {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              contentChanged = true;
              break;
            }
          }
          if (hookPart?.type === MessagePartTypes.REASONING && storePart?.type === MessagePartTypes.REASONING) {
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

    const shouldSync = countChanged || chatAheadOfStore || chatHasNewMessages || (contentChanged && !shouldThrottle);

    if (shouldSync) {
      const state = store.getState();
      if (state.hasEarlyOptimisticMessage) {
        return;
      }

      const filteredMessages = chatMessages.filter((m) => {
        if (m.id?.startsWith('pre-search-'))
          return false;

        if (m.role === MessageRoles.ASSISTANT && m.id?.includes('_moderator')) {
          const metadata = getMessageMetadata(m.metadata);
          const hasModeratorFlag = metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true;
          const hasParticipantMetadata = metadata?.role === 'assistant' && 'participantIndex' in metadata && typeof metadata.participantIndex === 'number';

          if (!hasModeratorFlag && hasParticipantMetadata)
            return false;
        }

        if (m.role === MessageRoles.USER) {
          const metadata = getMessageMetadata(m.metadata);
          if (metadata?.role === 'user' && metadata.isParticipantTrigger === true)
            return false;
        }

        const metadata = getMessageMetadata(m.metadata);
        if (metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true) {
          const hasParts = m.parts && m.parts.length > 0;
          const hasContent = m.parts?.some(p =>
            (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0),
          );
          return hasParts && hasContent;
        }

        return true;
      });

      const optimisticMessagesFromStore = currentStoreMessages.filter((m) => {
        const metadata = getMessageMetadata(m.metadata);
        return metadata !== undefined && 'isOptimistic' in metadata && metadata.isOptimistic === true;
      });

      const chatMessageIds = new Set(filteredMessages.map(m => m.id));

      const missingMessagesFromStore = currentStoreMessages.filter((m) => {
        if (chatMessageIds.has(m.id))
          return false;
        if (m.id?.startsWith('pre-search-'))
          return false;

        const metadata = getMessageMetadata(m.metadata);
        if (metadata !== undefined && 'isOptimistic' in metadata && metadata.isOptimistic === true)
          return false;

        if (metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true) {
          const hasParts = m.parts && m.parts.length > 0;
          const hasContent = m.parts?.some(p =>
            (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0),
          );

          const isModeratorStreaming = store.getState().isModeratorStreaming;
          if (isModeratorStreaming)
            return true;
          if (hasParts && hasContent)
            return true;

          return false;
        }

        if (m.role === MessageRoles.USER && metadata?.role === 'user' && metadata.isParticipantTrigger === true) {
          return false;
        }

        return true;
      });

      const mergedMessages = [...missingMessagesFromStore, ...filteredMessages];

      const realUserMessageRounds = new Set(
        mergedMessages
          .filter((m) => {
            if (m.role !== MessageRoles.USER)
              return false;
            const metadata = getMessageMetadata(m.metadata);
            return !(metadata !== undefined && 'isOptimistic' in metadata && metadata.isOptimistic === true);
          })
          .map(m => getRoundNumber(m.metadata))
          .filter((r): r is number => r !== null),
      );

      const filteredIndices: number[] = [];
      for (let i = 0; i < mergedMessages.length; i++) {
        const m = mergedMessages[i];
        if (!m || m.role !== MessageRoles.USER) {
          filteredIndices.push(i);
          continue;
        }
        const metadata = getMessageMetadata(m.metadata);
        if (!(metadata !== undefined && 'isOptimistic' in metadata && metadata.isOptimistic === true)) {
          filteredIndices.push(i);
          continue;
        }
        const round = getRoundNumber(metadata);
        if (round === null || !realUserMessageRounds.has(round)) {
          filteredIndices.push(i);
        }
      }
      const roundDeduplicatedMsgs = filteredIndices.map(i => mergedMessages[i]).filter((m): m is UIMessage => m !== undefined);
      mergedMessages.length = 0;
      mergedMessages.push(...roundDeduplicatedMsgs);

      const isModeratorStreaming = state.isModeratorStreaming;
      if ((chatIsStreaming || isModeratorStreaming) && mergedMessages.length < currentStoreMessages.length) {
        devLog.d('prevent-loss', { merged: mergedMessages.length, store: currentStoreMessages.length, strm: chatIsStreaming, modStrm: isModeratorStreaming });
        const mergedIds = new Set(mergedMessages.map(m => m.id));
        for (const storeMsg of currentStoreMessages) {
          if (!mergedIds.has(storeMsg.id) && !storeMsg.id?.startsWith('pre-search-')) {
            mergedMessages.push(storeMsg);
          }
        }
      }
      mergedMessages.sort((a, b) => {
        const roundA = getRoundNumber(a.metadata) ?? -1;
        const roundB = getRoundNumber(b.metadata) ?? -1;
        if (roundA !== roundB)
          return roundA - roundB;

        if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
          return -1;
        if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
          return 1;

        const metaA = getMessageMetadata(a.metadata);
        const metaB = getMessageMetadata(b.metadata);
        const pIdxA = metaA?.role === 'assistant' && 'participantIndex' in metaA ? metaA.participantIndex : undefined;
        const pIdxB = metaB?.role === 'assistant' && 'participantIndex' in metaB ? metaB.participantIndex : undefined;
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

      const messageDedupeMap = new Map<string, typeof mergedMessages[0]>();

      for (const msg of mergedMessages) {
        const existing = messageDedupeMap.get(msg.id);
        if (existing) {
          const existingContentLength = existing.parts?.reduce((len, p) => {
            if (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string') {
              return len + p.text.length;
            }
            return len;
          }, 0) || 0;
          const newContentLength = msg.parts?.reduce((len, p) => {
            if (p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string') {
              return len + p.text.length;
            }
            return len;
          }, 0) || 0;

          const existingText = existing.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string');
          const newText = msg.parts?.find(p => p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string');
          const existingTextContent = existingText && 'text' in existingText ? String(existingText.text || '') : '';
          const newTextContent = newText && 'text' in newText ? String(newText.text || '') : '';

          const existingMeta = getMessageMetadata(existing.metadata);
          const newMeta = getMessageMetadata(msg.metadata);
          const existingIsModerator = existingMeta?.role === 'assistant' && 'isModerator' in existingMeta && existingMeta.isModerator === true;
          const newIsModerator = newMeta?.role === 'assistant' && 'isModerator' in newMeta && newMeta.isModerator === true;
          const existingIsParticipant = existing.id.includes('_p') && !existing.id.includes('_moderator');

          const newLooksLikeModerator = newTextContent.startsWith('###') || newTextContent.toLowerCase().includes('council concluded');
          if (existingIsParticipant && !existingIsModerator && newLooksLikeModerator && existingContentLength > 0) {
            continue;
          }

          if (existingContentLength > 0 && newContentLength > existingContentLength) {
            const existingNormalized = existingTextContent.trim();
            const newNormalized = newTextContent.trim();
            const existingAppearsMultipleTimes = newNormalized.includes(existingNormalized + existingNormalized)
              || (newNormalized.startsWith(existingNormalized) && newNormalized.endsWith(existingNormalized) && newNormalized !== existingNormalized);
            if (existingAppearsMultipleTimes) {
              continue;
            }
          }

          const existingFinishReason = existingMeta?.role === 'assistant' ? existingMeta.finishReason : undefined;
          const newFinishReason = newMeta?.role === 'assistant' ? newMeta.finishReason : undefined;

          const existingIsComplete = existingFinishReason === FinishReasons.STOP || existingFinishReason === FinishReasons.LENGTH;
          const newIsComplete = newFinishReason === FinishReasons.STOP || newFinishReason === FinishReasons.LENGTH;

          if (existingIsModerator && newIsModerator && existingContentLength > 0 && newContentLength === 0) {
            continue;
          }

          if (existingIsParticipant && existingIsComplete && existingContentLength > 0) {
            const isValidContinuation = newIsComplete
              && newContentLength >= existingContentLength
              && newTextContent.startsWith(existingTextContent);
            if (!isValidContinuation) {
              continue;
            }
          }

          let keepExisting = false;

          if (existingIsComplete && !newIsComplete) {
            keepExisting = true;
          } else if (!existingIsComplete && newIsComplete) {
            keepExisting = false;
          } else if (existingContentLength > newContentLength && existingContentLength > 0) {
            keepExisting = true;
          } else if (existingContentLength > 0 && newContentLength === 0) {
            keepExisting = true;
          }

          if (keepExisting) {
            continue;
          }
        }
        messageDedupeMap.set(msg.id, msg);
      }

      const validatedMessages = Array.from(messageDedupeMap.values())
        .filter((msg) => {
          if (msg.role !== MessageRoles.ASSISTANT)
            return true;

          const isModeratorId = msg.id.includes('_moderator');
          const metadata = getMessageMetadata(msg.metadata);
          const hasModeratorFlag = metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true;
          const hasParticipantMetadata = metadata?.role === 'assistant' && 'participantIndex' in metadata && typeof metadata.participantIndex === 'number';

          if (isModeratorId && !hasModeratorFlag && hasParticipantMetadata) {
            return false;
          }

          return true;
        })
        .map((msg) => {
          if (msg.role !== MessageRoles.ASSISTANT)
            return msg;

          const idMatch = msg.id.match(/_r(\d+)_p(\d+)/);
          if (!idMatch)
            return msg;

          const roundFromId = Number.parseInt(idMatch[1]!, 10);
          const participantIndexFromId = Number.parseInt(idMatch[2]!, 10);
          const roundFromMetadata = getRoundNumber(msg.metadata);
          const metadata = getMessageMetadata(msg.metadata);
          const participantIndexFromMetadata = metadata?.role === 'assistant' && 'participantIndex' in metadata
            ? metadata.participantIndex
            : null;

          const roundMismatch = roundFromMetadata !== null && roundFromId !== roundFromMetadata;
          const participantMismatch = participantIndexFromMetadata !== null
            && participantIndexFromId !== participantIndexFromMetadata;

          if (roundMismatch || participantMismatch) {
            return {
              ...msg,
              metadata: {
                ...(metadata || {}),
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
          if (part.type === MessagePartTypes.TEXT && 'text' in part) {
            key = `text:${part.text}`;
          } else if (part.type === MessagePartTypes.REASONING && 'text' in part) {
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
            const existingHasState = 'state' in existing && existing.state === TextPartStates.DONE;
            const currentHasState = 'state' in part && part.state === TextPartStates.DONE;
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
              if (hookPart?.type === MessagePartTypes.TEXT && storePart?.type === MessagePartTypes.TEXT) {
                if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
                  return false;
                }
              }
              if (hookPart?.type === MessagePartTypes.REASONING && storePart?.type === MessagePartTypes.REASONING) {
                if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
                  return false;
                }
              }
            }
          }
          return true;
        });

      if (!isSameMessages) {
        const moderatorMessagesFromStore = currentStoreMessages.filter((msg) => {
          const metadata = getMessageMetadata(msg.metadata);
          return metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true;
        });

        // Build a map of store moderators by ID for quick lookup
        const storeModeratorMap = new Map(moderatorMessagesFromStore.map(m => [m.id, m]));

        const updatedDeduplicatedMessages = deduplicatedMessages.map((msg) => {
          const metadata = getMessageMetadata(msg.metadata);
          const isModerator = metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true;

          if (!isModerator)
            return msg;

          const msgHasContent = msg.parts?.some(p =>
            p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
          ) ?? false;

          if (msgHasContent)
            return msg;

          const storeVersion = storeModeratorMap.get(msg.id);
          if (!storeVersion)
            return msg;

          const storeHasContent = storeVersion.parts?.some(p =>
            p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
          ) ?? false;

          if (storeHasContent)
            return storeVersion;

          return msg;
        });

        const moderatorIdsInDedup = new Set(
          updatedDeduplicatedMessages
            .filter((msg) => {
              const metadata = getMessageMetadata(msg.metadata);
              return metadata?.role === 'assistant' && 'isModerator' in metadata && metadata.isModerator === true;
            })
            .map(msg => msg.id),
        );

        // Add store moderator messages that aren't already in deduplicatedMessages
        const moderatorsToPreserve = moderatorMessagesFromStore.filter(msg => !moderatorIdsInDedup.has(msg.id));

        // Merge: updated messages + preserved moderators
        const mergedMessages = [...updatedDeduplicatedMessages, ...moderatorsToPreserve];

        if (!chatIsStreaming) {
          for (const msg of mergedMessages) {
            if (msg.role === MessageRoles.ASSISTANT && msg.parts) {
              for (let i = 0; i < msg.parts.length; i++) {
                const part = msg.parts[i];
                if (part && 'state' in part && part.state === TextPartStates.STREAMING) {
                  msg.parts[i] = { ...part, state: TextPartStates.DONE };
                }
              }
            }
          }
        }

        const getMessageSortKey = (msg: UIMessage): string => {
          const round = getRoundNumber(msg.metadata) ?? 0;
          const metadata = getMessageMetadata(msg.metadata);
          const pIdx = metadata?.role === 'assistant' && 'participantIndex' in metadata ? metadata.participantIndex : undefined;
          const adjustedIdx = pIdx === undefined ? -1000 : (pIdx < 0 ? 1000 + pIdx : pIdx);
          return `${String(round).padStart(5, '0')}_${String(adjustedIdx + 1000).padStart(5, '0')}`;
        };

        const originalOrder = mergedMessages.map(m => m.id).join(',');

        mergedMessages.sort((a, b) => {
          const keyA = getMessageSortKey(a);
          const keyB = getMessageSortKey(b);
          return keyA.localeCompare(keyB);
        });

        const sortedOrder = mergedMessages.map(m => m.id).join(',');

        if (originalOrder === sortedOrder && isSameMessages) {
          prevMessageCountRef.current = chatMessages.length;
          prevChatMessagesRef.current = chatMessages;
          return;
        }

        devLog.msg(DevLogMsgEvents.SYNC, mergedMessages.length - prevMessageCountRef.current);

        const assistantMsgs = mergedMessages.filter(m => m.role === MessageRoles.ASSISTANT);
        const pIndices = assistantMsgs.map(m => getParticipantIndex(m.metadata)).filter(i => i !== undefined && i !== null);
        const rounds = [...new Set(mergedMessages.map(m => getRoundNumber(m.metadata)).filter(r => r !== null))];
        const msgIds = mergedMessages.map(m => m.id.replace(/^01[A-Z0-9]+_/, '')).join(',');
        rlog.msg('sync', `${currentStoreMessages.length}→${mergedMessages.length} ids=[${msgIds}] strm=${chatIsStreaming ? 1 : 0} r=[${rounds.join(',')}] p=[${pIndices.join(',')}]`);

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
  }, [chatMessages, chatIsStreaming, chatSetMessages, store]);

  useEffect(() => {
    if (!chatIsStreaming) {
      return;
    }

    const POLL_INTERVAL_MS = 300;

    const syncInterval = setInterval(() => {
      if (!chatIsStreaming || chatMessages.length === 0) {
        return;
      }

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
          if (hookPart?.type === MessagePartTypes.TEXT && storePart?.type === MessagePartTypes.TEXT) {
            if ('text' in hookPart && 'text' in storePart && hookPart.text !== storePart.text) {
              needsSync = true;
              break;
            }
          }
          if (hookPart?.type === MessagePartTypes.REASONING && storePart?.type === MessagePartTypes.REASONING) {
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
          const newMessageRound = getRoundNumber(lastHookMessage.metadata);
          let insertIndex = currentStoreMessages.length;

          if (newMessageRound !== null) {
            for (let i = currentStoreMessages.length - 1; i >= 0; i--) {
              const storeMsg = currentStoreMessages[i];
              const storeMsgRound = getRoundNumber(storeMsg?.metadata);

              if (storeMsgRound !== null && storeMsgRound <= newMessageRound) {
                insertIndex = i + 1;
                break;
              }
            }
          }

          const messageExists = currentStoreMessages.some(m => m.id === lastHookMessage.id);
          if (!messageExists) {
            const newMessages = [...currentStoreMessages];
            newMessages.splice(insertIndex, 0, structuredClone(lastHookMessage));
            store.getState().setMessages(newMessages);
            lastStreamSyncRef.current = Date.now();
          }
        } else {
          const storeMeta = getMessageMetadata(correspondingStoreMessage.metadata);
          const storeIsModerator = storeMeta?.role === 'assistant' && 'isModerator' in storeMeta && storeMeta.isModerator === true;

          if (storeIsModerator) {
            const storeHasContent = correspondingStoreMessage.parts?.some(p =>
              p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
            ) ?? false;
            const hookHasContent = lastHookMessage.parts?.some(p =>
              p.type === MessagePartTypes.TEXT && 'text' in p && typeof p.text === 'string' && p.text.length > 0,
            ) ?? false;

            if (storeHasContent && !hookHasContent) {
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
          lastStreamSyncRef.current = Date.now();
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(syncInterval);
  }, [chatIsStreaming, chatMessages, store]);

  return { lastStreamActivityRef };
}
