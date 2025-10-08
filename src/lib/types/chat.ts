// Chat-related types for the LLM chat application interface

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export type Chat = {
  id: string;
  title: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  messages: ChatMessage[];
  isActive?: boolean;
  isFavorite?: boolean;
  isPublic?: boolean;
};

export type ChatGroup = {
  label: string;
  chats: Chat[];
};

// Mock data for development
export const mockChats: Chat[] = [
  {
    id: '1',
    title: 'Building a Next.js App',
    slug: 'building-a-nextjs-app',
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 30),
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'How do I build a Next.js app?',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
      },
    ],
    isActive: false,
    isFavorite: true,
  },
  {
    id: '2',
    title: 'React Hooks Guide',
    slug: 'react-hooks-guide',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    messages: [],
    isActive: false,
    isFavorite: false,
  },
  {
    id: '3',
    title: 'TypeScript Best Practices',
    slug: 'typescript-best-practices',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    messages: [],
    isActive: false,
    isFavorite: true,
  },
  {
    id: '4',
    title: 'Database Schema Design',
    slug: 'database-schema-design',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    messages: [],
    isActive: false,
  },
  {
    id: '5',
    title: 'API Integration Tips',
    slug: 'api-integration-tips',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    messages: [],
    isActive: false,
  },
  {
    id: '6',
    title: 'CSS Layout Techniques',
    slug: 'css-layout-techniques',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // 3 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    messages: [],
    isActive: false,
  },
  {
    id: '7',
    title: 'Authentication Strategies',
    slug: 'authentication-strategies',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7), // 7 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    messages: [],
    isActive: false,
  },
  {
    id: '8',
    title: 'Performance Optimization',
    slug: 'performance-optimization',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14), // 14 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14),
    messages: [],
    isActive: false,
  },
  {
    id: '9',
    title: 'Docker Deployment Guide',
    slug: 'docker-deployment-guide',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25), // 25 days ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25),
    messages: [],
    isActive: false,
  },
];

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
