/**
 * Title Animation Controller Hook
 *
 * Drives the delete→type typewriter animation state machine.
 * State machine: idle → deleting → typing → complete
 *
 * - Delete speed: 15ms/char (fast)
 * - Type speed: 25ms/char (visible)
 * - Initial delay: 200ms
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { ChatStoreApi } from '@/stores/chat';

const DELETE_SPEED_MS = 15;
const TYPE_SPEED_MS = 25;
const INITIAL_DELAY_MS = 200;
const COMPLETE_DELAY_MS = 100;

type UseTitleAnimationControllerOptions = {
  store: ChatStoreApi;
};

export function useTitleAnimationController({ store }: UseTitleAnimationControllerOptions) {
  const {
    animationPhase,
    oldTitle,
    newTitle,
    displayedTitle,
    animatingThreadId,
  } = useStore(store, useShallow(s => ({
    animationPhase: s.animationPhase,
    oldTitle: s.oldTitle,
    newTitle: s.newTitle,
    displayedTitle: s.displayedTitle,
    animatingThreadId: s.animatingThreadId,
  })));

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deleting phase - remove chars one by one
  useEffect(() => {
    if (animationPhase !== 'deleting' || !animatingThreadId) {
      return;
    }

    // If empty string, transition to typing (check BEFORE falsy check)
    if (displayedTitle !== null && displayedTitle.length === 0) {
      store.getState().setAnimationPhase('typing');
      return;
    }

    // Need displayedTitle to continue deleting
    if (displayedTitle === null) {
      return;
    }

    // Initial delay before starting
    if (displayedTitle === oldTitle) {
      const timeout = setTimeout(() => {
        const nextTitle = displayedTitle.slice(0, -1);
        store.getState().updateDisplayedTitle(nextTitle);
      }, INITIAL_DELAY_MS);
      timeoutRef.current = timeout;
      return () => {
        clearTimeout(timeout);
        if (timeoutRef.current === timeout)
          timeoutRef.current = null;
      };
    }

    // Continue deleting
    const timeout = setTimeout(() => {
      if (document.hidden)
        return;
      const currentState = store.getState();
      if (currentState.animationPhase !== 'deleting')
        return;
      const nextTitle = displayedTitle.slice(0, -1);
      currentState.updateDisplayedTitle(nextTitle);
    }, DELETE_SPEED_MS);
    timeoutRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (timeoutRef.current === timeout)
        timeoutRef.current = null;
    };
  }, [animationPhase, displayedTitle, oldTitle, animatingThreadId, store]);

  // Typing phase - add chars one by one
  useEffect(() => {
    if (animationPhase !== 'typing' || !newTitle || !animatingThreadId) {
      return;
    }

    const currentLength = displayedTitle?.length ?? 0;

    // If complete, transition to complete phase
    if (currentLength >= newTitle.length) {
      store.getState().setAnimationPhase('complete');
      return;
    }

    // Continue typing
    const timeout = setTimeout(() => {
      if (document.hidden)
        return;
      const currentState = store.getState();
      if (currentState.animationPhase !== 'typing')
        return;
      const nextTitle = newTitle.slice(0, currentLength + 1);
      currentState.updateDisplayedTitle(nextTitle);
    }, TYPE_SPEED_MS);
    timeoutRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (timeoutRef.current === timeout)
        timeoutRef.current = null;
    };
  }, [animationPhase, displayedTitle, newTitle, animatingThreadId, store]);

  // Complete phase - reset animation state
  useEffect(() => {
    if (animationPhase !== 'complete' || !animatingThreadId) {
      return;
    }

    // Small delay before completing to let final char render
    const timeout = setTimeout(() => {
      store.getState().completeTitleAnimation();
    }, COMPLETE_DELAY_MS);
    timeoutRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (timeoutRef.current === timeout)
        timeoutRef.current = null;
    };
  }, [animationPhase, animatingThreadId, store]);

  // Handle visibility change - resume animation when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && animatingThreadId) {
        const state = store.getState();
        // Re-trigger the current phase to resume animation
        if (state.animationPhase === 'deleting' && state.displayedTitle) {
          state.updateDisplayedTitle(state.displayedTitle.slice(0, -1));
        } else if (state.animationPhase === 'typing' && state.newTitle) {
          const currentLength = state.displayedTitle?.length ?? 0;
          if (currentLength < state.newTitle.length) {
            state.updateDisplayedTitle(state.newTitle.slice(0, currentLength + 1));
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [animatingThreadId, store]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
}
