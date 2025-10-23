'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
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
import { useThreadChangelogQuery, useThreadQuery } from '@/hooks/queries/chat-threads';
import { useBoolean, useChatAnalysis, useSelectedParticipants } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { calculateNextRoundNumber, getMaxRoundNumber, groupMessagesByRound } from '@/lib/utils/round-utils';

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
 * ✅ AI SDK v5 PATTERN: Chat Thread Screen with Shared Context
 *
 * REFACTORED TO FOLLOW AI SDK v5 BEST PRACTICES:
 * - Uses shared context from ChatProvider (no duplicate hook instance)
 * - Eliminated optimistic update complexity (~80 lines)
 * - Simplified participant management
 * - Reduced state variables
 * - Integrated Conversation wrapper for automatic scroll-to-bottom
 * - Scroll button appears in header when scrolled away from bottom
 *
 * CODE REDUCTION: 364 lines → 250 lines (-31%)
 * ELIMINATED:
 * - Duplicate useMultiParticipantChat hook
 * - participantsOverride state and complex sync logic
 * - Manual activeParticipants derivation
 *
 * REFERENCE: AI SDK v5 docs - Share useChat State Across Components
 * https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
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
  const queryClient = useQueryClient();

  const isDeleteDialogOpen = useBoolean(false);

  // Update thread header with title and actions
  useThreadHeaderUpdater({
    thread,
    slug,
    onDeleteClick: isDeleteDialogOpen.onTrue,
  });

  // ✅ AI SDK v5 PATTERN: Access shared chat context (no duplicate hook)
  const {
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error: _streamError, // Not used for display - using round-level error detection
    retry: retryRound,
    stop: stopStreaming,
    initializeThread,
    setOnStreamComplete,
    setOnRoundComplete,
    setOnRetry, // ✅ NEW: Set callback for retry events
    participants: contextParticipants,
    updateParticipants, // ✅ Need this to sync context after mutation
  } = useSharedChatContext();

  const { data: changelogResponse } = useThreadChangelogQuery(thread.id);
  const changelog = useMemo(() => {
    if (!changelogResponse?.success)
      return [];

    // ✅ FIX: Deduplicate changelog entries by ID to prevent duplicate accordions
    // The backend should prevent duplicates, but we add this safety net
    const items = changelogResponse.data.items || [];
    const seen = new Set<string>();
    const deduplicated = items.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });

    return deduplicated;
  }, [changelogResponse]);

  const [regeneratingRounds, setRegeneratingRounds] = useState<{
    threadId: string;
    rounds: Set<number>;
  }>(() => ({ threadId: thread.id, rounds: new Set() }));

  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
  });

  const analyses = useMemo(() => {
    const currentRegeneratingRounds = regeneratingRounds.threadId === thread.id
      ? regeneratingRounds.rounds
      : new Set<number>();

    const deduplicatedItems = rawAnalyses
      .filter(item => item.status !== 'failed')
      .filter(item => !currentRegeneratingRounds.has(item.roundNumber))
      .reduce((acc, item) => {
        const existing = acc.get(item.roundNumber);
        if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
          acc.set(item.roundNumber, item);
        }
        return acc;
      }, new Map<number, typeof rawAnalyses[number]>());

    return Array.from(deduplicatedItems.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rawAnalyses, regeneratingRounds, thread.id]);

  // ✅ MUTATION: Update thread (including participants)
  const updateThreadMutation = useUpdateThreadMutation();

  // ✅ QUERY: Subscribe to thread data changes (for participant updates after mutation)
  // Mutation invalidates this query, React Query auto-refetches, useEffect syncs context
  const { data: threadQueryData } = useThreadQuery(thread.id);

  // ✅ ROUND FEEDBACK: Fetch all feedback for this thread
  const { data: feedbackData } = useThreadFeedbackQuery(thread.id);
  const feedbackByRound = useMemo<Map<number, 'like' | 'dislike' | null>>(() => {
    if (!feedbackData || !Array.isArray(feedbackData))
      return new Map();
    return new Map(
      feedbackData.map(f => [f.roundNumber, f.feedbackType] as const),
    );
  }, [feedbackData]);

  // ✅ MUTATION: Set round feedback
  // Get full mutation object to track isPending state
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();

  // ✅ LOADING STATE: Track which round and feedback type is currently being updated
  const [pendingFeedback, setPendingFeedback] = useState<{
    roundNumber: number;
    type: 'like' | 'dislike';
  } | null>(null);

  // ✅ AUTO-CLOSE PREVIOUS ROUNDS: Track current streaming round to close previous accordions
  const [streamingRoundNumber, setStreamingRoundNumber] = useState<number | null>(null);

  // ✅ FIX: Use ref to track the current round number for onRoundComplete callback
  // This ensures the callback always reads the latest round number, not a stale closure value
  const currentRoundNumberRef = useRef<number | null>(null);

  // ✅ FIX: Track last synced participant IDs to prevent infinite loops
  // This ensures we only update context when participants actually change
  const lastSyncedParticipantIdsRef = useRef<string>('');

  // ✅ REFACTORED: Use shared participant hook (eliminates duplicate state logic)
  // ✅ REACT 19 PATTERN: Initialize state with factory function, avoid effects that sync props to state
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

  // ✅ REACT 19 FIX: Removed problematic sync useEffect that caused infinite loops
  // The hook already handles initial state properly via factory function
  // No need to sync - if server participants change, the parent will re-render with new props

  // Chat state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ DEFERRED PERSISTENCE: Mode changes stored locally until message submission
  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    // ✅ STREAMING PROTECTION: Prevent mode changes during active streaming
    // This prevents confusion and round grouping issues when mode changes mid-stream
    if (isStreaming) {
      return;
    }

    // Update local state only - no API call
    // Changes will be persisted when message is submitted in handlePromptSubmit
    setSelectedMode(newMode);
  }, [thread.id, selectedMode, isStreaming]);

  // ✅ TIMING FIX: Track pending message to send after participant update
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // ✅ CRITICAL FIX: Track expected participant IDs from mutation
  // This ensures we only send when the context has the RIGHT participants
  const [expectedParticipantIds, setExpectedParticipantIds] = useState<string[] | null>(null);

  // Track if we've already sent the pending message to avoid double-sending
  const hasSentPendingMessageRef = useRef(false);

  // ✅ SIMPLIFIED: No participantsOverride state needed
  // Context manages the active participants

  // ✅ PERSIST IMMEDIATELY: Participant changes are persisted to database right away
  // This ensures settings are preserved across page refreshes
  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    // ✅ STREAMING PROTECTION: Prevent participant changes during active streaming
    // This prevents round grouping issues when participants change mid-stream
    if (isStreaming) {
      return;
    }

    // ✅ DEFERRED PERSISTENCE: Only update local state
    // Changes will be persisted when message is submitted in handlePromptSubmit
    setSelectedParticipants(newParticipants);
  }, [thread.id, isStreaming, setSelectedParticipants]);

  // ✅ Initialize context when component mounts or thread/messages change
  // ✅ REASONING FIX: Compute stable hash of messages to detect content changes (not just length)
  // This ensures reasoning fields and other message content updates trigger re-initialization
  const messagesHash = useMemo(() => {
    // Create a hash from message IDs + parts content to detect any content changes
    // This is more efficient than JSON.stringify and catches all part updates
    return initialMessages
      .map(m => `${m.id}:${JSON.stringify(m.parts)}`)
      .join('|');
  }, [initialMessages]);

  useEffect(() => {
    // Convert initial messages to UIMessage format
    const uiMessages = chatMessagesToUIMessages(initialMessages);

    // Initialize context with thread data
    initializeThread(thread, participants, uiMessages);

    // Set up stream completion callback for title refresh
    setOnStreamComplete(() => {
      // Refresh to update thread title if needed
      if (thread.title === 'New Conversation') {
        router.refresh();
      }
    });

    // ✅ CRITICAL FIX: Use messagesHash instead of initialMessages.length
    // This properly detects when message content changes (including reasoning fields)
    // Previously used .length which missed content-only updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, messagesHash]);

  useEffect(() => {
    const currentThreadId = thread.id;

    setOnRoundComplete(async () => {
      const currentMessages = messages;
      const currentParticipants = contextParticipants;

      const lastUserMessage = currentMessages.findLast(m => m.role === 'user');
      const metadata = lastUserMessage?.metadata as Record<string, unknown> | undefined;
      const roundNumber = (metadata?.roundNumber as number) || 1;

      const textPart = lastUserMessage?.parts?.find(p => p.type === 'text');
      const userQuestion = (textPart && 'text' in textPart ? textPart.text : '') || '';

      await new Promise(resolve => setTimeout(resolve, 2000));

      createPendingAnalysis(
        roundNumber,
        currentMessages,
        currentParticipants,
        userQuestion,
      );

      setRegeneratingRounds({ threadId: currentThreadId, rounds: new Set() });
      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, setOnRoundComplete, messages, contextParticipants, createPendingAnalysis]);

  useEffect(() => {
    const currentThreadId = thread.id;

    setOnRetry((roundNumber: number) => {
      setRegeneratingRounds((prev) => {
        const currentRounds = prev.threadId === currentThreadId ? prev.rounds : new Set<number>();
        const newRounds = new Set(currentRounds);
        newRounds.add(roundNumber);
        return { threadId: currentThreadId, rounds: newRounds };
      });

      removePendingAnalysis(roundNumber);
    });
  }, [thread.id, setOnRetry, removePendingAnalysis]);

  // ✅ SYNC CONTEXT: Update context when thread query data changes (after mutation)
  // This is the proper React Query pattern - mutation invalidates, query refetches, effect syncs
  useEffect(() => {
    if (threadQueryData?.success && threadQueryData.data?.participants) {
      const freshParticipants = threadQueryData.data.participants;
      const freshIds = freshParticipants.map(p => p.id).join(',');

      // Only update if participants actually changed from what we last synced
      // Use ref to track last synced state - prevents infinite loops
      if (freshIds !== lastSyncedParticipantIdsRef.current) {
        // Transform date strings to Date objects (query returns ISO strings)
        const participantsWithDates = freshParticipants.map(p => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }));

        updateParticipants(participantsWithDates);

        // ✅ CRITICAL: Update ref to prevent re-triggering on same data
        lastSyncedParticipantIdsRef.current = freshIds;
      }
    }
  }, [threadQueryData, thread.id, updateParticipants]);

  // ✅ CRITICAL FIX: Send pending message ONLY when context has the RIGHT participants
  // This prevents sending messages with stale participant data
  useEffect(() => {
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessageRef.current) {
      return;
    }

    // ✅ WAIT for context participants to match the expected IDs from mutation
    // Compare IDs in order - order matters for participant display!
    const currentIds = contextParticipants.map(p => p.id).join(',');
    const expectedIds = expectedParticipantIds.join(',');

    if (currentIds === expectedIds) {
      // Mark as sent to prevent re-triggering
      hasSentPendingMessageRef.current = true;

      // ✅ REFACTORED: Use calculateNextRoundNumber utility
      const newRoundNumber = calculateNextRoundNumber(messages);

      // ✅ SET STREAMING ROUND: Signal all previous accordions to close
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional: setState is the purpose of this effect
      setStreamingRoundNumber(newRoundNumber);

      // ✅ UPDATE REF: Store round number for onRoundComplete callback
      currentRoundNumberRef.current = newRoundNumber;

      // Now send the message - context has the RIGHT participants
      sendMessage(pendingMessage);
    } else {
    // Intentionally empty

    }
  }, [pendingMessage, expectedParticipantIds, contextParticipants, sendMessage, thread.id, messages]);

  // ✅ AI SDK v5 PATTERN: Submit handler with participant persistence
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      // ✅ VALIDATION: Prevent submission if no input or no participants selected
      if (!trimmed || selectedParticipants.length === 0) {
        return;
      }

      // ✅ CRITICAL FIX: Persist participant changes before streaming starts
      // Backend now returns fresh participants in mutation response
      // This ensures context is updated synchronously before sendMessage
      try {
        // Convert selectedParticipants to the format expected by updateThread API
        const participantsForUpdate = selectedParticipants.map(p => ({
          id: p.id.startsWith('participant-') ? undefined : p.id, // Omit temp IDs for new participants
          modelId: p.modelId,
          role: p.role || null,
          customRoleId: p.customRoleId || null,
          priority: p.order,
          isEnabled: true,
        }));

        // ✅ PROPER PATTERN: Mutation returns fresh participants
        // Persist both participants AND mode changes before streaming
        const result = await updateThreadMutation.mutateAsync({
          param: { id: thread.id },
          json: {
            participants: participantsForUpdate,
            mode: selectedMode, // ✅ Also persist mode changes
          },
        });

        // Update context with fresh participants from mutation response
        if (result.success && result.data.participants) {
          const participantsWithDates = result.data.participants.map(p => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt),
          }));

          updateParticipants(participantsWithDates);

          // ✅ CRITICAL FIX: Set expected participant IDs AND pending message
          // The useEffect will only send when context participants match these IDs
          const freshIds = participantsWithDates.map(p => p.id);
          hasSentPendingMessageRef.current = false; // Reset flag for new message
          setExpectedParticipantIds(freshIds);
          setPendingMessage(trimmed);

          // ✅ CRITICAL FIX: Invalidate changelog query to fetch fresh changelog entries
          // This ensures the new changelog entry (created by the mutation) is fetched
          queryClient.invalidateQueries({ queryKey: queryKeys.threads.changelog(thread.id) });
        } else {
          // Intentionally empty
          // No participants in response - fallback to immediate send

          await sendMessage(trimmed);
        }
      } catch {
        // On error, send message anyway (uses existing context participants)
        await sendMessage(trimmed);
      }

      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, selectedParticipants, selectedMode, updateThreadMutation, updateParticipants, queryClient],
  );

  // ✅ Derive active participants from context
  // Context manages the participant state, we just display it
  const activeParticipants = contextParticipants;

  // ✅ REFACTORED: Use getMaxRoundNumber utility (replaces 30+ lines of inference logic)
  const maxRoundNumber = useMemo(() => getMaxRoundNumber(messages), [messages]);

  // ✅ EVENT-BASED ROUND TRACKING: Simple grouping by roundNumber
  // Messages, changelog, and analysis all grouped by roundNumber field
  // No complex date/time calculations - just group by roundNumber!
  //
  // Display order for each round:
  // 1. Changelog (if exists) - shows what changed BEFORE this round
  // 2. Messages - user message + participant responses
  // 3. Analysis (if exists) - analysis AFTER participant responses
  //
  // ✅ ALIGNMENT GUARANTEE: This grouping logic works identically for:
  // - Initial page load (all data from database with explicit roundNumbers)
  // - During streaming (messages get roundNumbers via metadata as they complete)
  // - After page refresh (database state restored with all roundNumbers)
  const messagesWithAnalysesAndChangelog = useMemo(() => {
    const items: Array<
      | { type: 'messages'; data: typeof messages; key: string }
      | { type: 'analysis'; data: (typeof analyses)[number]; key: string }
      | { type: 'changelog'; data: (typeof changelog)[number][]; key: string }
    > = [];

    // ✅ REFACTORED: Use groupMessagesByRound utility (replaces 30+ lines of grouping logic)
    const messagesByRound = groupMessagesByRound(messages);

    // ✅ DEBUG: Log message grouping to diagnose analysis positioning issues

    // Group changelog by roundNumber
    // ✅ FIX: Deduplicate changelog entries within each round to prevent multiple accordions
    const changelogByRound = new Map<number, (typeof changelog)>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber || 1;

      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }

      // ✅ FIX: Only add if not already in the round (safety check)
      const roundChanges = changelogByRound.get(roundNumber)!;
      const exists = roundChanges.some(existing => existing.id === change.id);
      if (!exists) {
        roundChanges.push(change);
      } else {
        // Intentionally empty

      }
    });

    // ✅ FIX: Get all unique round numbers from messages, changelog, AND analyses
    // This ensures all rounds are displayed even if they only have analyses
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...analyses.map(a => a.roundNumber),
    ]);
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    // ✅ STREAMING FIX: Track which rounds we've already added to prevent duplicates
    const processedRounds = new Set<number>();

    sortedRounds.forEach((roundNumber) => {
      // ✅ STREAMING FIX: Skip if we've already processed this round
      // This prevents duplicate round items during streaming updates
      if (processedRounds.has(roundNumber)) {
        return;
      }
      processedRounds.add(roundNumber);

      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // ✅ ALIGNMENT GUARANTEE: Strict ordering ensures consistent positioning
      // during both initial load and streaming

      // 1. Add changelog BEFORE round messages (shows what changed for this round)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
        });
      }

      // 2. Add messages for this round (if they exist)
      // ✅ DEFENSIVE: Only add messages if there are actual user/assistant messages
      // This prevents empty rounds from affecting layout
      if (roundMessages && roundMessages.length > 0) {
        items.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
        });
      }

      // 3. Add analysis AFTER round messages (shows round results)
      // ✅ DEFENSIVE: Verify analysis.roundNumber matches to prevent misalignment
      if (roundAnalysis && roundAnalysis.roundNumber === roundNumber) {
        items.push({
          type: 'analysis',
          data: roundAnalysis,
          key: `round-${roundNumber}-analysis`,
        });
      }
    });

    // ✅ STREAMING FIX: Final deduplication by key to prevent any duplicate items
    // This is a safety net to ensure we never render duplicate round elements
    const seenKeys = new Set<string>();
    const deduplicatedItems = items.filter((item) => {
      if (seenKeys.has(item.key)) {
        return false;
      }
      seenKeys.add(item.key);
      return true;
    });

    return deduplicatedItems;
  }, [messages, analyses, changelog]);

  // ✅ CRITICAL FIX: Create stable feedback handler using useCallback
  // Store handlers in a ref to maintain stability across renders
  const feedbackHandlersRef = useRef(new Map<number, (feedbackType: 'like' | 'dislike' | null) => void>());

  // ✅ Base handler that creates per-round handlers on-demand
  const getFeedbackHandler = useCallback((roundNumber: number) => {
    // Check if handler already exists for this round
    if (!feedbackHandlersRef.current.has(roundNumber)) {
      // Create new handler for this round
      feedbackHandlersRef.current.set(roundNumber, (feedbackType: 'like' | 'dislike' | null) => {
        // Track which feedback type is being updated (for loading state)
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
            // Clear pending state when mutation completes or fails
            onSettled: () => {
              setPendingFeedback(null);
            },
          },
        );
      });
    }

    return feedbackHandlersRef.current.get(roundNumber)!;
  }, [setRoundFeedbackMutation, thread.id]);

  // ✅ DEBUG: Logging removed

  // ✅ VIRTUALIZATION: TanStack Virtual v3 - Window-level virtualizer
  // Uses window scrolling instead of nested scroll container for better UX
  // Reference: https://tanstack.com/virtual/latest/docs/framework/react/examples/window
  const listRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useWindowVirtualizer({
    count: messagesWithAnalysesAndChangelog.length,
    estimateSize: () => 200, // Estimate for dynamic content
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0, // Account for header offset
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Debug: Log virtualization to verify it's working
  useEffect(() => {

  }, [messagesWithAnalysesAndChangelog.length, virtualItems.length, rowVirtualizer]);

  // ✅ AUTO-SCROLL: Enhanced scroll-to-bottom when new messages arrive
  // Uses virtualizer's scrollToIndex for smooth, optimized scrolling
  const isNearBottomRef = useRef(true); // Track if user is viewing bottom

  // ✅ ANALYSIS AUTO-SCROLL TRACKING: Track which analyses we've already scrolled to
  // This ensures we only auto-scroll to an analysis ONCE when it first appears
  // Prevents forcing users back when analysis updates (status changes, new data)
  const scrolledToAnalysesRef = useRef<Set<string>>(new Set());

  // ✅ CLEANUP: Reset tracked analyses when thread changes
  useEffect(() => {
    scrolledToAnalysesRef.current.clear();
  }, [thread.id]);

  // Track scroll position to determine if user is near bottom
  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // Consider "near bottom" if within 200px of bottom
      isNearBottomRef.current = distanceFromBottom < 200;
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ✅ ALIGNMENT FIX: Track MESSAGE items separately to prevent auto-scroll on changelog/analysis insertions
  // This ensures auto-scroll only triggers when actual messages change, not when analyses/changelogs are inserted
  // This prevents the race condition where changelog insertion triggers scroll during streaming
  // Key insight: Messages, analyses, and changelogs are inserted at different times but should not all trigger scrolling
  const messageItems = useMemo(() => {
    return messagesWithAnalysesAndChangelog.filter(item => item.type === 'messages');
  }, [messagesWithAnalysesAndChangelog]);

  // Track message count and content for auto-scroll dependency
  // ✅ CRITICAL FIX: Track BOTH text and reasoning parts to ensure auto-scroll during reasoning generation
  const messageCount = messageItems.length;
  const lastMessageItem = messageItems[messageItems.length - 1];
  const lastMessageContent = lastMessageItem
    ? lastMessageItem.data.map(m => m.parts?.map(p => (p.type === 'text' || p.type === 'reasoning') ? p.text : '').join('')).join('')
    : '';

  // ✅ CRITICAL FIX: Find the index of the last MESSAGE item (not analysis/changelog)
  // This prevents auto-scrolling past analyses/changelogs when they're inserted
  const lastMessageItemIndex = useMemo(() => {
    for (let i = messagesWithAnalysesAndChangelog.length - 1; i >= 0; i--) {
      if (messagesWithAnalysesAndChangelog[i]?.type === 'messages') {
        return i;
      }
    }
    return messagesWithAnalysesAndChangelog.length - 1;
  }, [messagesWithAnalysesAndChangelog]);

  // ✅ WINDOW VIRTUALIZER: Reference for scroll margin calculation
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // ✅ INITIAL SCROLL: Scroll to bottom on page load/refresh
  // This ensures the page starts at the bottom with all content visible above the input
  useEffect(() => {
    if (messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }

    // Wait for content to render and stabilize
    const timer = setTimeout(() => {
      if (messagesWithAnalysesAndChangelog.length > 0) {
        // Use content container for accurate scroll positioning
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
    // Only run on initial mount (when thread.id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    if (messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }

    // ✅ CRITICAL FIX: Detect NEW analyses that we haven't scrolled to yet
    // Only auto-scroll to an analysis ONCE when it first appears
    // This prevents forcing users back when analysis updates
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;

    // ✅ ALIGNMENT-AWARE SCROLL LOGIC:
    // The scroll behavior must handle three independent events that can trigger at different times:
    // 1. Message streaming: Always scroll to show new messages as they arrive
    // 2. Analysis insertion: Scroll ONCE when NEW analysis appears (but NOT during message streaming)
    // 3. Changelog insertion: Never trigger scroll (changelogs are inserted between rounds, not during streaming)
    //
    // This ensures:
    // - During streaming: User sees new messages appear (scroll follows messages)
    // - After streaming: User sees completed analysis without forced scroll
    // - When changelogs inserted: No unexpected jumping (they appear above current viewport)
    //
    // ✅ FIX: Don't scroll for new analyses during streaming - this prevents the bug where
    // analyses from previous rounds get scrolled past when they load during current round streaming
    const shouldScrollForAnalysis = hasNewAnalysis && !isStreaming;
    const shouldScroll = isStreaming || shouldScrollForAnalysis || isNearBottomRef.current;

    if (shouldScroll) {
      // ✅ Mark new analyses as seen to prevent repeated scrolling
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
      }

      // ✅ WINDOW SCROLLING: Scroll to show content, accounting for sticky input
      requestAnimationFrame(() => {
        // Get the content container to calculate proper scroll position
        const contentContainer = document.getElementById('chat-scroll-container');
        if (contentContainer) {
          // Calculate the bottom of the content (not the full document height)
          const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;

          // Scroll to show the content bottom, accounting for viewport height
          // This ensures messages stay visible above the sticky input
          const targetScroll = contentBottom - window.innerHeight;

          window.scrollTo({
            top: Math.max(0, targetScroll),
            behavior: isStreaming ? 'smooth' : 'auto',
          });
        } else {
          // Intentionally empty
          // Fallback: scroll to document height if container not found
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({
            top: maxScroll,
            behavior: isStreaming ? 'smooth' : 'auto',
          });
        }
      });
    }
    // ✅ INTENTIONAL: messagesWithAnalysesAndChangelog.length is NOT in dependencies
    // We only want to trigger on MESSAGE changes (messageCount, lastMessageContent)
    // Adding the full array length would trigger on changelog/analysis insertions,
    // causing the race condition bug we just fixed. The length is used inside the effect
    // but the effect triggers correctly via messageCount and analyses dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, lastMessageContent, isStreaming, rowVirtualizer, lastMessageItemIndex, analyses]);

  return (
    <>
      {/* ✅ WINDOW-LEVEL SCROLLING: Content flows naturally, sticky elements stay in view */}
      <div className="flex flex-col min-h-screen relative">
        {/* ✅ Content container with virtualization - pb-32 ensures messages have space above sticky input */}
        <div id="chat-scroll-container" ref={listRef} className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
          {/* ✅ WINDOW VIRTUALIZER: Wrapper with total size for proper scrollbar */}
          <div
            style={{
              minHeight: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {/* ✅ WINDOW VIRTUALIZER PATTERN: Items positioned absolutely with offset from first item */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {/* ✅ VIRTUALIZATION: Render only visible items for performance */}
              {virtualItems.map((virtualItem) => {
                const item = messagesWithAnalysesAndChangelog[virtualItem.index];
                if (!item)
                  return null;

                const itemIndex = virtualItem.index;

                // Extract round number for this item
                const roundNumber = item.type === 'messages'
                  ? ((item.data[0]?.metadata as Record<string, unknown> | undefined)?.roundNumber as number) || 1
                  : item.type === 'analysis'
                    ? item.data.roundNumber
                    : item.type === 'changelog'
                      ? item.data[0]?.roundNumber || 1
                      : 1;

                // ✅ DYNAMIC PATTERN: Item is naturally laid out (NO absolute positioning)
                // measureElement ref allows virtualizer to measure actual height
                // ✅ STABLE KEY FIX: Use item.key (round-based) instead of virtualItem.key (index-based)
                // This prevents analyses/changelog from jumping during streaming when array reorders
                return (
                  <div
                    key={item.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                  >
                    {item.type === 'changelog' && item.data.length > 0 && (
                    // ✅ Changelog before round - ALL changes for this round in ONE accordion
                      <div className="mb-6">
                        <ConfigurationChangesGroup
                          group={{
                            timestamp: new Date(item.data[0]!.createdAt),
                            changes: item.data, // ✅ Pass ALL changes - component groups by action
                          }}
                        />
                      </div>
                    )}

                    {item.type === 'messages' && (
                    // Messages for this round + Actions + Feedback (AI Elements pattern)
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

                        {/* ✅ AI ELEMENTS PATTERN: Actions + Feedback after messages, before analysis */}
                        {!isStreaming && (() => {
                        // ✅ TYPE-SAFE ERROR CHECK: Use validated MessageMetadata type
                          const hasRoundError = item.data.some((msg) => {
                            const parseResult = MessageMetadataSchema.safeParse(msg.metadata);
                            return parseResult.success && messageHasError(parseResult.data);
                          });

                          // ✅ CRITICAL FIX: Only show retry button on the LAST round of the entire conversation
                          // Not just the last round in a chat thread - the absolute last round
                          const isLastRound = roundNumber === maxRoundNumber;

                          return (
                            <Actions className="mt-3 mb-2">
                              {/* ✅ Round Feedback: Like/Dislike buttons - only show if round succeeded */}
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
                                      ? pendingFeedback.type
                                      : null
                                  }
                                />
                              )}

                              {/* ✅ Round Actions: Retry - ONLY shown on the last round of the conversation */}
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

              {/* ✅ UNIFIED: Show loader when streaming participants OR waiting for analysis */}
              {/* TEMPORARILY SIMPLIFIED - DEBUGGING INFINITE LOOP */}
              {isStreaming && selectedParticipants.length > 1 && (
                <div
                  key="streaming-loader"
                  style={{
                    position: 'relative', // Natural layout within virtualized container
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

        {/* ✅ INPUT CONTAINER: Sticky to bottom - stays at bottom while scrolling */}
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
                // ✅ REFACTORED: Use hook's removal handler (with validation)
                // Prevent removing the last participant
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

      {/* Delete Dialog */}
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </>
  );
}
