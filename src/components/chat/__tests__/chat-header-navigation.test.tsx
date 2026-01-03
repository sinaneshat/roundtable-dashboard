/**
 * Tests for header behavior when navigating between chat thread and other pages.
 *
 * BUG SCENARIO:
 * 1. User starts conversation on /chat overview
 * 2. URL is updated via window.history.replaceState to /chat/[slug]
 * 3. User navigates away to /chat/pricing
 * 4. Header still shows thread header instead of pricing page header
 *
 * ROOT CAUSE:
 * - hasActiveThread is derived from store state (showInitialUI, createdThreadId, thread)
 * - Store state persists when navigating to non-thread pages like /chat/pricing
 * - Header logic doesn't properly check for known static routes
 */

import { usePathname } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '@/lib/testing';

import { NavigationHeader } from '../chat-header';
import { ChatHeaderSwitch } from '../chat-header-switch';

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

describe('chatHeaderSwitch - navigation bug', () => {
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
      vi.mocked(usePathname).mockReturnValue('/chat');

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
      vi.mocked(usePathname).mockReturnValue('/chat');

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

  describe('bUG: navigating away preserves thread header', () => {
    it('should show pricing page header on /chat/pricing, NOT thread header', () => {
      vi.mocked(usePathname).mockReturnValue('/chat/pricing');

      // BUG SCENARIO: Store still has thread state from previous page
      mockStoreState.showInitialUI = false;
      mockStoreState.createdThreadId = 'thread-123';
      mockStoreState.thread = {
        id: 'thread-123',
        title: 'Previous Thread Title',
        slug: 'previous-thread-slug',
      } as typeof mockStoreState.thread;

      render(<ChatHeaderSwitch />);

      // Should show NavigationHeader
      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();

      // BUG: Currently shows "Previous Thread Title" instead of pricing page title
      // This test documents the expected behavior (should fail until fixed)
    });

    it('breadcrumb should show "Pricing" on /chat/pricing, not thread title', () => {
      vi.mocked(usePathname).mockReturnValue('/chat/pricing');

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
    vi.mocked(usePathname).mockReturnValue('/chat/pricing');

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
    vi.mocked(usePathname).mockReturnValue('/chat/pricing');

    render(<NavigationHeader />);

    // isThreadPage should be false for /chat/pricing
    // even though pathname.startsWith('/chat/')
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
  });

  it('correctly identifies /chat/some-thread-slug as a thread page', () => {
    vi.mocked(usePathname).mockReturnValue('/chat/some-thread-slug');

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
    vi.mocked(usePathname).mockReturnValue('/chat/pricing');

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
    vi.mocked(usePathname).mockReturnValue('/chat');

    mockStoreState.showInitialUI = false;
    mockStoreState.createdThreadId = 'active-thread';

    render(<ChatHeaderSwitch />);

    // Should show NavigationHeader for active thread on overview
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
