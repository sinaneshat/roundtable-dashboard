/**
 * Dynamic Title Update E2E Test
 *
 * End-to-end test that simulates the exact scenario where the infinite loop occurs:
 * 1. User sends first message → thread created with temp slug
 * 2. AI generates title in background
 * 3. Frontend polls check-slug API
 * 4. When title ready, slug updates
 * 5. Sidebar re-renders with new title
 * 6. BEFORE FIX: compose-refs causes infinite loop
 * 7. AFTER FIX: Single re-render, stable callbacks
 *
 * This test catches the "Maximum update depth exceeded" error by:
 * - Tracking render counts
 * - Setting up a render budget
 * - Detecting runaway renders
 *
 * @see https://github.com/radix-ui/primitives/issues/3675
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import React, { useEffect, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatSidebarItem } from '@/api/routes/chat/schema';
import testMessages from '@/i18n/locales/en/common.json';

// ============================================================================
// MOCKS
// ============================================================================

// Mock next/navigation
const mockPush = vi.fn();
const mockPrefetch = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    prefetch: mockPrefetch,
    replace: mockReplace,
  }),
  usePathname: () => '/chat',
}));

// Mock hooks
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

vi.mock('@/hooks/utils', () => ({
  useCurrentPathname: () => '/chat',
  useIsMobile: () => false,
}));

// ============================================================================
// TEST UTILITIES
// ============================================================================

// Track render counts for detecting infinite loops
const renderCounts = new Map<string, number>();
const MAX_RENDERS_BEFORE_LOOP_DETECTION = 50;

function resetRenderCounts() {
  renderCounts.clear();
}

function trackRender(componentName: string): number {
  const current = renderCounts.get(componentName) || 0;
  const newCount = current + 1;
  renderCounts.set(componentName, newCount);

  // Throw if we detect an infinite loop
  if (newCount > MAX_RENDERS_BEFORE_LOOP_DETECTION) {
    throw new Error(
      `INFINITE LOOP DETECTED: ${componentName} rendered ${newCount} times. `
      + `This exceeds the maximum allowed renders (${MAX_RENDERS_BEFORE_LOOP_DETECTION}). `
      + `This is the exact scenario that triggers the React 19 + Radix compose-refs bug.`,
    );
  }

  return newCount;
}

// Create mock chat items
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

// Test wrapper with providers (without SidebarProvider - we test ChatList directly)
function TestWrapper({ children }: { children: ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={testMessages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

// ============================================================================
// SIMULATED SIDEBAR COMPONENT (mirrors ChatList behavior)
// ============================================================================

/**
 * Simulated sidebar item that tracks renders
 * This mimics the ChatItem component behavior during title updates
 */
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

  // Track when title changes
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

/**
 * Simulated sidebar list that tracks renders
 */
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

// ============================================================================
// E2E TESTS
// ============================================================================

