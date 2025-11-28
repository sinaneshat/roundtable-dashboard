import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ChatThreadChangelog, StoredModeratorAnalysis, StoredPreSearch } from '@/api/routes/chat/schema';
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
    type: 'analysis';
    data: StoredModeratorAnalysis;
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
   * Optional analyses to include in timeline
   * If not provided, only messages and changelog will be rendered
   */
  analyses?: StoredModeratorAnalysis[];

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
 * Single source of truth for grouping messages, analyses, and changelog by round number.
 * Handles both authenticated views (with analyses) and public views (without analyses).
 *
 * FLOW:
 * 1. Group messages by round number (from metadata)
 * 2. Group changelog by round number
 * 3. Get all unique round numbers
 * 4. For each round, assemble timeline items in order:
 *    a. Changelog (configuration changes before messages)
 *    b. Messages (user + assistant responses)
 *    c. Analysis (moderator analysis after messages, if available)
 *
 * @example
 * ```tsx
 * const timeline = useThreadTimeline({
 *   messages,
 *   analyses,  // Optional - omit for public views
 *   changelog,
 * });
 *
 * return timeline.map((item) => {
 *   if (item.type === 'messages') return <MessageList messages={item.data} />;
 *   if (item.type === 'analysis') return <AnalysisCard analysis={item.data} />;
 *   if (item.type === 'changelog') return <ChangelogGroup changes={item.data} />;
 * });
 * ```
 */
export function useThreadTimeline({
  messages,
  analyses = [],
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
      ...analyses.map(a => a.roundNumber),
      ...preSearchByRound.keys(),
    ]);

    // STEP 5: Build timeline items in chronological order
    const timeline: TimelineItem[] = [];
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundAnalysis = analyses.find(a => a.roundNumber === roundNumber);
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

      // Add changelog first (shows configuration changes before messages)
      if (hasChangelog) {
        timeline.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
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

      // Add analysis after messages (if exists and should be shown)
      // ✅ REVISED: Only filter out PENDING placeholder analyses (empty participantMessageIds)
      // STREAMING/COMPLETE/FAILED analyses should ALWAYS show for proper stream resumption
      // Placeholder states (PENDING + empty participantMessageIds) are handled by participant cards instead
      if (roundAnalysis) {
        const isPendingPlaceholder = roundAnalysis.status === AnalysisStatuses.PENDING
          && (!roundAnalysis.participantMessageIds || roundAnalysis.participantMessageIds.length === 0);

        // Show analysis if it's NOT a pending placeholder
        if (!isPendingPlaceholder) {
          timeline.push({
            type: 'analysis',
            data: roundAnalysis,
            key: `round-${roundNumber}-analysis`,
            roundNumber,
          });
        }
      }
    });

    return timeline;
  }, [messages, analyses, changelog, preSearches]);
}
