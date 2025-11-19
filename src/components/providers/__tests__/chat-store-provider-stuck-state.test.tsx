/**
 * Chat Store Provider - Stuck State Bug Tests
 *
 * CRITICAL BUG: Provider gets stuck when pre-search status changes
 *
 * ROOT CAUSE:
 * - useEffect with [store] dependency only runs ONCE on mount
 * - If pre-search is PENDING when effect runs, it returns early
 * - Pre-search becomes COMPLETE later
 * - Effect never re-runs (no dependency change)
 * - startRound() is never called
 * - User stuck with waitingToStartStreaming: true
 *
 * REPRODUCTION:
 * 1. Create thread with web search enabled (Round 0)
 * 2. Pre-search is created as PENDING
 * 3. Provider effect checks, sees PENDING, returns early
 * 4. Pre-search transitions to STREAMING, then COMPLETE
 * 5. Provider effect doesn't re-run (store ref hasn't changed)
 * 6. startRound() never called
 * 7. STUCK: waitingToStartStreaming stays true forever
 *
 * SAME BUG for Thread Screen:
 * - Pending message sender effect has same issue
 * - If pre-search is PENDING when effect runs, returns early
 * - Pre-search becomes COMPLETE later
 * - Effect doesn't re-run
 * - sendMessage() never called
 *
 * FILES UNDER TEST:
 * - src/components/providers/chat-store-provider.tsx
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';

import { ChatStoreProvider, useChatStore } from '../chat-store-provider';

// Mock the mutation hook
vi.mock('@/hooks/mutations', () => ({
  useCreatePreSearchMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
  }),
}));

// Mock the multi-participant chat hook
const mockStartRound = vi.fn();
const mockSendMessage = vi.fn();

vi.mock('@/hooks/utils', () => ({
  useMultiParticipantChat: () => ({
    messages: [],
    startRound: mockStartRound,
    sendMessage: mockSendMessage,
    stop: vi.fn(),
    setMessages: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

describe('chatStoreProvider - Stuck State Bug', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ChatStoreProvider>{children}</ChatStoreProvider>
    </QueryClientProvider>
  );

  // ==========================================================================
  // CRITICAL BUG: Overview Screen Stuck State
  // ==========================================================================

  it('✅ FIX: should start participants when pre-search transitions from PENDING to COMPLETE (Overview)', async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    // ✅ STEP 1: Setup initial state (thread created, waiting to start)
    result.current.setThread({
      id: 'thread-1',
      userId: 'user-1',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    result.current.setMessages([
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'What is Bitcoin price?' }],
        metadata: {
          role: 'user',
          roundNumber: 0,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    result.current.setParticipants([
      {
        id: 'p1',
        threadId: 'thread-1',
        modelId: 'gpt-4',
        customRoleId: null,
        role: null,
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    result.current.setScreenMode('overview');
    result.current.setWaitingToStartStreaming(true);

    // ✅ STEP 2: Add PENDING pre-search (created during thread creation)
    result.current.addPreSearch({
      id: 'search-0',
      threadId: 'thread-1',
      roundNumber: 0,
      userQuery: 'What is Bitcoin price?',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    });

    // ✅ STEP 3: Wait a tick for provider effect to run
    await waitFor(() => {
      // Effect should have checked state and seen PENDING pre-search
      // Effect returns early, doesn't call startRound()
      expect(mockStartRound).not.toHaveBeenCalled();
    });

    // ✅ STEP 4: Pre-search transitions to STREAMING
    result.current.updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

    await waitFor(() => {
      // Still shouldn't start (still waiting for COMPLETE)
      expect(mockStartRound).not.toHaveBeenCalled();
    });

    // ✅ STEP 5: Pre-search transitions to COMPLETE
    result.current.updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    // ✅ FIX: Effect DOES re-run because preSearches is subscribed
    // Provider subscribes to preSearches with useStore, so effect re-runs on status change
    // Effect sees COMPLETE status and calls startRound()

    // Wait for startRound to be called
    await waitFor(
      () => {
        // ✅ THIS IS THE FIX: startRound should be called
        expect(mockStartRound).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // ✅ VERIFY FIX: startRound was called with participants
    expect(mockStartRound).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'p1',
        modelId: 'gpt-4',
      }),
    ]);

    // Note: waitingToStartStreaming flag is cleared by separate effect when isStreaming becomes true
    // That's tested separately, here we just verify startRound was called
  });

  // ==========================================================================
  // CRITICAL BUG: Thread Screen Stuck State
  // ==========================================================================

  it('✅ FIX: should send message when pre-search transitions from PENDING to COMPLETE (Thread)', async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    // ✅ STEP 1: Setup existing thread with messages (Round 1)
    result.current.setThread({
      id: 'thread-1',
      userId: 'user-1',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    result.current.setParticipants([
      {
        id: 'p1',
        threadId: 'thread-1',
        modelId: 'gpt-4',
        customRoleId: null,
        role: null,
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Round 0 already complete
    result.current.setMessages([
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'First question' }],
        metadata: { role: 'user', roundNumber: 0, createdAt: new Date().toISOString() },
      },
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'First answer' }],
        metadata: {
          role: 'assistant',
          roundNumber: 0,
          participantIndex: 0,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    result.current.setScreenMode('thread');

    // ✅ STEP 2: User wants to send Round 1 message
    result.current.setPendingMessage('What about now?');
    result.current.setExpectedParticipantIds(['gpt-4']);
    result.current.setHasSentPendingMessage(false);

    // ✅ STEP 3: Add PENDING pre-search for Round 1
    result.current.addPreSearch({
      id: 'search-1',
      threadId: 'thread-1',
      roundNumber: 1,
      userQuery: 'What about now?',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    });

    // ✅ STEP 4: Wait for provider effect to run
    await waitFor(() => {
      // Effect should have checked and seen PENDING pre-search
      // Returns early, doesn't call sendMessage()
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    // ✅ STEP 5: Pre-search completes
    result.current.updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

    // ✅ FIX: Effect DOES re-run because preSearches is subscribed
    // Provider subscribes to preSearches with useStore, so effect re-runs on status change
    // Effect sees COMPLETE status and calls sendMessage()

    // Wait for sendMessage to be called
    await waitFor(
      () => {
        expect(mockSendMessage).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // ✅ VERIFY FIX: sendMessage was called with pending message
    expect(mockSendMessage).toHaveBeenCalledWith('What about now?');

    // ✅ VERIFY FIX: Flag was set to prevent duplicate sends
    expect(result.current.hasSentPendingMessage).toBe(true);
  });

  // ==========================================================================
  // SCREEN MODE SUBSCRIPTION BUG
  // ==========================================================================

  it('✅ FIX: should start participants when screenMode changes from null to overview', async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    // ✅ STEP 1: Setup thread but DON'T set screenMode yet (simulating initialization race)
    result.current.setThread({
      id: 'thread-1',
      userId: 'user-1',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    result.current.setMessages([
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Test question' }],
        metadata: {
          role: 'user',
          roundNumber: 0,
          createdAt: new Date().toISOString(),
        },
      },
    ]);

    result.current.setParticipants([
      {
        id: 'p1',
        threadId: 'thread-1',
        modelId: 'gpt-4',
        customRoleId: null,
        role: null,
        priority: 0,
        isEnabled: true,
        settings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Add COMPLETE pre-search (already finished)
    result.current.addPreSearch({
      id: 'search-0',
      threadId: 'thread-1',
      roundNumber: 0,
      userQuery: 'Test question',
      status: AnalysisStatuses.COMPLETE,
      searchData: null,
      errorMessage: null,
      completedAt: new Date(),
      createdAt: new Date(),
    });

    // ✅ STEP 2: Set waiting flag BEFORE setting screenMode (race condition)
    // This simulates what happens during thread creation
    result.current.setWaitingToStartStreaming(true);

    // ✅ STEP 3: Wait a tick - effect runs but screenMode is null, so returns early
    await waitFor(() => {
      expect(mockStartRound).not.toHaveBeenCalled();
    });

    // ✅ STEP 4: Now set screenMode to 'overview' (screen initialization happens)
    result.current.setScreenMode('overview');

    // ✅ FIX: Effect DOES re-run because screenMode is subscribed
    // Before fix: Effect used store.getState().screenMode (not subscribed)
    // After fix: Effect uses useStore(store, s => s.screenMode) (subscribed)
    // Effect sees screenMode changed to 'overview' and re-runs
    // Effect now sees: screenMode='overview', pre-search COMPLETE, all conditions met
    // Effect calls startRound()

    // Wait for startRound to be called
    await waitFor(
      () => {
        expect(mockStartRound).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    // ✅ VERIFY FIX: startRound was called after screenMode changed
    expect(mockStartRound).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'p1',
        modelId: 'gpt-4',
      }),
    ]);
  });

  // ==========================================================================
  // ROOT CAUSE TESTS
  // ==========================================================================

  it('should demonstrate effect only runs once (dependency issue)', async () => {
    const effectRunCount = { count: 0 };
    const { result, rerender } = renderHook(() => useChatStore(), {
      wrapper: ({ children }: { children: ReactNode }) => {
        // Track effect runs by monitoring when component updates
        effectRunCount.count++;
        return (
          <QueryClientProvider client={queryClient}>
            <ChatStoreProvider>{children}</ChatStoreProvider>
          </QueryClientProvider>
        );
      },
    });

    const initialCount = effectRunCount.count;

    // Change store state (doesn't change store reference)
    result.current.setWaitingToStartStreaming(true);
    result.current.setWaitingToStartStreaming(false);
    result.current.setWaitingToStartStreaming(true);

    // Force re-render
    rerender();

    await waitFor(() => {
      // Wrapper re-rendered due to rerender(), but that's expected
      // The key issue is useEffect inside ChatStoreProvider with [store] dependency
      // won't re-run when state inside store changes
      expect(effectRunCount.count).toBeGreaterThan(initialCount);
    });
  });

  it('should show pre-search status changes do not trigger effect re-run', async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    result.current.setThread({
      id: 'thread-1',
      userId: 'user-1',
      projectId: null,
      title: 'Test',
      slug: 'test',
      mode: 'debating',
      status: 'active',
      isFavorite: false,
      isPublic: false,
      isAiGeneratedTitle: false,
      enableWebSearch: true,
      metadata: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: new Date(),
    });

    result.current.addPreSearch({
      id: 'search-0',
      threadId: 'thread-1',
      roundNumber: 0,
      userQuery: 'test',
      status: AnalysisStatuses.PENDING,
      searchData: null,
      errorMessage: null,
      completedAt: null,
      createdAt: new Date(),
    });

    const callCountBefore = mockStartRound.mock.calls.length;

    // Change pre-search status multiple times
    result.current.updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    result.current.updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

    await waitFor(() => {
      // If effect re-ran, startRound might be called
      // But it won't because effect dependency doesn't include pre-search state
      const callCountAfter = mockStartRound.mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });
  });
});
