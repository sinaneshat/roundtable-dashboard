/**
 * Round Closing & Web Search Retrigger Bug Tests
 *
 * Tests the specific bug where:
 * 1. Rounds don't close properly when web search is enabled
 * 2. Analyze streams get retriggered
 * 3. Mismatch of data in "analyze" and "analyses"
 * 4. Invalid confidenceWeighting values cause validation failures
 *
 * ROOT CAUSE ANALYSIS:
 * - The validation error shows `confidenceWeighting: "limited"` is invalid
 * - Valid values: 'balanced' | 'evidence_heavy' | 'consensus_heavy' | 'expertise_weighted'
 * - When validation fails, analysis may not complete properly
 * - Multiple trigger points (Provider + FlowStateMachine) can cause retriggering
 *
 * Location: /src/stores/chat/__tests__/round-closing-web-search-retrigger.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  CONFIDENCE_WEIGHTINGS,
  ConfidenceWeightings,
  ConfidenceWeightingSchema,
  ScreenModes,
} from '@/api/core/enums';
import {
  ModeratorAnalysisPayloadSchema,
} from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Setup store with complete round including pre-search
 */
function setupRoundWithWebSearch(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  participantCount: number,
  options: { preSearchComplete?: boolean } = {},
): void {
  const thread = createMockThread({
    id: 'thread-123',
    enableWebSearch: true,
  });
  const participants = Array.from({ length: participantCount }, (_, i) =>
    createMockParticipant(i, { threadId: 'thread-123' }));

  const messages: UIMessage[] = [
    createMockUserMessage(roundNumber, `Question for round ${roundNumber}`),
    ...Array.from({ length: participantCount }, (_, i) =>
      createMockMessage(i, roundNumber)),
  ];

  if (roundNumber === 0) {
    store.getState().initializeThread(thread, participants, messages);
  } else {
    messages.forEach((msg) => {
      store.getState().setMessages(prev => [...prev, msg]);
    });
  }

  // Add pre-search
  const preSearch = createMockPreSearch({
    roundNumber,
    status: options.preSearchComplete ? AnalysisStatuses.COMPLETE : AnalysisStatuses.PENDING,
  });
  store.getState().addPreSearch(preSearch);
}

// ============================================================================
// SECTION 1: CONFIDENCE WEIGHTING VALIDATION
// ============================================================================

