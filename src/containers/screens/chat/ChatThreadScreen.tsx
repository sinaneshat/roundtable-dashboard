'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon, RefreshCcwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
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
import { chatMessagesToUIMessages, getMessageMetadata } from '@/lib/utils/message-transforms';

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
    participants: contextParticipants,
    updateParticipants, // ✅ Need this to sync context after mutation
  } = useSharedChatContext();

  const { data: changelogResponse } = useThreadChangelogQuery(thread.id);
  const changelog = useMemo(
    () => (changelogResponse?.success ? changelogResponse.data.items || [] : []),
    [changelogResponse],
  );

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
  const setFeedbackMutation = useSetRoundFeedbackMutation();

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

    // Set up round completion callback for analysis triggers
    setOnRoundComplete(() => {
      // ✅ Immediately invalidate analyses when round completes
      // React Query will auto-refetch and the hook will get fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(thread.id) });
    });
    // ✅ CRITICAL: Only depend on thread.id to prevent infinite loops
    // participants/initialMessages come from server props and shouldn't trigger re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

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

  // ✅ TIMING FIX: Send pending message after context participants update
  // This ensures sendMessage uses fresh participants, not stale ones
  useEffect(() => {
    if (pendingMessage && contextParticipants.length > 0) {
      console.warn('[ChatThreadScreen] 🚀 Sending pending message with fresh participants', {
        threadId: thread.id,
        participantCount: contextParticipants.length,
        participantIds: contextParticipants.map(p => p.id),
        messagePreview: pendingMessage.substring(0, 50),
      });

      // Clear pending message first to prevent re-triggering
      setPendingMessage(null);

      // Now send the message - context has fresh participants
      sendMessage(pendingMessage);
    }
  }, [pendingMessage, contextParticipants, sendMessage, thread.id]);

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

          // ✅ TIMING FIX: Set pending message instead of calling sendMessage immediately
          // The useEffect will trigger sendMessage after context state propagates
          setPendingMessage(trimmed);
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
    const changelogByRound = new Map<number, (typeof changelog)>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber || 1;

      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }
      changelogByRound.get(roundNumber)!.push(change);
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

  // ✅ DEBUG: Log when items update to track rendering
  useEffect(() => {
    console.warn('[ChatThreadScreen] 🔄 Messages with analyses and changelog updated', {
      totalItems: messagesWithAnalysesAndChangelog.length,
      messagesGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'messages').length,
      analysesGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'analysis').length,
      changelogGroups: messagesWithAnalysesAndChangelog.filter(i => i.type === 'changelog').length,
      items: messagesWithAnalysesAndChangelog.map(item => ({
        type: item.type,
        key: item.key,
        itemCount: item.type === 'messages' ? item.data.length : item.type === 'changelog' ? item.data.length : undefined,
      })),
    });
  }, [messagesWithAnalysesAndChangelog]);

  // ✅ ROUND-LEVEL ERROR DETECTION: Check if the last completed round has errors
  // A round is considered complete when:
  // 1. Not currently streaming
  // 2. Last message is an assistant message (round finished)
  // 3. At least one assistant message in the round has an error
  const lastRoundHasErrors = useMemo(() => {
    if (isStreaming || messages.length === 0) {
      return false;
    }

    // Find the last user message to determine the current round
    const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex === -1) {
      return false;
    }

    // Get all assistant messages after the last user message (current round)
    const currentRoundAssistantMessages = messages.slice(lastUserMessageIndex + 1).filter(m => m.role === 'assistant');

    // Check if any assistant message in this round has an error
    const hasErrorInRound = currentRoundAssistantMessages.some((message) => {
      const metadata = getMessageMetadata(message.metadata);
      return metadata?.hasError === true || !!metadata?.error || !!metadata?.errorMessage;
    });

    return hasErrorInRound;
  }, [messages, isStreaming]);

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Conversation wrapper - scrollable content area */}
      <Conversation className="flex-1 flex flex-col min-h-0">
        {/* Scroll button updater component */}
        <ThreadHeaderScrollUpdater
          thread={thread}
          slug={slug}
          onDeleteClick={isDeleteDialogOpen.onTrue}
        />

        {/* Scrollable content area */}
        <ConversationContent className="flex-1">
          <div className="mx-auto max-w-3xl px-4 pt-6 pb-32">
            {/* ✅ Configuration changes are now shown inline between rounds */}

            {/* ✅ ROUND-BASED RENDERING: Changelog → Messages → Analysis */}
            {messagesWithAnalysesAndChangelog.map((item, itemIndex) => (
              <div key={item.key}>
                {item.type === 'changelog' && item.data.length > 0
                  ? (
                // ✅ Changelog before round - ALL changes for this round in ONE accordion
                      <div className="mb-6">
                        <ConfigurationChangesGroup
                          group={{
                            timestamp: new Date(item.data[0]!.createdAt),
                            changes: item.data, // ✅ Pass ALL changes - component groups by action
                          }}
                        />
                      </div>
                    )
                  : item.type === 'messages'
                    ? (
                  // Messages for this round
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
                      )
                    : item.type === 'analysis'
                      ? (
                    // Analysis after round (shows results) + Round Feedback
                          <div className="mt-6 space-y-4">
                            {/* ✅ Round Feedback: Like/Dislike buttons above changelog/analysis */}
                            <div className="flex justify-start min-h-[32px]">
                              <RoundFeedback
                                threadId={thread.id}
                                roundNumber={item.data.roundNumber}
                                currentFeedback={feedbackByRound.get(item.data.roundNumber) ?? null}
                                onFeedbackChange={(feedbackType) => {
                                  setFeedbackMutation.mutate({
                                    param: {
                                      threadId: thread.id,
                                      roundNumber: String(item.data.roundNumber),
                                    },
                                    json: { feedbackType },
                                  });
                                }}
                                disabled={isStreaming}
                              />
                            </div>

                            <RoundAnalysisCard
                              analysis={item.data}
                              threadId={thread.id}
                              isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                            />
                          </div>
                        )
                      : null}
              </div>
            ))}

            {/* ✅ ROUND-LEVEL RETRY: Show after entire round completes with errors */}
            {/* Following AI Elements Actions pattern - retry button appears after failed round */}
            {/* ✅ MOVED TO FAR LEFT: Changed justify-center to justify-start */}
            {lastRoundHasErrors && !isStreaming && (
              <div className="flex justify-start mt-6 mb-4">
                <Actions>
                  <Action
                    onClick={retryRound}
                    label={t('errors.retry')}
                    tooltip={t('errors.retryRound')}
                  >
                    <RefreshCcwIcon className="size-3" />
                  </Action>
                </Actions>
              </div>
            )}

            {/* Streaming participants loader */}
            {isStreaming && selectedParticipants.length > 1 && (
              <div className="mt-4">
                <StreamingParticipantsLoader
                  participants={selectedParticipants}
                  currentParticipantIndex={currentParticipantIndex}
                />
              </div>
            )}
          </div>
        </ConversationContent>
      </Conversation>

      {/* Absolutely positioned input - always visible at bottom, centered with content */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 py-4">
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
