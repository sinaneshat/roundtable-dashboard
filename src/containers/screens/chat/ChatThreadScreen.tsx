'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { canAccessModelByPricing } from '@/api/services/model-pricing-tiers.service';
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
import { useChatStreaming } from '@/hooks/utils/use-chat-streaming';
import { getAvatarPropsFromModelId } from '@/lib/ai/avatar-helpers';
import { groupChangelogByTime } from '@/lib/ai/changelog-helpers';
import {
  chatMessagesToUIMessages,
  getMessageMetadata,
} from '@/lib/ai/message-helpers';
// import { detectConversationRounds } from '@/lib/ai/round-helpers'; // REMOVED - No longer detecting rounds in frontend
import { useSession } from '@/lib/auth/client';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { invalidationPatterns } from '@/lib/data/query-keys';
import type { ParticipantConfig } from '@/lib/schemas/chat-forms';

type ChatThreadScreenProps = {
  thread: ChatThread;
  participants: ChatParticipant[];
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

// ✅ STABLE FILTER: Define outside component to prevent query key changes on re-render
const MODELS_QUERY_FILTERS = { includeAll: true } as const;

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
  const { data: modelsData } = useModelsQuery(MODELS_QUERY_FILTERS);
  const allModels = modelsData?.data?.models || [];

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
    () => (analysesResponse?.success ? analysesResponse.data.analyses || [] : []),
    [analysesResponse],
  );

  // ✅ DYNAMIC PRICING: Fetch user tier for access control
  const { data: usageData } = useUsageStatsQuery();
  const userTier = usageData?.success ? usageData.data.subscription.tier : 'free';

  // ✅ Thread action state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // ✅ Transform backend ChatMessage to AI SDK format using helper
  const [messages, setMessages] = useState<UIMessage[]>(() => chatMessagesToUIMessages(initialMessages));

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

  // ✅ Optimize: Only recalculate changelog/analysis items when they actually change
  // During streaming, only messages change, so we can memoize the expensive changelog/analysis processing
  const changelogItems = useMemo(() => {
    const changelogGroups = groupChangelogByTime(changelog);
    return changelogGroups.map(group => ({
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

  // ✅ Create a merged timeline of messages, grouped changelog entries, and analyses
  // ✅ CRITICAL: Use stable timestamps to prevent React reconciliation issues
  // ✅ OPTIMIZED: Separated memoization for changelog/analysis to reduce recalculation during streaming
  // ✅ REMOVED: roundItems - analysis is backend-triggered only, no manual triggering UI
  const timeline = useMemo(() => {
    const messageItems = messages.map((msg, index) => {
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

  const [selectedMode, setSelectedMode] = useState<ChatModeId>(thread.mode as ChatModeId);
  const [inputValue, setInputValue] = useState('');

  // ✅ Simplified streaming hook - Following AI SDK patterns
  const { status, streamingState, streamMessage, stopStreaming } = useChatStreaming(
    {
      threadId: thread.id,
      selectedMode,
      selectedParticipants,
    },
    setMessages,
    setSelectedParticipants,
  );

  // ✅ Removed fetchedVariantsRef - no longer needed since variants are pre-loaded

  // ✅ Refetch messages and changelog from backend after streaming completes
  // This ensures we get real backend message IDs, participantIds, and parentMessageIds for variant support
  // ALSO invalidates changelog to show any configuration changes that occurred during streaming
  // ✅ Enable polling for analysis generation after streaming completes
  const previousStatusRef = useRef<typeof status>('ready');
  useEffect(() => {
    const didJustFinishStreaming = previousStatusRef.current === 'streaming' && status === 'ready';
    previousStatusRef.current = status;

    if (!didJustFinishStreaming) {
      return;
    }

    // Streaming just completed - refetch messages and invalidate changelog
    console.warn('[ChatThreadScreen] Streaming completed - refetching messages and starting analysis polling');

    const refetchData = async () => {
      try {
        const { getThreadService } = await import('@/services/api/chat-threads');

        const result = await getThreadService(thread.id);

        if (result.success && result.data?.messages) {
          console.warn('[ChatThreadScreen] Refetched', result.data.messages.length, 'messages from backend');
          // Transform backend messages to UI messages
          const { chatMessagesToUIMessages } = await import('@/lib/ai/message-helpers');
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
    // queryClient is intentionally omitted - it's a stable reference from useQueryClient()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, thread.id]);

  // ✅ REMOVED: Polling control logic
  // Polling is now always enabled in useThreadAnalysesQuery (3s interval)
  // Backend automatically triggers analysis after last participant completes
  // No need for frontend to manage polling state

  // ✅ Handle sending new message
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || status !== 'ready')
        return;

      const userMessage: UIMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        parts: [{ type: 'text', text: inputValue }],
        metadata: {
          participantId: null, // User messages have no participant
          createdAt: new Date().toISOString(), // ✅ Required for timeline sorting
        },
      };

      setInputValue('');
      setMessages(prev => [...prev, userMessage]);
      await streamMessage([...messages, userMessage]);

      // Auto-scroll handled by useEffect watching messages
    },
    [inputValue, messages, status, streamMessage],
  );

  // ✅ Use shared thread actions component
  const threadActions = useMemo(
    () => (
      <ChatThreadActions
        thread={thread}
        slug={slug}
        onDeleteClick={() => setIsDeleteDialogOpen(true)}
      />
    ),
    [thread, slug],
  );

  // ✅ Set thread actions in header context - minimal dependencies
  useEffect(() => {
    setThreadActions(threadActions);
    setThreadTitle(thread.title);

    // Clear on unmount
    return () => {
      setThreadActions(null);
      setThreadTitle(null);
    };
    // Only depend on the memoized actions and title, not the setters (they're stable context functions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadActions, thread.title]);

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
                  {message.parts.map((part, partIndex) => {
                    if (part.type === 'text') {
                      return (
                      // eslint-disable-next-line react/no-array-index-key -- Parts are stable content segments within a message
                        <Response key={`${message.id}-${partIndex}`}>
                          {part.text}
                        </Response>
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
          const isCurrentlyStreaming = streamingState.messageId === message.id;
          const hasContent = message.parts.some(p => p.type === 'text' && p.text.trim().length > 0);

          const messageStatus: 'thinking' | 'streaming' | 'completed' | 'error' = hasError
            ? 'error'
            : isCurrentlyStreaming && !hasContent
              ? 'thinking'
              : isCurrentlyStreaming
                ? 'streaming'
                : 'completed';

          // Filter message parts to only text and reasoning (ModelMessageCard types)
          const filteredParts = message.parts.filter(
            (p): p is { type: 'text'; text: string } | { type: 'reasoning'; text: string } =>
              p.type === 'text' || p.type === 'reasoning',
          );

          return (
            <ModelMessageCard
              key={message.id}
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
          );
        })}

        {/* ✅ Enhanced streaming loader with participant queue and thinking messages */}
        {status === 'streaming' && (
          <StreamingParticipantsLoader
            participants={selectedParticipants}
            currentParticipantIndex={streamingState.participantIndex}
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
            onStop={stopStreaming}
            status={status === 'streaming' ? 'streaming' : status === 'error' ? 'error' : 'ready'}
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
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        threadId={thread.id}
        threadSlug={slug}
        redirectIfCurrent={true}
      />
    </div>
  );
}