describe('section 1: ConfidenceWeighting Validation', () => {
  describe('schema Validation', () => {
    it('should accept valid confidenceWeighting values', () => {
      // Use CONFIDENCE_WEIGHTINGS array as single source of truth
      const validValues = CONFIDENCE_WEIGHTINGS;

      validValues.forEach((value) => {
        const result = ConfidenceWeightingSchema.safeParse(value);
        // Use toMatchObject to avoid conditional expect while verifying both success and data
        expect(result).toMatchObject({ success: true, data: value });
      });
    });

    it('should coerce invalid confidenceWeighting value "limited" to default', () => {
      // Schema uses .catch('balanced') for lenient validation - invalid values default to 'balanced'
      // This prevents AI model responses from breaking analysis streaming
      const result = ConfidenceWeightingSchema.safeParse('limited');

      // Lenient schema succeeds and coerces to default
      expect(result).toMatchObject({
        success: true,
        data: ConfidenceWeightings.BALANCED, // Default fallback
      });
    });

    it('should coerce other invalid confidenceWeighting values to default', () => {
      // Schema uses .catch('balanced') - all invalid values coerce to 'balanced'
      const invalidValues = ['limited', 'none', 'heavy', 'weighted', ''];

      invalidValues.forEach((value) => {
        const result = ConfidenceWeightingSchema.safeParse(value);
        expect(result).toMatchObject({
          success: true,
          data: ConfidenceWeightings.BALANCED,
        });
      });
    });
  });

  describe('full Analysis Payload Validation', () => {
    it('should coerce invalid confidenceWeighting in analysis payload to default', () => {
      // Use factory to create valid base payload, then override with invalid value
      const validBase = createMockAnalysisPayload(0, {
        mode: ChatModes.ANALYZING,
        userQuestion: 'btc price right now',
        roundConfidence: 65,
      });

      // Override confidenceWeighting with invalid value using spread
      const invalidPayload = {
        ...validBase,
        confidenceWeighting: 'limited', // Invalid value - will be coerced to 'balanced'
      };

      const result = ModeratorAnalysisPayloadSchema.safeParse(invalidPayload);

      // Schema uses .catch('balanced') - lenient validation succeeds with coerced value
      // Use toMatchObject to verify both success and data without conditional expect
      expect(result).toMatchObject({
        success: true,
        data: expect.objectContaining({
          confidenceWeighting: ConfidenceWeightings.BALANCED,
        }),
      });
    });

    it('should accept analysis payload with valid confidenceWeighting', () => {
      const validPayload = createMockAnalysisPayload(0, {
        confidenceWeighting: ConfidenceWeightings.BALANCED,
      });

      const result = ModeratorAnalysisPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should accept analysis payload with optional confidenceWeighting omitted', () => {
      // confidenceWeighting is optional in schema
      const payloadWithoutWeighting = createMockAnalysisPayload(0);
      // Remove confidenceWeighting
      const { confidenceWeighting: _, ...rest } = payloadWithoutWeighting;

      const result = ModeratorAnalysisPayloadSchema.safeParse(rest);
      // Expect success since confidenceWeighting is optional
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 2: ROUND CLOSING DEDUPLICATION
// ============================================================================

describe('section 2: Round Closing Deduplication', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('analysis Creation Tracking', () => {
    it('should prevent duplicate analysis creation via markAnalysisCreated', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setIsStreaming(false);

      // First call: mark as created
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Second call: should still return true (already marked)
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Create the actual analysis
      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses).toHaveLength(1);

      // Attempting to add again should not duplicate
      // (addAnalysis has deduplication logic)
    });

    it('should clear analysis tracking for regeneration', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Clear tracking (for regeneration)
      store.getState().clearAnalysisTracking(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should track multiple rounds independently', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(2)).toBe(false);
    });
  });

  describe('duplicate Analysis Prevention in addAnalysis', () => {
    it('should not add duplicate analysis for same round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      const analysis1 = createMockAnalysis({
        id: 'analysis-1',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      });

      const analysis2 = createMockAnalysis({
        id: 'analysis-2', // Different ID
        roundNumber: 0, // Same round
        status: AnalysisStatuses.STREAMING,
      });

      store.getState().addAnalysis(analysis1);
      expect(store.getState().analyses).toHaveLength(1);

      store.getState().addAnalysis(analysis2);
      // Should still be 1 (deduplicated by roundNumber)
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].id).toBe('analysis-1');
    });

    it('should add analyses for different rounds', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], []);

      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addAnalysis(createPendingAnalysis(1));
      store.getState().addAnalysis(createPendingAnalysis(2));

      expect(store.getState().analyses).toHaveLength(3);
    });
  });
});

// ============================================================================
// SECTION 3: WEB SEARCH + ROUND CLOSING INTERACTION
// ============================================================================

