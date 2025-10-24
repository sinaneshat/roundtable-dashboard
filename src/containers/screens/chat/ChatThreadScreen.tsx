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
import { useSharedChatContext } from '@/contexts/chat-context';
import { useSetRoundFeedbackMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadChangelogQuery, useThreadFeedbackQuery } from '@/hooks/queries/chat';
import { useBoolean, useChatAnalysis, useSelectedParticipants } from '@/hooks/utils';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { deduplicateParticipants } from '@/lib/utils/participant-utils';
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
    setOnComplete,
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
  const { data: feedbackData, isSuccess: feedbackSuccess } = useThreadFeedbackQuery(thread.id, !hasInitiallyLoaded);
  const [clientFeedback, setClientFeedback] = useState<Map<number, 'like' | 'dislike' | null>>(new Map());
  const [hasLoadedFeedback, setHasLoadedFeedback] = useState(false);

  // ✅ SIDE EFFECT: Set client state on initial load with proper success check
  useEffect(() => {
    if (!hasLoadedFeedback && feedbackSuccess && feedbackData && Array.isArray(feedbackData)) {
      const initialFeedback = new Map(
        feedbackData.map(f => [f.roundNumber, f.feedbackType] as const),
      );
      setClientFeedback(initialFeedback);
      setHasLoadedFeedback(true); // Mark as loaded immediately after setting state
    }
  }, [feedbackData, feedbackSuccess, hasLoadedFeedback]);

  const feedbackByRound = clientFeedback;

  // ✅ ONE-WAY DATA FLOW: Analyses loaded ONCE on initial page load
  // Query disabled after initial load - client state managed via cache manipulation
  const {
    analyses: rawAnalyses,
    createPendingAnalysis,
    updateAnalysisData,
    updateAnalysisStatus,
    removePendingAnalysis,
  } = useChatAnalysis({
    threadId: thread.id,
    mode: thread.mode as ChatModeId,
    // ✅ Keep enabled during streaming to maintain analyses state properly
    // Disable only when not streaming AND initial load is complete
    enabled: isStreaming || !hasInitiallyLoaded,
  });

  const analyses = useMemo(() => {
    // ✅ STEP 1: Deduplicate by ID first (handles duplicate cache entries)
    const seenIds = new Set<string>();
    const uniqueById = rawAnalyses.filter((item) => {
      if (seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });

    // ✅ STEP 2: Filter out failed analyses
    const validAnalyses = uniqueById.filter(item => item.status !== 'failed');

    // ✅ STEP 3: Deduplicate by round number with proper status priority
    // Priority: completed > streaming > pending
    // Within same status: keep newer (by createdAt timestamp)
    const deduplicatedByRound = validAnalyses.reduce((acc, item) => {
      const existing = acc.get(item.roundNumber);

      // No existing analysis for this round - add it
      if (!existing) {
        acc.set(item.roundNumber, item);
        return acc;
      }

      // Define status priority (higher number = higher priority)
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

      // Keep item with higher status priority
      if (itemPriority > existingPriority) {
        acc.set(item.roundNumber, item);
        return acc;
      }

      // If same status priority, keep newer one (by timestamp)
      if (itemPriority === existingPriority) {
        const itemTime = item.createdAt instanceof Date ? item.createdAt.getTime() : new Date(item.createdAt).getTime();
        const existingTime = existing.createdAt instanceof Date ? existing.createdAt.getTime() : new Date(existing.createdAt).getTime();

        if (itemTime > existingTime) {
          acc.set(item.roundNumber, item);
        }
      }

      // Otherwise keep existing (it has higher priority or is newer)
      return acc;
    }, new Map<number, typeof rawAnalyses[number]>());

    // ✅ STEP 4: Sort by round number (ascending)
    return Array.from(deduplicatedByRound.values()).sort((a, b) => a.roundNumber - b.roundNumber);
  }, [rawAnalyses]);

  // ✅ FIRE-AND-FORGET MUTATIONS: Persist to server but don't update from response
  const updateThreadMutation = useUpdateThreadMutation();
  const setRoundFeedbackMutation = useSetRoundFeedbackMutation();

  // ✅ Mark as loaded after initial data is fetched with proper success checks
  useEffect(() => {
    if (!hasInitiallyLoaded && changelogResponse && feedbackSuccess) {
      setHasInitiallyLoaded(true);
    }
  }, [changelogResponse, feedbackSuccess, hasInitiallyLoaded]);

  // ✅ FIX: Refs to avoid stale closures in callbacks - declared early to be available for all effects
  const createPendingAnalysisRef = useRef(createPendingAnalysis);
  const messagesRef = useRef(messages);
  const contextParticipantsRef = useRef(contextParticipants);

  // Keep refs updated with latest values
  useEffect(() => {
    createPendingAnalysisRef.current = createPendingAnalysis;
  }, [createPendingAnalysis]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    contextParticipantsRef.current = contextParticipants;
  }, [contextParticipants]);

  // Loading and feedback state
  const [pendingFeedback, setPendingFeedback] = useState<{
    roundNumber: number;
    type: 'like' | 'dislike';
  } | null>(null);

  const [streamingRoundNumber, setStreamingRoundNumber] = useState<number | null>(null);
  const currentRoundNumberRef = useRef<number | null>(null);
  const regenerateRoundNumberRef = useRef<number | null>(null);

  // ✅ SINGLE SOURCE OF TRUTH: Participant state comes from ChatContext ONLY during thread
  // Participants are initialized in context via initializeThread()
  // All reads and writes go through context - no local state drift
  // Local hook is ONLY used for temporary UI state (adding/removing before submit)
  const initialParticipants = useMemo<ParticipantConfig[]>(() => {
    // Context already handles deduplication in initializeThread and updateParticipants
    // We just need to format the data for UI components
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
  }, [contextParticipants]); // ✅ Derive from context, not server props

  // ✅ Use local hook ONLY for temporary UI state (before persisting to context)
  // This provides add/remove/reorder handlers for UI interactions
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

  /**
   * ✅ ONE-WAY SYNC: Context → Local State (NOT bidirectional)
   *
   * WHY THIS SYNC IS NEEDED:
   * - useSelectedParticipants only initializes once on mount (factory function pattern)
   * - When server returns real database IDs for new participants, contextParticipants updates
   * - Without this sync, local state has temporary IDs while context has real IDs
   * - This causes state drift where UI shows different participants than context expects
   *
   * HOW THIS AVOIDS RACE CONDITIONS:
   * 1. ONE-WAY only: context → local (never write back to context from here)
   * 2. Compare by modelId (stable): Not by ID (which changes from temp → real)
   * 3. Only sync when IDs are real: Skip if context has temporary IDs (participant-*)
   * 4. Skip during streaming: Prevents mid-stream configuration changes
   * 5. Deduplicate by modelId: Ensures each model appears only once
   *
   * WHEN THIS RUNS:
   * - After server updates context with real participant IDs (line 543-548)
   * - When context participant configuration changes between rounds
   * - NOT during initial mount (handled by factory function)
   * - NOT during streaming (stability requirement)
   */
  useEffect(() => {
    // Skip during streaming for stability
    if (isStreaming) {
      return;
    }

    // ✅ Check if context has real database IDs (not temporary IDs)
    const hasTemporaryIds = contextParticipants.some(p => p.id.startsWith('participant-'));
    if (hasTemporaryIds) {
      // Don't sync temporary IDs - wait for real IDs from server
      return;
    }

    // ✅ Compare by modelId to detect actual participant changes (not just ID changes)
    // Get modelIds from both context and local state
    const contextModelIds = contextParticipants
      .filter(p => p.isEnabled)
      .sort((a, b) => a.priority - b.priority)
      .map(p => p.modelId)
      .join(',');

    const localModelIds = selectedParticipants
      .map(p => p.modelId)
      .join(',');

    // Only sync if participants actually changed (by modelId, not ID)
    if (contextModelIds === localModelIds) {
      return; // No changes - skip sync
    }

    // ✅ Sync: Update local state to match context (one-way flow)
    console.log('[ChatThreadScreen] Syncing local state with context participants', {
      contextCount: contextParticipants.length,
      localCount: selectedParticipants.length,
      contextModelIds,
      localModelIds,
    });

    // Derive fresh participant configs from context (same logic as initialParticipants)
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

  // Initialize context when component mounts - only once per thread
  useEffect(() => {
    const uiMessages = chatMessagesToUIMessages(initialMessages);

    // ✅ CRITICAL FIX: Deduplicate participants before initializing thread
    // Server may return duplicate participants after configuration changes
    // Use canonical deduplication function for consistency
    const deduplicatedParticipants = deduplicateParticipants(participants);

    // Add debug logging if duplicates were removed
    if (participants.length !== deduplicatedParticipants.length) {
      console.warn('[ChatThreadScreen] Server returned duplicate participants:', {
        original: participants.length,
        deduplicated: deduplicatedParticipants.length,
        removed: participants.length - deduplicatedParticipants.length,
      });
    }

    initializeThread(thread, deduplicatedParticipants, uiMessages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]); // Only depend on thread.id, not messagesHash

  // ✅ MERGED CALLBACK: Combine stream completion and round completion logic
  // This single callback handles both:
  // 1. Title refresh for new conversations (stream completion)
  // 2. Analysis creation for completed rounds (round completion)
  // ✅ CRITICAL FIX: Remove createPendingAnalysis from dependencies to prevent stale closures
  // The ref (createPendingAnalysisRef) is updated separately in its own effect (line 269-271)
  useEffect(() => {
    setOnComplete(async () => {
      // ✅ STREAM COMPLETION LOGIC: Refresh title if needed
      if (thread.title === 'New Conversation') {
        router.refresh();
      }

      // ✅ ROUND COMPLETION LOGIC: Create analysis for completed round
      // ✅ Use refs to get current values instead of stale closure variables
      const currentMessages = messagesRef.current;
      const currentParticipants = contextParticipantsRef.current;

      const roundNumber = getCurrentRoundNumber(currentMessages);

      // 🔍 DEBUG: Log onRoundComplete trigger details
      console.group('[ChatThreadScreen] onRoundComplete called');
      console.log('Round Number:', roundNumber);
      console.log('Total Messages:', currentMessages.length);
      console.log('Participants:', currentParticipants.length);
      console.log('Is Regeneration:', regenerateRoundNumberRef.current !== null);

      // Log messages with their round numbers
      console.log('Messages by round:');
      currentMessages.forEach((m, index) => {
        const metadata = m.metadata as Record<string, unknown> | undefined;
        console.log(`  Message ${index}:`, {
          id: m.id,
          role: m.role,
          roundNumber: metadata?.roundNumber,
        });
      });

      const lastUserMessage = currentMessages.findLast(m => m.role === 'user');
      const userQuestion = extractTextFromMessage(lastUserMessage);

      console.log('User Question:', userQuestion);
      console.log('Calling createPendingAnalysis...');
      console.groupEnd();

      // ✅ FIX: Add small delay during regeneration to ensure messages are fully updated
      // During regeneration, messages might still be updating when onRoundComplete fires
      const isRegeneration = regenerateRoundNumberRef.current !== null;

      const createAnalysis = () => {
        // ✅ Get latest messages from ref to ensure we have the most recent state
        const latestMessages = messagesRef.current;
        const latestParticipants = contextParticipantsRef.current;
        const latestUserMessage = latestMessages.findLast(m => m.role === 'user');
        const latestUserQuestion = extractTextFromMessage(latestUserMessage);

        // ✅ Use ref to access latest createPendingAnalysis function
        createPendingAnalysisRef.current(
          roundNumber,
          latestMessages,
          latestParticipants,
          latestUserQuestion,
        );
      };

      if (isRegeneration) {
        console.log('[ChatThreadScreen] Delaying analysis creation for regeneration by 100ms');
        setTimeout(createAnalysis, 100);
      } else {
        createAnalysis();
      }

      console.log('[ChatThreadScreen] Created client-side pending analysis for round', roundNumber);

      // ✅ Clear regeneration tracking after creating analysis
      if (regenerateRoundNumberRef.current === roundNumber) {
        console.log('[ChatThreadScreen] Clearing regeneration flag for round', roundNumber);
        regenerateRoundNumberRef.current = null;
      }

      setStreamingRoundNumber(null);
      currentRoundNumberRef.current = null;
    });
  }, [thread.id, thread.title, router, setOnComplete]); // ✅ Removed createPendingAnalysis dependency

  useEffect(() => {
    setOnRetry((roundNumber: number) => {
      // ✅ Track that we're regenerating this round
      regenerateRoundNumberRef.current = roundNumber;

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

    // ✅ SEMANTIC MATCHING: Compare by modelId since backend matches by modelId
    // This ensures message gate works correctly after participant ID changes from temp → real
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
          id: p.id.startsWith('participant-') ? undefined : p.id,
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

        // Check if any participants have temporary IDs (new participants being added)
        const hasTemporaryIds = selectedParticipants.some(p => p.id.startsWith('participant-'));

        if (hasTemporaryIds) {
          // ✅ RACE CONDITION FIX: Atomic ID replacement flow
          // 1. Apply optimistic update with temp IDs
          updateParticipants(optimisticParticipants);

          // 2. Wait for server to generate real database IDs
          const response = await updateThreadMutation.mutateAsync({
            param: { id: thread.id },
            json: {
              participants: participantsForUpdate,
              mode: selectedMode,
            },
          });

          // 3. Atomically replace temp IDs with real IDs from server
          if (response?.data?.participants) {
            // ✅ CRITICAL: Remove all participants with temp IDs first
            // This prevents brief duplication where both temp and real IDs exist
            const currentParticipants = contextParticipants.filter(
              p => !p.id.startsWith('participant-'),
            );

            // Convert server response to participant objects with proper dates
            const participantsWithDates = response.data.participants.map(p => ({
              ...p,
              createdAt: new Date(p.createdAt),
              updatedAt: new Date(p.updatedAt),
            }));

            // ✅ Merge: Keep existing participants (no temp IDs) + add new participants (real IDs)
            // The updateParticipants function will handle deduplication by modelId
            const mergedParticipants = [
              ...currentParticipants,
              ...participantsWithDates,
            ];

            // ✅ Apply atomic update - deduplication handled by context
            updateParticipants(mergedParticipants);
            // ✅ SEMANTIC MATCHING: Store modelIds (backend matches by modelId, not database ID)
            setExpectedParticipantIds(participantsWithDates.map(p => p.modelId));
          } else {
            // ✅ SEMANTIC MATCHING: Store modelIds (backend matches by modelId, not database ID)
            setExpectedParticipantIds(optimisticParticipants.map(p => p.modelId));
          }
        } else {
          // No new participants - keep fire-and-forget for better performance
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

          // ✅ SEMANTIC MATCHING: Store modelIds (backend matches by modelId, not database ID)
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

    // ✅ STREAMING OPTIMIZATION: If streaming same round, just update messages and analyses - don't rebuild entire array
    // This prevents changelogs from shifting positions while keeping analyses state up-to-date
    if (isStreaming && currentMaxRound === previousMaxRound && previousItemsRef.current.length > 0) {
      // Create a map of current analyses by round number for quick lookup
      const analysesByRound = new Map(analyses.map(a => [a.roundNumber, a]));

      const updatedItems = previousItemsRef.current.map((item) => {
        // Update messages for the streaming round
        if (item.type === 'messages' && item.roundNumber === currentMaxRound) {
          const roundMessages = messagesByRound.get(currentMaxRound);
          if (roundMessages && roundMessages.length > 0) {
            return { ...item, data: roundMessages };
          }
        }
        // ✅ FIX: Update analysis data from current analyses array to prevent stale state
        // This ensures completed analyses stay completed and don't revert to "analyzing"
        if (item.type === 'analysis') {
          const currentAnalysis = analysesByRound.get(item.roundNumber);
          if (currentAnalysis) {
            return { ...item, data: currentAnalysis };
          }
        }
        return item;
      });

      // ✅ CRITICAL FIX: Update previousItemsRef to prevent reverting to stale state
      // Without this, the next render would revert to the old state from previousItemsRef
      // This ensures analysis state changes (e.g., pending → completed) are preserved
      previousItemsRef.current = updatedItems;

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

      // ✅ CRITICAL: Skip rounds without messages (prevents empty rounds)
      // Changelog and analysis are only meaningful when a round has messages
      if (!roundMessages || roundMessages.length === 0) {
        return;
      }

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
  }, [setRoundFeedbackMutation, thread.id, setClientFeedback, setPendingFeedback]);

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
                  ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
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
                          onStreamStart={() => {
                            // ✅ CRITICAL FIX: Update status to 'streaming' when POST request starts
                            // This matches backend state transition (pending → streaming)
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
                // Only show loader during actual streaming or active analysis
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
