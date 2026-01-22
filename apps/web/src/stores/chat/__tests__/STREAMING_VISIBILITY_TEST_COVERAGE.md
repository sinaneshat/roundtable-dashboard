# Streaming Visibility Test Coverage

## Overview

This document describes comprehensive test coverage for the critical bug where messages and placeholders were NOT visible DURING streaming in non-initial rounds. The bug caused a poor user experience where the UI appeared frozen until all streaming completed.

## Bug Description

**Original Problem:**
- User submits message in non-initial round (round 1+)
- User message NOT visible until streaming completes
- Placeholder cards NOT visible during streaming
- Content only appears AFTER all streams finish
- UI appears frozen/broken during streaming

**Expected Behavior (Now Tested):**
- User message IMMEDIATELY visible (optimistic update)
- Placeholders IMMEDIATELY visible for all participants
- Content streams in GRADUALLY and updates UI progressively
- Messages remain visible throughout entire streaming process

## Test Files

### 1. `streaming-visibility-during-flow.test.ts` (NEW)
**Purpose:** Comprehensive test suite specifically for streaming visibility

**Test Coverage:**

#### Initial Round (Round 0) Streaming Visibility
- ✅ User message visible DURING streaming, not just after
- ✅ Placeholders for participants visible DURING streaming
- ✅ Gradual content updates visible DURING streaming
- ✅ Pre-search placeholder visible DURING streaming (when enabled)

#### Non-Initial Rounds (Round 1+) Streaming Visibility
- ✅ Optimistic user message IMMEDIATELY visible in round 1
- ✅ Placeholders for all participants IMMEDIATELY visible
- ✅ Visibility maintained when streaming starts
- ✅ Gradual updates for first participant visible
- ✅ All participants streaming sequentially with visibility
- ✅ Visibility preserved across PATCH response updates

#### Multi-Round Streaming Visibility
- ✅ Visibility maintained across rounds 0, 1, and 2
- ✅ Previous round messages visible during new round streaming

#### State Consistency During Streaming
- ✅ `streamingRoundNumber` maintained throughout streaming
- ✅ `streamingRoundNumber` not cleared when `configChangeRoundNumber` set
- ✅ Messages preserved when `initializeThread` called during active submission

#### Edge Cases
- ✅ Streaming starting before PATCH completes
- ✅ Rapid consecutive submissions
- ✅ Web search enabled mid-conversation

**Total Tests:** 17 tests

### 2. `non-initial-round-immediate-visibility.test.ts` (EXISTING, ENHANCED)
**Purpose:** Tests for immediate visibility of messages and state in non-initial rounds

**Test Coverage:**

#### Immediate State Changes After Submission
- ✅ Optimistic user message added to store immediately
- ✅ `streamingRoundNumber` set immediately after submission
- ✅ `configChangeRoundNumber` set immediately (before PATCH)
- ✅ `waitingToStartStreaming` set immediately
- ✅ All required flags set in correct order

#### Timeline Item Creation for Non-Initial Round
- ✅ Timeline item created for optimistic user message
- ✅ Round included in timeline even with only user message

#### Placeholder Visibility Conditions
- ✅ `streamingRoundNumber` enables placeholder rendering
- ✅ Participants array available for placeholder rendering
- ✅ `waitingToStartStreaming` blocks submissions but allows rendering

#### Pre-Search Placeholder
- ✅ Pre-search placeholder added immediately when web search enabled

#### `initializeThread` Guard During Active Submission
- ✅ Streaming state NOT reset when `configChangeRoundNumber` set
- ✅ Streaming state NOT reset when `isWaitingForChangelog` true
- ✅ Optimistic user message preserved during `initializeThread`

#### Complete Non-Initial Round Submission Flow
- ✅ Correct state immediately after all submission actions
- ✅ Visibility maintained after PATCH response updates

#### Regression: User Message Disappearance Bug
- ✅ **CRITICAL:** User message remains visible throughout entire submission flow
- ✅ User message visible before streaming
- ✅ User message visible during streaming
- ✅ User message visible after streaming completes

**Total Tests:** 21 tests

### 3. `multi-round-streaming-lifecycle.test.ts` (EXISTING)
**Purpose:** Tests complete conversation journey across multiple rounds