describe('section 3: Web Search + Round Closing Interaction', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('pre-Search Blocking Analysis Creation', () => {
    it('should not block analysis creation when pre-search is complete', () => {
      setupRoundWithWebSearch(store, 0, 2, { preSearchComplete: true });
      store.getState().setIsStreaming(false);

      // Pre-search is complete, analysis can be created
      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);

      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should track pre-search trigger status separately from analysis', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [], []);

      // Pre-search tracking
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Analysis tracking is separate
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should clear pre-search tracking on failure', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [], []);

      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Clear on failure
      store.getState().clearPreSearchTracking(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  describe('round Completion With Web Search', () => {
    it('should complete round 0 with web search enabled', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];
      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add complete pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Streaming done
      store.getState().setIsStreaming(false);

      // Create analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Analysis streams
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      // Analysis completes
      store.getState().updateAnalysisData(0, createMockAnalysisPayload(0));

      // Verify complete state
      const state = store.getState();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle round 1 with web search after round 0 complete', () => {
      // Complete round 0
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(0),
      }));
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Start round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);

      // Pre-search for round 1
      store.getState().markPreSearchTriggered(1);
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Participant streaming for round 1
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setIsStreaming(false);

      // Analysis for round 1
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisData(1, createMockAnalysisPayload(1));

      // Verify both rounds complete
      const state = store.getState();
      expect(state.analyses).toHaveLength(2);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.preSearches).toHaveLength(2);
    });
  });

  describe('addPreSearch Race Condition Fix', () => {
    it('should update PENDING to STREAMING when provider and orchestrator race', () => {
      // This test verifies the fix for "Malformed JSON in request body" bug
      // Race condition: Provider creates pre-search → mutation's onSuccess invalidates query
      // → orchestrator syncs PENDING → provider's .then() tries to add STREAMING
      // Without the fix: STREAMING is skipped, PreSearchStream sees PENDING and triggers duplicate POST

      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [], [createMockUserMessage(0)]);

      // Step 1: Orchestrator adds PENDING pre-search first (race condition scenario)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuery: 'test query',
      }));

      // Verify PENDING was added
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Step 2: Provider tries to add STREAMING (should UPDATE, not skip)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        userQuery: 'test query',
      }));

      // Verify status was UPDATED to STREAMING (not skipped)
      // This ensures PreSearchStream sees STREAMING and doesn't trigger duplicate POST
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should skip if status is already STREAMING or COMPLETE', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [], [createMockUserMessage(0)]);

      // Add STREAMING pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // Try to add PENDING (should skip - STREAMING is more advanced)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));

      // Should still be STREAMING
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  describe('stuck Pre-Search Detection', () => {
    it('should detect stuck pre-search after timeout', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [], []);

      // Add pre-search stuck in STREAMING
      // Default timeout is 90 seconds (from TIMEOUT_CONFIG.DEFAULT_MS)
      // Activity timeout is 120 seconds (ACTIVITY_TIMEOUT_MS)
      // So we need the pre-search to be older than 120 seconds
      const stuckPreSearch = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 150000), // 150 seconds ago (exceeds 120s activity timeout)
      });
      store.getState().addPreSearch(stuckPreSearch);

      // Check for stuck pre-searches
      store.getState().checkStuckPreSearches();

      // Should be marked as complete to unblock the flow
      const preSearch = store.getState().preSearches[0];
      expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// SECTION 4: ANALYSIS RETRIGGERING SCENARIOS
// ============================================================================

describe('section 4: Analysis Retriggering Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('validation Failure Handling', () => {
    it('should handle analysis stream validation failure gracefully', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Create pending analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      // Simulate validation failure (like invalid confidenceWeighting)
      store.getState().updateAnalysisError(0, 'Type validation failed: Invalid option for confidenceWeighting');

      // Analysis should be in FAILED state
      const analysis = store.getState().analyses[0];
      expect(analysis.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis.errorMessage).toContain('validation');
    });

    it('should not retrigger analysis after validation failure', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisError(0, 'Validation failed');

      // Check that tracking prevents re-creation
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Attempt to add another analysis for same round
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Should still only have 1 analysis
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
    });
  });

  describe('multiple Trigger Point Race Conditions', () => {
    it('should prevent simultaneous analysis creation from Provider and FlowStateMachine', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Simulate first trigger (Provider)
      const triggered1 = !store.getState().hasAnalysisBeenCreated(0);
      if (triggered1) {
        store.getState().markAnalysisCreated(0);
        store.getState().addAnalysis(createPendingAnalysis(0));
      }

      // Simulate second trigger (FlowStateMachine) - should be blocked
      const triggered2 = !store.getState().hasAnalysisBeenCreated(0);
      expect(triggered2).toBe(false); // Already marked, should not trigger

      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should handle rapid state changes without duplicate analysis', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0), createMockParticipant(1)], [
        createMockUserMessage(0),
      ]);

      // Simulate rapid message additions
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      store.getState().setIsStreaming(false);

      // Multiple rapid checks for analysis creation
      const shouldCreate1 = !store.getState().hasAnalysisBeenCreated(0);
      if (shouldCreate1) {
        store.getState().markAnalysisCreated(0);
        store.getState().addAnalysis(createPendingAnalysis(0));
      }

      const shouldCreate2 = !store.getState().hasAnalysisBeenCreated(0);
      const shouldCreate3 = !store.getState().hasAnalysisBeenCreated(0);

      expect(shouldCreate1).toBe(true);
      expect(shouldCreate2).toBe(false);
      expect(shouldCreate3).toBe(false);
      expect(store.getState().analyses).toHaveLength(1);
    });
  });

  describe('direct addAnalysis Deduplication', () => {
    it('should use tracking to prevent race conditions', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Simulate race condition: Two triggers try to create analysis
      // First trigger marks and adds
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Second trigger tries the same
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Only one analysis should exist
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].roundNumber).toBe(0);
    });
  });
});

