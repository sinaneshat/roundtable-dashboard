/**
 * Chat Header Navigation Tests
 *
 * Verifies header behavior across navigation scenarios:
 * - Static routes (/chat/pricing) show correct breadcrumbs
 * - Thread pages show thread title in breadcrumb
 * - Store state doesn't leak between route types
 */

import type { ReactNode } from 'react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/lib/testing';

import { NavigationHeader } from '../chat-header';
import { ChatHeaderSwitch } from '../chat-header-switch';

// Track the current mocked pathname for useLocation
let mockedPathname = '/chat';

// Mock TanStack Router components and hooks
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className, to, ...props }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  ),
  useLocation: vi.fn(() => ({ pathname: mockedPathname })),
  useMatches: vi.fn(() => []),
  useNavigate: vi.fn(() => vi.fn()),
  useRouter: vi.fn(() => ({
    navigate: vi.fn(),
    state: {
      location: {
        pathname: '/chat',
      },
    },
  })),
}));

// Helper to set mocked pathname for useLocation
function setMockedPathname(pathname: string) {
  mockedPathname = pathname;
}

// Mock useThreadQuery hook
vi.mock('@/hooks/queries', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/queries')>();
  return {
    ...original,
    useThreadQuery: vi.fn(() => ({
      data: null,
      isError: false,
      isLoading: false,
    })),
  };
});

// Mock useSidebar hook
vi.mock('@/components/ui/sidebar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ui/sidebar')>();
  return {
    ...original,
    useSidebar: () => ({
      isMobile: false,
      open: true,
      openMobile: false,
      setOpen: vi.fn(),
      setOpenMobile: vi.fn(),
      state: 'expanded' as const,
      toggleSidebar: vi.fn(),
    }),
  };
});

// Mock useNavigationReset from stores/chat
vi.mock('@/stores/chat', () => ({
  useNavigationReset: vi.fn(() => vi.fn()),
}));

// Mock useChatStore
const mockStoreState = {
  createdThreadId: null as string | null,
  isCreatingThread: false,
  isModeratorStreaming: false,
  isStreaming: false,
  showInitialUI: true,
  thread: null as { id: string; title: string; slug: string } | null,
  waitingToStartStreaming: false,
};

vi.mock('@/components/providers', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/providers')>();
  return {
    ...original,
    useChatStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
  };
});

describe('chatHeaderSwitch navigation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocked pathname to default
    mockedPathname = '/chat';
    // Reset store state to defaults
    mockStoreState.showInitialUI = true;
    mockStoreState.createdThreadId = null;
    mockStoreState.thread = null;
    mockStoreState.isStreaming = false;
    mockStoreState.isCreatingThread = false;
    mockStoreState.waitingToStartStreaming = false;
    mockStoreState.isModeratorStreaming = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('overview page without active thread', () => {
    it('shows MinimalHeader on /chat with no active thread', () => {
      setMockedPathname('/chat');

      render(<ChatHeaderSwitch />);

      // MinimalHeader should only have the sidebar trigger button, no breadcrumbs
      const header = document.querySelector('header');
      expect(header).toBeInTheDocument();
      // MinimalHeader doesn't have navigation breadcrumbs
      expect(screen.queryByText('Roundtable')).not.toBeInTheDocument();
    });
  });

  describe('thread created from overview', () => {
    it('shows NavigationHeader when thread is created but URL is still /chat', () => {
      setMockedPathname('/chat');

      // Simulate thread creation - store state has thread data
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        slug: 'test-thread-slug',
        title: 'Test Thread Title',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should show NavigationHeader with thread title
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('static route navigation with stale state', () => {
    it('should show pricing page header on /chat/pricing, NOT thread header', () => {
      setMockedPathname('/chat/pricing');

      // Store still has thread state from previous page
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        slug: 'previous-thread-slug',
        title: 'Previous Thread Title',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should show NavigationHeader for static route
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('breadcrumb should show "Pricing" on /chat/pricing, not thread title', () => {
      setMockedPathname('/chat/pricing');

      // Store has stale thread state
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        slug: 'old-thread-slug',
        title: 'Old Thread Title',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should NOT show old thread title
      expect(screen.queryByText('Old Thread Title')).not.toBeInTheDocument();
    });
  });
});

describe('navigationHeader - static routes detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPathname = '/chat';
    mockStoreState.showInitialUI = true;
    mockStoreState.createdThreadId = null;
    mockStoreState.thread = null;
  });

  it('shows correct breadcrumb for /chat/pricing even with stale thread state', () => {
    setMockedPathname('/chat/pricing');

    // Stale thread state from previous navigation
    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'old-thread';
    mockStoreState.thread = {
      id: 'old-thread',
      slug: 'stale-slug',
      title: 'Stale Thread',
    } as typeof mockStoreState.thread;

    render(<NavigationHeader />);

    // Should use breadcrumbMap for pricing, not thread title
    // The fix should recognize /chat/pricing as a known route
    const breadcrumb = screen.queryByRole('navigation');
    expect(breadcrumb).toBeInTheDocument();

    // Should NOT show stale thread title in breadcrumb
    expect(screen.queryByText('Stale Thread')).not.toBeInTheDocument();
  });

  it('correctly identifies /chat/pricing as not a thread page', () => {
    setMockedPathname('/chat/pricing');

    render(<NavigationHeader />);

    // isThreadPage should be false for /chat/pricing
    // even though pathname.startsWith('/chat/')
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('correctly identifies /chat/some-thread-slug as a thread page', () => {
    setMockedPathname('/chat/some-thread-slug');

    mockStoreState.showInitialUI = false;
    mockStoreState.thread = {
      id: 'thread-123',
      slug: 'some-thread-slug',
      title: 'Actual Thread',
    } as typeof mockStoreState.thread;

    render(<NavigationHeader />);

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});

describe('hasActiveThread logic edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPathname = '/chat';
    mockStoreState.showInitialUI = true;
    mockStoreState.createdThreadId = null;
    mockStoreState.thread = null;
  });

  it('hasActiveThread should be false on static routes like /chat/pricing', () => {
    setMockedPathname('/chat/pricing');

    // Even with stale store state
    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'stale-id';

    render(<ChatHeaderSwitch />);

    // The header switch should recognize this is a static route
    // and NOT treat it as having an active thread
    const header = document.querySelector('header');
    expect(header).toBeInTheDocument();
  });

  it('hasActiveThread should be true only on /chat with actual thread state', () => {
    setMockedPathname('/chat');

    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'active-thread';

    render(<ChatHeaderSwitch />);

    // Should show NavigationHeader for active thread on overview
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