**Relevant Test Coverage:**
- ✅ Round initialization and completion
- ✅ Sequential participant streaming within rounds
- ✅ Round-to-round transitions
- ✅ State consistency across multiple rounds
- ✅ Configuration changes between rounds
- ✅ Pre-search flow blocking participant streaming
- ✅ Moderator phase after all participants
- ✅ Stop button behavior
- ✅ Web search toggle between rounds

**Total Tests:** 22 tests

### 4. `timeline-ordering-during-streaming.test.ts` (EXISTING)
**Purpose:** Verifies timeline items appear in correct order during streaming

**Relevant Test Coverage:**
- ✅ Pre-search before user message in round 0
- ✅ Correct order after assistant responses
- ✅ Pre-search for round 1+ in correct position
- ✅ Pre-search status transitions (PENDING → STREAMING → COMPLETE)
- ✅ Different participants between rounds
- ✅ `streamingRoundNumber` tracking during streaming

**Total Tests:** 9 tests

### 5. `second-round-first-participant-streaming.test.ts` (EXISTING)
**Purpose:** Tests for first participant streaming in round 2+ (bug that was fixed)

**Relevant Test Coverage:**
- ✅ Expected participant IDs preserved for round 2+
- ✅ `nextParticipantToTrigger` set for round 2+
- ✅ Streaming state for first participant in round 2+
- ✅ Progressive UI updates for first participant
- ✅ Timeline element ordering during multi-round streaming
- ✅ Race conditions in multi-round conversations
- ✅ `hasEarlyOptimisticMessage` flag handling
- ✅ Complete 3-round conversation flow

**Total Tests:** 21 tests

## Total Test Coverage

**Total Test Files:** 5 files
**Total Tests:** 90+ tests
**Focus:** Messages and placeholders VISIBLE DURING streaming, not just after

## Key Assertions Across All Tests

### Critical Visibility Assertions
1. `expect(state.isStreaming).toBe(true)` - Streaming is active
2. User message count > 0 - User message visible
3. `expect(state.streamingRoundNumber).toBe(roundNumber)` - Round number set
4. `expect(state.participants.length).toBeGreaterThan(0)` - Participants available
5. Assistant message visible with partial content - Progressive updates
6. All previous round messages preserved - History maintained

### State Consistency Assertions
1. `streamingRoundNumber` maintained throughout streaming
2. `configChangeRoundNumber` prevents state reset
3. `isWaitingForChangelog` prevents state reset
4. Messages array grows, never shrinks during active submission
5. Optimistic messages replaced but count maintained

## Test Execution

All tests pass successfully:

```bash
# Run new comprehensive test
bun run test streaming-visibility-during-flow.test.ts
✅ 17 tests passed

# Run existing enhanced test
bun run test non-initial-round-immediate-visibility.test.ts
✅ 21 tests passed

# Run multi-round lifecycle test
bun run test multi-round-streaming-lifecycle.test.ts
✅ 22 tests passed

# Run timeline ordering test
bun run test timeline-ordering-during-streaming.test.ts
✅ 9 tests passed

# Run second round participant test
bun run test second-round-first-participant-streaming.test.ts
✅ 21 tests passed
```

## What These Tests Prevent

1. **User Message Disappearing:** Tests ensure user message visible from submission through streaming completion
2. **Placeholder Disappearing:** Tests ensure placeholders render immediately and remain visible
3. **Frozen UI:** Tests ensure progressive updates happen during streaming
4. **State Reset:** Tests ensure `initializeThread` doesn't reset active submission state
5. **Message Loss:** Tests ensure optimistic messages preserved during server updates
6. **Round Confusion:** Tests ensure `streamingRoundNumber` maintained correctly
7. **Timeline Gaps:** Tests ensure all timeline items present during streaming

## Future Test Additions

Consider adding tests for:
- Network interruptions during streaming
- Browser tab switching during streaming
- Multiple simultaneous round submissions (should be blocked)
- Very long streaming sessions (memory/performance)
- Streaming with very large message content

## Related Files

- `/src/stores/chat/store.ts` - Chat store implementation
- `/src/stores/chat/actions/form-actions.ts` - Form submission actions
- `/src/stores/chat/actions/thread-actions.ts` - Thread management actions
- `/src/stores/chat/hooks/useHandleStreamingMessage.ts` - Streaming message handler
- `/src/containers/screens/chat/hooks/useThreadTimeline.ts` - Timeline rendering logic
