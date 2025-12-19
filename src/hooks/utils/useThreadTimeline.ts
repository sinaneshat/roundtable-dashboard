import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { ChatThreadChangelog, StoredPreSearch, StoredRoundSummary } from '@/api/routes/chat/schema';
import { getParticipantIndex } from '@/lib/utils/metadata';
import { getRoundNumberFromMetadata } from '@/lib/utils/round-utils';

/**
 * Changelog type that accepts both Date (from DB) and string (from API JSON)
 * This matches the reality of data flow: API returns JSON with string dates
 */
type ChangelogItem = Omit<ChatThreadChangelog, 'createdAt'> & {
  createdAt: Date | string;
};

/**
 * Timeline Item Types
 * Discriminated union for type-safe timeline rendering
 *
 * ✅ RESUMPTION FIX: Added 'pre-search' type to support rendering pre-search cards
 * at the timeline level, enabling proper display during page refresh scenarios
 * where user message hasn't been persisted yet.
 */
export type TimelineItem
  = | {
    type: 'messages';
    data: UIMessage[];
    key: string;
    roundNumber: number;
  }
  | {
    type: 'summary';
    data: StoredRoundSummary;
    key: string;
    roundNumber: number;
  }
  | {
    type: 'changelog';
    data: ChangelogItem[];
    key: string;
    roundNumber: number;
  }
  | {
    type: 'pre-search';
    data: StoredPreSearch;
    key: string;
    roundNumber: number;
  };

export type UseThreadTimelineOptions = {
  /**
   * Messages to group by round
   */
  messages: UIMessage[];

  /**
   * Optional summaries to include in timeline
   * If not provided, only messages and changelog will be rendered
   */
  summaries?: StoredRoundSummary[];

  /**
   * Changelog items to group by round
   * Accepts both Date and string for createdAt to match API JSON responses
   */
  changelog: ChangelogItem[];

  /**
   * Pre-searches to include in timeline
   * ✅ RESUMPTION FIX: Required for rendering pre-search cards when user message
   * hasn't been persisted yet (e.g., page refresh during web search phase)
   */
  preSearches?: StoredPreSearch[];
};

/**
 * useThreadTimeline - Unified Timeline Grouping Hook
 *
 * CONSOLIDATION: This hook replaces duplicate timeline logic in:
 * - ChatThreadScreen.tsx:726-801 (76 lines)
 * - PublicChatThreadScreen.tsx:43-94 (52 lines)
 *
 * Single source of truth for grouping messages, summaries, and changelog by round number.
 * Handles both authenticated views (with summaries) and public views (without summaries).
 *
 * FLOW:
 * 1. Group messages by round number (from metadata)
 * 2. Group changelog by round number
 * 3. Get all unique round numbers
 * 4. For each round, assemble timeline items in order:
 *    a. Changelog (configuration changes before messages)
 *    b. Messages (user + assistant responses)
 *    c. Summary (round summary after messages, if available)
 *
 * @example
 * ```tsx
 * const timeline = useThreadTimeline({
 *   messages,
 *   summaries,  // Optional - omit for public views
 *   changelog,
 * });
 *
 * return timeline.map((item) => {
 *   if (item.type === 'messages') return <MessageList messages={item.data} />;
 *   if (item.type === 'summary') return <SummaryCard summary={item.data} />;
 *   if (item.type === 'changelog') return <ChangelogGroup changes={item.data} />;
 * });
 * ```
 */
