'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MessageStatus } from '@/api/routes/chat/schema';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatInput } from '@/components/chat/chat-input';
import { ChatModeSelector } from '@/components/chat/chat-mode-selector';
import { ChatParticipantsList } from '@/components/chat/chat-participants-list';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { ModeratorRoundTrigger } from '@/components/chat/moderator/moderator-round-trigger';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { useThreadHeader } from '@/components/chat/thread-header-context';
import { useThreadAnalysesQuery, useThreadChangelogQuery } from '@/hooks/queries/chat-threads';
import { useModelsQuery } from '@/hooks/queries/models';
import { useUsageStatsQuery } from '@/hooks/queries/usage';
import { useBoolean } from '@/hooks/utils';
import { useMultiParticipantChat } from '@/hooks/utils/use-multi-participant-chat';
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import {
  chatMessagesToUIMessages,
  getMessageMetadata,
} from '@/lib/utils/message-transforms';
/**
 * ✅ RPC-INFERRED TYPES: Import runtime types from types layer
 * These types automatically have correct runtime representation (dates as ISO strings)
 */
import type { Changelog, ChatMessage, Participant, Thread } from '@/types/chat';

type ChatThreadScreenProps = {
  thread: Thread;
  participants: Participant[];
  initialMessages: ChatMessage[];
  slug: string;
  /**
   * Thread owner user data from server (for hydration consistency)
   */
  user: {
    name: string;
    image: string | null;
  };
};

// ============================================================================
// Main Component - ✅ OFFICIAL AI SDK PATTERN
// ============================================================================

/**
 * ChatThreadScreen - Following OFFICIAL AI SDK Elements Pattern
 *
 * ✅ Simple message mapping - no complex grouping
 * ✅ Messages appear immediately as they're added to state
 * ✅ Direct rendering following AI SDK docs exactly
 * ✅ Real-time changelog updates via TanStack Query
 *
 * See: https://ai-sdk.dev/elements/components/message
 */
