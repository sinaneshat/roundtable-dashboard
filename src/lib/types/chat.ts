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
 */
export function groupChatsByPeriod(chats: Chat[]): ChatGroup[] {
  const now = Date.now();
  const today: Chat[] = [];
  const yesterday: Chat[] = [];
  const previous7Days: Chat[] = [];
  const previous30Days: Chat[] = [];
  const older: Chat[] = [];

  chats.forEach((chat) => {
    const chatTime = chat.createdAt.getTime();
    const diffMs = now - chatTime;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 1) {
      today.push(chat);
    } else if (diffDays < 2) {
      yesterday.push(chat);
    } else if (diffDays < 7) {
      previous7Days.push(chat);
    } else if (diffDays < 30) {
      previous30Days.push(chat);
    } else {
      older.push(chat);
    }
  });

  return [
    { label: 'chat.today', chats: today },
    { label: 'chat.yesterday', chats: yesterday },
    { label: 'chat.previous7Days', chats: previous7Days },
    { label: 'chat.previous30Days', chats: previous30Days },
    { label: 'chat.older', chats: older },
  ].filter(group => group.chats.length > 0);
}
