'use client';
import { RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
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
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
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
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional initial data load
      setClientChangelog(deduplicated);
    }
  }, [changelogResponse, hasInitiallyLoaded]);
  const changelog = clientChangelog;
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !hasInitiallyLoaded);
  // Use lazy initialization to avoid creating Map on every render
  const [clientFeedback, setClientFeedback] = useState<Map<number, 'like' | 'dislike' | null>>(() => new Map());
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);
  useEffect(() => {
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData && Array.isArray(feedbackData)) {
      const initialFeedback = new Map(
        feedbackData.map(f => [f.roundNumber, f.feedbackType] as const),
      );
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional initial data load
      setClientFeedback(initialFeedback);
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional flag to prevent re-loading
      setHasLoadedFeedback(true);
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback]);
  const feedbackByRound = clientFeedback;
  // Track when regeneration is in progress to prevent query refetching
  const [isRegenerating, setIsRegenerating] = useState(false);

  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    updateAnalysisStatus,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
    // AI SDK v5 Pattern: Simple boolean logic for query enabling
    // Disable during streaming OR regeneration to prevent refetching
    // Enable only when idle and after initial load
    enabled: hasInitiallyLoaded && !isStreaming && !isRegenerating,
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
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional flag to track initial load
      setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackSuccess, hasInitiallyLoaded]);
  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  const messagesRef = useRef(messages);
  const contextParticipantsRef = useRef(contextParticipants);
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());
  const analysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Track if user has made pending configuration changes (not yet submitted)
  const [hasPendingConfigChanges, setHasPendingConfigChanges] = useState(false);

  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    if (isStreaming)
      return;
    setSelectedMode(newMode);
    setHasPendingConfigChanges(true); // Mark as having pending changes
  }, [isStreaming]);

  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [expectedParticipantIds, setExpectedParticipantIds] = useState<string[] | null>(null);
  const hasSentPendingMessageRef = useRef(false);

  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    if (isStreaming)
      return;
    setSelectedParticipants(newParticipants);
    setHasPendingConfigChanges(true); // Mark as having pending changes
  }, [isStreaming, setSelectedParticipants]);

  // Keep a ref of the last synced context participants to prevent infinite loops
  const lastSyncedContextRef = useRef<string>('');

  // Sync local participants with context ONLY when there are no pending user changes
  // This allows users to modify participants and have changes staged until next message submission
  useEffect(() => {
    // Don't sync if:
    // 1. User is actively streaming
    // 2. User has pending configuration changes (staged for next message)
    if (isStreaming || hasPendingConfigChanges) {
      return;
    }

    // Don't sync if participants have temporary IDs (mid-creation)
    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      return;
    }

    // Create a stable key for context participants
    const contextKey = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => `${p.id}:${p.modelId}:${p.priority}`)
      .join('|');

    // Only sync if context participants actually changed
    if (contextKey === lastSyncedContextRef.current) {
      return;
    }

    // Transform context participants into local format
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

    // Update state and ref together
    lastSyncedContextRef.current = contextKey;
    setSelectedParticipants(syncedParticipants);
  }, [contextParticipants, isStreaming, hasPendingConfigChanges, setSelectedParticipants]);
  // AI SDK v5 Pattern: Initialize thread on mount and when thread ID changes
  // Following crash course Exercise 01.07, 04.02, 04.03:
  // - Server provides initialMessages via props
  // - Call initializeThread once when thread.id changes
  // - useChat handles state management from there
  useEffect(() => {
    // Reset UI state for new thread
    scrolledToAnalysesRef.current.clear();
    currentRoundNumberRef.current = null;
    regenerateRoundNumberRef.current = null;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional state reset on thread change
    setHasPendingConfigChanges(false);
    lastSyncedContextRef.current = '';

    // Set completion callback
    setOnComplete(() => () => {
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
      const currentMessages = messagesRef.current;
      const roundNumber = getCurrentRoundNumber(currentMessages);
      const isRegeneration = regenerateRoundNumberRef.current !== null;

      // AI SDK v5 Pattern: Create analysis after all participants complete
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

        // Clear regeneration flags and enable query after analysis is created
        if (regenerateRoundNumberRef.current === roundNumber) {
          regenerateRoundNumberRef.current = null;
          setIsRegenerating(false);
        }
        setStreamingRoundNumber(null);
        currentRoundNumberRef.current = null;
      };

      if (isRegeneration) {
        // Delay analysis creation slightly for regeneration to allow UI to settle
        analysisTimeoutRef.current = setTimeout(createAnalysis, 100);
      } else {
        // Create analysis immediately for normal rounds
        createAnalysis();
      }
    });

    // AI SDK v5 Pattern: Initialize thread with server-provided data
    // initializeThread checks if this is a new thread and handles accordingly
    const uiMessages = chatMessagesToUIMessages(initialMessages);
    initializeThread(thread, participants, uiMessages);

    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional flag on thread load
    setHasInitiallyLoaded(true);

    return () => {
      // Clear any pending analysis timeout on cleanup
      if (analysisTimeoutRef.current) {
        clearTimeout(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      setOnComplete(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);
  useEffect(() => {
    setOnRetry(() => (roundNumber: number) => {
      // AI SDK v5 Pattern: Immediate state cleanup before streaming starts

      // STEP 1: Set regenerate flag to preserve round numbering
      regenerateRoundNumberRef.current = roundNumber;

      // STEP 2: Mark as regenerating to prevent query refetching
      setIsRegenerating(true);

      // STEP 3: Remove analysis IMMEDIATELY from cache
      removePendingAnalysis(roundNumber);

      // STEP 4: Clean up changelog and feedback for this round
      setClientChangelog(prev => prev.filter(item => item.roundNumber !== roundNumber));
      setClientFeedback((prev) => {
        const updated = new Map(prev);
        updated.delete(roundNumber);
        return updated;
      });

      // STEP 5: Reset streaming round number to trigger fresh UI state
      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, setOnRetry, removePendingAnalysis]);
  useEffect(() => {
    const wasStreaming = isStreaming;
    if (wasStreaming && !isStreaming) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional state sync when streaming completes
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
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional state update when participants are ready
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
        // Reset pending changes flag - changes are now committed
        setHasPendingConfigChanges(false);
      } catch {
        await sendMessage(trimmed);
        // Reset pending changes flag even on error path
        setHasPendingConfigChanges(false);
      }
      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, selectedParticipants, selectedMode, updateThreadMutation, updateParticipants, contextParticipants],
  );
  const activeParticipants = contextParticipants;
  const maxRoundNumber = useMemo(() => getMaxRoundNumber(messages), [messages]);

  const messagesWithAnalysesAndChangelog = useMemo(() => {
    type ItemType
      = | { type: 'messages'; data: typeof messages; key: string; roundNumber: number }
        | { type: 'analysis'; data: (typeof analyses)[number]; key: string; roundNumber: number }
        | { type: 'changelog'; data: (typeof changelog)[number][]; key: string; roundNumber: number };

    // AI SDK v5 Pattern: Simple, straightforward grouping without optimization
    // Trust the messages array and let React handle efficient diffing
    const messagesByRound = groupMessagesByRound(messages);
    const items: ItemType[] = [];

    // Group changelog items by round
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

    // Get all unique round numbers from messages, changelog, and analyses
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...analyses.map(a => a.roundNumber),
    ]);

    // Process rounds in order
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // Skip rounds without messages
      if (!roundMessages || roundMessages.length === 0) {
        return;
      }

      // Add changelog first (shows before messages in the round)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }

      // Add messages for this round
      items.push({
        type: 'messages',
        data: roundMessages,
        key: `round-${roundNumber}-messages`,
        roundNumber,
      });

      // Add analysis after messages (if exists)
      if (roundAnalysis) {
        items.push({
          type: 'analysis',
          data: roundAnalysis,
          key: `round-${roundNumber}-analysis`,
          roundNumber,
        });
      }
    });

    return items;
  }, [messages, analyses, changelog]);

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
  const listRef = useRef<HTMLDivElement | null>(null);
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
    // Delay scroll to ensure DOM is fully rendered with messages
    const timer = setTimeout(() => {
      const contentContainer = document.getElementById('chat-scroll-container');
      if (contentContainer) {
        const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;
        const targetScroll = contentBottom - window.innerHeight;
        // Ensure we scroll to show content, but use smooth behavior for better UX
        window.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth',
        });
      }
    }, 150); // Increased delay to ensure messages are fully rendered
    return () => clearTimeout(timer);
  }, [thread.id, messagesWithAnalysesAndChangelog.length]);
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
  }, [messageCount, lastMessageContent, isStreaming, lastMessageItemIndex, analyses, messagesWithAnalysesAndChangelog.length]);

  return (
    <>
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col min-h-screen relative">
          <div id="chat-scroll-container" ref={listRef} className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
            {messagesWithAnalysesAndChangelog.map((item, itemIndex) => {
              if (!item)
                return null;
              const roundNumber = item.type === 'messages'
                ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
                : item.type === 'analysis'
                  ? item.data.roundNumber
                  : item.type === 'changelog'
                    ? item.data[0]?.roundNumber ?? 1
                    : 1;
              return (
                <div
                  key={item.key}
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

                        // Check if analysis is currently in progress for this round
                        const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);
                        const isAnalysisInProgress = roundAnalysis?.status === 'pending' || roundAnalysis?.status === 'streaming';

                        // Only show retry button if:
                        // 1. It's the last round
                        // 2. Analysis is NOT in progress (completed, failed, or doesn't exist)
                        // User shouldn't see retry during analysis streaming
                        const showRetryButton = isLastRound && !isAnalysisInProgress;

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
                            {showRetryButton && (
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
                      setHasPendingConfigChanges(true); // Mark as having pending changes
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