export function useThreadTimeline({
  messages,
  summaries = [],
  changelog,
  preSearches = [],
}: UseThreadTimelineOptions): TimelineItem[] {
  return useMemo(() => {
    // STEP 1: Group messages by round number
    // ✅ 0-BASED: Default round is 0
    const messagesByRound = new Map<number, UIMessage[]>();
    messages.forEach((message) => {
      const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);

      if (!messagesByRound.has(roundNumber)) {
        messagesByRound.set(roundNumber, []);
      }
      messagesByRound.get(roundNumber)!.push(message);
    });

    // STEP 1.5: Sort messages within each round
    // ✅ FIX: User messages first, then assistant messages sorted by participantIndex
    // This ensures consistent ordering regardless of message arrival order
    messagesByRound.forEach((roundMessages, _roundNumber) => {
      roundMessages.sort((a, b) => {
        // User messages come first
        if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
          return -1;
        if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
          return 1;

        // For assistant messages, sort by participantIndex
        if (a.role === MessageRoles.ASSISTANT && b.role === MessageRoles.ASSISTANT) {
          const indexA = getParticipantIndex(a.metadata) ?? 0;
          const indexB = getParticipantIndex(b.metadata) ?? 0;
          return indexA - indexB;
        }

        return 0;
      });
    });

    // STEP 2: Group changelog by round number
    // ✅ 0-BASED: Default round is 0
    const changelogByRound = new Map<number, ChangelogItem[]>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber ?? 0;

      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }

      // Deduplicate changelog items by ID
      const roundChanges = changelogByRound.get(roundNumber)!;
      const exists = roundChanges.some(existing => existing.id === change.id);
      if (!exists) {
        roundChanges.push(change);
      }
    });

    // STEP 3: Index pre-searches by round number
    // ✅ RESUMPTION FIX: Pre-searches are now tracked at timeline level
    const preSearchByRound = new Map<number, StoredPreSearch>();
    preSearches.forEach((preSearch) => {
      preSearchByRound.set(preSearch.roundNumber, preSearch);
    });

    // STEP 4: Collect all unique round numbers from all sources
    // ✅ RESUMPTION FIX: Include pre-search rounds to ensure they render
    // even when user message hasn't been persisted yet
    const allRoundNumbers = new Set<number>([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...summaries.map(s => s.roundNumber),
      ...preSearchByRound.keys(),
    ]);

    // STEP 5: Build timeline items in chronological order
    const timeline: TimelineItem[] = [];
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundSummary = summaries.find(s => s.roundNumber === roundNumber);
      const roundPreSearch = preSearchByRound.get(roundNumber);

      // ✅ RESUMPTION FIX: Don't skip rounds that have pre-search or changelog
      // This enables rendering changelog + pre-search even when user message
      // hasn't been persisted yet (e.g., page refresh during web search phase)
      const hasMessages = roundMessages && roundMessages.length > 0;
      const hasPreSearch = !!roundPreSearch;
      const hasChangelog = roundChangelog && roundChangelog.length > 0;

      // Skip rounds that have nothing to show
      if (!hasMessages && !hasPreSearch && !hasChangelog) {
        return;
      }

      // ✅ FIX: Don't show changelog for rounds that have no messages and no pre-search
      // These are "future" rounds where config was changed but round hasn't started yet
      // Only show changelog when the round is actually starting (has messages or pre-search)
      const shouldShowChangelog = hasChangelog && (hasMessages || hasPreSearch);

      // Add changelog first (shows configuration changes before messages)
      if (shouldShowChangelog) {
        timeline.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }

      // Skip entire round if it only has changelog (no messages, no pre-search)
      // This prevents showing orphaned changelog at the bottom
      if (!hasMessages && !hasPreSearch) {
        return;
      }

      // ✅ RESUMPTION FIX: Pre-search renders at timeline level ONLY for orphaned rounds
      // (rounds without messages). For normal rounds with messages, ChatMessageList
      // renders PreSearchCard in the correct position (after user message, before assistant messages).
      //
      // This ensures:
      // - Normal flow: changelog → user message → pre-search → assistant messages (via ChatMessageList)
      // - Orphaned flow: changelog → pre-search (standalone timeline item)
      if (hasPreSearch && !hasMessages) {
        timeline.push({
          type: 'pre-search',
          data: roundPreSearch,
          key: `round-${roundNumber}-pre-search`,
          roundNumber,
        });
      }

      // Add messages for this round (if any)
      // ChatMessageList handles pre-search rendering in correct position when messages exist
      if (hasMessages) {
        timeline.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
          roundNumber,
        });
      }

      // Add summary after messages (if exists and should be shown)
      // ✅ DEFENSIVE: Verify all referenced messages are complete before showing pending summary
      // The flow state machine validates completion, but UI adds extra safety check
      if (roundSummary) {
        const hasMessageIds = roundSummary.participantMessageIds && roundSummary.participantMessageIds.length > 0;

        // For pending summaries with messageIds, verify all messages are complete (have finishReason)
        let allMessagesComplete = true;
        if (roundSummary.status === MessageStatuses.PENDING && hasMessageIds && roundMessages) {
          const messageIds = new Set(roundSummary.participantMessageIds);
          const referencedMessages = roundMessages.filter(m => messageIds.has(m.id));
          allMessagesComplete = referencedMessages.length > 0
            && referencedMessages.every((m) => {
              const meta = m.metadata as Record<string, unknown> | undefined;
              return meta?.finishReason != null;
            });
        }

        // Show summary when:
        // 1. Non-pending status (streaming/complete/failed) - always show
        // 2. Pending status WITH messageIds AND all messages complete
        // Don't show: Pending with no messageIds OR referenced messages still streaming
        const shouldShowSummary
          = roundSummary.status !== MessageStatuses.PENDING
            || (hasMessageIds && allMessagesComplete);

        if (shouldShowSummary) {
          timeline.push({
            type: 'summary',
            data: roundSummary,
            key: `round-${roundNumber}-summary`,
            roundNumber,
          });
        }
      }
    });

    return timeline;
  }, [messages, summaries, changelog, preSearches]);
}
