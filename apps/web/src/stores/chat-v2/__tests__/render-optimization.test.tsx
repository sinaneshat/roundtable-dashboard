/**
 * Render Optimization Tests - V2
 *
 * Tests for selector stability and subscription efficiency.
 * Ensures minimal re-renders and proper batching.
 */

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  createRoundCompleteFlowState,
  createStreamingFlowState,
  createTestChatStoreV2,
  createV2AssistantMessage,
  createV2UserMessage,
} from '@/lib/testing';

import { ChatStoreContext } from '@/components/providers/chat-store-provider-v2/context';
import { useChatStore } from '@/components/providers/chat-store-provider-v2/use-chat-store';

describe('V2 render optimization', () => {
  function createWrapper(store: ReturnType<typeof createTestChatStoreV2>) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <ChatStoreContext value={store}>{children}</ChatStoreContext>;
    };
  }

  describe('selector stability', () => {
    it('flow selector only triggers on flow change', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0 }),
        inputValue: 'initial',
      });

      let renderCount = 0;

      const { result } = renderHook(
        () => {
          renderCount++;
          return useChatStore(state => state.flow);
        },
        { wrapper: createWrapper(store) },
      );

      expect(result.current.type).toBe('streaming');
      const initialRenderCount = renderCount;

      // Change inputValue - should NOT re-render
      act(() => {
        store.getState().setInputValue('changed');
      });

      // Render count should be the same (selector doesn't use inputValue)
      expect(renderCount).toBe(initialRenderCount);

      // Change flow - SHOULD re-render
      act(() => {
        store.getState().dispatch({ type: 'STOP' });
      });

      expect(renderCount).toBeGreaterThan(initialRenderCount);
      expect(result.current.type).toBe('round_complete');
    });

    it('thread selector only triggers on thread/messages change', () => {
      const store = createTestChatStoreV2({
        thread: { id: 't1', slug: 'test' } as never,
        messages: [],
        inputValue: 'initial',
      });

      let renderCount = 0;

      const { result } = renderHook(
        () => {
          renderCount++;
          return useChatStore(state => state.thread);
        },
        { wrapper: createWrapper(store) },
      );

      expect(result.current?.id).toBe('t1');
      const initialRenderCount = renderCount;

      // Change inputValue - should NOT re-render
      act(() => {
        store.getState().setInputValue('changed');
      });

      expect(renderCount).toBe(initialRenderCount);

      // Change thread - SHOULD re-render
      act(() => {
        store.getState().setThread({ id: 't2', slug: 'new' } as never);
      });

      expect(renderCount).toBeGreaterThan(initialRenderCount);
      expect(result.current?.id).toBe('t2');
    });

    it('form selector only triggers on form change', () => {
      const store = createTestChatStoreV2({
        inputValue: 'initial',
        selectedMode: 'council',
        messages: [],
      });

      let renderCount = 0;

      const { result } = renderHook(
        () => {
          renderCount++;
          return useChatStore(state => state.inputValue);
        },
        { wrapper: createWrapper(store) },
      );

      expect(result.current).toBe('initial');
      const initialRenderCount = renderCount;

      // Add message - should NOT re-render
      act(() => {
        store.getState().addMessage(createV2UserMessage({ roundNumber: 0 }));
      });

      expect(renderCount).toBe(initialRenderCount);

      // Change inputValue - SHOULD re-render
      act(() => {
        store.getState().setInputValue('changed');
      });

      expect(renderCount).toBeGreaterThan(initialRenderCount);
      expect(result.current).toBe('changed');
    });

    it('multiple selectors isolate updates', () => {
      const store = createTestChatStoreV2({
        inputValue: 'initial',
        selectedMode: 'council',
        messages: [],
      });

      let flowRenderCount = 0;
      let inputRenderCount = 0;
      let messageRenderCount = 0;

      const { result: flowResult } = renderHook(
        () => {
          flowRenderCount++;
          return useChatStore(state => state.flow);
        },
        { wrapper: createWrapper(store) },
      );

      const { result: inputResult } = renderHook(
        () => {
          inputRenderCount++;
          return useChatStore(state => state.inputValue);
        },
        { wrapper: createWrapper(store) },
      );

      const { result: messageResult } = renderHook(
        () => {
          messageRenderCount++;
          return useChatStore(state => state.messages);
        },
        { wrapper: createWrapper(store) },
      );

      const initialFlowCount = flowRenderCount;
      const initialInputCount = inputRenderCount;
      const initialMessageCount = messageRenderCount;

      // Change input - only input hook should re-render
      act(() => {
        store.getState().setInputValue('changed');
      });

      expect(flowRenderCount).toBe(initialFlowCount);
      expect(inputRenderCount).toBeGreaterThan(initialInputCount);
      expect(messageRenderCount).toBe(initialMessageCount);

      // Change messages - only message hook should re-render
      act(() => {
        store.getState().addMessage(createV2UserMessage({ roundNumber: 0 }));
      });

      expect(flowRenderCount).toBe(initialFlowCount);
      expect(messageRenderCount).toBeGreaterThan(initialMessageCount);
    });
  });

  describe('subscription efficiency', () => {
    it('subscribe callback invoked once per state change', () => {
      const store = createTestChatStoreV2();
      const callback = vi.fn();

      const unsubscribe = store.subscribe(callback);

      // Initial subscribe doesn't trigger callback
      expect(callback).not.toHaveBeenCalled();

      // Single state change triggers once
      store.getState().setInputValue('test');
      expect(callback).toHaveBeenCalledTimes(1);

      // Another change triggers again
      store.getState().setSelectedMode('debate');
      expect(callback).toHaveBeenCalledTimes(2);

      unsubscribe();

      // After unsubscribe, no more callbacks
      store.getState().setInputValue('after unsubscribe');
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('batched updates still trigger individual callbacks', () => {
      const store = createTestChatStoreV2();
      const callback = vi.fn();

      store.subscribe(callback);

      // Each setState is a separate update
      store.getState().setInputValue('1');
      store.getState().setInputValue('2');
      store.getState().setInputValue('3');

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('setState with same value still triggers callback (Zustand behavior)', () => {
      const store = createTestChatStoreV2({
        inputValue: 'same',
      });
      const callback = vi.fn();

      store.subscribe(callback);

      // Setting same value still triggers (Zustand doesn't do deep equality)
      store.getState().setInputValue('same');

      // Note: Zustand will trigger the callback because it uses reference equality
      // The selector in useChatStore may prevent re-render if value is same
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('object reference stability', () => {
    it('messages array reference changes on update', () => {
      const store = createTestChatStoreV2({
        messages: [],
      });

      const initialMessages = store.getState().messages;

      store.getState().addMessage(createV2UserMessage({ roundNumber: 0 }));

      const newMessages = store.getState().messages;

      // Reference should change (new array)
      expect(newMessages).not.toBe(initialMessages);
      expect(newMessages.length).toBe(1);
    });

    it('preSearches map reference changes on update', () => {
      const store = createTestChatStoreV2({
        preSearches: new Map(),
      });

      const initialMap = store.getState().preSearches;

      store.getState().setPreSearch(0, {
        roundNumber: 0,
        status: 'complete',
        query: 'test',
        results: [],
        startedAt: 100,
        completedAt: 200,
      });

      const newMap = store.getState().preSearches;

      // Reference should change (new Map)
      expect(newMap).not.toBe(initialMap);
      expect(newMap.size).toBe(1);
    });

    it('flow object reference changes on dispatch', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0, totalParticipants: 2 }),
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      const initialFlow = store.getState().flow;

      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 0 });

      const newFlow = store.getState().flow;

      // Reference should change
      expect(newFlow).not.toBe(initialFlow);
    });
  });

  describe('selector memoization', () => {
    it('same selector function prevents re-subscription', () => {
      const store = createTestChatStoreV2();

      // Using the same inline selector creates new functions each render
      // This is why useShallow or stable selectors are important

      const selector1 = (state: ReturnType<typeof store.getState>) => state.inputValue;
      const selector2 = (state: ReturnType<typeof store.getState>) => state.inputValue;

      // Different function references
      expect(selector1).not.toBe(selector2);

      // But they produce same result
      expect(selector1(store.getState())).toBe(selector2(store.getState()));
    });

    it('derived selectors compute consistently', () => {
      const store = createTestChatStoreV2({
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      // Derived selector (like getting enabled participant count)
      const getEnabledCount = (state: ReturnType<typeof store.getState>) =>
        state.selectedParticipants.length;

      expect(getEnabledCount(store.getState())).toBe(2);

      store.getState().addParticipant({ modelId: 'gemini', role: null, priority: 3 });

      expect(getEnabledCount(store.getState())).toBe(3);
    });
  });

  describe('action dispatch efficiency', () => {
    it('dispatch is synchronous', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({ threadId: 't1', round: 0, totalParticipants: 2 }),
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      // Before dispatch
      expect(store.getState().flow.type).toBe('streaming');

      // Dispatch is synchronous
      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 0 });

      // Immediately after dispatch, state is updated
      expect(store.getState().flow.type).toBe('streaming');
      const flow = store.getState().flow;
      if (flow.type === 'streaming') {
        expect(flow.participantIndex).toBe(1);
      }
    });

    it('multiple dispatches in sequence are all synchronous', () => {
      const store = createTestChatStoreV2({
        flow: createStreamingFlowState({
          threadId: 't1',
          round: 0,
          participantIndex: 0,
          totalParticipants: 2,
        }),
        selectedParticipants: [
          { modelId: 'gpt-4', role: null, priority: 1 },
          { modelId: 'claude-3', role: null, priority: 2 },
        ],
      });

      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 0 });
      expect(store.getState().flow.type).toBe('streaming');

      store.getState().dispatch({ type: 'PARTICIPANT_COMPLETE', participantIndex: 1 });
      expect(store.getState().flow.type).toBe('awaiting_moderator');

      store.getState().dispatch({ type: 'MODERATOR_STARTED' });
      expect(store.getState().flow.type).toBe('moderator_streaming');

      store.getState().dispatch({ type: 'MODERATOR_COMPLETE', round: 0 });
      expect(store.getState().flow.type).toBe('round_complete');
    });
  });

  describe('useShallow usage patterns', () => {
    it('object selector without useShallow creates new refs', () => {
      const store = createTestChatStoreV2({
        inputValue: 'test',
        selectedMode: 'council',
      });

      // Selector returns new object each time
      const selector = (state: ReturnType<typeof store.getState>) => ({
        input: state.inputValue,
        mode: state.selectedMode,
      });

      const result1 = selector(store.getState());
      const result2 = selector(store.getState());

      // Different references even with same content
      expect(result1).not.toBe(result2);
      expect(result1).toEqual(result2);
    });

    it('primitive selector has stable values', () => {
      const store = createTestChatStoreV2({
        inputValue: 'test',
      });

      // Primitive selector
      const selector = (state: ReturnType<typeof store.getState>) => state.inputValue;

      const result1 = selector(store.getState());
      const result2 = selector(store.getState());

      // Same primitive value
      expect(result1).toBe(result2);
      expect(result1).toBe('test');
    });
  });
});
