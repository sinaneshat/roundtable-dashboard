'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
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
import { useSharedChatContext } from '@/contexts/chat-context';
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
 * ✅ AI SDK v5 PATTERN: Chat Thread Screen with Shared Context
 *
 * REFACTORED TO FOLLOW AI SDK v5 BEST PRACTICES:
 * - Uses shared context from ChatProvider (no duplicate hook instance)
 * - Eliminated optimistic update complexity (~80 lines)
 * - Simplified participant management
 * - Reduced state variables
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
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  const queryClient = useQueryClient();

  // ✅ AI SDK v5 PATTERN: Access shared chat context (no duplicate hook)
  const {
    messages,
    sendMessage,
    isStreaming,
    currentParticipantIndex,
    error: streamError,
    retry: retryRound,
    initializeThread,
    setOnStreamComplete,
    setOnRoundComplete,
    updateParticipants,
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
      console.log('[ChatThreadScreen] Analyses loaded:', {
        count: items.length,
        analyses: items.map(a => ({
          id: a.id,
          roundNumber: a.roundNumber,
          status: a.status,
        })),
      });
      // Transform date strings to Date objects (API returns ISO strings, component expects Dates)
      return items.map(item => ({
        ...item,
        createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
        completedAt: item.completedAt ? (typeof item.completedAt === 'string' ? new Date(item.completedAt) : item.completedAt) : null,
      }));
    },
    [analysesResponse],
  );

  const isDeleteDialogOpen = useBoolean(false);

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

  // ✅ AI SDK v5 PATTERN: Staged participant changes (local only)
  // Changes are persisted when user submits next message, not immediately
  // This prevents unwanted API calls when user is just exploring options
  const handleParticipantsChange = useCallback((newParticipants: ParticipantConfig[]) => {
    // Update local UI state
    setSelectedParticipants(newParticipants);

    // Convert ParticipantConfig[] to ChatParticipant[] and update context
    // Context will send these participants with the next message
    const updatedParticipants = newParticipants.map((config, index) => {
      // Find the original participant to preserve DB fields (timestamps, etc.)
      const original = participants.find(p => p.id === config.id);
      if (!original) {
        // If not found, this shouldn't happen but handle gracefully
        console.warn(`[ChatThreadScreen] Participant ${config.id} not found in original participants`);
        return null;
      }

      // Merge: Use config for updated fields, preserve DB fields from original
      return {
        ...original,
        modelId: config.modelId,
        role: config.role || null,
        customRoleId: config.customRoleId || null,
        priority: index, // Use array index as priority
        isEnabled: true,
        settings: config.settings || original.settings,
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);

    // Update context with new participant configuration
    // These will be sent to backend with the next message
    updateParticipants(updatedParticipants);
  }, [participants, updateParticipants]);

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
      console.log('[ChatThreadScreen] Round complete - triggering analysis refetch');
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(thread.id) });
    });
    // ✅ CRITICAL: Only depend on thread.id to prevent infinite loops
    // participants/initialMessages come from server props and shouldn't trigger re-initialization
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id]);

  // ✅ AI SDK v5 PATTERN: Simple submit handler using shared context
  const handlePromptSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) {
        return;
      }

      // ✅ The context hook handles all streaming logic
      await sendMessage(trimmed);
      setInputValue('');
    },
    [inputValue, sendMessage],
  );

  // Update header actions
  useEffect(() => {
    setThreadTitle(thread.title);
    setThreadActions(
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={isDeleteDialogOpen.onTrue}
      />,
    );
  }, [thread, slug, setThreadTitle, setThreadActions, isDeleteDialogOpen.onTrue]);

  // ✅ Derive active participants from context
  // Context manages the participant state, we just display it
  const activeParticipants = contextParticipants;

  // ✅ INTERLEAVED RENDERING: Merge messages and analyses by round
  // Each round consists of: user message → N participant responses
  // Analysis should appear immediately after each round's participant responses
  const messagesWithAnalyses = useMemo(() => {
    const items: Array<{ type: 'messages' | 'analysis'; data: any; key: string }> = [];

    // Group messages by rounds
    const participantCount = activeParticipants.length;
    let currentRound = 0;
    let roundMessages: typeof messages = [];

    messages.forEach((message, index) => {
      roundMessages.push(message);

      // Check if we've completed a round (all participants have responded)
      if (message.role === 'assistant') {
        const assistantMessagesInRound = roundMessages.filter(m => m.role === 'assistant').length;

        if (assistantMessagesInRound === participantCount) {
          // Round complete - add messages group
          currentRound++;
          items.push({
            type: 'messages',
            data: roundMessages,
            key: `round-${currentRound}-messages`,
          });

          // Add analysis for this round if it exists
          const analysis = analyses.find(a => a.roundNumber === currentRound);
          if (analysis) {
            items.push({
              type: 'analysis',
              data: analysis,
              key: `round-${currentRound}-analysis`,
            });
          }

          // Reset for next round
          roundMessages = [];
        }
      }
    });

    // Add any remaining messages (incomplete round)
    if (roundMessages.length > 0) {
      items.push({
        type: 'messages',
        data: roundMessages,
        key: `round-incomplete-messages`,
      });
    }

    return items;
  }, [messages, analyses, activeParticipants.length]);

  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {/* Configuration Changes */}
            {changelog.length > 0 && (
              <div className="mb-6 space-y-4">
                {/* Group changes by timestamp for ConfigurationChangesGroup */}
                {changelog.map(change => (
                  <ConfigurationChangesGroup
                    key={change.id}
                    group={{
                      timestamp: new Date(change.createdAt),
                      changes: [change],
                    }}
                  />
                ))}
              </div>
            )}

            {/* ✅ INTERLEAVED MESSAGES AND ANALYSES: Render messages and analyses in chronological order */}
            {messagesWithAnalyses.map((item, itemIndex) => (
              <div key={item.key}>
                {item.type === 'messages'
                  ? (
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
                      <div className="mt-6">
                        <RoundAnalysisCard
                          analysis={item.data}
                          threadId={thread.id}
                          isLatest={itemIndex === messagesWithAnalyses.length - 1 && item.type === 'analysis'}
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
        </div>

        {/* Input Area */}

        <div className="mx-auto max-w-3xl w-full px-4 py-4">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handlePromptSubmit}
            status={isStreaming ? 'submitted' : 'ready'}
            placeholder={t('input.placeholder')}
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
    </>
  );
}
