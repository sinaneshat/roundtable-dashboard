/**
 * Chat Sidebar Types
 *
 * Lightweight types for chat thread display in sidebar navigation
 */

/**
 * Simplified thread representation for sidebar display
 * Transformed from API thread list responses
 */
export type Chat = {
  id: string;
  title: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  messages: never[]; // Always empty in sidebar context - messages loaded separately
  isActive?: boolean;
  isFavorite?: boolean;
  isPublic?: boolean;
};

/**
 * Time-based grouping structure for sidebar organization
 */
export type ChatGroup = {
  label: string;
  chats: Chat[];
};

/**
 * Group chats by time periods for sidebar organization
 * Groups by: Today, Yesterday, X days ago, X weeks ago
 * Max grouping is weeks (no months/years)
 */
export function groupChatsByPeriod(chats: Chat[]): ChatGroup[] {
  const now = Date.now();
  const groups = new Map<string, Chat[]>();

  chats.forEach((chat) => {
    const chatTime = chat.updatedAt.getTime();
    const diffMs = now - chatTime;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let label: string;

    if (diffDays < 1) {
      label = 'chat.today';
    } else if (diffDays === 1) {
      label = 'chat.yesterday';
    } else if (diffDays < 7) {
      label = `chat.daysAgo:${diffDays}`;
    } else {
    // Intentionally empty
      const weeks = Math.floor(diffDays / 7);
      label = `chat.weeksAgo:${weeks}`;
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(chat);
  });

  return Array.from(groups.entries()).map(([label, chats]) => ({
    label,
    chats,
  }));
}
