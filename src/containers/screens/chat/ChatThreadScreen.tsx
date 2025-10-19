'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { messageHasError, MessageMetadataSchema } from '@/api/routes/chat/schema';
import { Action, Actions } from '@/components/ai-elements/actions';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
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
import { Button } from '@/components/ui/button';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useSetRoundFeedbackMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadFeedbackQuery } from '@/hooks/queries/chat-feedback';
import { useThreadAnalysesQuery, useThreadChangelogQuery, useThreadQuery } from '@/hooks/queries/chat-threads';
import { useBoolean } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { queryKeys } from '@/lib/data/query-keys';
import type { ParticipantConfig } from '@/lib/types/participant-config';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

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
 * Component that injects scroll button into thread header when not at bottom
 * Must be rendered inside Conversation to access StickToBottomContext
 */
function ThreadHeaderScrollUpdater({
  thread,
  slug,
  onDeleteClick,
}: {
  thread: ChatThread;
  slug: string;
  onDeleteClick: () => void;
}) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const { setThreadActions, setThreadTitle } = useThreadHeader();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Update thread header with title and actions (including scroll button when not at bottom)
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <div className="flex items-center gap-2">
        {!isAtBottom && (
          <Button
            onClick={handleScrollToBottom}
            size="sm"
            variant="ghost"
            className="rounded-full"
            type="button"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        )}
        <ChatThreadActions
          thread={thread}
          slug={slug}
          onDeleteClick={onDeleteClick}
        />
      </div>,
    );
  }, [thread, slug, isAtBottom, onDeleteClick, setThreadTitle, setThreadActions, handleScrollToBottom]);

  return null; // This component only updates context
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
        console.warn('[ChatThreadScreen] ⚠️ Duplicate changelog entry detected and filtered', item.id);
        return false;
      }
      seen.add(item.id);
      return true;
    });

    return deduplicated;
  }, [changelogResponse]);

  const { data: analysesResponse } = useThreadAnalysesQuery(thread.id, true);
  const analyses = useMemo(
    () => {
      const items = analysesResponse?.success ? analysesResponse.data.items || [] : [];
      // Transform date strings to Date objects (API returns ISO strings, component expects Dates)
      // ✅ SHOW ALL ANALYSES: Include pending, streaming, completed (but not failed)
      // Pending/streaming will show loading state, completed will show full analysis
      return items
        .filter(item => item.status !== 'failed') // Only exclude failed
        .map(item => ({
          ...item,
          createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
          completedAt: item.completedAt ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt) : null,
        }));
    },
    [analysesResponse],
  );

  const isDeleteDialogOpen = useBoolean(false);

  // ✅ MUTATION: Update thread (including participants)
  const updateThreadMutation = useUpdateThreadMutation();

  // ✅ QUERY: Subscribe to thread data changes (for participant updates after mutation)
  // Mutation invalidates this query, React Query auto-refetches, useEffect syncs context
  const { data: threadQueryData } = useThreadQuery(thread.id);

  // ✅ ROUND FEEDBACK: Fetch all feedback for this thread
  const { data: feedbackData } = useThreadFeedbackQuery(thread.id);
  const feedbackByRound = useMemo<Map<number, 'like' | 'dislike' | null>>(() => {
    if (!feedbackData)
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

  // Chat state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(() => {
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
  });

  // ✅ TIMING FIX: Track pending message to send after participant update
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // ✅ CRITICAL FIX: Track expected participant IDs from mutation
  // This ensures we only send when the context has the RIGHT participants
  const [expectedParticipantIds, setExpectedParticipantIds] = useState<string[] | null>(null);

  // ✅ SIMPLIFIED: No participantsOverride state needed
  // Context manages the active participants

  // ✅ SIMPLIFIED: Participant changes handler
  // Changes are persisted via updateThreadMutation when user submits next message
  // This prevents unwanted API calls when user is just exploring options
  const handleParticipantsChange = useCallback((newParticipants: ParticipantConfig[]) => {
    setSelectedParticipants(newParticipants);
  }, []);

  // ✅ Initialize context when component mounts or thread changes
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

    // ✅ CRITICAL: Only depend on thread.id to prevent infinite loops
    // participants/initialMessages come from server props and shouldn't trigger re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // ✅ FIX: Separate useEffect for round completion to prevent re-registering callback
  // This ensures the callback is only set once and uses stable thread.id reference
  useEffect(() => {
    // Set up round completion callback for analysis triggers
    const currentThreadId = thread.id; // Capture thread.id in closure
    setOnRoundComplete(() => {
      // ✅ Immediately invalidate analyses when round completes
      // React Query will auto-refetch and the hook will get fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(currentThreadId) });
    });
  }, [thread.id, setOnRoundComplete, queryClient]);

  // ✅ CRITICAL FIX: Set up retry callback to immediately remove old analysis when round is retried
  // This ensures the old analysis disappears from UI BEFORE regeneration starts
  useEffect(() => {
    const currentThreadId = thread.id; // Capture thread.id in closure
    setOnRetry((roundNumber: number) => {
      console.warn('[ChatThreadScreen] ♻️ Retry triggered for round', {
        threadId: currentThreadId,
        roundNumber,
      });

      // ✅ CRITICAL: Immediately remove the old analysis from cache
      // Don't wait for refetch - remove it now so UI updates instantly
      queryClient.setQueryData(
        queryKeys.threads.analyses(currentThreadId),
        (oldData: typeof analysesResponse) => {
          if (!oldData?.success) {
            return oldData;
          }

          // Filter out the analysis for the round being regenerated
          const filteredItems = (oldData.data.items || []).filter(
            item => item.roundNumber !== roundNumber,
          );

          console.warn('[ChatThreadScreen] ♻️ Removed analysis from cache', {
            threadId: currentThreadId,
            roundNumber,
            oldCount: oldData.data.items?.length || 0,
            newCount: filteredItems.length,
          });

          return {
            ...oldData,
            data: {
              ...oldData.data,
              items: filteredItems,
            },
          };
        },
      );

      // ✅ CRITICAL FIX: DO NOT invalidate immediately
      // Reason: Invalidation triggers immediate refetch BEFORE backend deletes the old analysis
      // This causes a race condition where the old analysis gets fetched again
      // Instead: Let onRoundComplete refetch when the new round finishes
      // The cache removal above is sufficient to hide the old analysis immediately
    });
  }, [thread.id, setOnRetry, queryClient, analysesResponse]);

  // ✅ SYNC CONTEXT: Update context when thread query data changes (after mutation)
  // This is the proper React Query pattern - mutation invalidates, query refetches, effect syncs
  useEffect(() => {
    if (threadQueryData?.success && threadQueryData.data?.participants) {
      const freshParticipants = threadQueryData.data.participants;

      // Only update if participants actually changed (avoid unnecessary updates)
      const hasChanged = JSON.stringify(contextParticipants.map(p => p.id).sort())
        !== JSON.stringify(freshParticipants.map(p => p.id).sort());

      if (hasChanged) {
        console.warn('[ChatThreadScreen] 🔄 Syncing context with fresh participants from query', {
          threadId: thread.id,
          participantCount: freshParticipants.length,
        });

        // Transform date strings to Date objects (query returns ISO strings)
        const participantsWithDates = freshParticipants.map(p => ({
          ...p,
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }));

        updateParticipants(participantsWithDates);
      }
    }
  }, [threadQueryData, thread.id, contextParticipants, updateParticipants]);

  // ✅ CRITICAL FIX: Send pending message ONLY when context has the RIGHT participants
  // This prevents sending messages with stale participant data
  useEffect(() => {
    if (!pendingMessage || !expectedParticipantIds) {
      return;
    }

    // ✅ WAIT for context participants to match the expected IDs from mutation
    const currentIds = contextParticipants.map(p => p.id).sort().join(',');
    const expectedIds = expectedParticipantIds.sort().join(',');

    if (currentIds === expectedIds) {
      console.warn('[ChatThreadScreen] ✅ Context participants match expected - sending message', {
        threadId: thread.id,
        participantCount: contextParticipants.length,
        participantIds: contextParticipants.map(p => p.id),
        messagePreview: pendingMessage.substring(0, 50),
      });

      // Clear pending state first to prevent re-triggering
      setPendingMessage(null);
      setExpectedParticipantIds(null);

      // Now send the message - context has the RIGHT participants
      sendMessage(pendingMessage);
    } else {
      console.warn('[ChatThreadScreen] ⏳ Waiting for context to update with fresh participants', {
        threadId: thread.id,
        currentIds,
        expectedIds,
      });
    }
  }, [pendingMessage, expectedParticipantIds, contextParticipants, sendMessage, thread.id]);

  // ✅ AI SDK v5 PATTERN: Submit handler with participant persistence
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) {
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
        // No manual refetching needed - use the mutation response directly
        const result = await updateThreadMutation.mutateAsync({
          param: { id: thread.id },
          json: {
            participants: participantsForUpdate,
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

          console.warn('[ChatThreadScreen] ✅ Context updated with fresh participants from mutation', {
            threadId: thread.id,
            participantCount: participantsWithDates.length,
            participantIds: participantsWithDates.map(p => p.id),
          });

          // ✅ CRITICAL FIX: Set expected participant IDs AND pending message
          // The useEffect will only send when context participants match these IDs
          const freshIds = participantsWithDates.map(p => p.id);
          setExpectedParticipantIds(freshIds);
          setPendingMessage(trimmed);

          console.warn('[ChatThreadScreen] 📝 Set expected participant IDs', {
            threadId: thread.id,
            expectedIds: freshIds,
          });

          // ✅ CRITICAL FIX: Invalidate changelog query to fetch fresh changelog entries
          // This ensures the new changelog entry (created by the mutation) is fetched
          queryClient.invalidateQueries({ queryKey: queryKeys.threads.changelog(thread.id) });
        } else {
          // No participants in response - fallback to immediate send
          console.warn('[ChatThreadScreen] ⚠️ No participants in mutation response, sending immediately');
          await sendMessage(trimmed);
        }
      } catch (error) {
        console.error('[ChatThreadScreen] ❌ Failed to persist participant changes:', error);
        // On error, send message anyway (uses existing context participants)
        await sendMessage(trimmed);
      }

      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, selectedParticipants, updateThreadMutation, updateParticipants],
  );

  // ✅ Derive active participants from context
  // Context manages the participant state, we just display it
  const activeParticipants = contextParticipants;

  // ✅ EVENT-BASED ROUND TRACKING: Simple grouping by roundNumber
  // Messages, changelog, and analysis all grouped by roundNumber field
  // No complex date/time calculations - just group by roundNumber!
  //
  // Display order for each round:
  // 1. Changelog (if exists) - shows what changed BEFORE this round
  // 2. Messages - user message + participant responses
  // 3. Analysis (if exists) - analysis AFTER participant responses
  const messagesWithAnalysesAndChangelog = useMemo(() => {
    const items: Array<
      | { type: 'messages'; data: typeof messages; key: string }
      | { type: 'analysis'; data: (typeof analyses)[number]; key: string }
      | { type: 'changelog'; data: (typeof changelog)[number][]; key: string }
    > = [];

    // Group messages by roundNumber
    const messagesByRound = new Map<number, typeof messages>();
    messages.forEach((message) => {
      const metadata = message.metadata as Record<string, unknown> | undefined;
      const roundNumber = (metadata?.roundNumber as number) || 1;

      if (!messagesByRound.has(roundNumber)) {
        messagesByRound.set(roundNumber, []);
      }
      messagesByRound.get(roundNumber)!.push(message);
    });

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
        console.warn('[ChatThreadScreen] ⚠️ Duplicate changelog in round grouping', {
          changeId: change.id,
          roundNumber,
        });
      }
    });

    // ✅ FIX: Get all unique round numbers from BOTH messages AND changelog
    // This ensures changelog for upcoming rounds (where participant changes were made) displays
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
    ]);
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // 1. Add changelog BEFORE round messages (shows what changed for this round)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
        });
      }

      // 2. Add messages for this round (if they exist)
      if (roundMessages && roundMessages.length > 0) {
        items.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
        });
      }

      // 3. Add analysis AFTER round messages (shows round results)
      if (roundAnalysis) {
        items.push({
          type: 'analysis',
          data: roundAnalysis,
          key: `round-${roundNumber}-analysis`,
        });
      }
    });

    return items;
  }, [messages, analyses, changelog]);

  // ✅ Single stable feedback handler to prevent infinite re-renders
  // Using useCallback with proper dependencies
  const handleFeedbackChange = useCallback(
    (roundNumber: number, feedbackType: 'like' | 'dislike' | null) => {
      // ✅ Track which feedback type is being updated (for loading state)
      // If feedbackType is null, we're clearing feedback (no loading needed)
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
    },
    [setRoundFeedbackMutation, thread.id],
  );

  // ✅ Create stable bound handlers per round using useMemo
  // This ensures each round gets a stable callback reference
  const feedbackHandlersMap = useMemo(() => {
    const map = new Map<number, (feedbackType: 'like' | 'dislike' | null) => void>();

    messagesWithAnalysesAndChangelog.forEach((item) => {
      // Create handlers for all rounds (messages, analysis, changelog)
      let roundNumber: number;

      if (item.type === 'messages') {
        roundNumber = ((item.data[0]?.metadata as Record<string, unknown> | undefined)?.roundNumber as number) || 1;
      } else if (item.type === 'analysis') {
        roundNumber = item.data.roundNumber;
      } else if (item.type === 'changelog') {
        roundNumber = item.data[0]?.roundNumber || 1;
      } else {
        return;
      }

      // Create a bound handler for this specific round (avoid duplicates)
      if (!map.has(roundNumber)) {
        map.set(roundNumber, feedbackType => handleFeedbackChange(roundNumber, feedbackType));
      }
    });

    return map;
  }, [messagesWithAnalysesAndChangelog, handleFeedbackChange]);

  // ✅ DEBUG: Log when items update to track rendering and round numbers
  useEffect(() => {
    console.warn('[ChatThreadScreen] 🔄 Messages with analyses and changelog updated', {
      totalItems: messagesWithAnalysesAndChangelog.length,
      messagesGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'messages').length,
      analysesGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'analysis').length,
      changelogGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'changelog').length,
      items: messagesWithAnalysesAndChangelog.map((item) => {
        if (item.type === 'messages') {
          const firstMsg = item.data[0];
          const metadata = firstMsg?.metadata as Record<string, unknown> | undefined;
          return {
            type: item.type,
            key: item.key,
            roundNumber: metadata?.roundNumber,
            messageCount: item.data.length,
          };
        }
        if (item.type === 'changelog') {
          return {
            type: item.type,
            key: item.key,
            roundNumber: item.data[0]?.roundNumber,
            changeCount: item.data.length,
          };
        }
        // ✅ TYPE SAFETY: item.type is 'analysis' here (only remaining case)
        return {
          type: item.type,
          key: item.key,
          roundNumber: item.data.roundNumber,
          status: item.data.status,
        };
      }),
    });

    // ✅ DEBUG: Log analyses array to track round numbers
    console.warn('[ChatThreadScreen] 📊 Current analyses', {
      count: analyses.length,
      analyses: analyses.map(a => ({
        id: a.id,
        roundNumber: a.roundNumber,
        status: a.status,
        createdAt: a.createdAt,
      })),
    });

    // ✅ DEBUG: Log changelog array to track round numbers
    console.warn('[ChatThreadScreen] 📝 Current changelog', {
      count: changelog.length,
      changelog: changelog.map(c => ({
        id: c.id,
        roundNumber: c.roundNumber,
        changeType: c.changeType, // ✅ FIX: Use correct field name from schema
        createdAt: c.createdAt,
      })),
    });
  }, [messagesWithAnalysesAndChangelog, analyses, changelog]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Conversation wrapper - scrollable content area */}
      <Conversation className="flex-1 flex-col min-h-0">
        {/* Scroll button updater component */}
        <ThreadHeaderScrollUpdater
          thread={thread}
          slug={slug}
          onDeleteClick={isDeleteDialogOpen.onTrue}
        />

        {/* Scrollable content area */}
        <ConversationContent className="p-0">
          {/*
            Bottom padding for scroll clearance:
            - Uses inline style paddingBottom: '400px' (only reliable method)
            - Tailwind classes don't work due to:
              1. Arbitrary values [400px] not compiled by JIT engine
              2. Custom utilities in global.css not loading/applying
              3. Possible build process or CSS ordering issue
            - 400px ensures content can scroll past the ~150px fixed input box at bottom
            - Inline style is necessary to guarantee proper spacing
          */}
          <div className="mx-auto max-w-3xl px-4 pt-6 min-h-full" style={{ paddingBottom: '400px' }}>
            {/* ✅ Configuration changes are now shown inline between rounds */}

            {/* ✅ ROUND-BASED RENDERING: Changelog → Messages → Actions/Feedback → Analysis */}
            {messagesWithAnalysesAndChangelog.map((item, itemIndex) => {
              // Extract round number for this item
              const roundNumber = item.type === 'messages'
                ? ((item.data[0]?.metadata as Record<string, unknown> | undefined)?.roundNumber as number) || 1
                : item.type === 'analysis'
                  ? item.data.roundNumber
                  : item.type === 'changelog'
                    ? item.data[0]?.roundNumber || 1
                    : 1;

              if (item.type === 'changelog' && item.data.length > 0) {
                // ✅ Changelog before round - ALL changes for this round in ONE accordion
                return (
                  <ConfigurationChangesGroup
                    key={item.key}
                    className="mb-6"
                    group={{
                      timestamp: new Date(item.data[0]!.createdAt),
                      changes: item.data, // ✅ Pass ALL changes - component groups by action
                    }}
                  />
                );
              }

              if (item.type === 'messages') {
                // Messages for this round + Actions + Feedback (AI Elements pattern)
                return (
                  <div key={item.key} className="space-y-3">
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

                      return (
                        <Actions className="mt-3">
                          {/* ✅ Round Feedback: Like/Dislike buttons - only show if round succeeded */}
                          {!hasRoundError && feedbackHandlersMap.has(roundNumber) && (
                            <RoundFeedback
                              threadId={thread.id}
                              roundNumber={roundNumber}
                              currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                              onFeedbackChange={feedbackHandlersMap.get(roundNumber)!}
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

                          {/* ✅ Round Actions: Retry - always shown */}
                          <Action
                            onClick={retryRound}
                            label={t('errors.retry')}
                            tooltip={t('errors.retryRound')}
                          >
                            <RefreshCcwIcon className="size-3" />
                          </Action>
                        </Actions>
                      );
                    })()}
                  </div>
                );
              }

              if (item.type === 'analysis') {
                // Analysis after round (shows results)
                return (
                  <RoundAnalysisCard
                    key={item.key}
                    className="mt-6"
                    analysis={item.data}
                    threadId={thread.id}
                    isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                  />
                );
              }

              return null;
            })}

            {/* Streaming participants loader */}
            {isStreaming && selectedParticipants.length > 1 && (
              <StreamingParticipantsLoader
                className="mt-4"
                participants={selectedParticipants}
                currentParticipantIndex={currentParticipantIndex}
              />
            )}
          </div>
        </ConversationContent>
      </Conversation>

      {/* Sticky positioned input - stays at bottom within SidebarInset content area */}
      <div className="sticky bottom-0 z-20 pb-6 md:pb-8 w-full">
        <div className="mx-auto max-w-3xl px-4">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            status={isStreaming ? 'submitted' : 'ready'}
            onStop={stopStreaming}
            placeholder={t('input.placeholder')}
            className="backdrop-blur-xl bg-background/70 border border-border/30 shadow-lg"
            toolbar={(
              <>
                <ChatParticipantsList
                  participants={selectedParticipants}
                  onParticipantsChange={handleParticipantsChange}
                />
                <ChatModeSelector
                  selectedMode={selectedMode}
                  onModeChange={setSelectedMode}
                />
              </>
            )}
          />
        </div>
      </div>

      {/* Delete Dialog */}
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
      />
    </div>
  );
}