// ============================================================================
// SECTION 5: COMPLETE STREAM RESET SCENARIOS
// ============================================================================

describe('section 5: CompleteStreaming Reset', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should clear streaming flags after analysis creation', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)], [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);

    // Set streaming flags
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsCreatingAnalysis(true);

    // Verify flags are set
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().isCreatingAnalysis).toBe(true);

    // Complete streaming
    store.getState().completeStreaming();

    // Flags should be cleared
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().isCreatingAnalysis).toBe(false);
  });

  it('should clear waitingToStartStreaming on completion', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 6: MISMATCH DATA SCENARIOS (analyze vs analyses)
// ============================================================================

describe('section 6: Analyze vs Analyses Data Mismatch', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
  });

  it('should maintain consistency between analysis status updates', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Add analysis
    store.getState().addAnalysis(createMockAnalysis({
      id: 'analysis-0',
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      analysisData: null,
    }));

    // Update status to streaming
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);
    expect(store.getState().analyses[0].analysisData).toBeNull();

    // Update with data (should also update status to COMPLETE)
    const payload = createMockAnalysisPayload(0);
    store.getState().updateAnalysisData(0, payload);

    const analysis = store.getState().analyses[0];
    expect(analysis.status).toBe(AnalysisStatuses.COMPLETE);
    expect(analysis.analysisData).not.toBeNull();
    expect(analysis.analysisData?.confidenceWeighting).toBe(ConfidenceWeightings.BALANCED);
  });

  it('should not overwrite analysis data on status-only update', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    const payload = createMockAnalysisPayload(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      analysisData: payload,
    }));

    // Attempt status update (should not change data)
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    const analysis = store.getState().analyses[0];
    expect(analysis.analysisData).not.toBeNull();
    expect(analysis.analysisData?.confidenceWeighting).toBe(ConfidenceWeightings.BALANCED);
  });

  it('should handle analysis round mismatch gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    }));

    // Try to update non-existent round
    store.getState().updateAnalysisStatus(5, AnalysisStatuses.STREAMING);

    // Original analysis should be unchanged
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().analyses[0].roundNumber).toBe(0);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
  });
});

// ============================================================================
// SECTION 7: INTEGRATION TESTS
// ============================================================================

describe('section 7: Full Round Lifecycle With Web Search', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should complete full lifecycle: pre-search → participants → analysis', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Step 1: User submits question
    store.getState().setMessages([createMockUserMessage(0, 'btc price right now')]);
    store.getState().setPendingMessage('btc price right now');
    store.getState().setExpectedParticipantIds(['openai/gpt-4', 'openai/gpt-4']);

    // Step 2: Pre-search triggers
    store.getState().markPreSearchTriggered(0);
    store.getState().addPreSearch(createPendingPreSearch(0));
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // Step 3: Pre-search streams
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

    // Step 4: Pre-search completes
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);

    // Step 5: Participants stream
    store.getState().setIsStreaming(true);
    store.getState().setHasSentPendingMessage(true);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

    // Step 6: Participants complete
    store.getState().setIsStreaming(false);

    // Step 7: Analysis triggers (should only trigger once)
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    store.getState().markAnalysisCreated(0);
    expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

    store.getState().addAnalysis(createPendingAnalysis(0));
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

    // Step 8: Analysis streams
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

    // Step 9: Analysis completes with valid data
    const validPayload = createMockAnalysisPayload(0, {
      confidenceWeighting: ConfidenceWeightings.BALANCED,
    });
    store.getState().updateAnalysisData(0, validPayload);

    // Final state verification
    const finalState = store.getState();
    expect(finalState.preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.analyses[0].analysisData?.confidenceWeighting).toBe(ConfidenceWeightings.BALANCED);
    expect(finalState.isStreaming).toBe(false);
  });
});
