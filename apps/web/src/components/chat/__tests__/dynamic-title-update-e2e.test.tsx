import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import React, { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import testMessages from '@/i18n/locales/en/common.json';
import { I18nProvider } from '@/lib/i18n';
import { act, render, screen } from '@/lib/testing';
import type { ChatSidebarItem } from '@/services/api';

const mockPush = vi.fn();
const mockPrefetch = vi.fn();
const _mockReplace = vi.fn();

// Note: mockPush/mockPrefetch/mockReplace are used directly in test components
// No router mock needed - test components use these mocks directly for navigation simulation

vi.mock('@/hooks/mutations', () => ({
  useToggleFavoriteMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useTogglePublicMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateThreadMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/hooks/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...actual,
    useCurrentPathname: () => '/chat',
    useIsMobile: () => false,
  };
});

const renderCounts = new Map<string, number>();
const MAX_RENDERS_BEFORE_LOOP_DETECTION = 50;

function resetRenderCounts() {
  renderCounts.clear();
}

function trackRender(componentName: string): number {
  const current = renderCounts.get(componentName) || 0;
  const newCount = current + 1;
  renderCounts.set(componentName, newCount);

  if (newCount > MAX_RENDERS_BEFORE_LOOP_DETECTION) {
    throw new Error(
      `INFINITE LOOP DETECTED: ${componentName} rendered ${newCount} times. `
      + `This exceeds the maximum allowed renders (${MAX_RENDERS_BEFORE_LOOP_DETECTION}).`,
    );
  }

  return newCount;
}

function createMockChat(overrides: Partial<ChatSidebarItem> = {}): ChatSidebarItem {
  return {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'New conversation',
    slug: 'temp-thread-abc123',
    previousSlug: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    isFavorite: false,
    isPublic: false,
    ...overrides,
  };
}

function TestWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale="en" messages={testMessages} timeZone="UTC">
        {children}
      </I18nProvider>
    </QueryClientProvider>
  );
}

function TrackedChatItem({
  chat,
  onTitleUpdate,
}: {
  chat: ChatSidebarItem;
  onTitleUpdate?: () => void;
}) {
  const renderCount = trackRender(`ChatItem-${chat.id}`);
  const slugRef = useRef(chat.slug);
  slugRef.current = chat.slug;
  const prevTitleRef = useRef(chat.title);
  useEffect(() => {
    if (prevTitleRef.current !== chat.title) {
      prevTitleRef.current = chat.title;
      onTitleUpdate?.();
    }
  }, [chat.title, onTitleUpdate]);

  return (
    <div
      data-testid={`chat-item-${chat.id}`}
      data-render-count={renderCount}
      data-slug={chat.slug}
    >
      <button
        type="button"
        data-testid={`chat-button-${chat.id}`}
        onClick={() => mockPush(`/chat/${slugRef.current}`)}
        onMouseEnter={() => mockPrefetch(`/chat/${slugRef.current}`)}
      >
        {chat.title}
      </button>
    </div>
  );
}

function TrackedChatList({
  chats,
  onListRender,
}: {
  chats: ChatSidebarItem[];
  onListRender?: () => void;
}) {
  const renderCount = trackRender('ChatList');

  useEffect(() => {
    onListRender?.();
  });

  return (
    <div data-testid="chat-list" data-render-count={renderCount}>
      {chats.map(chat => (
        <TrackedChatItem key={chat.id} chat={chat} />
      ))}
    </div>
  );
}

