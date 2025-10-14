/**
 * Changelog Display Helpers
 *
 * ✅ UI-ONLY UTILITIES: Changelog grouping and sorting logic
 * ✅ IMPORTS FROM API: All types come from @/api/routes/chat/schema
 */

import type {
  ChangeAction,
  ChangeGroup,
  ChatThreadChangelog,
  GroupedChange,
} from '@/api/routes/chat/schema';

/**
 * Categorize a change type into an action (added, modified, removed)
 */
export function categorizeChangeAction(changeType: ChatThreadChangelog['changeType']): ChangeAction {
  switch (changeType) {
    case 'participant_added':
      return 'added';
    case 'participant_removed':
      return 'removed';
    case 'participant_updated':
    case 'participants_reordered':
    case 'mode_change':
      return 'modified';
    default:
      return 'modified';
  }
}

/**
 * Group changelog entries that occurred within the same time window
 *
 * Changes within 2 seconds of each other are grouped together.
 * This handles cases where multiple configuration changes happen
 * as part of a single user action.
 *
 * @param changelog - List of changelog entries
 * @param timeWindowMs - Time window in milliseconds (default: 2000ms)
 * @returns Grouped changelog entries
 */
export function groupChangelogByTime(
  changelog: ChatThreadChangelog[],
  timeWindowMs: number = 2000,
): ChangeGroup[] {
  if (changelog.length === 0) {
    return [];
  }

  // Sort by timestamp (newest first, matching the display order)
  const sorted = [...changelog].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groups: ChangeGroup[] = [];
  let currentGroup: ChangeGroup | null = null;

  for (const change of sorted) {
    const timestamp = new Date(change.createdAt);

    // Start a new group if:
    // 1. No current group exists
    // 2. This change is outside the time window of the current group
    if (
      !currentGroup
      || Math.abs(timestamp.getTime() - currentGroup.timestamp.getTime()) > timeWindowMs
    ) {
      currentGroup = {
        timestamp,
        changes: [],
      };
      groups.push(currentGroup);
    }

    // Add this change to the current group with its action category
    currentGroup.changes.push({
      id: change.id,
      action: categorizeChangeAction(change.changeType),
      change,
    });
  }

  return groups;
}

/**
 * Sort changes within a group by action type
 * Order: added -> modified -> removed
 */
export function sortChangesByAction(changes: GroupedChange[]): GroupedChange[] {
  const actionOrder: Record<ChangeAction, number> = {
    added: 1,
    modified: 2,
    removed: 3,
  };

  return [...changes].sort((a, b) => actionOrder[a.action] - actionOrder[b.action]);
}
