'use client';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { UIMessage } from 'ai';
import { RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { Action, Actions } from '@/components/ai-elements/actions';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { RoundFeedback } from '@/components/chat/round-feedback';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useSetRoundFeedbackMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import { useBoolean, useChatAnalysis, useSelectedParticipants } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { chatMessagesToUIMessages, validateMessageOrder } from '@/lib/utils/message-transforms';
import { calculateNextRoundNumber, getCurrentRoundNumber, getMaxRoundNumber, getRoundNumberFromMetadata, groupMessagesByRound } from '@/lib/utils/round-utils';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
  initialMessages: ChatMessage[];
  slug: string;
  user: {
    name: string;
    image: string | null;
  };
};
function useThreadHeaderUpdater({
  thread,
  slug,
  onDeleteClick,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={onDeleteClick}
      />,
    );
  }, [thread, slug, onDeleteClick, setThreadTitle, setThreadActions]);
}
export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const router = useRouter();
  const t = useTranslations('chat');
  const isDeleteDialogOpen = useBoolean(false);
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });
  const {
    thread: contextThread,
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error: _streamError,
    retry: retryRound,
    stop: stopStreaming,
    initializeThread,
    setOnComplete,
    setOnRetry,
    participants: contextParticipants,
    updateParticipants,
  } = useSharedChatContext();
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const { data: changelogResponse } = useThreadChangelogQuery(thread.id, !hasInitiallyLoaded);
  type ChangelogItem = NonNullable<NonNullable<typeof changelogResponse>['data']>['items'][number];
  const [clientChangelog, setClientChangelog] = useState<ChangelogItem[]>([]);
  useEffect(() => {
    if (!hasInitiallyLoaded && changelogResponse?.success) {
      const items = changelogResponse.data.items || [];
      const seen = new Set<string>();
      const deduplicated = items.filter((item) => {
        if (seen.has(item.id))
          return false;
        seen.add(item.id);
        return true;
      });
      setClientChangelog(deduplicated);
    }
  }, [changelogResponse, hasInitiallyLoaded]);
  const changelog = clientChangelog;
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !hasInitiallyLoaded);
  const [clientFeedback, setClientFeedback] = useState<Map<number, 'like' | 'dislike' | null>>(new Map());
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);
  useEffect(() => {
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData && Array.isArray(feedbackData)) {
      const initialFeedback = new Map(
        feedbackData.map(f => [f.roundNumber, f.feedbackType] as const),
      );
      setClientFeedback(initialFeedback);
      setHasLoadedFeedback(true);
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback]);
  const feedbackByRound = clientFeedback;
  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    updateAnalysisStatus,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
    enabled: isStreaming || !hasInitiallyLoaded,
  });
  const analyses = useMemo(() => {
    const seenIds = new Set<string>();
    const uniqueById = rawAnalyses.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
    const validAnalyses = uniqueById.filter(item => item.status !== 'failed');
    const deduplicatedByRound = validAnalyses.reduce((acc, item) => {
      const existing = acc.get(item.roundNumber);
      if (!existing) {
        acc.set(item.roundNumber, item);
        return acc;
      }
      const getStatusPriority = (status: string) => {
        switch (status) {
          case 'completed': return 3;
          case 'streaming': return 2;
          case 'pending': return 1;
          default: return 0;
        }
      };
      const itemPriority = getStatusPriority(item.status);
      const existingPriority = getStatusPriority(existing.status);
      if (itemPriority > existingPriority) {
        acc.set(item.roundNumber, item);
        return acc;
      }
      if (itemPriority === existingPriority) {
        const itemTime = item.createdAt instanceof Date ? item.createdAt.getTime() : new Date(item.createdAt).getTime();
        const existingTime = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();
        if (itemTime > existingTime) {
          acc.set(item.roundNumber, item);
        }
      }
      return acc;
    }, new Map<number, typeof rawAnalyses[number]>());
    return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rawAnalyses]);
  const updateThreadMutation = useUpdateThreadMutation();
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();
  useEffect(() => {
    if (!hasInitiallyLoaded && changelogResponse && feedbackSuccess) {
      setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackSuccess, hasInitiallyLoaded]);
  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  const messagesRef = useRef(messages);
  const contextParticipantsRef = useRef(contextParticipants);
  const previousItemsRef = useRef<Array<
    | { type: 'messages'; data: UIMessage[]; key: string; roundNumber: number }
    | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
    | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number }
  >>([]);
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    contextParticipantsRef.current = contextParticipants;
  }, [contextParticipants]);
  const [pendingFeedback, setPendingFeedback] = useState<{
    roundNumber: number;
    type: 'like' | 'dislike';
  } | null>(null);

  /**
   * SIMPLIFIED ROUND MANAGEMENT
   * - Backend provides round numbers in message metadata
   * - Frontend trusts backend as source of truth
   * - Removed complex client-side round tracking
   * - Round numbers extracted from messages using getRoundNumberFromMetadata()
   */
  const [streamingRoundNumber, setStreamingRoundNumber] = useState<number | null>(null);
  const currentRoundNumberRef = useRef<number | null>(null);
  const regenerateRoundNumberRef = useRef<number | null>(null);

  // State to track previous items for streaming optimization (declared early to avoid use-before-define)
  const wasStreamingRef = useRef(false);
  const [wasStreaming, setWasStreaming] = useState(false);
  const [previousItems, setPreviousItems] = useState<Array<
    | { type: 'messages'; data: UIMessage[]; key: string; roundNumber: number }
    | { type: 'analysis'; data: StoredModeratorAnalysis; key: string; roundNumber: number }
    | { type: 'changelog'; data: ChangelogItem[]; key: string; roundNumber: number }
  >>([]);

  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    return contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));
  }, [contextParticipants]);
  const {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant: removeParticipant,
  } = useSelectedParticipants(initialParticipants);
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');
  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    if (isStreaming)
      return;
    setSelectedMode(newMode);
  }, [isStreaming]);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [expectedParticipantIds, setExpectedParticipantIds] = useState<string[] | null>(null);
  const hasSentPendingMessageRef = useRef(false);
  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    if (isStreaming)
      return;
    setSelectedParticipants(newParticipants);
  }, [isStreaming, setSelectedParticipants]);
  useEffect(() => {
    if (isStreaming) {
      return;
    }
    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      return;
    }
    const contextModelIds = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => p.modelId)
      .join(',');
    const localModelIds = selectedParticipants
      .map(p => p.modelId)
      .join(',');
    if (contextModelIds === localModelIds) {
      return;
    }
    const syncedParticipants = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        priority: index,
      }));
    setSelectedParticipants(syncedParticipants);
  }, [contextParticipants, selectedParticipants, isStreaming, setSelectedParticipants]);
  useEffect(() => {
    const isNavigatingFromOverview = contextThread?.id === thread.id
      && contextParticipants.length > 0
      && (messages.length > 0 || isStreaming);
    if (isNavigatingFromOverview) {
      setHasInitiallyLoaded(true);
    }
    setPreviousItems([]);
    previousItemsRef.current = [];
    scrolledToAnalysesRef.current.clear();
    currentRoundNumberRef.current = null;
    regenerateRoundNumberRef.current = null;
    setOnComplete(() => async () => {
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
      const currentMessages = messagesRef.current;
      const roundNumber = getCurrentRoundNumber(currentMessages);
      const isRegeneration = regenerateRoundNumberRef.current !== null;
      const createAnalysis = () => {
        const latestMessages = messagesRef.current;
        const latestParticipants = contextParticipantsRef.current;
        const latestUserMessage = latestMessages.findLast(m => m.role === 'user');
        const latestUserQuestion = extractTextFromMessage(latestUserMessage);
        createPendingAnalysisRef.current(
          roundNumber,
          latestMessages,
          latestParticipants,
          latestUserQuestion,
        );
      };
      if (isRegeneration) {
        setTimeout(createAnalysis, 100);
      } else {
        createAnalysis();
      }
      if (regenerateRoundNumberRef.current === roundNumber) {
        regenerateRoundNumberRef.current = null;
      }
      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
    if (!isNavigatingFromOverview) {
      const uiMessages = chatMessagesToUIMessages(initialMessages);
      // Backend already provides deduplicated participants
      initializeThread(thread, participants, uiMessages);
    }
    return () => {
      setOnComplete(undefined);
    };
  }, [thread.id]);
  useEffect(() => {
    setOnRetry(() => (roundNumber: number) => {
      regenerateRoundNumberRef.current = roundNumber;
      removePendingAnalysis(roundNumber);
      setClientChangelog(prev => prev.filter(item => item.roundNumber !== roundNumber));
      setClientFeedback((prev) => {
        const updated = new Map(prev);
        updated.delete(roundNumber);
        return updated;
      });
    });
  }, [thread.id, setOnRetry, removePendingAnalysis]);
  useEffect(() => {
    const wasStreaming = isStreaming;
    if (wasStreaming && !isStreaming) {
      setStreamingRoundNumber(null);
    }
  }, [isStreaming]);
  useEffect(() => {
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessageRef.current) {
      return;
    }
    const currentModelIds = contextParticipants.map(p => p.modelId).sort().join(',');
    const expectedModelIds = expectedParticipantIds.sort().join(',');
    if (currentModelIds === expectedModelIds) {
      hasSentPendingMessageRef.current = true;
      const newRoundNumber = calculateNextRoundNumber(messages);
      setStreamingRoundNumber(newRoundNumber);
      currentRoundNumberRef.current = newRoundNumber;
      sendMessage(pendingMessage);
    }
  }, [pendingMessage, expectedParticipantIds, contextParticipants, sendMessage, messages]);
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed || selectedParticipants.length === 0) {
        return;
      }
      try {
        const participantsForUpdate = selectedParticipants.map(p => ({
          id: p.id.startsWith('participant-') ? '' : p.id,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: p.priority,
          isEnabled: true,
        }));
        const optimisticParticipants = selectedParticipants.map((p, index) => ({
          id: p.id,
          threadId: thread.id,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: index,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        const hasTemporaryIds = selectedParticipants.some(p => p.id.startsWith('participant-'));
        if (hasTemporaryIds) {
          updateParticipants(optimisticParticipants);
          const response = await updateThreadMutation.mutateAsync({
            param: { id: thread.id },
            json: {
              participants: participantsForUpdate,
              mode: selectedMode,
            },
          });
          if (response?.data?.participants) {
            const currentParticipants = contextParticipants.filter(
              p => !p.id.startsWith('participant-'),
            );
            const participantsWithDates = response.data.participants.map(p => ({
              ...p,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            }));
            const mergedParticipants = [
              ...currentParticipants,
              ...participantsWithDates,
            ];
            updateParticipants(mergedParticipants);
            await new Promise(resolve => setTimeout(resolve, 10));
            setExpectedParticipantIds(participantsWithDates.map(p => p.modelId));
          } else {
            setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
          }
        } else {
          updateParticipants(optimisticParticipants);
          updateThreadMutation.mutateAsync({
            param: { id: thread.id },
            json: {
              participants: participantsForUpdate,
              mode: selectedMode,
            },
          }).catch(() => {
          });
          await new Promise(resolve => setTimeout(resolve, 10));
          setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
        }
        hasSentPendingMessageRef.current = false;
        setPendingMessage(trimmed);
      } catch {
        await sendMessage(trimmed);
      }
      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, thread.mode, selectedParticipants, selectedMode, updateThreadMutation, updateParticipants, contextParticipants, messages],
  );
  const activeParticipants = contextParticipants;
  const maxRoundNumber = useMemo(() => getMaxRoundNumber(messages), [messages]);

  const messagesWithAnalysesAndChangelog = useMemo(() => {
    type ItemType
      = | { type: 'messages'; data: typeof messages; key: string; roundNumber: number }
        | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
        | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number };
    const currentMaxRound = getMaxRoundNumber(messages);
    const previousMaxRound = previousItems.length > 0
      ? Math.max(...previousItems.map(item => item.roundNumber))
      : 0;
    const streamingJustEnded = wasStreaming && !isStreaming;
    const hasRoundTransition = currentMaxRound > previousMaxRound;
    const messageOrderValidation = validateMessageOrder(messages);
    const isMessageOrderValid = messageOrderValidation.isValid;
    const shouldUseStreamingOptimization = previousItems.length > 0
      && !hasRoundTransition
      && (isStreaming || streamingJustEnded)
      && isMessageOrderValid;
    if (shouldUseStreamingOptimization) {
      const messagesByRound = new Map<number, UIMessage[]>();
      messages.forEach((message) => {
        const roundNumber = getRoundNumberFromMetadata(message) || 1;
        if (!messagesByRound.has(roundNumber)) {
          messagesByRound.set(roundNumber, []);
        }
        messagesByRound.get(roundNumber)!.push(message);
      });
      const analysesByRound = new Map(analyses.map(a => [a.roundNumber, a]));
      const changelogByRound = new Map<number, (typeof changelog)>();
      changelog.forEach((change) => {
        const roundNumber = change.roundNumber || 1;
        if (!changelogByRound.has(roundNumber)) {
          changelogByRound.set(roundNumber, []);
        }
        const roundChanges = changelogByRound.get(roundNumber)!;
        const exists = roundChanges.some(existing => existing.id === change.id);
        if (!exists) {
          roundChanges.push(change);
        }
      });
      const existingItemKeys = new Set(previousItems.map(item => item.key));
      let updatedItems = previousItems.map((item) => {
        if (item.type === 'messages') {
          const roundMessages = messagesByRound.get(item.roundNumber);
          if (roundMessages && roundMessages.length > 0) {
            return { ...item, data: roundMessages };
          }
        }
        if (item.type === 'analysis') {
          const currentAnalysis = analysesByRound.get(item.roundNumber);
          if (currentAnalysis) {
            const currentData = item.data as StoredModeratorAnalysis;
            if (currentData.status === 'completed' && currentAnalysis.status !== 'completed') {
              return item;
            }
            return { ...item, data: currentAnalysis };
          }
        }
        if (item.type === 'changelog') {
          const currentChangelog = changelogByRound.get(item.roundNumber);
          if (currentChangelog && currentChangelog.length > 0) {
            return { ...item, data: currentChangelog };
          }
        }
        return item;
      });
      analyses.forEach((analysis) => {
        const analysisKey = `round-${analysis.roundNumber}-analysis`;
        if (!existingItemKeys.has(analysisKey)) {
          const messagesIndex = updatedItems.findIndex(
            item => item.type === 'messages' && item.roundNumber === analysis.roundNumber,
          );
          if (messagesIndex !== -1) {
            const newAnalysisItem = {
              type: 'analysis' as const,
              data: analysis,
              key: analysisKey,
              roundNumber: analysis.roundNumber,
            };
            updatedItems = [
              ...updatedItems.slice(0, messagesIndex + 1),
              newAnalysisItem,
              ...updatedItems.slice(messagesIndex + 1),
            ];
            existingItemKeys.add(analysisKey);
          }
        }
      });
      changelogByRound.forEach((changelogItems, roundNumber) => {
        const changelogKey = `round-${roundNumber}-changelog`;
        if (!existingItemKeys.has(changelogKey)) {
          const messagesIndex = updatedItems.findIndex(
            item => item.type === 'messages' && item.roundNumber === roundNumber,
          );
          if (messagesIndex !== -1) {
            const newChangelogItem = {
              type: 'changelog' as const,
              data: changelogItems,
              key: changelogKey,
              roundNumber,
            };
            updatedItems = [
              ...updatedItems.slice(0, messagesIndex),
              newChangelogItem,
              ...updatedItems.slice(messagesIndex),
            ];
            existingItemKeys.add(changelogKey);
          }
        }
      });
      return updatedItems;
    }
    const messagesByRound = groupMessagesByRound(messages);
    const items: ItemType[] = [];
    const changelogByRound = new Map<number, (typeof changelog)>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber || 1;
      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }
      const roundChanges = changelogByRound.get(roundNumber)!;
      const exists = roundChanges.some(existing => existing.id === change.id);
      if (!exists) {
        roundChanges.push(change);
      }
    });
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...analyses.map(a => a.roundNumber),
    ]);
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);
    const processedRounds = new Set<number>();
    sortedRounds.forEach((roundNumber) => {
      if (processedRounds.has(roundNumber)) {
        return;
      }
      processedRounds.add(roundNumber);
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);
      if (!roundMessages || roundMessages.length === 0) {
        return;
      }
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }
      if (roundMessages && roundMessages.length > 0) {
        items.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
          roundNumber,
        });
      }
      if (roundAnalysis && roundAnalysis.roundNumber === roundNumber) {
        items.push({
          type: 'analysis',
          data: roundAnalysis,
          key: `round-${roundNumber}-analysis`,
          roundNumber,
        });
      }
    });
    const seenKeys = new Set<string>();
    const deduplicatedItems = items.filter((item) => {
      if (seenKeys.has(item.key)) {
        return false;
      }
      seenKeys.add(item.key);
      return true;
    });
    return deduplicatedItems;
    // NOTE: previousItems and wasStreaming are intentionally excluded from dependencies
    // They are optimization state, not source data - including them causes infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, analyses, changelog, isStreaming]);

  // Update wasStreaming and previousItems after render for next optimization cycle
  useEffect(() => {
    // Update refs for consistency
    wasStreamingRef.current = isStreaming;
    previousItemsRef.current = messagesWithAnalysesAndChangelog;

    // Update state only if changed to prevent unnecessary re-renders
    setWasStreaming(prev => prev !== isStreaming ? isStreaming : prev);
    setPreviousItems((prev) => {
      // Only update if the array reference or length changed
      if (prev === messagesWithAnalysesAndChangelog || prev.length !== messagesWithAnalysesAndChangelog.length) {
        return messagesWithAnalysesAndChangelog;
      }
      return prev;
    });
  }, [messagesWithAnalysesAndChangelog, isStreaming]);
  const feedbackHandlersRef = useRef(new Map<number, (feedbackType: 'like' | 'dislike' | null) => void>());
  const getFeedbackHandler = useCallback((roundNumber: number) => {
    if (!feedbackHandlersRef.current.has(roundNumber)) {
      feedbackHandlersRef.current.set(roundNumber, (feedbackType: 'like' | 'dislike' | null) => {
        setClientFeedback((prev) => {
          const updated = new Map(prev);
          updated.set(roundNumber, feedbackType);
          return updated;
        });
        if (feedbackType) {
          setPendingFeedback({ roundNumber, type: feedbackType });
        }
        setRoundFeedbackMutation.mutate(
          {
            param: {
              threadId: thread.id,
              roundNumber: String(roundNumber),
            },
            json: { feedbackType },
          },
          {
            onSettled: () => {
              setPendingFeedback(null);
            },
          },
        );
      });
    }
    return feedbackHandlersRef.current.get(roundNumber)!;
  }, [setRoundFeedbackMutation, thread.id, setClientFeedback, setPendingFeedback]);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Use callback ref to update scroll margin when element is mounted
  const listRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setScrollMargin(node.offsetTop);
    }
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: messagesWithAnalysesAndChangelog.length,
    estimateSize: () => 200,
    overscan: 5,
    scrollMargin,
  });
  const virtualItems = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer]);
  const totalSize = useMemo(() => rowVirtualizer.getTotalSize(), [rowVirtualizer]);
  const firstItemStart = useMemo(() => virtualItems[0]?.start ?? 0, [virtualItems]);
  const measureElement = useMemo(() => rowVirtualizer.measureElement, [rowVirtualizer]);
  const isNearBottomRef = useRef(true);
  useEffect(() => {
    scrolledToAnalysesRef.current.clear();
  }, [thread.id]);
  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      isNearBottomRef.current = distanceFromBottom < 200;
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const messageItems = useMemo(() => {
    return messagesWithAnalysesAndChangelog.filter(item => item.type === 'messages');
  }, [messagesWithAnalysesAndChangelog]);
  const messageCount = messageItems.length;
  const lastMessageItem = messageItems[messageItems.length - 1];
  const lastMessageContent = lastMessageItem
    ? lastMessageItem.data.map(m => m.parts?.map(p => (p.type === 'text' || p.type === 'reasoning') ? p.text : '').join('')).join('')
    : '';
  const lastMessageItemIndex = useMemo(() => {
    for (let i = messagesWithAnalysesAndChangelog.length - 1; i >= 0; i--) {
      if (messagesWithAnalysesAndChangelog[i]?.type === 'messages') {
        return i;
      }
    }
    return messagesWithAnalysesAndChangelog.length - 1;
  }, [messagesWithAnalysesAndChangelog]);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      if (messagesWithAnalysesAndChangelog.length > 0) {
        const contentContainer = document.getElementById('chat-scroll-container');
        if (contentContainer) {
          const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;
          const targetScroll = contentBottom - window.innerHeight;
          window.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: 'auto',
          });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [thread.id]);
  useEffect(() => {
    if (messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;
    const shouldScrollForAnalysis = hasNewAnalysis && !isStreaming;
    const shouldScroll = isStreaming || shouldScrollForAnalysis || isNearBottomRef.current;
    if (shouldScroll) {
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
      }
      requestAnimationFrame(() => {
        const contentContainer = document.getElementById('chat-scroll-container');
        if (contentContainer) {
          const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;
          const targetScroll = contentBottom - window.innerHeight;
          window.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: isStreaming ? 'smooth' : 'auto',
          });
        } else {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({
            top: maxScroll,
            behavior: isStreaming ? 'smooth' : 'auto',
          });
        }
      });
    }
  }, [messageCount, lastMessageContent, isStreaming, rowVirtualizer, lastMessageItemIndex, analyses]);
  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col min-h-screen relative">
          <div id="chat-scroll-container" ref={listRef} className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
            <div
              style={{
                minHeight: `${totalSize}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${firstItemStart}px)`,
                }}
              >
                {virtualItems.map((virtualItem) => {
                  const item = messagesWithAnalysesAndChangelog[virtualItem.index];
                  if (!item)
                    return null;
                  const itemIndex = virtualItem.index;
                  const roundNumber = item.type === 'messages'
                    ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
                    : item.type === 'analysis'
                      ? item.data.roundNumber
                      : item.type === 'changelog'
                        ? item.data[0]?.roundNumber ?? 1
                        : 1;
                  return (
                    <div
                      key={`${item.key}-${item.type === 'messages' ? item.data.length : ''}`}
                      data-index={virtualItem.index}
                      ref={measureElement}
                    >
                      {item.type === 'changelog' && item.data.length > 0 && (
                        <div className="mb-6">
                          <UnifiedErrorBoundary context="configuration">
                            <ConfigurationChangesGroup
                              group={{
                                timestamp: new Date(item.data[0]!.createdAt),
                                changes: item.data,
                              }}
                            />
                          </UnifiedErrorBoundary>
                        </div>
                      )}
                      {item.type === 'messages' && (
                        <div className="space-y-3 pb-2">
                          <UnifiedErrorBoundary context="message-list" onReset={retryRound}>
                            <ChatMessageList
                              messages={item.data}
                              user={user}
                              participants={activeParticipants}
                              isStreaming={isStreaming}
                              currentParticipantIndex={currentParticipantIndex}
                              currentStreamingParticipant={
                                isStreaming && activeParticipants[currentParticipantIndex]
                                  ? activeParticipants[currentParticipantIndex]
                                  : null
                              }
                            />
                          </UnifiedErrorBoundary>
                          {!isStreaming && (() => {
                            const hasRoundError = item.data.some((msg) => {
                              const parseResult = MessageMetadataSchema.safeParse(msg.metadata);
                              return parseResult.success && messageHasError(parseResult.data);
                            });
                            const isLastRound = roundNumber === maxRoundNumber;
                            return (
                              <Actions className="mt-3 mb-2">
                                {!hasRoundError && (
                                  <RoundFeedback
                                    key={`feedback-${thread.id}-${roundNumber}`}
                                    threadId={thread.id}
                                    roundNumber={roundNumber}
                                    currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                                    onFeedbackChange={getFeedbackHandler(roundNumber)}
                                    disabled={isStreaming}
                                    isPending={
                                      setRoundFeedbackMutation.isPending
                                      && pendingFeedback?.roundNumber === roundNumber
                                    }
                                    pendingType={
                                      pendingFeedback?.roundNumber === roundNumber
                                        ? pendingFeedback?.type ?? null
                                        : null
                                    }
                                  />
                                )}
                                {isLastRound && (
                                  <Action
                                    key={`retry-${thread.id}-${roundNumber}`}
                                    onClick={retryRound}
                                    label={t('errors.retry')}
                                    tooltip={t('errors.retryRound')}
                                  >
                                    <RefreshCcwIcon className="size-3" />
                                  </Action>
                                )}
                              </Actions>
                            );
                          })()}
                        </div>
                      )}
                      {item.type === 'analysis' && (
                        <div className="mt-6 mb-4">
                          <RoundAnalysisCard
                            analysis={item.data}
                            threadId={thread.id}
                            isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                            streamingRoundNumber={streamingRoundNumber}
                            onStreamStart={() => {
                              updateAnalysisStatus(item.data.roundNumber, 'streaming');
                            }}
                            onStreamComplete={(completedData) => {
                              if (completedData) {
                                updateAnalysisData(
                                  item.data.roundNumber,
                                  completedData as import('@/api/routes/chat/schema').ModeratorAnalysisPayload,
                                );
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const isAnalyzing = analyses.some(a => a.status === 'pending' || a.status === 'streaming');
                  const showLoader = (isStreaming || isAnalyzing) && selectedParticipants.length > 1;
                  return showLoader && (
                    <div
                      key="streaming-loader"
                      style={{
                        position: 'relative',
                      }}
                    >
                      <StreamingParticipantsLoader
                        className="mt-12"
                        participants={selectedParticipants}
                        currentParticipantIndex={currentParticipantIndex}
                        isAnalyzing={isAnalyzing}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div
            ref={inputContainerRef}
            className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto"
          >
            <div className="container max-w-3xl mx-auto px-4 sm:px-6">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handlePromptSubmit}
                status={isStreaming ? 'submitted' : 'ready'}
                onStop={stopStreaming}
                placeholder={t('input.placeholder')}
                participants={selectedParticipants}
                currentParticipantIndex={currentParticipantIndex}
                onRemoveParticipant={isStreaming
                  ? undefined
                  : (participantId) => {
                      if (selectedParticipants.length <= 1)
                        return;
                      removeParticipant(participantId);
                    }}
                toolbar={(
                  <>
                    <ChatParticipantsList
                      participants={selectedParticipants}
                      onParticipantsChange={handleParticipantsChange}
                      isStreaming={isStreaming}
                    />
                    <ChatModeSelector
                      selectedMode={selectedMode}
                      onModeChange={handleModeChange}
                      disabled={isStreaming}
                    />
                  </>
                )}
              />
            </div>
          </div>
        </div>
      </UnifiedErrorBoundary>
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
