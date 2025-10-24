'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { UIMessage } from 'ai';
import { RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { Action, Actions } from '@/components/ai-elements/actions';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
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
import { useSharedChatContext } from '@/contexts/chat-context';
import { useSetRoundFeedbackMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadFeedbackQuery } from '@/hooks/queries/chat-feedback';
import { useThreadChangelogQuery } from '@/hooks/queries/chat-threads';
import { useBoolean, useChatAnalysis, useSelectedParticipants } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { calculateNextRoundNumber, getCurrentRoundNumber, getMaxRoundNumber, groupMessagesByRound } from '@/lib/utils/round-utils';

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

/**
 * Component that sets thread header title and actions
 */
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

  // Update thread header with title and actions
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

/**
 * ✅ ONE-WAY DATA FLOW PATTERN: Chat Thread Screen
 *
 * ARCHITECTURAL PRINCIPLE:
 * - Server data loads ONCE on initial page load (from server-side props)
 * - All subsequent state changes are CLIENT-SIDE ONLY
 * - Mutations are FIRE-AND-FORGET (persist to server, ignore response)
 * - NO query refetches during the session
 * - NO query invalidations after mutations
 * - Full page refresh is the ONLY way to sync with server
 *
 * This ensures:
 * - Predictable client-side state management
 * - No race conditions from competing state sources
 * - Fast, responsive UI (no waiting for server)
 * - Clear separation of concerns
 */
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

  // Update thread header with title and actions
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  // ✅ AI SDK v5 PATTERN: Access shared chat context
  const {
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error: _streamError,
    retry: retryRound,
    stop: stopStreaming,
    initializeThread,
    setOnStreamComplete,
    setOnRoundComplete,
    setOnRetry,
    participants: contextParticipants,
    updateParticipants,
  } = useSharedChatContext();

  // ✅ ONE-WAY DATA FLOW: Track initial load state
  // After first load, ALL queries are permanently disabled
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  // ✅ ONE-WAY DATA FLOW: Changelog loaded ONCE on initial page load
  // Query disabled after initial load - client state is source of truth
  const { data: changelogResponse } = useThreadChangelogQuery(thread.id, !hasInitiallyLoaded);
  type ChangelogItem = NonNullable<NonNullable<typeof changelogResponse>['data']>['items'][number];
  const [clientChangelog, setClientChangelog] = useState<ChangelogItem[]>([]);

  // ✅ SIDE EFFECT: Set client state on initial load
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

  // ✅ ONE-WAY DATA FLOW: Feedback loaded ONCE on initial page load
  // Client-side state tracks all feedback changes during the session
  const { data: feedbackData } = useThreadFeedbackQuery(thread.id, !hasInitiallyLoaded);
  const [clientFeedback, setClientFeedback] = useState<Map<number, 'like' | 'dislike' | null>>(new Map());

  // ✅ SIDE EFFECT: Set client state on initial load
  useEffect(() => {
    if (!hasInitiallyLoaded && feedbackData && Array.isArray(feedbackData)) {
      const initialFeedback = new Map(
        feedbackData.map(f => [f.roundNumber, f.feedbackType] as const),
      );
      setClientFeedback(initialFeedback);
    }
  }, [feedbackData, hasInitiallyLoaded]);

  const feedbackByRound = clientFeedback;

  // ✅ ONE-WAY DATA FLOW: Analyses loaded ONCE on initial page load
  // Query disabled after initial load - client state managed via cache manipulation
  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
    enabled: !hasInitiallyLoaded, // ✅ Disable after initial load
  });

  const analyses = useMemo(() => {
    const deduplicatedItems = rawAnalyses
      .filter(item => item.status !== 'failed')
      .reduce((acc, item) => {
        const existing = acc.get(item.roundNumber);
        if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
          acc.set(item.roundNumber, item);
        }
        return acc;
      }, new Map<number, typeof rawAnalyses[number]>());

    return Array.from(deduplicatedItems.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rawAnalyses]);

  // ✅ FIRE-AND-FORGET MUTATIONS: Persist to server but don't update from response
  const updateThreadMutation = useUpdateThreadMutation();
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();

  // ✅ Mark as loaded after initial data is fetched
  useEffect(() => {
    if (!hasInitiallyLoaded && changelogResponse && feedbackData !== undefined) {
      setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackData, hasInitiallyLoaded]);

  // Loading and feedback state
  const [pendingFeedback, setPendingFeedback] = useState<{
    roundNumber: number;
    type: 'like' | 'dislike';
  } | null>(null);

  const [streamingRoundNumber, setStreamingRoundNumber] = useState<number | null>(null);
  const currentRoundNumberRef = useRef<number | null>(null);

  // Participant management
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    return participants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map((p, index) => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role,
        customRoleId: p.customRoleId || undefined,
        order: index,
      }));
  }, [participants]);

  const {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant: removeParticipant,
  } = useSelectedParticipants(initialParticipants);

  // Chat state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    if (isStreaming)
      return;
    setSelectedMode(newMode);
  }, [isStreaming]);

  // Message sending state
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [expectedParticipantIds, setExpectedParticipantIds] = useState<string[] | null>(null);
  const hasSentPendingMessageRef = useRef(false);

  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    if (isStreaming)
      return;
    setSelectedParticipants(newParticipants);
  }, [isStreaming, setSelectedParticipants]);

  // Initialize context when component mounts
  const messagesHash = useMemo(() => {
    return initialMessages
      .map(m => `${m.id}:${JSON.stringify(m.parts)}`)
      .join('|');
  }, [initialMessages]);

  useEffect(() => {
    const uiMessages = chatMessagesToUIMessages(initialMessages);
    initializeThread(thread, participants, uiMessages);

    setOnStreamComplete(() => {
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, messagesHash]);

  useEffect(() => {
    setOnRoundComplete(async () => {
      const currentMessages = messages;
      const currentParticipants = contextParticipants;

      const roundNumber = getCurrentRoundNumber(currentMessages);

      const lastUserMessage = currentMessages.findLast(m => m.role === 'user');
      const textPart = lastUserMessage?.parts?.find(p => p.type === 'text');
      const userQuestion = (textPart && 'text' in textPart ? textPart.text : '') || '';

      createPendingAnalysis(
        roundNumber,
        currentMessages,
        currentParticipants,
        userQuestion,
      );

      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, setOnRoundComplete, messages, contextParticipants, createPendingAnalysis]);

  useEffect(() => {
    setOnRetry((roundNumber: number) => {
      // Remove pending analysis for the round being regenerated
      removePendingAnalysis(roundNumber);

      // Remove changelog entries for the round being regenerated
      // Changelogs appear BEFORE the round they apply to
      setClientChangelog(prev => prev.filter(item => item.roundNumber !== roundNumber));

      // Remove feedback for the round being regenerated
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

    const currentIds = contextParticipants.map(p => p.id).join(',');
    const expectedIds = expectedParticipantIds.join(',');

    if (currentIds === expectedIds) {
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

      // ✅ FIX 3: Capture old state BEFORE update for changelog comparison
      const oldParticipantIds = contextParticipants.map(p => p.id).sort().join(',');
      const oldMode = thread.mode;

      try {
        const participantsForUpdate = selectedParticipants.map(p => ({
          id: p.id.startsWith('participant-') ? undefined : p.id,
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: p.order,
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

        updateParticipants(optimisticParticipants);

        updateThreadMutation.mutateAsync({
          param: { id: thread.id },
          json: {
            participants: participantsForUpdate,
            mode: selectedMode,
          },
        }).catch(() => {
          // Silently ignore errors - client state is source of truth
        });

        // ✅ FIX 3: Check what changed and create client-side changelog if needed
        // Backend creates changelog when MESSAGE is sent
        // But we need client-side changelog for immediate feedback when settings change
        const newParticipantIds = optimisticParticipants.map(p => p.id).sort().join(',');
        const participantsChanged = oldParticipantIds !== newParticipantIds;
        const modeChanged = oldMode !== selectedMode;

        // Create client-side changelog for NEXT round (shows BEFORE user sends message)
        if (participantsChanged || modeChanged) {
          const nextRound = calculateNextRoundNumber(messages);

          const changelogEntry: ChangelogItem = {
            id: `client-${Date.now()}`,
            threadId: thread.id,
            roundNumber: nextRound,
            changeType: modeChanged ? 'mode_change' : 'participants_reordered',
            changeSummary: modeChanged
              ? `Mode changed from ${oldMode} to ${selectedMode}`
              : 'Participants updated',
            changeData: {
              ...(modeChanged && {
                oldMode,
                newMode: selectedMode,
              }),
              ...(participantsChanged && {
                participants: optimisticParticipants.map((p, index) => ({
                  id: p.id,
                  modelId: p.modelId,
                  role: p.role,
                  order: index,
                })),
              }),
            },
            createdAt: new Date().toISOString(),
          };

          setClientChangelog(prev => [...prev, changelogEntry]);
        }

        hasSentPendingMessageRef.current = false;
        setExpectedParticipantIds(optimisticParticipants.map(p => p.id));
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

  // ✅ FIX 1: Stable item positioning - prevent re-sorting during streaming
  // Track previous items to maintain stability when streaming
  const previousItemsRef = useRef<Array<
    | { type: 'messages'; data: UIMessage[]; key: string; roundNumber: number }
    | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
    | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number }
  >>([]);

  const messagesWithAnalysesAndChangelog = useMemo(() => {
    type ItemType
      = | { type: 'messages'; data: typeof messages; key: string; roundNumber: number }
        | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
        | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number };

    const messagesByRound = groupMessagesByRound(messages);

    // Calculate max round from current messages
    const currentMaxRound = getMaxRoundNumber(messages);

    // Get max round from previous items
    const previousMaxRound = previousItemsRef.current.length > 0
      ? Math.max(...previousItemsRef.current.map(item => item.roundNumber))
      : 0;

    // ✅ STREAMING OPTIMIZATION: If streaming same round, just update messages - don't rebuild entire array
    // This prevents analyses and changelogs from shifting positions
    if (isStreaming && currentMaxRound === previousMaxRound && previousItemsRef.current.length > 0) {
      const updatedItems = previousItemsRef.current.map((item) => {
        if (item.type === 'messages' && item.roundNumber === currentMaxRound) {
          const roundMessages = messagesByRound.get(currentMaxRound);
          if (roundMessages && roundMessages.length > 0) {
            return { ...item, data: roundMessages };
          }
        }
        return item;
      });
      return updatedItems;
    }

    // ✅ REBUILD ARRAY: Round completed, new round started, or not streaming
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

    // ✅ FIX 2: Correct order within each round
    // Order: changelog → messages → analysis (so changelog shows BEFORE round, analysis shows AFTER round)
    sortedRounds.forEach((roundNumber) => {
      if (processedRounds.has(roundNumber)) {
        return;
      }
      processedRounds.add(roundNumber);

      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // ✅ CORRECT ORDER: Changelog first (shows what changed BEFORE this round)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }

      // ✅ CORRECT ORDER: Messages second (user prompt + participant responses)
      if (roundMessages && roundMessages.length > 0) {
        items.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
          roundNumber,
        });
      }

      // ✅ CORRECT ORDER: Analysis last (analyzes round AFTER completion)
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

    // Store for next comparison
    previousItemsRef.current = deduplicatedItems;

    return deduplicatedItems;
  }, [messages, analyses, changelog, isStreaming]);

  // ✅ ONE-WAY DATA FLOW: Feedback handler with client-side updates
  const feedbackHandlersRef = useRef(new Map<number, (feedbackType: 'like' | 'dislike' | null) => void>());

  const getFeedbackHandler = useCallback((roundNumber: number) => {
    if (!feedbackHandlersRef.current.has(roundNumber)) {
      feedbackHandlersRef.current.set(roundNumber, (feedbackType: 'like' | 'dislike' | null) => {
        // ✅ OPTIMISTIC UPDATE: Update client state immediately
        setClientFeedback((prev) => {
          const updated = new Map(prev);
          updated.set(roundNumber, feedbackType);
          return updated;
        });

        if (feedbackType) {
          setPendingFeedback({ roundNumber, type: feedbackType });
        }

        // ✅ FIRE-AND-FORGET: Persist to server, ignore response
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
  }, [setRoundFeedbackMutation, thread.id]);

  // Virtualization
  const listRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useWindowVirtualizer({
    count: messagesWithAnalysesAndChangelog.length,
    estimateSize: () => 200,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Auto-scroll logic
  const isNearBottomRef = useRef(true);
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, lastMessageContent, isStreaming, rowVirtualizer, lastMessageItemIndex, analyses]);

  return (
    <>
      <div className="flex flex-col min-h-screen relative">
        <div id="chat-scroll-container" ref={listRef} className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
          <div
            style={{
              minHeight: `${rowVirtualizer.getTotalSize()}px`,
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
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const item = messagesWithAnalysesAndChangelog[virtualItem.index];
                if (!item)
                  return null;

                const itemIndex = virtualItem.index;

                const roundNumber = item.type === 'messages'
                  ? ((item.data[0]?.metadata as Record<string, unknown> | undefined)?.roundNumber as number) ?? 1
                  : item.type === 'analysis'
                    ? item.data.roundNumber
                    : item.type === 'changelog'
                      ? item.data[0]?.roundNumber ?? 1
                      : 1;

                return (
                  <div
                    key={item.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                  >
                    {item.type === 'changelog' && item.data.length > 0 && (
                      <div className="mb-6">
                        <ConfigurationChangesGroup
                          group={{
                            timestamp: new Date(item.data[0]!.createdAt),
                            changes: item.data,
                          }}
                        />
                      </div>
                    )}

                    {item.type === 'messages' && (
                      <div className="space-y-3 pb-2">
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

              {isStreaming && selectedParticipants.length > 1 && (
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
                    isAnalyzing={false}
                  />
                </div>
              )}
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
              onRemoveParticipant={(participantId) => {
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

      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
