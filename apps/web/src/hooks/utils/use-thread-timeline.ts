import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import { getParticipantIndex, getRoundNumberFromMetadata, isModeratorMessage } from '@/lib/utils';
import type { ApiChangelog, StoredPreSearch } from '@/services/api';

/**
 * Timeline Item Types
 * Discriminated union for type-safe timeline rendering
 *
 * ARCHITECTURE:
 * - 'messages': All messages for a round (user, participants, moderator)
 *   Moderator messages (isModerator: true) are sorted LAST after all participants
 * - 'changelog': Configuration changes that occurred before round started
 * - 'pre-search': Web search phase indicator (orphaned rounds only)
 */
export type TimelineItem
  = | {
    type: 'messages';
    data: UIMessage[];
    key: string;
    roundNumber: number;
  }
  | {
    type: 'changelog';
    data: ApiChangelog[];
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
   * Includes ALL message types: user, participants, and moderator
   * Moderator messages (isModerator: true) are sorted LAST in each round
   */
  messages: UIMessage[];

  /**
   * Changelog items to group by round
   * Accepts both Date and string for createdAt to match API JSON responses
   */
  changelog: ApiChangelog[];

  /**
   * Pre-searches to include in timeline
   * Required for rendering pre-search cards when user message
   * hasn't been persisted yet (e.g., page refresh during web search phase)
   */
  preSearches?: StoredPreSearch[];
};

/**
 * useThreadTimeline - Unified Timeline Grouping Hook
 *
 * Single source of truth for grouping messages, changelog, and pre-searches by round number.
 *
 * ARCHITECTURE:
 * - Messages array includes ALL messages: user, participants, AND moderator
 * - Moderator messages (isModerator: true) are sorted LAST after all participants
 * - Moderator renders inline via ChatMessageList, just like participants
 *
 * FLOW:
 * 1. Group messages by round number (from metadata)
 * 2. Sort messages: user first, then participants by index, then moderator LAST
 * 3. Group changelog by round number
 * 4. Index pre-searches by round number
 * 5. For each round, assemble timeline items in order:
 *    a. Changelog (configuration changes before messages)
 *    b. Pre-search (orphaned rounds only - otherwise rendered by ChatMessageList)
 *    c. Messages (user + participants + moderator, with moderator LAST)
 *
 * @example
 * ```tsx
 * const timeline = useThreadTimeline({
 *   messages,      // Includes moderator messages (isModerator: true)
 *   changelog,
 *   preSearches,
 * });
 *
 * return timeline.map((item) => {
 *   if (item.type === 'messages') {
 *     // Renders ALL messages including moderator (sorted LAST)
 *     return <ChatMessageList messages={item.data} />;
 *   }
 *   if (item.type === 'changelog') return <ChangelogGroup changes={item.data} />;
 *   if (item.type === 'pre-search') return <PreSearchCard data={item.data} />;
 * });
 * ```
 */
export function useThreadTimeline({
  messages,
  changelog,
  preSearches = [],
}: UseThreadTimelineOptions): TimelineItem[] {
  return useMemo(() => {
    // STEP 1: Group messages by round number
    // Includes ALL messages: user, participants, and moderator
    const messagesByRound = new Map<number, UIMessage[]>();
    messages.forEach((message) => {
      const roundNumber = getRoundNumberFromMetadata(message.metadata, 0);

      if (!messagesByRound.has(roundNumber)) {
        messagesByRound.set(roundNumber, []);
      }
      const roundMessages = messagesByRound.get(roundNumber);
      if (roundMessages) {
        roundMessages.push(message);
      }
    });

    // STEP 2: Sort messages within each round
    // Order: user → participants (by index) → moderator LAST
    // This ensures consistent ordering regardless of message arrival order
    messagesByRound.forEach((roundMessages, _roundNumber) => {
      roundMessages.sort((a, b) => {
        // User messages come first
        if (a.role === MessageRoles.USER && b.role !== MessageRoles.USER)
          return -1;
        if (a.role !== MessageRoles.USER && b.role === MessageRoles.USER)
          return 1;

        // For assistant messages, sort by participantIndex
        // Moderator (isModerator: true, no participantIndex) comes LAST
        if (a.role === MessageRoles.ASSISTANT && b.role === MessageRoles.ASSISTANT) {
          const aIsModerator = isModeratorMessage(a);
          const bIsModerator = isModeratorMessage(b);

          // Moderator always comes after participants
          if (aIsModerator && !bIsModerator)
            return 1;
          if (!aIsModerator && bIsModerator)
            return -1;

          // Neither is moderator - sort by participantIndex
          const indexA = getParticipantIndex(a.metadata) ?? 0;
          const indexB = getParticipantIndex(b.metadata) ?? 0;
          return indexA - indexB;
        }

        return 0;
      });
    });

    // STEP 3: Group changelog by round number
    const changelogByRound = new Map<number, ApiChangelog[]>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber ?? 0;

      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }

      // Deduplicate changelog items by ID
      const roundChanges = changelogByRound.get(roundNumber);
      if (roundChanges) {
        const exists = roundChanges.some(existing => existing.id === change.id);
        if (!exists) {
          roundChanges.push(change);
        }
      }
    });

    // STEP 4: Index pre-searches by round number
    const preSearchByRound = new Map<number, StoredPreSearch>();
    preSearches.forEach((preSearch) => {
      preSearchByRound.set(preSearch.roundNumber, preSearch);
    });

    // STEP 5: Collect all unique round numbers from all sources
    // Include pre-search rounds to ensure they render even when user message hasn't been persisted yet
    const allRoundNumbers = new Set<number>([
      ...messagesByRound.keys(),
      ...changelogByRound.keys(),
      ...preSearchByRound.keys(),
    ]);

    // STEP 6: Build timeline items in chronological order
    const timeline: TimelineItem[] = [];
    const sortedRounds = Array.from(allRoundNumbers).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber);
      const roundChangelog = changelogByRound.get(roundNumber);
      const roundPreSearch = preSearchByRound.get(roundNumber);

      const hasMessages = roundMessages && roundMessages.length > 0;
      const hasPreSearch = !!roundPreSearch;
      const hasChangelog = roundChangelog && roundChangelog.length > 0;

      // Skip rounds that have nothing to show
      if (!hasMessages && !hasPreSearch && !hasChangelog) {
        return;
      }

      // Only show changelog when round is actually starting (has messages or pre-search)
      // Don't show changelog for "future" rounds where config changed but round hasn't started yet
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
      if (!hasMessages && !hasPreSearch) {
        return;
      }

      // Pre-search renders at timeline level ONLY for orphaned rounds (rounds without messages)
      // For normal rounds with messages, ChatMessageList renders PreSearchCard in correct position
      // (after user message, before assistant messages)
      //
      // Flow with messages: changelog → user message → pre-search → participants → moderator (via ChatMessageList)
      // Flow without messages (orphaned): changelog → pre-search (standalone timeline item)
      if (hasPreSearch && !hasMessages) {
        timeline.push({
          type: 'pre-search',
          data: roundPreSearch,
          key: `round-${roundNumber}-pre-search`,
          roundNumber,
        });
      }

      // Add messages for this round (if any)
      // Messages array includes: user → participants (by index) → moderator LAST
      // ChatMessageList handles rendering and pre-search card insertion
      if (hasMessages) {
        timeline.push({
          type: 'messages',
          data: roundMessages,
          key: `round-${roundNumber}-messages`,
          roundNumber,
        });
      }
    });

    return timeline;
  }, [messages, changelog, preSearches]);
}