export default function ChatThreadScreen({
  thread,
  participants,
  initialMessages,
  slug,
  user,
}: ChatThreadScreenProps) {
  const t = useTranslations('chat');
  const { data: session } = useSession();
  const { setThreadActions, setThreadTitle } = useThreadHeader();
  const queryClient = useQueryClient();

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // ✅ Fetch changelog reactively - prefetched on server, updates when configuration changes happen
  const { data: changelogResponse } = useThreadChangelogQuery(thread.id);
  const changelog = useMemo(
    () => (changelogResponse?.success ? changelogResponse.data.changelog || [] : []),
    [changelogResponse],
  );

  // ✅ Fetch existing moderator analyses - backend-triggered automatically
  // Polling is always enabled (3s interval) to discover new analyses
  const { data: analysesResponse } = useThreadAnalysesQuery(thread.id, true);
  const analyses = useMemo(
    () => (analysesResponse?.success ? analysesResponse.data.items || [] : []),
    [analysesResponse],
  );

  // ✅ DYNAMIC PRICING: Fetch user tier for access control
  const { data: usageData } = useUsageStatsQuery();
  const userTier = usageData?.success ? usageData.data.subscription.tier : 'free';

  // ✅ Thread action state
  const isDeleteDialogOpen = useBoolean(false);

  // ✅ Participants state (must be declared before timeline useMemo that depends on it)
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

  // ✅ Group changelog entries by time window (2s) inline - no helper file needed
  // This is a simple UI transformation following patterns in chat-participants-list.tsx
  const changelogItems = useMemo(() => {
    if (changelog.length === 0)
      return [];

    // Sort by timestamp (newest first, matching backend order)
    const sorted = [...changelog].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const groups: Array<{ timestamp: Date; changes: Changelog[] }> = [];
    let currentGroup: { timestamp: Date; changes: Changelog[] } | null = null;
    const TIME_WINDOW_MS = 2000; // Group changes within 2 seconds

    for (const change of sorted) {
      const timestamp = new Date(change.createdAt);

      // Start new group if outside time window
      if (
        !currentGroup
        || Math.abs(timestamp.getTime() - currentGroup.timestamp.getTime()) > TIME_WINDOW_MS
      ) {
        currentGroup = { timestamp, changes: [] };
        groups.push(currentGroup);
      }

      currentGroup.changes.push(change);
    }

    return groups.map(group => ({
      type: 'changelog_group' as const,
      data: group,
      timestamp: group.timestamp,
    }));
  }, [changelog]);

  const analysisItems = useMemo(() => {
    return analyses.map((analysis) => {
      // ✅ Ensure all date fields are Date objects for type safety
      const analysisWithDates = {
        ...analysis,
        createdAt: new Date(analysis.createdAt),
        // ✅ Convert completedAt if it exists, otherwise explicitly set as null
        completedAt: analysis.completedAt ? new Date(analysis.completedAt) : (null as Date | null),
      };

      return {
        type: 'moderator_analysis' as const,
        data: analysisWithDates,
        timestamp: new Date(analysis.createdAt),
      };
    });
  }, [analyses]);

  // ✅ REMOVED: roundItems detection
  // Analysis is now BACKEND-TRIGGERED ONLY after last participant completes
  // Users cannot manually trigger analysis - no UI for "opportunities"
  // Frontend just displays analyses that backend creates automatically

  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ OFFICIAL AI SDK HOOK - Handles all streaming automatically
  const {
    messages,
    status,
    error,
    streamAllParticipants,
    stop,
    setMessages,
    isStreamingParticipants,
    currentParticipantIndex,
  } = useMultiParticipantChat({
    threadId: thread.id,
    initialMessages: chatMessagesToUIMessages(initialMessages),
    selectedMode,
    selectedParticipants,
    onParticipantsUpdate: setSelectedParticipants,
    onError: (err) => {
      console.error('[ChatThreadScreen] Streaming error:', err);
    },
  });

  // ✅ Create a merged timeline of messages, grouped changelog entries, and analyses
  // ✅ CRITICAL: Use stable timestamps to prevent React reconciliation issues
  // ✅ OPTIMIZED: Separated memoization for changelog/analysis to reduce recalculation during streaming
  // ✅ REMOVED: roundItems - analysis is backend-triggered only, no manual triggering UI
  const timeline = useMemo(() => {
    const messageItems = messages.map((msg: UIMessage, index: number) => {
      const metadata = getMessageMetadata(msg.metadata);
      return {
        type: 'message' as const,
        data: msg,
        index,
        timestamp: metadata?.createdAt
          ? new Date(metadata.createdAt)
          : new Date(Date.now() + index),
      };
    });

    return [...messageItems, ...changelogItems, ...analysisItems].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }, [messages, changelogItems, analysisItems]);

  // ✅ Removed fetchedVariantsRef - no longer needed since variants are pre-loaded

  // ✅ Refetch messages and changelog from backend after streaming completes
  // This ensures we get real backend message IDs, participantIds, and parentMessageIds for variant support
  // ALSO invalidates changelog to show any configuration changes that occurred during streaming
  // ✅ Enable polling for analysis generation after streaming completes
  const previousStreamingRef = useRef(false);
  useEffect(() => {
    const didJustFinishStreaming = previousStreamingRef.current && !isStreamingParticipants;
    previousStreamingRef.current = isStreamingParticipants;

    if (!didJustFinishStreaming) {
      return;
    }

    // Streaming just completed - refetch messages and invalidate changelog
    console.warn('[ChatThreadScreen] Streaming completed - refetching messages and starting analysis polling');

    const refetchData = async () => {
      try {
        // ✅ PROPER PATTERN: Use queryClient.refetchQueries to trigger query hooks
        // This ensures we use the existing query infrastructure (hooks) instead of calling services
        await queryClient.refetchQueries({
          queryKey: queryKeys.threads.detail(thread.id),
          exact: true,
        });

        // ✅ Get the updated data from the query cache (populated by the query hook's queryFn)
        const result = queryClient.getQueryData(queryKeys.threads.detail(thread.id)) as Awaited<ReturnType<typeof import('@/services/api/chat-threads').getThreadService>> | undefined;

        if (result?.success && result.data?.messages) {
          console.warn('[ChatThreadScreen] Refetched', result.data.messages.length, 'messages from backend');
          // Transform backend messages to UI messages
          setMessages(chatMessagesToUIMessages(result.data.messages));

          // Variants are already included in message metadata from server
        }

        // ✅ CRITICAL: Invalidate thread detail queries (includes changelog) to show config changes
        // This triggers refetch of changelog query which will show new entries created during streaming
        invalidationPatterns.threadDetail(thread.id).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });

        // ✅ Polling is always enabled - no need to manually trigger
      } catch (error) {
        console.error('[ChatThreadScreen] Failed to refetch messages after streaming:', error);
      }
    };

    refetchData();
  }, [isStreamingParticipants, thread.id, queryClient, setMessages]);

  // ✅ REMOVED: Polling control logic
  // Polling is now always enabled in useThreadAnalysesQuery (3s interval)
  // Backend automatically triggers analysis after last participant completes
  // No need for frontend to manage polling state

  // ✅ Handle sending new message - AI SDK handles everything
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || status !== 'ready') {
        return;
      }

      const messageText = inputValue;
      setInputValue('');

      // ✅ AI SDK hook handles: user message creation, SSE parsing, state updates, metadata
      await streamAllParticipants(messageText);

      // Auto-scroll handled by useEffect watching messages
    },
    [inputValue, status, streamAllParticipants],
  );

  // ✅ Use shared thread actions component
  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={isDeleteDialogOpen.onTrue}
      />
    ),
    [thread, slug, isDeleteDialogOpen.onTrue],
  );

  // ✅ Set thread actions in header context - minimal dependencies
  // setThreadActions and setThreadTitle are stable context functions (don't need to be in dependencies)
  useEffect(() => {
    setThreadActions(threadActions);
    setThreadTitle(thread.title);

    // Clear on unmount
    return () => {
      setThreadActions(null);
      setThreadTitle(null);
    };
  }, [threadActions, thread.title, setThreadActions, setThreadTitle]);

  // ✅ Auto-scroll to bottom when messages change (during streaming or new messages)
  useEffect(() => {
    const scrollContainer = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;
    if (!scrollContainer)
      return;

    // Check if user is near bottom before auto-scrolling (respect user scroll position)
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

    // Only auto-scroll if user is already near the bottom or if streaming
    if (isNearBottom || status === 'streaming') {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, status]); // Re-run when messages or streaming status changes

  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      {/* Content scrolls at page level - no Conversation scroll container */}
      <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-20 pb-32 space-y-4">
        {/* ✅ Timeline: Messages, grouped configuration changes, and moderator analysis sorted by time */}
        {timeline.map((item, _index) => {
          // Render grouped configuration changes
          if (item.type === 'changelog_group') {
            return (
              <ConfigurationChangesGroup
                key={`changelog-group-${item.data.timestamp.getTime()}`}
                group={item.data}
              />
            );
          }

          // ✅ Render moderator analysis (backend-triggered automatically)
          // Analysis is created by backend after last participant completes
          // Frontend just displays it (all statuses: pending/streaming/completed/failed)
          if (item.type === 'moderator_analysis') {
            const analysis = item.data;

            return (
              <ModeratorRoundTrigger
                key={`moderator-analysis-${analysis.id}`} // ✅ Use ID for unique key
                analysis={analysis} // Pass analysis with status
              />
            );
          }

          // Render message (existing logic)
          const message = item.data;
          if (message.role === 'user') {
            // ✅ User message
            return (
              <Message from="user" key={message.id}>
                <MessageContent>
                  {message.parts.map((part: UIMessage['parts'][number], partIndex: number) => {
                    // ✅ OFFICIAL PATTERN: Render text content
                    if (part.type === 'text') {
                      return (
                      // eslint-disable-next-line react/no-array-index-key -- Parts are stable content segments within a message
                        <Response key={`${message.id}-${partIndex}`}>
                          {part.text}
                        </Response>
                      );
                    }

                    // ✅ OFFICIAL PATTERN: Render file attachments (images)
                    // Following: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#attachments
                    if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
                      return (
                        // eslint-disable-next-line react/no-array-index-key -- Parts are stable content segments within a message
                        <div key={`${message.id}-${partIndex}`} className="my-2">
                          <img
                            src={part.url}
                            alt={part.filename || 'Attachment'}
                            className="max-w-full rounded-lg border border-border"
                            style={{ maxHeight: '400px' }}
                          />
                          {part.filename && (
                            <p className="mt-1 text-xs text-muted-foreground">{part.filename}</p>
                          )}
                        </div>
                      );
                    }

                    // ✅ OFFICIAL PATTERN: Render non-image file attachments
                    // Following: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#attachments
                    if (part.type === 'file') {
                      return (
                        // eslint-disable-next-line react/no-array-index-key -- Parts are stable content segments within a message
                        <div key={`${message.id}-${partIndex}`} className="my-2 p-3 border border-border rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{part.filename || 'File'}</p>
                              {part.mediaType && (
                                <p className="text-xs text-muted-foreground">{part.mediaType}</p>
                              )}
                            </div>
                            <a
                              href={part.url}
                              download={part.filename}
                              className="text-xs text-primary hover:underline"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </MessageContent>
                <MessageAvatar
                  src={user.image ?? ''}
                  name={user.name}
                />
              </Message>
            );
          }

          // ✅ Assistant message: Extract participant data from message metadata
          // CRITICAL: Use stored model/role from participants array (NOT just metadata)
          // Look up participant to get model and role information
          const metadata = getMessageMetadata(message.metadata);

          // Get participantId from metadata (where chatMessageToUIMessage puts it)
          const participantId = metadata?.participantId;

          // Find the participant in the participants array
          const participant = participants.find(p => p.id === participantId);

          // Get model ID from participant (primary) or metadata (fallback)
          const storedModelId = participant?.modelId || metadata?.model;

          // Get role from participant
          const storedRole = participant?.role;

          // Calculate participant index (0-based position in enabled participants sorted by priority)
          const participantIndex = participant
            ? participants
                .filter(p => p.isEnabled)
                .sort((a, b) => a.priority - b.priority)
                .findIndex(p => p.id === participant.id)
            : 0;

          // ✅ CRITICAL: Use stored modelId directly for avatar (independent of current participants)
          const avatarProps = getAvatarPropsFromModelId(
            message.role === 'system' ? 'assistant' : message.role,
            storedModelId,
            session?.user?.image,
            session?.user?.name,
          );

          // Use stored modelId from participant or metadata
          const model = storedModelId ? allModels.find(m => m.id === storedModelId) : undefined;

          if (!model) {
            console.warn('[ChatThreadScreen] Skipping message - no model found:', {
              messageId: message.id,
              storedModelId,
              participantId,
              hasParticipant: !!participant,
              metadataModel: metadata?.model,
            });
            // Skip rendering messages without valid model reference
            // This can happen with deleted participants or invalid model IDs
            return null;
          }

          // ✅ DYNAMIC PRICING: Check if user can access this model at their current tier
          const isAccessible = canAccessModelByPricing(userTier, model);

          // ✅ Check for error using typed metadata (already declared above)
          // Type-safe error detection following AI SDK error handling pattern
          const hasError = metadata?.hasError === true || !!metadata?.error;
          const isCurrentlyStreaming = isStreamingParticipants
            && metadata?.participantIndex === currentParticipantIndex;
          const hasContent = message.parts.some((p: UIMessage['parts'][number]) => p.type === 'text' && p.text.trim().length > 0);

          // ✅ RPC TYPE: MessageStatus from backend schema
          const messageStatus: MessageStatus = hasError
            ? 'error'
            : isCurrentlyStreaming && !hasContent
              ? 'thinking'
              : isCurrentlyStreaming
                ? 'streaming'
                : 'completed';

          // Filter message parts to only text and reasoning (ModelMessageCard types)
          const filteredParts = message.parts.filter(
            (p: UIMessage['parts'][number]): p is { type: 'text'; text: string } | { type: 'reasoning'; text: string } =>
              p.type === 'text' || p.type === 'reasoning',
          );

          // ✅ OFFICIAL PATTERN: Extract source parts (source-url, source-document)
          // Following: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#sources
          // Sources are forwarded from models like Perplexity and Google AI when sendSources: true
          const sourceParts = message.parts.filter((p: UIMessage['parts'][number]) =>
            'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
          );

          return (
            <div key={message.id}>
              <ModelMessageCard
                messageId={message.id}
                model={model}
                role={String(storedRole || '')} // ✅ Use stored role from metadata
                participantIndex={participantIndex ?? 0}
                status={messageStatus}
                parts={filteredParts}
                avatarSrc={avatarProps.src}
                avatarName={avatarProps.name}
                metadata={metadata ?? null}
                isAccessible={isAccessible} // ✅ DYNAMIC PRICING: Show tier badge if not accessible
              />

              {/* ✅ OFFICIAL PATTERN: Render sources (if present) */}
              {sourceParts.length > 0 && (
                <div className="mt-2 ml-12 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Sources:</p>
                  <div className="space-y-1">
                    {sourceParts.map((sourcePart: UIMessage['parts'][number], sourceIndex: number) => {
                      if ('type' in sourcePart && sourcePart.type === 'source-url' && 'url' in sourcePart) {
                        return (
                          // eslint-disable-next-line react/no-array-index-key -- Sources are stable references within a message
                          <div key={`${message.id}-source-${sourceIndex}`} className="text-xs">
                            <a
                              href={sourcePart.url as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              <span>{('title' in sourcePart && sourcePart.title) || sourcePart.url}</span>
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </a>
                          </div>
                        );
                      }

                      if ('type' in sourcePart && sourcePart.type === 'source-document') {
                        return (
                          // eslint-disable-next-line react/no-array-index-key -- Sources are stable references within a message
                          <div key={`${message.id}-source-${sourceIndex}`} className="text-xs text-muted-foreground">
                            <span>{('title' in sourcePart && sourcePart.title) || 'Document'}</span>
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* ✅ Enhanced streaming loader with participant queue and thinking messages */}
        {isStreamingParticipants && currentParticipantIndex !== null && (
          <StreamingParticipantsLoader
            participants={selectedParticipants}
            currentParticipantIndex={currentParticipantIndex}
          />
        )}
      </div>

      {/* ✅ STICKY INPUT - Liquid Glass design with content scrolling underneath */}
      <div className="sticky bottom-0 z-10 mt-auto">
        <div className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4">
          {/* ✅ Chat input with mode selector in toolbar - Glass design */}
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onStop={stop}
            status={isStreamingParticipants ? 'streaming' : error ? 'error' : 'ready'}
            placeholder={t('input.placeholder')}
            toolbar={(
              <>
                <ChatParticipantsList
                  participants={selectedParticipants}
                  onParticipantsChange={setSelectedParticipants}
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

      {/* Delete confirmation dialog */}
      <ChatDeleteDialog
        isOpen={isDeleteDialogOpen.value}
        onOpenChange={isDeleteDialogOpen.setValue}
        threadId={thread.id}
        threadSlug={slug}
        redirectIfCurrent={true}
      />
    </div>
  );
}
