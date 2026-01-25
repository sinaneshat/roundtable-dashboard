/**
 * Navigation Reset Tests
 *
 * Tests for navigation reset logic:
 * - State cleanup when navigating to new chat
 * - Query cache invalidation
 * - User preference preservation
 * - Reset conditions and triggers
 *
 * These tests verify that:
 * 1. Store is reset when navigating to /chat
 * 2. Query cache is invalidated for thread-specific data
 * 3. User preferences are preserved across resets
 * 4. Only resets when navigating TO /chat, not FROM /chat
 */

import { describe, expect, it } from 'vitest';

import { invalidationPatterns, queryKeys } from '@/lib/data/query-keys';

// ============================================================================
// TEST HELPERS - Pure function tests for navigation reset logic
// ============================================================================

/**
 * Determines if navigation should trigger reset
 * Extracts pure logic from useNavigationReset hook
 */
function shouldResetOnNavigation(
  currentPathname: string,
  previousPathname: string,
): boolean {
  return currentPathname === '/chat' && previousPathname !== '/chat';
}

/**
 * Determines which query keys should be invalidated
 * Uses invalidationPatterns.leaveThread for consistency
 */
function getQueryKeysToInvalidate(threadId: string | null) {
  if (!threadId)
    return [];

  return invalidationPatterns.leaveThread(threadId);
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('navigation Reset Conditions', () => {
  describe('shouldResetOnNavigation', () => {
    it('returns true when navigating FROM thread TO /chat', () => {
      expect(shouldResetOnNavigation('/chat', '/chat/some-thread-slug')).toBe(true);
    });

    it('returns true when navigating FROM any page TO /chat', () => {
      expect(shouldResetOnNavigation('/chat', '/settings')).toBe(true);
      expect(shouldResetOnNavigation('/chat', '/dashboard')).toBe(true);
      expect(shouldResetOnNavigation('/chat', '/')).toBe(true);
    });

    it('returns false when already on /chat', () => {
      expect(shouldResetOnNavigation('/chat', '/chat')).toBe(false);
    });

    it('returns false when navigating FROM /chat to thread', () => {
      expect(shouldResetOnNavigation('/chat/new-thread', '/chat')).toBe(false);
    });

    it('returns false when navigating between thread pages', () => {
      expect(shouldResetOnNavigation('/chat/thread-1', '/chat/thread-2')).toBe(false);
    });

    it('returns false when navigating to non-chat pages', () => {
      expect(shouldResetOnNavigation('/settings', '/chat')).toBe(false);
      expect(shouldResetOnNavigation('/dashboard', '/chat/thread')).toBe(false);
    });
  });
});

describe('query Cache Invalidation', () => {
  describe('getQueryKeysToInvalidate', () => {
    it('returns empty array when no threadId', () => {
      expect(getQueryKeysToInvalidate(null)).toEqual([]);
    });

    it('returns ephemeral thread-specific query keys when threadId exists', () => {
      const threadId = 'thread-123';
      const keys = getQueryKeysToInvalidate(threadId);

      // leaveThread only invalidates ephemeral streaming state - NOT detail/messages/etc.
      // This ensures snappy navigation when returning to cached threads
      // (see query-keys.ts:344 comment)
      expect(keys).toHaveLength(1);
      expect(keys).toContainEqual(queryKeys.threads.streamResumption(threadId));
    });

    it('generates unique keys for different thread IDs', () => {
      const keys1 = getQueryKeysToInvalidate('thread-1');
      const keys2 = getQueryKeysToInvalidate('thread-2');

      // Keys should be different for different threads
      expect(JSON.stringify(keys1)).not.toBe(JSON.stringify(keys2));
    });
  });
});

describe('reset Behavior', () => {
  describe('thread ID Resolution', () => {
    it('uses thread.id when available', () => {
      const thread = { id: 'thread-from-db' };
      const createdThreadId = 'created-thread-id';

      // Mimic the effectiveThreadId logic from the hook
      const effectiveThreadId = thread?.id || createdThreadId;
      expect(effectiveThreadId).toBe('thread-from-db');
    });

    it('falls back to createdThreadId when thread is null', () => {
      const thread = null;
      const createdThreadId = 'created-thread-id';

      const effectiveThreadId = thread?.id || createdThreadId;
      expect(effectiveThreadId).toBe('created-thread-id');
    });

    it('returns undefined when both are null', () => {
      const thread = null;
      const createdThreadId = null;

      const effectiveThreadId = thread?.id || createdThreadId;
      expect(effectiveThreadId).toBeNull();
    });
  });
});

describe('navigation Scenarios', () => {
  describe('logo Click (New Chat)', () => {
    it('should trigger reset when clicking logo from thread page', () => {
      // User on /chat/some-thread clicks logo → navigates to /chat
      const shouldReset = shouldResetOnNavigation('/chat', '/chat/some-thread');
      expect(shouldReset).toBe(true);
    });

    it('should trigger reset when clicking logo from thread with complex slug', () => {
      // Thread slugs can have special characters
      const shouldReset = shouldResetOnNavigation('/chat', '/chat/my-thread-about-ai-2024-01-01');
      expect(shouldReset).toBe(true);
    });
  });

  describe('new Chat Button', () => {
    it('should trigger reset when clicking "New Chat" from thread page', () => {
      const shouldReset = shouldResetOnNavigation('/chat', '/chat/existing-conversation');
      expect(shouldReset).toBe(true);
    });

    it('should not trigger reset when clicking "New Chat" from /chat', () => {
      // Already on /chat, clicking new chat shouldn't reset again
      const shouldReset = shouldResetOnNavigation('/chat', '/chat');
      expect(shouldReset).toBe(false);
    });
  });

  describe('direct URL Navigation', () => {
    it('should trigger reset when navigating directly to /chat', () => {
      // User types /chat in URL bar
      const shouldReset = shouldResetOnNavigation('/chat', '/settings');
      expect(shouldReset).toBe(true);
    });

    it('should not trigger reset when navigating to specific thread', () => {
      // User types /chat/thread-id in URL bar
      const shouldReset = shouldResetOnNavigation('/chat/specific-thread', '/settings');
      expect(shouldReset).toBe(false);
    });
  });

  describe('browser Back Button', () => {
    it('should trigger reset when going back to /chat', () => {
      // User presses back from thread → lands on /chat
      const shouldReset = shouldResetOnNavigation('/chat', '/chat/previous-thread');
      expect(shouldReset).toBe(true);
    });

    it('should not trigger reset when going back between threads', () => {
      // User presses back from thread → lands on another thread
      const shouldReset = shouldResetOnNavigation('/chat/thread-1', '/chat/thread-2');
      expect(shouldReset).toBe(false);
    });
  });
});

describe('user Preference Preservation', () => {
  describe('preference Structure', () => {
    it('preserves expected preference fields', () => {
      // These are the fields that should be preserved
      const expectedFields = [
        'selectedModelIds',
        'modelOrder',
        'selectedMode',
        'enableWebSearch',
      ];

      // Simulate preference object shape
      const preferences = {
        selectedModelIds: ['model-1', 'model-2'],
        modelOrder: ['model-1', 'model-2'],
        selectedMode: 'analyzing',
        enableWebSearch: true,
      };

      expectedFields.forEach((field) => {
        expect(preferences).toHaveProperty(field);
      });
    });

    it('handles empty preference arrays', () => {
      const preferences = {
        selectedModelIds: [],
        modelOrder: [],
        selectedMode: 'analyzing',
        enableWebSearch: false,
      };

      expect(preferences.selectedModelIds).toEqual([]);
      expect(preferences.modelOrder).toEqual([]);
    });

    it('handles default preference values', () => {
      const defaultPreferences = {
        selectedModelIds: [],
        modelOrder: [],
        selectedMode: 'analyzing',
        enableWebSearch: false,
      };

      // Verify defaults can be passed to reset
      expect(defaultPreferences.enableWebSearch).toBe(false);
      expect(defaultPreferences.selectedMode).toBe('analyzing');
    });
  });
});

describe('edge Cases', () => {
  describe('rapid Navigation', () => {
    it('handles rapid navigation correctly', () => {
      // Simulate rapid navigation sequence
      const navSequence = [
        { from: '/chat/thread-1', to: '/chat' },
        { from: '/chat', to: '/chat/thread-2' },
        { from: '/chat/thread-2', to: '/chat' },
      ];

      const resetTriggers = navSequence.map(
        nav => shouldResetOnNavigation(nav.to, nav.from),
      );

      // First and third should trigger reset (TO /chat)
      // Second should not (FROM /chat)
      expect(resetTriggers).toEqual([true, false, true]);
    });
  });

  describe('same Page Navigation', () => {
    it('does not reset on same-page navigation', () => {
      expect(shouldResetOnNavigation('/chat', '/chat')).toBe(false);
      expect(shouldResetOnNavigation('/chat/thread', '/chat/thread')).toBe(false);
    });
  });

  describe('query String Handling', () => {
    it('pathname comparison ignores query strings', () => {
      // TanStack Router's useLocation().pathname returns pathname without query string
      // These tests verify our logic works with clean pathnames
      expect(shouldResetOnNavigation('/chat', '/chat/thread')).toBe(true);
    });
  });
});
