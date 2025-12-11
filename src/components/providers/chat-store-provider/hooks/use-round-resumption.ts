'use client';

/**
 * Round Resumption Hook
 *
 * Handles continuing from a specific participant when a round is incomplete.
 * Triggered by useIncompleteRoundResumption hook on page load.
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';

import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import type { ChatStoreApi } from '@/stores/chat';
import { shouldWaitForPreSearch } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseRoundResumptionParams = {
  store: ChatStoreApi;
  chat: ChatHook;
};

/**
 * Handles incomplete round resumption from specific participant
 */
export function useRoundResumption({ store, chat }: UseRoundResumptionParams) {
  // Subscribe to necessary store state
  const waitingToStart = useStore(store, s => s.waitingToStartStreaming);
  const chatIsStreaming = useStore(store, s => s.isStreaming);
  const nextParticipantToTrigger = useStore(store, s => s.nextParticipantToTrigger);
  const storeParticipants = useStore(store, s => s.participants);
  const storeMessages = useStore(store, s => s.messages);
  const storePreSearches = useStore(store, s => s.preSearches);
  const storeThread = useStore(store, s => s.thread);

  const resumptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up dangling nextParticipantToTrigger state
  useEffect(() => {
    if (nextParticipantToTrigger === null || waitingToStart || chatIsStreaming) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const latestState = store.getState();
      if (latestState.nextParticipantToTrigger !== null
        && !latestState.waitingToStartStreaming
        && !latestState.isStreaming
      ) {
        latestState.setNextParticipantToTrigger(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, store]);

  // Main resumption effect
  useEffect(() => {
    if (nextParticipantToTrigger === null || !waitingToStart) {
      return;
    }

    if (chatIsStreaming) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      return;
    }

    if (storeParticipants.length === 0) {
      return;
    }

    if (storeMessages.length === 0) {
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setNextParticipantToTrigger(null);
      return;
    }

    // Wait for AI SDK to be ready
    if (!chat.isReady) {
      return;
    }

    // Wait for pre-search to complete
    const currentRound = getCurrentRoundNumber(storeMessages);
    const webSearchEnabled = storeThread?.enableWebSearch ?? false;
    const preSearchForRound = storePreSearches.find(ps => ps.roundNumber === currentRound);
    if (shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)) {
      return;
    }

    // Resume from specific participant
    chat.continueFromParticipant(nextParticipantToTrigger, storeParticipants);
  }, [nextParticipantToTrigger, waitingToStart, chatIsStreaming, storeParticipants, storeMessages, storePreSearches, storeThread, chat, store]);

  // Safety timeout for thread screen resumption
  useEffect(() => {
    const currentScreenMode = store.getState().screenMode;
    if (currentScreenMode !== 'thread' || !waitingToStart || nextParticipantToTrigger === null) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    if (chatIsStreaming) {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
      return;
    }

    resumptionTimeoutRef.current = setTimeout(() => {
      const latestState = store.getState();
      if (latestState.waitingToStartStreaming && !latestState.isStreaming) {
        latestState.setWaitingToStartStreaming(false);
        latestState.setNextParticipantToTrigger(null);
      }
    }, 10000);

    return () => {
      if (resumptionTimeoutRef.current) {
        clearTimeout(resumptionTimeoutRef.current);
        resumptionTimeoutRef.current = null;
      }
    };
  }, [waitingToStart, chatIsStreaming, nextParticipantToTrigger, store]);
}