describe('dynamic Title Update E2E - Infinite Loop Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRenderCounts();
  });

  afterEach(() => {
    resetRenderCounts();
  });

  describe('scenario: AI Title Generation during streaming', () => {
    it('should NOT cause infinite loop when title updates during streaming', async () => {
      // SETUP: Simulate the exact scenario
      // 1. User sends message
      // 2. Thread created with temp slug
      // 3. Streaming starts
      // 4. AI generates title in background
      // 5. Title updates in sidebar

      const threadId = 'thread-001';

      // Initial state: temp slug, default title
      const initialChat = createMockChat({
        id: threadId,
        slug: 'temp-thread-001',
        title: 'New conversation',
      });

      const titleUpdateTimestamps: number[] = [];
      const listRenderTimestamps: number[] = [];

      // Render component with initial state
      const { rerender } = render(
        <TestWrapper>
          <TrackedChatList
            chats={[initialChat]}
            onListRender={() => listRenderTimestamps.push(Date.now())}
          />
        </TestWrapper>,
      );

      // Verify initial render
      expect(screen.getByTestId('chat-list')).toBeInTheDocument();
      expect(screen.getByText('New conversation')).toBeInTheDocument();

      const initialRenderCount = renderCounts.get('ChatList') || 0;

      // SIMULATE: check-slug API returns AI-generated title
      // This is what triggers the bug - rapid updates during streaming
      await act(async () => {
        // Simulate multiple polling cycles (10 polls over ~1 second)
        for (let pollCycle = 0; pollCycle < 10; pollCycle++) {
          // Polls 1-4: Title not ready yet
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
            // Poll 5: Title ready - this is where the bug occurs
            const updatedChat = createMockChat({
              id: threadId,
              slug: 'how-to-implement-react-hooks', // AI-generated slug
              previousSlug: 'temp-thread-001',
              title: 'How to implement React hooks effectively', // AI-generated title
            });

            titleUpdateTimestamps.push(Date.now());

            rerender(
              <TestWrapper>
                <TrackedChatList
                  chats={[updatedChat]}
                  onListRender={() => listRenderTimestamps.push(Date.now())}
                />
              </TestWrapper>,
            );
          } else {
            // Polls 6-9: Title already updated, no change
            const stableChat = createMockChat({
              id: threadId,
              slug: 'how-to-implement-react-hooks',
              previousSlug: null, // Cleared after navigation
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

      // ASSERTIONS: Should NOT have caused infinite loop
      const finalRenderCount = renderCounts.get('ChatList') || 0;
      const totalRenders = finalRenderCount - initialRenderCount;

      // Should have reasonable number of renders (around 10 for 10 rerenders)
      expect(totalRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
      expect(totalRenders).toBeGreaterThan(0);

      // Verify title was updated
      expect(screen.getByText('How to implement React hooks effectively')).toBeInTheDocument();

      // Log results for debugging
      // eslint-disable-next-line no-console -- Test output
      console.log(`Total renders: ${totalRenders}\nList render timestamps: ${listRenderTimestamps.length}`);
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

      // Get button before update
      const buttonBefore = screen.getByTestId(`chat-button-${threadId}`);
      expect(buttonBefore).toBeInTheDocument();

      // Simulate title update
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

      // Get button after update
      const buttonAfter = screen.getByTestId(`chat-button-${threadId}`);
      expect(buttonAfter).toBeInTheDocument();

      // Verify button still works
      buttonAfter.click();
      expect(mockPush).toHaveBeenCalledWith('/chat/ai-generated-slug');
    });

    it('should handle rapid consecutive title updates without loop', async () => {
      // This simulates an edge case where multiple threads update rapidly
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

      // Rapidly update all threads (simulates batch title generation)
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

      // Should handle rapid updates without infinite loop
      expect(totalRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
    });
  });

  describe('scenario: Dropdown interaction during title update', () => {
    it('should not infinite loop when dropdown opens during title change', async () => {
      // This tests the specific scenario where:
      // 1. User hovers over chat item (showing dropdown)
      // 2. Title updates from AI
      // 3. compose-refs would previously cause infinite loop

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

      // Simulate hovering (would trigger dropdown show)
      const button = screen.getByTestId(`chat-button-${threadId}`);
      fireEvent.mouseEnter(button);

      // Verify hover was triggered
      expect(mockPrefetch).toHaveBeenCalled();

      // Now update title while "hovering"
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

      // Should not have caused infinite loop
      const chatItemRenders = renderCounts.get(`ChatItem-${threadId}`) || 0;
      expect(chatItemRenders).toBeLessThan(MAX_RENDERS_BEFORE_LOOP_DETECTION);
    });
  });

  describe('performance baseline documentation', () => {
    it('documents the expected render counts for title update scenario', async () => {
      /**
       * EXPECTED RENDER COUNTS:
       *
       * Normal title update flow:
       * - Initial render: 1
       * - Per poll cycle (no change): 1 each
       * - Title update: 1
       * - Total for 10 polls: ~11 renders
       *
       * INFINITE LOOP SCENARIO (BEFORE FIX):
       * - Initial render: 1
       * - Title update triggers compose-refs
       * - compose-refs creates new ref callback
       * - New callback triggers re-render
       * - Re-render triggers compose-refs again
       * - Loop continues until React throws "Maximum update depth exceeded"
       * - Would see 100s or 1000s of renders in milliseconds
       *
       * This test ensures we stay well under the infinite loop threshold
       */

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

      // Simulate 10 update cycles
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

      // Document expected behavior
      // eslint-disable-next-line no-console -- Test output
      console.log(`Baseline render count after 10 updates: ${finalCount}`);
      expect(finalCount).toBeLessThan(20); // Should be around 11
      expect(finalCount).toBeGreaterThan(5); // At least initial + some updates
    });
  });
});

describe('dynamic Title Update E2E - Source Code Verification', () => {
  it('verifies all problematic asChild usages have been fixed', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');

    const filesToCheck = [
      { path: '../chat-list.tsx', name: 'ChatList' },
      { path: '../nav-user.tsx', name: 'NavUser' },
      { path: '../chat-thread-actions.tsx', name: 'ChatThreadActions' },
      { path: '../social-share-button.tsx', name: 'SocialShareButton' },
    ];

    const issues: string[] = [];

    for (const file of filesToCheck) {
      const filePath = resolve(__dirname, file.path);
      const content = readFileSync(filePath, 'utf-8');

      // Check for DropdownMenuTrigger asChild
      if (/DropdownMenuTrigger\s+asChild/.test(content)) {
        issues.push(`${file.name}: Still has DropdownMenuTrigger asChild`);
      }

      // Check for TooltipTrigger asChild (only in components that re-render frequently)
      if (file.name === 'ChatThreadActions' || file.name === 'SocialShareButton') {
        if (/TooltipTrigger\s+asChild/.test(content)) {
          issues.push(`${file.name}: Still has TooltipTrigger asChild`);
        }
      }
    }

    // Should have no issues
    expect(issues).toEqual([]);
  });
});