describe('dynamic Title Update E2E - Infinite Loop Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRenderCounts();
  });

  afterEach(() => {
    resetRenderCounts();
  });

  describe('scenario: AI Title Generation During Streaming', () => {
    it('should NOT cause infinite loop when title updates during streaming', async () => {
      const threadId = 'thread-001';
      const initialChat = createMockChat({
        id: threadId,
        slug: 'temp-thread-001',
        title: 'New conversation',
      });

      const listRenderTimestamps: number[] = [];
      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList
            chats={[initialChat]}
            onListRender={() => listRenderTimestamps.push(Date.now())}
          />
        </TestWrapper>,
      );

      expect(screen.getByTestId('chat-list')).toBeInTheDocument();
      expect(screen.getByText('New conversation')).toBeInTheDocument();

      const initialRenderCount = renderCounts.get('ChatList') || 0;
      await act(async () => {
        for (let pollCycle = 0; pollCycle < 10; pollCycle++) {
          if (pollCycle < 5) {
            rerender(
              <TestWrapper>
                <TrackedChatList
                  chats={[{ ...initialChat }]}
                  onListRender={() => listRenderTimestamps.push(Date.now())}
                />
              </TestWrapper>,
            );
          } else if (pollCycle === 5) {
            const updatedChat = createMockChat({
              id: threadId,
              slug: 'how-to-implement-react-hooks',
              previousSlug: 'temp-thread-001',
              title: 'How to implement React hooks effectively',
            });

            rerender(
              <TestWrapper>
                <TrackedChatList
                  chats={[updatedChat]}
                  onListRender={() => listRenderTimestamps.push(Date.now())}
                />
              </TestWrapper>,
            );
          } else {
            const stableChat = createMockChat({
              id: threadId,
              slug: 'how-to-implement-react-hooks',
              previousSlug: null,
              title: 'How to implement React hooks effectively',
            });

            rerender(
              <TestWrapper>
                <TrackedChatList
                  chats={[stableChat]}
                  onListRender={() => listRenderTimestamps.push(Date.now())}
                />
              </TestWrapper>,
            );
          }
        }
      });

      const finalRenderCount = renderCounts.get('ChatList') || 0;
      const totalRenders = finalRenderCount - initialRenderCount;

      expect(totalRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
      expect(totalRenders).toBeGreaterThan(0);
      expect(screen.getByText('How to implement React hooks effectively')).toBeInTheDocument();
    });

    it('should maintain stable button references across title updates', async () => {
      const threadId = 'thread-002';

      const initialChat = createMockChat({
        id: threadId,
        slug: 'temp-thread-002',
        title: 'New conversation',
      });

      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList chats={[initialChat]} />
        </TestWrapper>,
      );

      const buttonBefore = screen.getByTestId(`chat-button-${threadId}`);
      expect(buttonBefore).toBeInTheDocument();
      const updatedChat = createMockChat({
        id: threadId,
        slug: 'ai-generated-slug',
        previousSlug: 'temp-thread-002',
        title: 'AI Generated Title',
      });

      await act(async () => {
        rerender(
          <TestWrapper>
            <TrackedChatList chats={[updatedChat]} />
          </TestWrapper>,
        );
      });

      const buttonAfter = screen.getByTestId(`chat-button-${threadId}`);
      expect(buttonAfter).toBeInTheDocument();

      buttonAfter.click();
      expect(mockPush).toHaveBeenCalledWith('/chat/ai-generated-slug');
    });

    it('should handle rapid consecutive title updates without loop', async () => {
      const threads = [
        createMockChat({ id: 'thread-a', slug: 'temp-a', title: 'Thread A' }),
        createMockChat({ id: 'thread-b', slug: 'temp-b', title: 'Thread B' }),
        createMockChat({ id: 'thread-c', slug: 'temp-c', title: 'Thread C' }),
      ];

      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList chats={threads} />
        </TestWrapper>,
      );

      const initialRenderCount = renderCounts.get('ChatList') || 0;

      await act(async () => {
        for (let i = 0; i < 5; i++) {
          const updatedThreads = threads.map((t, idx) => ({
            ...t,
            slug: i >= 3 ? `ai-slug-${idx}` : t.slug,
            title: i >= 3 ? `AI Title ${idx}` : t.title,
            previousSlug: i === 3 ? t.slug : null,
          }));

          rerender(
            <TestWrapper>
              <TrackedChatList chats={updatedThreads} />
            </TestWrapper>,
          );
        }
      });

      const finalRenderCount = renderCounts.get('ChatList') || 0;
      const totalRenders = finalRenderCount - initialRenderCount;

      expect(totalRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
    });
  });

  describe('scenario: Dropdown Interaction During Title Update', () => {
    it('should not infinite loop when dropdown opens during title change', async () => {
      const threadId = 'thread-dropdown';

      const initialChat = createMockChat({
        id: threadId,
        slug: 'temp-dropdown',
        title: 'Untitled',
      });

      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList chats={[initialChat]} />
        </TestWrapper>,
      );

      const button = screen.getByTestId(`chat-button-${threadId}`);
      await userEvent.hover(button);

      expect(mockPrefetch).toHaveBeenCalled();
      await act(async () => {
        const updatedChat = createMockChat({
          id: threadId,
          slug: 'ai-dropdown-test',
          previousSlug: 'temp-dropdown',
          title: 'AI Generated During Hover',
        });

        rerender(
          <TestWrapper>
            <TrackedChatList chats={[updatedChat]} />
          </TestWrapper>,
        );
      });

      const chatItemRenders = renderCounts.get(`ChatItem-${threadId}`) || 0;
      expect(chatItemRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
    });
  });

  describe('performance Baseline Documentation', () => {
    it('documents the expected render counts for title update scenario', async () => {
      const thread = createMockChat({
        id: 'baseline-test',
        slug: 'temp-baseline',
        title: 'Baseline Test',
      });

      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList chats={[thread]} />
        </TestWrapper>,
      );

      for (let i = 0; i < 10; i++) {
        await act(async () => {
          rerender(
            <TestWrapper>
              <TrackedChatList
                chats={[{
                  ...thread,
                  title: i >= 5 ? 'AI Title' : 'Baseline Test',
                  slug: i >= 5 ? 'ai-slug' : 'temp-baseline',
                }]}
              />
            </TestWrapper>,
          );
        });
      }

      const finalCount = renderCounts.get('ChatList') || 0;

      expect(finalCount).toBeLessThan(20);
      expect(finalCount).toBeGreaterThan(5);
    });
  });
});

describe('dynamic Title Update E2E - Source Code Verification', () => {
  it('verifies navigation patterns are stable across files', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const filesToCheck = [
      { path: '../chat-list.tsx', name: 'ChatList' },
      { path: '../nav-user.tsx', name: 'NavUser' },
      { path: '../chat-thread-actions.tsx', name: 'ChatThreadActions' },
      { path: '../social-share-button.tsx', name: 'SocialShareButton' },
    ];

    const findings: string[] = [];

    for (const file of filesToCheck) {
      const filePath = resolve(__dirname, file.path);
      const content = readFileSync(filePath, 'utf-8');

      if (file.name === 'ChatList') {
        if (!/Link\s+to=/.test(content)) {
          findings.push(`${file.name}: Should use Link component for navigation`);
        }
        if (!/SidebarMenuAction/.test(content)) {
          findings.push(`${file.name}: Should use SidebarMenuAction for menu triggers`);
        }
      }

      if (file.name === 'NavUser') {
        if (/DropdownMenuTrigger\s+asChild/.test(content)) {
          findings.push(`${file.name}: Should not have DropdownMenuTrigger asChild`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
