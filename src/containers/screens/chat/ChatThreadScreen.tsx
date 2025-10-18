'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStickToBottomContext } from 'use-stick-to-bottom';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { Button } from '@/components/ui/button';
import { useSharedChatContext } from '@/contexts/chat-context';
import { useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadAnalysesQuery, useThreadChangelogQuery } from '@/hooks/queries/chat-threads';
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
    error: streamError,
    retry: retryRound,
    stop: stopStreaming,
    initializeThread,
    setOnStreamComplete,
    setOnRoundComplete,
    participants: contextParticipants,
  } = useSharedChatContext();

  const { data: changelogResponse } = useThreadChangelogQuery(thread.id);
  const changelog = useMemo(
    () => (changelogResponse?.success ? changelogResponse.data.changelog || [] : []),
    [changelogResponse],
  );

  const { data: analysesResponse } = useThreadAnalysesQuery(thread.id, true);
  const analyses = useMemo(
    () => {
      const items = analysesResponse?.success ? analysesResponse.data.items || [] : [];
      // Transform date strings to Date objects (API returns ISO strings, component expects Dates)
      // ✅ FILTER: Only show completed analyses (exclude pending, streaming, or failed)
      // Failed/pending analyses should not be displayed as they don't have valid data
      return items
        .filter(item => item.status === 'completed')
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
      // ✅ Immediately refetch analyses when round completes
      // This ensures the pending analysis is discovered without waiting for polling
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(thread.id) });
    });
    // ✅ CRITICAL: Only depend on thread.id to prevent infinite loops
    // participants/initialMessages come from server props and shouldn't trigger re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // ✅ AI SDK v5 PATTERN: Submit handler with participant persistence
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }

      // ✅ CRITICAL FIX: Persist participant changes before streaming starts
      // This ensures the backend uses the latest participant configuration
      // and creates proper changelog entries for the changes
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

        // ✅ USE MUTATION HOOK: Update thread with new participant configuration
        await updateThreadMutation.mutateAsync({
          param: { id: thread.id },
          json: {
            participants: participantsForUpdate,
          },
        });

        console.warn('[ChatThreadScreen] ✅ Participant changes persisted before streaming', {
          threadId: thread.id,
          participantCount: participantsForUpdate.length,
        });
      } catch (error) {
        console.error('[ChatThreadScreen] ❌ Failed to persist participant changes:', error);
        // Don't block streaming on participant update errors
        // The streamChat endpoint will still receive providedParticipants
      }

      // ✅ The context hook handles all streaming logic
      await sendMessage(trimmed);
      setInputValue('');
    },
    [inputValue, sendMessage, thread.id, selectedParticipants, updateThreadMutation],
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

    // Get all unique round numbers from messages (changelog might not have all rounds)
    const sortedRounds = Array.from(messagesByRound.keys()).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber)!;
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);

      // 1. Add changelog BEFORE round messages (shows what changed)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
        });
      }

      // 2. Add messages for this round
      items.push({
        type: 'messages',
        data: roundMessages,
        key: `round-${roundNumber}-messages`,
      });

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
                {item.type === 'changelog'
                  ? (
                // Changelog before round (shows what changed)
                      <div className="mb-6 space-y-4">
                        {item.data.map(change => (
                          <ConfigurationChangesGroup
                            key={change.id}
                            group={{
                              timestamp: new Date(change.createdAt),
                              changes: [change],
                            }}
                          />
                        ))}
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
                    : (
                  // Analysis after round (shows results)
                        <div className="mt-6">
                          <RoundAnalysisCard
                            analysis={item.data}
                            threadId={thread.id}
                            isLatest={itemIndex === messagesWithAnalysesAndChangelog.length - 1}
                          />
                        </div>
                      )}
              </div>
            ))}

            {/* ✅ RETRY BUTTON: Show after error (error message appears inline with participant) */}
            {streamError && !isStreaming && (
              <div className="flex justify-center mt-4">
                <button
                  type="button"
                  onClick={retryRound}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors"
                >
                  {t('errors.retry')}
                </button>
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
