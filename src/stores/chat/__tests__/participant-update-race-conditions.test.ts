/**
 * Participant Update & Optimistic UI Race Conditions
 *
 * Tests for race conditions related to optimistic updates,
 * participant management, and form state synchronization.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatStoreContext } from '@/components/providers/chat-store-provider';
import { useChatFormActions } from '@/stores/chat/actions/form-actions';
import { createChatStore } from '@/stores/chat/store';

import { createMockParticipants, createMockThread } from './test-factories';

// Create a QueryClient for tests
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// Mock mutations
const mockMutateAsync = vi.fn();
vi.mock('@/hooks/mutations/chat-mutations', () => ({
  useCreateThreadMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
  useUpdateThreadMutation: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

// Mock toast
vi.mock('@/lib/toast', () => ({
  showApiErrorToast: vi.fn(),
}));

describe('participant Update Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;
  let queryClient: QueryClient;

  beforeEach(() => {
    store = createChatStore();
    queryClient = createTestQueryClient();
    mockMutateAsync.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(ChatStoreContext.Provider, { value: store }, children),
    )
  );

  it('should rollback optimistic participants on mutation failure', async () => {
    // 1. Setup: Thread with 1 participant
    const thread = createMockThread({ id: 't1' });
    const participants = createMockParticipants(1); // Model 0
    store.getState().initializeThread(thread, participants, []);

    // Set form state to match
    store.getState().setSelectedParticipants(participants);
    store.getState().setSelectedMode('brainstorming'); // Required for form validation

    // 2. User adds a participant (Model 1)
    const newParticipants = createMockParticipants(2); // Model 0, Model 1
    store.getState().setSelectedParticipants(newParticipants);

    // 3. Mock mutation failure
    mockMutateAsync.mockRejectedValue(new Error('Update failed'));

    // 4. Trigger update
    const { result } = renderHook(() => useChatFormActions(), { wrapper });

    // Set input so form is valid
    store.getState().setInputValue('Hello');

    // We need to await the handler, but it catches errors internally
    await result.current.handleUpdateThreadAndSend('t1');

    // 5. Verify Rollback
    // The store should have reverted to the original participants
    const currentParticipants = store.getState().participants;
    expect(currentParticipants).toHaveLength(1);
    expect(currentParticipants[0].id).toBe(participants[0].id);
  });

  it('should wait for mutation when web search is enabled', async () => {
    // 1. Setup: Thread with web search DISABLED, then ENABLE it (creates a change)
    const thread = createMockThread({ id: 't1', enableWebSearch: false });
    const participants = createMockParticipants(1);
    store.getState().initializeThread(thread, participants, []);
    store.getState().setSelectedParticipants(participants);
    store.getState().setSelectedMode('brainstorming'); // Required for form validation
    // Toggle web search from false to true - this creates a change that triggers the mutation
    store.getState().setEnableWebSearch(true);
    store.getState().setInputValue('Hello');

    // 2. Mock mutation with delay
    let mutationResolved = false;
    mockMutateAsync.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      mutationResolved = true;
      return { data: { participants } };
    });

    // 3. Trigger update
    const { result } = renderHook(() => useChatFormActions(), { wrapper });
    const updatePromise = result.current.handleUpdateThreadAndSend('t1');

    // 4. Verify it waits for config update mutation (web search enabled)
    // Immediately after call, mutation shouldn't be resolved yet
    expect(mutationResolved).toBe(false);

    // Advance time using async version to properly handle promise chains
    await vi.advanceTimersByTimeAsync(150);
    await updatePromise;

    // Now it should be resolved
    expect(mutationResolved).toBe(true);
  });

  it('should NOT wait for mutation when web search is disabled and no temp IDs', async () => {
    // 1. Setup: Thread with web search DISABLED
    const thread = createMockThread({ id: 't1', enableWebSearch: false });
    // Use IDs that don't start with 'participant-' to avoid temp ID detection
    const participants = createMockParticipants(1).map(p => ({ ...p, id: 'existing-id-1' }));
    store.getState().initializeThread(thread, participants, []);
    store.getState().setSelectedParticipants(participants);
    store.getState().setEnableWebSearch(false);
    store.getState().setInputValue('Hello');

    // 2. Mock mutation with delay
    let mutationResolved = false;
    mockMutateAsync.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      mutationResolved = true;
      return { data: { participants } };
    });

    // 3. Trigger update
    const { result } = renderHook(() => useChatFormActions(), { wrapper });

    // We modify participants slightly to trigger an update (e.g. reorder)
    // But NO temp IDs (ids are preserved)
    const _reordered = [...participants]; // Same participants
    // Force a change detection by changing mode or something,
    // or just rely on the fact that we call update if shouldUpdateParticipantConfig returns true.
    // Let's change mode to trigger update
    store.getState().setSelectedMode('debate');

    const updatePromise = result.current.handleUpdateThreadAndSend('t1');

    // 4. Verify it DOES NOT wait (fire and forget)
    // The promise should resolve immediately (before mutation finishes)
    // Wait, handleUpdateThreadAndSend is async. If it doesn't await, it returns promise that resolves immediately?
    // The code says:
    // if (needsWait) { await ... } else { mutation.catch(...); }
    // So if !needsWait, the function finishes immediately.

    await updatePromise;

    // Mutation should still be pending (simulated by flag)
    // Note: In fake timers, promises might resolve differently.
    // But logically, if we didn't await, we passed the await point.
    expect(mutationResolved).toBe(false);

    // Clean up pending timers
    vi.advanceTimersByTime(150);
  });
});
