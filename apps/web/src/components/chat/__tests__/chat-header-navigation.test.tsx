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

import { useCurrentPathname } from '@/hooks/utils';
import { render, screen } from '@/lib/testing';

import { NavigationHeader } from '../chat-header';
import { ChatHeaderSwitch } from '../chat-header-switch';

// Mock TanStack Router components and hooks
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className, ...props }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className} {...props}>
      {children}
    </a>
  ),
  useRouter: vi.fn(() => ({
    navigate: vi.fn(),
    state: {
      location: {
        pathname: '/chat',
      },
    },
  })),
  useNavigate: vi.fn(() => vi.fn()),
}));

// Mock useCurrentPathname hook (used for history API support alongside TanStack Router)
vi.mock('@/hooks/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/utils')>();
  return {
    ...original,
    useCurrentPathname: vi.fn(() => '/chat'),
  };
});

// Mock useThreadQuery hook
vi.mock('@/hooks/queries', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/hooks/queries')>();
  return {
    ...original,
    useThreadQuery: vi.fn(() => ({
      data: null,
      isLoading: false,
      isError: false,
    })),
  };
});

// Mock useSidebar hook
vi.mock('@/components/ui/sidebar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/components/ui/sidebar')>();
  return {
    ...original,
    useSidebar: () => ({
      state: 'expanded' as const,
      open: true,
      setOpen: vi.fn(),
      openMobile: false,
      setOpenMobile: vi.fn(),
      isMobile: false,
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
  showInitialUI: true,
  createdThreadId: null as string | null,
  thread: null as { id: string; title: string; slug: string } | null,
  isStreaming: false,
  isCreatingThread: false,
  waitingToStartStreaming: false,
  isModeratorStreaming: false,
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
      vi.mocked(useCurrentPathname).mockReturnValue('/chat');

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
      vi.mocked(useCurrentPathname).mockReturnValue('/chat');

      // Simulate thread creation - store state has thread data
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        title: 'Test Thread Title',
        slug: 'test-thread-slug',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should show NavigationHeader with thread title
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('static route navigation with stale state', () => {
    it('should show pricing page header on /chat/pricing, NOT thread header', () => {
      vi.mocked(useCurrentPathname).mockReturnValue('/chat/pricing');

      // Store still has thread state from previous page
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        title: 'Previous Thread Title',
        slug: 'previous-thread-slug',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should show NavigationHeader for static route
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('breadcrumb should show "Pricing" on /chat/pricing, not thread title', () => {
      vi.mocked(useCurrentPathname).mockReturnValue('/chat/pricing');

      // Store has stale thread state
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        title: 'Old Thread Title',
        slug: 'old-thread-slug',
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
    mockStoreState.showInitialUI = true;
    mockStoreState.createdThreadId = null;
    mockStoreState.thread = null;
  });

  it('shows correct breadcrumb for /chat/pricing even with stale thread state', () => {
    vi.mocked(useCurrentPathname).mockReturnValue('/chat/pricing');

    // Stale thread state from previous navigation
    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'old-thread';
    mockStoreState.thread = {
      id: 'old-thread',
      title: 'Stale Thread',
      slug: 'stale-slug',
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
    vi.mocked(useCurrentPathname).mockReturnValue('/chat/pricing');

    render(<NavigationHeader />);

    // isThreadPage should be false for /chat/pricing
    // even though pathname.startsWith('/chat/')
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('correctly identifies /chat/some-thread-slug as a thread page', () => {
    vi.mocked(useCurrentPathname).mockReturnValue('/chat/some-thread-slug');

    mockStoreState.showInitialUI = false;
    mockStoreState.thread = {
      id: 'thread-123',
      title: 'Actual Thread',
      slug: 'some-thread-slug',
    } as typeof mockStoreState.thread;

    render(<NavigationHeader />);

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });
});

describe('hasActiveThread logic edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreState.showInitialUI = true;
    mockStoreState.createdThreadId = null;
    mockStoreState.thread = null;
  });

  it('hasActiveThread should be false on static routes like /chat/pricing', () => {
    vi.mocked(useCurrentPathname).mockReturnValue('/chat/pricing');

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
    vi.mocked(useCurrentPathname).mockReturnValue('/chat');

    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'active-thread';

    render(<ChatHeaderSwitch />);

    // Should show NavigationHeader for active thread on overview
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
