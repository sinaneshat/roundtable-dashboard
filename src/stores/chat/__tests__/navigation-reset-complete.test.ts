/**
 * Navigation Reset Complete Tests
 *
 * Tests that navigating to /chat resets ALL state to day 0 - as if nothing was ever there.
 * This includes:
 * - Store state (messages, participants, analyses, pre-searches, etc.)
 * - AI SDK methods (sendMessage, startRound, stop, chatSetMessages)
 * - Tracking sets (createdAnalysisRounds, triggeredPreSearchRounds, etc.)
 * - Provider refs (preSearchCreationAttemptedRef)
 *
 * REQUIREMENT:
 * Landing on /chat should reset everything to a completely fresh state.
 * The user should see the initial UI as if they just opened the app.
 */

import { describe, expect, it } from 'vitest';

import { ChatModes, ScreenModes } from '@/api/core/enums';

import { createChatStore } from '../store';
import { COMPLETE_RESET_STATE, FORM_DEFAULTS, THREAD_NAVIGATION_RESET_STATE } from '../store-defaults';

describe('navigation Reset to /chat - Complete State Reset', () => {
  describe('resetToOverview - Day 0 State', () => {
    it('should reset all form state to defaults', () => {
      const store = createChatStore();

      // Simulate dirty state
      store.getState().setInputValue('Test input');
      store.getState().setSelectedMode(ChatModes.BRAINSTORM);
      store.getState().setEnableWebSearch(true);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.inputValue).toBe(FORM_DEFAULTS.inputValue);
      expect(state.selectedMode).toBe(FORM_DEFAULTS.selectedMode);
      expect(state.enableWebSearch).toBe(FORM_DEFAULTS.enableWebSearch);
      expect(state.selectedParticipants).toEqual([]);
    });

    it('should clear all thread data', () => {
      const store = createChatStore();

      // Simulate having a thread
      store.getState().initializeThread(
        { id: 'thread-1', slug: 'test-thread', title: 'Test', mode: ChatModes.ANALYZING, enableWebSearch: false, isPublic: false, createdAt: new Date(), updatedAt: new Date() },
        [{ id: 'p1', modelId: 'openai/gpt-4', displayName: 'GPT-4', role: null, disabled: false, ordinalPosition: 0 }],
        [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], metadata: {} }],
      );

      expect(store.getState().thread).not.toBeNull();
      expect(store.getState().participants.length).toBeGreaterThan(0);
      expect(store.getState().messages.length).toBeGreaterThan(0);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.participants).toEqual([]);
      expect(state.messages).toEqual([]);
    });

    it('should clear all analyses', () => {
      const store = createChatStore();

      // Simulate having analyses
      store.getState().addAnalysis({
        id: 'analysis-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: 'complete',
        data: null,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(store.getState().analyses).toHaveLength(1);

      // Reset
      store.getState().resetToOverview();

      expect(store.getState().analyses).toEqual([]);
    });

    it('should clear all pre-searches', () => {
      const store = createChatStore();

      // Simulate having pre-searches
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: 'complete',
        searchData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      expect(store.getState().preSearches).toHaveLength(1);

      // Reset
      store.getState().resetToOverview();

      expect(store.getState().preSearches).toEqual([]);
    });

    it('should reset all streaming flags', () => {
      const store = createChatStore();

      // Simulate streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentRoundNumber(1);
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setWaitingToStartStreaming(true);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.waitingToStartStreaming).toBe(false);
    });

    it('should reset all UI flags', () => {
      const store = createChatStore();

      // Simulate UI state changes
      store.getState().setShowInitialUI(false);
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setIsCreatingThread(true);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.showInitialUI).toBe(true);
      expect(state.createdThreadId).toBeNull();
      expect(state.isCreatingThread).toBe(false);
    });

    it('should create fresh Set instances for tracking state', () => {
      const store = createChatStore();

      // Get initial tracking sets
      const initialAnalysisSet = store.getState().createdAnalysisRounds;
      const initialPreSearchSet = store.getState().triggeredPreSearchRounds;
      const initialResumptionSet = store.getState().resumptionAttempts;

      // Mark some rounds
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);

      expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);
      expect(store.getState().triggeredPreSearchRounds.has(0)).toBe(true);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();

      // Sets should be cleared AND be new instances (not same reference)
      expect(state.createdAnalysisRounds.size).toBe(0);
      expect(state.triggeredPreSearchRounds.size).toBe(0);
      expect(state.resumptionAttempts.size).toBe(0);

      // Verify new instances were created (important to prevent cross-session pollution)
      expect(state.createdAnalysisRounds).not.toBe(initialAnalysisSet);
      expect(state.triggeredPreSearchRounds).not.toBe(initialPreSearchSet);
      expect(state.resumptionAttempts).not.toBe(initialResumptionSet);
    });

    it('should reset pending message state', () => {
      const store = createChatStore();

      // Simulate pending message
      store.getState().setPendingMessage('Test pending message');
      store.getState().setExpectedParticipantIds(['p1', 'p2']);
      store.getState().setHasSentPendingMessage(true);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.pendingMessage).toBeNull();
      expect(state.expectedParticipantIds).toBeNull();
      expect(state.hasSentPendingMessage).toBe(false);
    });

    it('should reset screen mode to overview', () => {
      const store = createChatStore();

      // Change screen mode
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Reset
      store.getState().resetToOverview();

      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should clear AI SDK methods', () => {
      const store = createChatStore();

      // Simulate AI SDK methods being set
      store.getState().setSendMessage(async () => {});
      store.getState().setStartRound(async () => {});
      store.getState().setStop(() => {});
      store.getState().setChatSetMessages(() => {});

      expect(store.getState().sendMessage).toBeDefined();
      expect(store.getState().startRound).toBeDefined();
      expect(store.getState().stop).toBeDefined();
      expect(store.getState().chatSetMessages).toBeDefined();

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.sendMessage).toBeUndefined();
      expect(state.startRound).toBeUndefined();
      expect(state.stop).toBeUndefined();
      expect(state.chatSetMessages).toBeUndefined();
    });

    it('should clear stream resumption state', () => {
      const store = createChatStore();

      // Simulate stream resumption state
      store.getState().setStreamResumptionState({
        threadId: 'thread-1',
        participantIndex: 0,
        roundNumber: 0,
        timestamp: Date.now(),
        status: 'pending',
      });
      store.getState().markResumptionAttempted('attempt-1');

      expect(store.getState().streamResumptionState).not.toBeNull();
      expect(store.getState().resumptionAttempts.size).toBe(1);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.streamResumptionState).toBeNull();
      expect(state.resumptionAttempts.size).toBe(0);
    });

    it('should clear animation state', () => {
      const store = createChatStore();

      // Simulate animation state - registerAnimation adds to pendingAnimations
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      expect(store.getState().pendingAnimations.size).toBeGreaterThan(0);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.pendingAnimations.size).toBe(0);
      expect(state.animationResolvers.size).toBe(0);
    });

    it('should reset regeneration state', () => {
      const store = createChatStore();

      // Simulate regeneration
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(1);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBeNull();
    });

    it('should clear feedback state', () => {
      const store = createChatStore();

      // Simulate feedback
      store.getState().setFeedback(0, 'positive');
      store.getState().setPendingFeedback({ roundNumber: 0, type: 'positive' });

      expect(store.getState().feedbackByRound.size).toBe(1);
      expect(store.getState().pendingFeedback).not.toBeNull();

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(0);
      expect(state.pendingFeedback).toBeNull();
      expect(state.hasLoadedFeedback).toBe(false);
    });
  });

  describe('resetForThreadNavigation - Thread-to-Thread', () => {
    it('should clear thread data but preserve form defaults', () => {
      const store = createChatStore();

      // Set up thread
      store.getState().initializeThread(
        { id: 'thread-1', slug: 'test-thread', title: 'Test', mode: ChatModes.ANALYZING, enableWebSearch: false, isPublic: false, createdAt: new Date(), updatedAt: new Date() },
        [{ id: 'p1', modelId: 'openai/gpt-4', displayName: 'GPT-4', role: null, disabled: false, ordinalPosition: 0 }],
        [{ id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Hello' }], metadata: {} }],
      );

      // Set form values that should be preserved
      store.getState().setInputValue('Draft input');

      // Reset for navigation
      store.getState().resetForThreadNavigation();

      const state = store.getState();
      // Thread data should be cleared
      expect(state.thread).toBeNull();
      expect(state.participants).toEqual([]);
      expect(state.messages).toEqual([]);
      // Input should be preserved (for draft behavior)
      expect(state.inputValue).toBe('Draft input');
    });

    it('should create fresh tracking Sets', () => {
      const store = createChatStore();

      // Mark some rounds as processed
      store.getState().markAnalysisCreated(0);
      store.getState().markPreSearchTriggered(0);

      const prevAnalysisSet = store.getState().createdAnalysisRounds;

      // Reset for navigation
      store.getState().resetForThreadNavigation();

      const state = store.getState();
      expect(state.createdAnalysisRounds.size).toBe(0);
      expect(state.triggeredPreSearchRounds.size).toBe(0);
      // Should be new instance
      expect(state.createdAnalysisRounds).not.toBe(prevAnalysisSet);
    });
  });

  describe('cOMPLETE_RESET_STATE constant', () => {
    it('should include all required state properties', () => {
      // This test ensures COMPLETE_RESET_STATE has all the necessary properties
      // If a new state property is added but not included in reset, this should fail

      const expectedKeys = [
        // Form
        'inputValue',
        'selectedMode',
        'selectedParticipants',
        'enableWebSearch',
        'modelOrder',
        // Feedback
        'feedbackByRound',
        'pendingFeedback',
        'hasLoadedFeedback',
        // UI
        'showInitialUI',
        'waitingToStartStreaming',
        'isCreatingThread',
        'createdThreadId',
        // Analysis
        'analyses',
        // Pre-search
        'preSearches',
        'preSearchActivityTimes',
        // Thread
        'thread',
        'participants',
        'messages',
        'isStreaming',
        'currentParticipantIndex',
        'error',
        'sendMessage',
        'startRound',
        'stop',
        'chatSetMessages',
        // Flags
        'hasInitiallyLoaded',
        'isRegenerating',
        'isCreatingAnalysis',
        'isWaitingForChangelog',
        'hasPendingConfigChanges',
        // Data
        'regeneratingRoundNumber',
        'pendingMessage',
        'expectedParticipantIds',
        'streamingRoundNumber',
        'currentRoundNumber',
        // Tracking
        'hasSentPendingMessage',
        'createdAnalysisRounds',
        'triggeredPreSearchRounds',
        'hasEarlyOptimisticMessage',
        // Callbacks
        'onComplete',
        // Screen
        'screenMode',
        'isReadOnly',
        // Stream resumption
        'streamResumptionState',
        'resumptionAttempts',
        'nextParticipantToTrigger',
        // Animation
        'pendingAnimations',
        'animationResolvers',
      ];

      // Check that all expected keys are in COMPLETE_RESET_STATE
      for (const key of expectedKeys) {
        expect(COMPLETE_RESET_STATE).toHaveProperty(key);
      }
    });
  });

  describe('tHREAD_NAVIGATION_RESET_STATE constant', () => {
    it('should clear thread data in addition to thread state', () => {
      // Thread navigation reset should clear more than just flags
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('thread');
      expect(THREAD_NAVIGATION_RESET_STATE.thread).toBeNull();
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('participants');
      expect(THREAD_NAVIGATION_RESET_STATE.participants).toEqual([]);
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('messages');
      expect(THREAD_NAVIGATION_RESET_STATE.messages).toEqual([]);
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('analyses');
      expect(THREAD_NAVIGATION_RESET_STATE.analyses).toEqual([]);
      expect(THREAD_NAVIGATION_RESET_STATE).toHaveProperty('preSearches');
      expect(THREAD_NAVIGATION_RESET_STATE.preSearches).toEqual([]);
    });
  });
});
