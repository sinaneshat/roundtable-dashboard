'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { messageHasError, MessageMetadataSchema } from '@/api/routes/chat/schema';
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
        console.warn('[ChatThreadScreen] ⚠️ Duplicate changelog entry detected and filtered', item.id);
        return false;
      }
      seen.add(item.id);
      return true;
    });

    return deduplicated;
  }, [changelogResponse]);

  // ✅ REGENERATION STATE: Track which rounds are being regenerated
  // This ensures old analyses are immediately hidden from UI when retry is triggered
  // Must be declared before analyses memo to avoid "used before declaration" error
  // Thread-aware state: automatically resets when thread.id changes
  const [regeneratingRounds, setRegeneratingRounds] = useState<{
    threadId: string;
    rounds: Set<number>;
  }>(() => ({ threadId: thread.id, rounds: new Set() }));

  const { data: analysesResponse } = useThreadAnalysesQuery(thread.id, true);
  const analyses = useMemo(
    () => {
      // Get current rounds for this thread, or empty set if thread changed
      const currentRegeneratingRounds = regeneratingRounds.threadId === thread.id
        ? regeneratingRounds.rounds
        : new Set<number>();

      const items = analysesResponse?.success ? analysesResponse.data.items || [] : [];
      // Transform date strings to Date objects (API returns ISO strings, component expects Dates)
      // ✅ SHOW ALL ANALYSES: Include pending, streaming, completed (but not failed)
      // Pending/streaming will show loading state, completed will show full analysis

      // ✅ CRITICAL FIX: Deduplicate analyses by roundNumber to prevent duplicate analyses during regeneration
      // Keep only the MOST RECENT analysis for each round (by createdAt)
      // This handles race conditions where both old and new analyses might appear briefly
      const deduplicatedItems = items
        .filter(item => item.status !== 'failed') // Only exclude failed
        .filter(item => !currentRegeneratingRounds.has(item.roundNumber)) // ✅ FIX: Exclude rounds being regenerated
        .reduce((acc, item) => {
          const existing = acc.get(item.roundNumber);
          if (!existing || new Date(item.createdAt) > new Date(existing.createdAt)) {
            // Keep the newest analysis for this round
            acc.set(item.roundNumber, item);
          }
          return acc;
        }, new Map<number, typeof items[number]>());

      return Array.from(deduplicatedItems.values())
        .sort((a, b) => a.roundNumber - b.roundNumber) // Sort by round number
        .map(item => ({
          ...item,
          createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
          completedAt: item.completedAt ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt) : null,
        }));
    },
    [analysesResponse, regeneratingRounds, thread.id],
  );

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

  // Chat state
  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ PERSIST IMMEDIATELY: Mode changes are persisted to database right away
  const handleModeChange = useCallback(async (newMode: ChatModeId) => {
    // Update local state immediately for responsive UI
    setSelectedMode(newMode);

    // Persist to backend to ensure changes survive page refresh
    try {
      await updateThreadMutation.mutateAsync({
        param: { id: thread.id },
        json: {
          mode: newMode,
        },
      });

      console.warn('[ChatThreadScreen] ✅ Mode persisted', {
        threadId: thread.id,
        mode: newMode,
      });

      // Invalidate changelog query to fetch fresh changelog entries
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.changelog(thread.id) });
    } catch (error) {
      console.error('[ChatThreadScreen] ❌ Failed to persist mode change:', error);
      // Keep local state updated even if persistence fails
    }
  }, [thread.id, updateThreadMutation, queryClient]);
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

  // Track if we've already sent the pending message to avoid double-sending
  const hasSentPendingMessageRef = useRef(false);

  // ✅ SIMPLIFIED: No participantsOverride state needed
  // Context manages the active participants

  // ✅ PERSIST IMMEDIATELY: Participant changes are persisted to database right away
  // This ensures settings are preserved across page refreshes
  const handleParticipantsChange = useCallback(async (newParticipants: ParticipantConfig[]) => {
    // Update local state immediately for responsive UI
    setSelectedParticipants(newParticipants);

    // Persist to backend to ensure changes survive page refresh
    try {
      // Convert to API format
      const participantsForUpdate = newParticipants.map(p => ({
        id: p.id.startsWith('participant-') ? undefined : p.id, // Omit temp IDs for new participants
        modelId: p.modelId,
        role: p.role || null,
        customRoleId: p.customRoleId || null,
        priority: p.order,
        isEnabled: true,
      }));

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

        console.warn('[ChatThreadScreen] ✅ Participants persisted and context updated', {
          threadId: thread.id,
          participantCount: participantsWithDates.length,
        });

        // Invalidate changelog query to fetch fresh changelog entries
        queryClient.invalidateQueries({ queryKey: queryKeys.threads.changelog(thread.id) });
      }
    } catch (error) {
      console.error('[ChatThreadScreen] ❌ Failed to persist participant changes:', error);
      // Keep local state updated even if persistence fails
      // User will see their changes but they won't survive refresh
    }
  }, [thread.id, updateThreadMutation, updateParticipants, queryClient]);

  // ✅ Initialize context when component mounts or thread/messages change
  // ✅ REASONING FIX: Compute stable hash of messages to detect content changes (not just length)
  // This ensures reasoning fields and other message content updates trigger re-initialization
  const messagesHash = useMemo(() => {
    // Create a hash from message IDs + content + reasoning to detect any content changes
    // This is more efficient than JSON.stringify and catches reasoning field updates
    return initialMessages
      .map(m => `${m.id}:${m.content}:${m.reasoning || ''}`)
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

  // ✅ FIX: Separate useEffect for round completion to prevent re-registering callback
  // This ensures the callback is only set once and uses stable thread.id reference
  useEffect(() => {
    // Set up round completion callback for analysis triggers
    const currentThreadId = thread.id; // Capture thread.id in closure
    const currentThreadMode = thread.mode; // Capture mode in closure

    setOnRoundComplete(async () => {
      // ✅ CRITICAL: Wait for messages to be persisted to database
      // Messages are created during streaming but might not be committed immediately
      // This ensures POST /analyze can find the participant messages
      console.warn('[ChatThreadScreen] 🎯 Round completed - waiting for messages to persist', {
        threadId: currentThreadId,
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      console.warn('[ChatThreadScreen] ✅ Messages should be persisted - triggering analysis', {
        threadId: currentThreadId,
      });

      // ✅ ACTIVE SESSION OPTIMIZATION: Add pending analysis directly to cache
      // This skips unnecessary GET request and triggers streaming immediately
      // Only after page refresh should GET /analyses be used to fetch existing pending analyses

      // ✅ FIX: Use the round number from the ref that was set when the message was sent
      // This avoids closure issues with stale messages array
      // If ref is null (shouldn't happen), fall back to calculating from messages
      const userMessages = messages.filter(m => m.role === 'user');
      const roundNumber = currentRoundNumberRef.current ?? (userMessages.length || 1);

      // Get participant message IDs from the messages that were just created
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const participantCount = contextParticipants.length;
      const recentAssistantMessages = assistantMessages.slice(-participantCount);
      const participantMessageIds = recentAssistantMessages.map(m => m.id);

      // Get user question for this round (last user message)
      const lastUserMessage = userMessages[userMessages.length - 1];
      const userQuestion = lastUserMessage?.parts
        ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
        .map(p => p.text)
        .join('')
        .trim() || 'N/A';

      // Create pending analysis object to trigger streaming
      // ✅ UNIQUE ID: Include timestamp to ensure uniqueness for retries
      // When a round is retried, we need a different ID than the previous attempt
      const pendingAnalysis = {
        id: `pending-${currentThreadId}-${roundNumber}-${Date.now()}`, // Temporary ID with timestamp
        threadId: currentThreadId,
        roundNumber,
        mode: currentThreadMode,
        userQuestion,
        status: 'pending' as const,
        participantMessageIds,
        analysisData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      console.warn('[ChatThreadScreen] 🎯 Round complete - adding pending analysis to cache', {
        threadId: currentThreadId,
        roundNumber,
        participantMessageIds,
        pendingAnalysisId: pendingAnalysis.id,
        isRetry: regeneratingRounds.threadId === currentThreadId && regeneratingRounds.rounds.has(roundNumber),
      });

      // Add pending analysis directly to cache (no GET request)
      queryClient.setQueryData(
        queryKeys.threads.analyses(currentThreadId),
        (oldData: unknown) => {
          const typedData = oldData as typeof analysesResponse;

          if (!typedData?.success) {
            // If no existing data, create new response structure
            return {
              success: true,
              data: {
                items: [pendingAnalysis],
              },
            };
          }

          // Add pending analysis to existing items
          const updatedData = {
            ...typedData,
            data: {
              ...typedData.data,
              items: [...(typedData.data.items || []), pendingAnalysis],
            },
          };

          console.warn('[ChatThreadScreen] ✅ Pending analysis added to cache', {
            threadId: currentThreadId,
            roundNumber,
            pendingAnalysisId: pendingAnalysis.id,
            totalAnalyses: updatedData.data.items.length,
          });

          return updatedData;
        },
      );

      // ✅ CLEAR REGENERATING STATE: Round is complete, new analysis will be created
      // Clear all regenerating rounds since the participants have finished speaking
      setRegeneratingRounds({ threadId: currentThreadId, rounds: new Set() });

      // ✅ CLEAR STREAMING ROUND: Round completed, reset to allow new round
      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, thread.mode, setOnRoundComplete, queryClient, messages, contextParticipants, analysesResponse]);

  // ✅ CRITICAL FIX: Set up retry callback to immediately remove old analysis when round is retried
  // This ensures the old analysis disappears from UI BEFORE regeneration starts
  useEffect(() => {
    const currentThreadId = thread.id; // Capture thread.id in closure
    setOnRetry((roundNumber: number) => {
      console.warn('[ChatThreadScreen] ♻️ Retry triggered for round', {
        threadId: currentThreadId,
        roundNumber,
      });

      // ✅ IMMEDIATE UI UPDATE: Add round to regenerating state
      // This immediately hides the old analysis from UI, preventing any visual glitches
      setRegeneratingRounds((prev) => {
        // Only update if same thread, otherwise start fresh
        const currentRounds = prev.threadId === currentThreadId ? prev.rounds : new Set<number>();
        const newRounds = new Set(currentRounds);
        newRounds.add(roundNumber);
        return { threadId: currentThreadId, rounds: newRounds };
      });

      // ✅ CRITICAL: Immediately remove the old analysis from cache
      // Don't wait for refetch - remove it now so UI updates instantly
      queryClient.setQueryData(
        queryKeys.threads.analyses(currentThreadId),
        (oldData: unknown) => {
          // ✅ FIX: Use unknown type to avoid dependency on analysesResponse
          const typedData = oldData as typeof analysesResponse;

          if (!typedData?.success) {
            return typedData;
          }

          // Filter out the analysis for the round being regenerated
          const filteredItems = (typedData.data.items || []).filter(
            item => item.roundNumber !== roundNumber,
          );

          console.warn('[ChatThreadScreen] ♻️ Removed analysis from cache', {
            threadId: currentThreadId,
            roundNumber,
            oldCount: typedData.data.items?.length || 0,
            newCount: filteredItems.length,
          });

          return {
            ...typedData,
            data: {
              ...typedData.data,
              items: filteredItems,
            },
          };
        },
      );

      // ✅ CRITICAL FIX: DO NOT invalidate immediately
      // Reason: Invalidation triggers immediate refetch BEFORE backend deletes the old analysis
      // This causes a race condition where the old analysis gets fetched again
      // Instead: Let onRoundComplete refetch when the new round finishes
      // The cache removal above + deduplication logic ensures old analysis doesn't appear
    });
  }, [thread.id, setOnRetry, queryClient]); // ✅ REMOVED analysesResponse dependency to prevent stale callbacks

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
    if (!pendingMessage || !expectedParticipantIds || hasSentPendingMessageRef.current) {
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

      // Mark as sent to prevent re-triggering
      hasSentPendingMessageRef.current = true;

      // ✅ CALCULATE NEW ROUND NUMBER: Count existing user messages + 1
      const userMessages = messages.filter(m => m.role === 'user');
      const newRoundNumber = userMessages.length + 1;

      // ✅ SET STREAMING ROUND: Signal all previous accordions to close
      setStreamingRoundNumber(newRoundNumber);

      // ✅ UPDATE REF: Store round number for onRoundComplete callback
      currentRoundNumberRef.current = newRoundNumber;

      console.warn('[ChatThreadScreen] 🎬 Starting new round', {
        roundNumber: newRoundNumber,
        userMessageCount: userMessages.length,
      });

      // Now send the message - context has the RIGHT participants
      sendMessage(pendingMessage);
    } else {
      console.warn('[ChatThreadScreen] ⏳ Waiting for context to update with fresh participants', {
        threadId: thread.id,
        currentIds,
        expectedIds,
      });
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
          hasSentPendingMessageRef.current = false; // Reset flag for new message
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
    [inputValue, sendMessage, thread.id, selectedParticipants, updateThreadMutation, updateParticipants, queryClient],
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

    // ✅ FIX: Get all unique round numbers from messages, changelog, AND analyses
    // This ensures all rounds are displayed even if they only have analyses
    const allRoundNumbers = new Set([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...analyses.map(a => a.roundNumber),
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

  // ✅ VIRTUALIZATION: TanStack Virtual v3 - Use layout's scroll container
  // The layout provides #chat-scroll-container, we use that instead of creating a nested scroll container
  // Reference: https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic
  const parentRef = useRef<HTMLElement | null>(null);
  const scrollingRef = useRef<number | undefined>(undefined);

  // Get the layout's scroll container on mount
  useEffect(() => {
    parentRef.current = document.getElementById('chat-scroll-container');
  }, []);

  // ✅ SMOOTH SCROLL: Custom scrollToFn with easing animation for TanStack Virtual v3
  const easeInOutQuint = useCallback((t: number) => {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t;
  }, []);

  const scrollToFn = useCallback(
    (offset: number, _options: { adjustments?: number; behavior?: ScrollBehavior }) => {
      const duration = 500;
      const start = parentRef.current?.scrollTop || 0;
      const startTime = (scrollingRef.current = Date.now());

      const run = () => {
        if (scrollingRef.current !== startTime)
          return;

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = easeInOutQuint(Math.min(elapsed / duration, 1));
        const interpolated = start + (offset - start) * progress;

        if (elapsed < duration && parentRef.current) {
          parentRef.current.scrollTop = interpolated;
          requestAnimationFrame(run);
        } else if (parentRef.current) {
          parentRef.current.scrollTop = interpolated;
        }
      };

      requestAnimationFrame(run);
    },
    [easeInOutQuint],
  );

  const rowVirtualizer = useVirtualizer({
    count: messagesWithAnalysesAndChangelog.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimate for dynamic content
    overscan: 5,
    scrollToFn, // ✅ Smooth scrolling for better UX
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Debug: Log virtualization to verify it's working
  useEffect(() => {
    console.warn('[Virtualizer] 📊 Active:', {
      totalItems: messagesWithAnalysesAndChangelog.length,
      renderedItems: virtualItems.length,
      isVirtualizing: virtualItems.length < messagesWithAnalysesAndChangelog.length,
      totalHeight: rowVirtualizer.getTotalSize(),
    });
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
    if (!parentRef.current)
      return;

    const scrollContainer = parentRef.current;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // Consider "near bottom" if within 200px of bottom
      isNearBottomRef.current = distanceFromBottom < 200;
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // ✅ CRITICAL FIX: Track MESSAGE items separately to prevent auto-scroll on changelog/analysis insertions
  // This prevents the race condition where changelog insertion triggers scroll during streaming
  const messageItems = useMemo(() => {
    return messagesWithAnalysesAndChangelog.filter(item => item.type === 'messages');
  }, [messagesWithAnalysesAndChangelog]);

  // Track message count and content for auto-scroll dependency
  const messageCount = messageItems.length;
  const lastMessageItem = messageItems[messageItems.length - 1];
  const lastMessageContent = lastMessageItem
    ? lastMessageItem.data.map(m => m.parts?.map(p => p.type === 'text' ? p.text : '').join('')).join('')
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

  // ✅ NEW: Reference to fixed input container for height measurement
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  // ✅ CRITICAL FIX: Set scroll-padding-bottom on scroll container to account for fixed input
  // This ensures scrollToIndex properly accounts for the fixed input at the bottom
  useEffect(() => {
    const updateScrollPadding = () => {
      if (parentRef.current && inputContainerRef.current) {
        const inputHeight = inputContainerRef.current.offsetHeight;
        // ✅ FIX: Add BOTH the input container height AND the content padding (pb-8 = 32px)
        // This ensures content is fully visible when scrolled to bottom
        const contentBottomPadding = 32; // pb-8 from content container (8 * 4px = 32px)
        const totalPadding = inputHeight + contentBottomPadding;

        // Add scroll-padding-bottom to reserve space for fixed input + content padding
        // This works natively with scrollToIndex to ensure content is visible
        parentRef.current.style.scrollPaddingBottom = `${totalPadding}px`;
      }
    };

    // Set initial padding (wait for refs to be ready)
    const timer = setTimeout(updateScrollPadding, 0);

    // Update padding on window resize (input height might change)
    window.addEventListener('resize', updateScrollPadding);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateScrollPadding);
    };
  }, []);

  // ✅ INITIAL SCROLL: Scroll to bottom on page load/refresh
  // This ensures the page starts at the bottom with all content visible
  useEffect(() => {
    if (!parentRef.current || messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }

    // Wait for content to render and scroll padding to be set
    const timer = setTimeout(() => {
      if (parentRef.current && messagesWithAnalysesAndChangelog.length > 0) {
        // Scroll to the last item on initial load
        rowVirtualizer.scrollToIndex(messagesWithAnalysesAndChangelog.length - 1, {
          align: 'end',
          behavior: 'auto', // Instant scroll on initial load
        });
      }
    }, 100);

    return () => clearTimeout(timer);
    // Only run on initial mount (when thread.id changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  useEffect(() => {
    if (!parentRef.current || messagesWithAnalysesAndChangelog.length === 0) {
      return;
    }

    // ✅ CRITICAL FIX: Detect NEW analyses that we haven't scrolled to yet
    // Only auto-scroll to an analysis ONCE when it first appears
    // This prevents forcing users back when analysis updates
    const newAnalyses = analyses.filter(a => !scrolledToAnalysesRef.current.has(a.id));
    const hasNewAnalysis = newAnalyses.length > 0;

    // ✅ CRITICAL FIX: During streaming, scroll to last MESSAGE item, not last item overall
    // This prevents analyses/changelog from being dragged down during streaming
    // When NOT streaming, use normal behavior (scroll to actual bottom if user is near bottom)
    const targetIndex = isStreaming ? lastMessageItemIndex : messagesWithAnalysesAndChangelog.length - 1;

    // ✅ ENHANCED SCROLL LOGIC:
    // 1. Always scroll during message streaming (to show new messages)
    // 2. Scroll ONCE when a NEW analysis appears (not on updates) - BUT NOT DURING STREAMING
    // 3. Scroll when user is near bottom and content changes
    // ✅ FIX: Don't scroll for new analyses during streaming - this prevents the bug where
    // analyses from previous rounds get scrolled past when they load during current round streaming
    const shouldScrollForAnalysis = hasNewAnalysis && !isStreaming;
    const shouldScroll = isStreaming || shouldScrollForAnalysis || isNearBottomRef.current;

    if (shouldScroll) {
      // ✅ Mark new analyses as seen to prevent repeated scrolling
      if (hasNewAnalysis) {
        newAnalyses.forEach(a => scrolledToAnalysesRef.current.add(a.id));
        console.warn('[ChatThreadScreen] 📍 New analysis detected', {
          analysisIds: newAnalyses.map(a => a.id),
          roundNumbers: newAnalyses.map(a => a.roundNumber),
          isStreaming,
          willScroll: shouldScrollForAnalysis || isStreaming,
        });
      }

      // ✅ FIX: Use virtualizer scrollToIndex with scroll-padding-bottom handling the offset
      // The scroll-padding-bottom CSS property ensures content appears above the fixed input
      requestAnimationFrame(() => {
        rowVirtualizer.scrollToIndex(targetIndex, {
          align: 'end',
          behavior: 'smooth',
        });
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
      {/* ✅ FLEX LAYOUT: Wrapper to maximize spacing between content and input */}
      <div className="flex flex-col min-h-full justify-between h-full">
        {/* ✅ Use layout's scroll container - no nested scroll container needed */}
        {/* Content container with virtualization - flex-1 to take available space */}
        <div className="flex-1 container max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-8">
          {/* ✅ VIRTUALIZATION: Inner container with calculated total height */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {/* ✅ DYNAMIC PATTERN: Wrapper div translated by first item's start position
               Reference: TanStack Virtual dynamic example
               Items inside are NOT absolutely positioned - naturally laid out */}
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
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                  >
                    {item.type === 'changelog' && item.data.length > 0 && (
                    // ✅ Changelog before round - ALL changes for this round in ONE accordion
                      <ConfigurationChangesGroup
                        className="mb-6"
                        group={{
                          timestamp: new Date(item.data[0]!.createdAt),
                          changes: item.data, // ✅ Pass ALL changes - component groups by action
                        }}
                      />
                    )}

                    {item.type === 'messages' && (
                    // Messages for this round + Actions + Feedback (AI Elements pattern)
                      <div className="space-y-3">
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
                    )}

                    {item.type === 'analysis' && (
                    // Analysis after round (shows results)
                      <RoundAnalysisCard
                        className="mt-6"
                        analysis={item.data}
                        threadId={thread.id}
                        isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                        streamingRoundNumber={streamingRoundNumber}
                        onStreamComplete={(completedData) => {
                          // ✅ ACTIVE SESSION OPTIMIZATION: Update cache directly with completed analysis
                          // This skips unnecessary GET request after streaming completes
                          console.warn('[ChatThreadScreen] Analysis stream completed, updating cache directly');

                          queryClient.setQueryData(
                            queryKeys.threads.analyses(thread.id),
                            (oldData: unknown) => {
                              const typedData = oldData as typeof analysesResponse;

                              if (!typedData?.success) {
                                return typedData;
                              }

                              // Replace the pending analysis with completed analysis
                              const updatedItems = (typedData.data.items || []).map((analysis) => {
                                // Match by round number (pending analysis has temporary ID)
                                if (analysis.roundNumber === item.data.roundNumber) {
                                  return {
                                    ...analysis,
                                    status: 'completed' as const,
                                    analysisData: completedData,
                                    completedAt: new Date(),
                                  };
                                }
                                return analysis;
                              });

                              console.warn('[ChatThreadScreen] ✅ Updated analysis in cache', {
                                threadId: thread.id,
                                roundNumber: item.data.roundNumber,
                                itemCount: updatedItems.length,
                              });

                              return {
                                ...typedData,
                                data: {
                                  ...typedData.data,
                                  items: updatedItems,
                                },
                              };
                            },
                          );
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Streaming participants loader */}
          {isStreaming && selectedParticipants.length > 1 && (
            <StreamingParticipantsLoader
              className="mt-8"
              participants={selectedParticipants}
              currentParticipantIndex={currentParticipantIndex}
            />
          )}
        </div>

        {/* ✅ INPUT CONTAINER: mt-auto pushes to bottom, maximizing distance from content */}
        <div ref={inputContainerRef} className="mt-auto sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4">
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
              // Filter out the removed participant and reindex
                const filtered = selectedParticipants.filter(p => p.id !== participantId);
                // Prevent removing the last participant
                if (filtered.length === 0)
                  return;
                const reindexed = filtered.map((p, index) => ({ ...p, order: index }));
                handleParticipantsChange(reindexed);
              }}
              toolbar={(
                <>
                  <ChatParticipantsList
                    participants={selectedParticipants}
                    onParticipantsChange={handleParticipantsChange}
                  />
                  <ChatModeSelector
                    selectedMode={selectedMode}
                    onModeChange={handleModeChange}
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
