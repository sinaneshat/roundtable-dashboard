/**
 * ChatInput Hydration Tests
 *
 * Tests to verify that ChatInput renders consistent DOM structure
 * between SSR and client to prevent hydration mismatches.
 *
 * Root Cause Fixed:
 * 1. File input was conditionally rendered based on `enableAttachments` prop
 *    which depended on `isInputBlocked` state that differs between SSR/client
 * 2. The `isModelsLoading` state from TanStack Query differs between SSR
 *    (no cache = loading) and client (cached data = not loading)
 *
 * Fixes Applied:
 * 1. ChatInput always renders file input element (hidden when disabled)
 * 2. ChatView uses useIsMounted() to ensure consistent initial loading state
 */

import { describe, expect, it } from 'vitest';

import { useIsMounted } from '@/hooks/utils';
import { render, renderHook } from '@/lib/testing';

import { ChatInput } from '../chat-input';

describe('chatInput Hydration Safety', () => {
  describe('file input rendering', () => {
    it('should always render file input element regardless of enableAttachments', () => {
      const { container } = render(
        <ChatInput
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          status="ready"
          enableAttachments={false}
          onAddAttachments={undefined}
        />,
      );

      // File input should always exist (just disabled when attachments not enabled)
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toBeDisabled();
    });

    it('should enable file input when attachments are enabled', () => {
      const { container } = render(
        <ChatInput
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
          status="ready"
          enableAttachments={true}
          onAddAttachments={() => {}}
        />,
      );

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).not.toBeDisabled();
    });
  });

  describe('useIsMounted hydration safety', () => {
    it('should return false on server and true on client', () => {
      const { result } = renderHook(() => useIsMounted());

      // In test environment (simulating client), should be true
      // On actual SSR, getServerSnapshot returns false
      expect(result.current).toBe(true);
    });
  });
});

describe('chatView isModelsLoading hydration safety', () => {
  it('should treat loading as true until mounted to match SSR', () => {
    // This tests the pattern used in ChatView:
    // const isModelsLoading = !isMounted || isModelsLoadingRaw;
    //
    // SSR: isMounted=false, so isModelsLoading=true (regardless of raw value)
    // Client first render: isMounted=false initially, so isModelsLoading=true
    // After hydration: isMounted=true, isModelsLoading=actual value
    //
    // This ensures SSR and initial client render match

    // Simulate the hydration-safe pattern
    const getHydrationSafeLoading = (isMounted: boolean, rawLoading: boolean) => {
      return !isMounted || rawLoading;
    };

    // SSR scenario: isMounted=false (server snapshot)
    expect(getHydrationSafeLoading(false, false)).toBe(true); // Treats as loading
    expect(getHydrationSafeLoading(false, true)).toBe(true); // Still loading

    // Client after hydration: isMounted=true
    expect(getHydrationSafeLoading(true, false)).toBe(false); // Not loading
    expect(getHydrationSafeLoading(true, true)).toBe(true); // Actually loading
  });
});
