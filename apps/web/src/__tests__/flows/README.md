# Flow Tests - User Message Submission and Patching

This directory contains comprehensive tests for the critical user message submission and patching flow as documented in FLOW_DOCUMENTATION.md.

## Test Files

### 1. `user-message-patch-timing.test.ts` (29 tests)

Tests the CRITICAL requirement: **"When user submits, the message MUST be patched to thread data FIRST"**

#### Coverage Areas:

**1. Optimistic Message Addition (4 tests)**
- Message added to store IMMEDIATELY on submission
- streamingRoundNumber set to match optimistic message
- Works identically with and without config changes

**2. Streaming Block - configChangeRoundNumber (5 tests)**
- ALWAYS set before PATCH to prevent streaming
- Blocks streaming regardless of config changes
- Set BEFORE waitingToStartStreaming flag

**3. PATCH Completion - Message Replacement (3 tests)**
- Optimistic message replaced with persisted message
- Content and round number preserved during replacement
- Real database ID assigned to persisted message

**4. Streaming Unblock (3 tests)**
- configChangeRoundNumber cleared when NO config changes (after PATCH)
- NOT cleared when config changes exist (waits for changelog)
- hasPendingConfigChanges cleared after submission

**5. Complete Flow - No Config Changes (2 tests)**
- Full flow: optimistic message → block → PATCH → unblock
- Message array length correct after submission

**6. Complete Flow - With Config Changes (2 tests)**
- Full flow: optimistic message → block → PATCH → changelog → unblock
- configChangeRoundNumber kept until changelog syncs

**7. Error Handling - PATCH Failure (3 tests)**
- Optimistic message rolled back on error
- Streaming state reset on error
- Existing messages preserved on error

**8. Timing Verification - Ordering Guarantees (4 tests)**
- Optimistic message added BEFORE configChangeRoundNumber
- configChangeRoundNumber set BEFORE waitingToStartStreaming
- PATCH completes BEFORE configChangeRoundNumber cleared
- PATCH completes BEFORE changelog fetch triggered

**9. Identical Flow Verification (4 tests)**
- Same optimistic message addition flow regardless of config changes
- configChangeRoundNumber set in both scenarios
- Message replacement works identically
- Only difference is configChangeRoundNumber clearing timing

---

### 2. `presearch-placeholder-patch-timing.test.ts` (18 tests)

Tests the relationship between pre-search placeholder creation and message patching.

#### Coverage Areas:

**1. Pre-Search Placeholder Creation Timing (4 tests)**
- Created AFTER optimistic message added
- Created BEFORE waitingToStartStreaming set
- NOT created when web search disabled
- Created with correct roundNumber

**2. Pre-Search Placeholder Prevents Streaming (4 tests)**
- PENDING status when optimistic message added
- Waits for pre-search completion before participants stream
- Blocks streaming while PENDING
- Allows streaming when COMPLETE

**3. Complete Flow - Web Search Enabled, No Config Changes (2 tests)**
- Full flow: message → pre-search placeholder → PATCH → unblock
- Streaming waits for BOTH message PATCH AND pre-search completion

**4. Complete Flow - Web Search Enabled, With Config Changes (2 tests)**
- Full flow: message → pre-search → PATCH → changelog → unblock
- Waits for changelog even if pre-search complete

**5. Identical Flow - With vs Without Config Changes (2 tests)**
- Pre-search placeholder created identically regardless of config changes
- Message + pre-search added in same order for both scenarios

**6. Error Handling - Pre-Search Cleanup (2 tests)**
- Pre-search placeholder kept on PATCH failure (for retry)
- FAILED status allows streaming to proceed

**7. Round Number Isolation (2 tests)**
- Separate pre-search placeholders for different rounds
- Pre-search status not confused between rounds

---

## Key Behavioral Requirements Tested

### Message Patching Flow (form-actions.ts:266-397)

1. **Optimistic Update (Line 285)**
   - User message added to store IMMEDIATELY
   - Provides instant UI feedback before PATCH

2. **Streaming Block (Line 309)**
   - configChangeRoundNumber ALWAYS set before PATCH
   - Prevents streaming from starting before message persisted to DB
   - Critical error prevented: "[stream] User message not found in DB, expected pre-persisted"

3. **PATCH Request (Line 321)**
   - Persists message to database
   - Updates config if changes exist
   - Creates changelog entries if needed

4. **Message Replacement (Line 343-346)**
   - Optimistic message replaced with persisted message
   - Database-assigned ID replaces temporary ID

5. **Streaming Unblock**
   - **No config changes (Line 371-373):** configChangeRoundNumber cleared immediately
   - **With config changes (Line 367-369):** isWaitingForChangelog set, configChangeRoundNumber cleared by use-changelog-sync

6. **Pre-Search Integration (Line 297-303)**
   - Placeholder created AFTER optimistic message
   - Placeholder created BEFORE streaming block
   - Blocks streaming until pre-search completes

### Critical Timing Dependencies

```
1. User submits message
   ↓
2. Optimistic message added to store (IMMEDIATE UI FEEDBACK)
   ↓
3. Pre-search placeholder created (if web search enabled)
   ↓
4. configChangeRoundNumber set (BLOCKS STREAMING)
   ↓
5. waitingToStartStreaming set
   ↓
6. PATCH request persists message to DB
   ↓
7. Optimistic message replaced with persisted message
   ↓
8a. No config changes: configChangeRoundNumber cleared → streaming can proceed
8b. With config changes: isWaitingForChangelog set → wait for changelog → then stream
```

### Identical Flow Guarantee

**The flow works IDENTICALLY whether config changes exist or not:**

- ✅ Optimistic message addition: SAME
- ✅ Pre-search placeholder creation: SAME (if web search enabled)
- ✅ configChangeRoundNumber blocking: SAME
- ✅ PATCH request: SAME (includes message + optional config)
- ✅ Message replacement: SAME
- ❗ **ONLY DIFFERENCE:** configChangeRoundNumber clearing timing
  - No config changes: cleared immediately after PATCH
  - With config changes: cleared after changelog sync

---

## Test Strategy

### Store-Level Testing
All tests use direct store manipulation to test state transitions and timing:
- No React component rendering needed
- Focus on state machine logic
- Fast execution
- Easy to debug

### Timing Verification
Tests verify critical ordering guarantees:
- Using sequential ACT steps
- Asserting state at each phase
- Checking timing with performance.now() where needed

### Error Scenarios
Tests verify proper cleanup on failures:
- PATCH failure rollback
- Streaming state reset
- Pre-search cleanup behavior

---

## References

- **FLOW_DOCUMENTATION.md Part 6:** Configuration Changes Mid-Conversation
- **FLOW_DOCUMENTATION.md Part 14:** Race Condition Protection
- **form-actions.ts:266-397:** handleUpdateThreadAndSend implementation
- **src/stores/chat/store.ts:** Chat store state management

---

## Running Tests

```bash
# Run all flow tests
bun run test src/__tests__/flows/

# Run specific test file
bun run test src/__tests__/flows/user-message-patch-timing.test.ts
bun run test src/__tests__/flows/presearch-placeholder-patch-timing.test.ts

# Watch mode
bun run test:watch src/__tests__/flows/

# Coverage
bun run test:coverage src/__tests__/flows/
```

---

---

### 3. `submission-performance.test.ts` (16 tests)

Tests store update frequency and function call counts during submission flow to detect performance regressions.

#### Coverage Areas:

**1. Store Updates (3 tests)**
- Tracks update frequency during submission (baseline: 8 updates)
- Monitors streaming chunk update count
- Documents batched operations (completeStreaming)

**2. Function Call Tracking (5 tests)**
- setMessages called N times for N chunks
- setIsStreaming called exactly 2x per session (start + end)
- setCurrentParticipantIndex called per participant transition
- addPreSearch NOT called when web search disabled
- addPreSearch called exactly once when enabled

**3. Sequential Participant Streaming (2 tests)**
- currentParticipantIndex increments sequentially without gaps
- Message updates per participant tracked without duplicates

**4. Council Moderator (2 tests)**
- Transition from participant to moderator streaming efficiency
- Moderator does not trigger while participants streaming

**5. Regression Baselines (3 tests)**
- Documents baseline: ~109 updates per complete round
- Verifies completeStreaming batching maintained (1 update, not 4)
- No duplicate messages after streaming

---

### 4. `submission-sanity.test.ts` (26 tests)

Sanity checks to verify state updates happen in correct order and expected state.

#### Coverage Areas:

**1. State Transition Order (3 tests)**
- Transition from initial UI to streaming in correct order
- isCreatingThread and isStreaming never true simultaneously
- streamingRoundNumber consistency with messages

**2. Invalid State Prevention (4 tests)**
- currentParticipantIndex validation (provider enforces >= 0)
- isStreaming not true when streamingRoundNumber is null
- streamingRoundNumber cleared when completing streaming
- isStreaming and isModeratorStreaming never true simultaneously

**3. Pre-Search Integration (4 tests)**
- Creates PENDING pre-search when web search enabled
- Status transitions: PENDING → STREAMING → COMPLETE
- NO pre-search when web search disabled
- Atomic tryMarkPreSearchTriggered prevents duplicates

**4. Message Ordering (3 tests)**
- Chronological message order maintained
- User message before assistant messages in same round
- Participant index order within round

**5. Council Moderator Integration (3 tests)**
- Moderator message only after all participants complete
- isModeratorStreaming cleared after moderator completes
- Moderator does not start if participants still streaming

**6. Screen Mode Transitions (2 tests)**
- OVERVIEW → THREAD after first round
- Stays in THREAD for subsequent rounds

**7. Critical Flags (6 tests)**
- Input value cleared after submission
- waitingToStartStreaming set correctly
- pendingMessage reset after submission
- enableWebSearch toggle works
- createdThreadId set after thread creation
- effectiveThreadId tracked correctly

---

### 5. `action-invocation-counts.test.ts` (21 tests)

Tests to verify store actions are called the correct number of times to detect duplicate calls and race conditions.

#### Coverage Areas:

**1. Submission Flow (5 tests)**
- setInputValue exactly 2x (type + clear)
- setIsCreatingThread exactly 2x (start + end)
- setShowInitialUI exactly once
- setStreamingRoundNumber once per round
- setCreatedThreadId exactly once per thread

**2. Participant Streaming (4 tests)**
- setCurrentParticipantIndex N times for N participants
- setIsStreaming exactly 2x per session
- completeStreaming exactly once per round
- setMessages N times for N chunks

**3. Council Moderator (2 tests)**
- setIsModeratorStreaming exactly 2x (start + end)
- NOT called while participants streaming

**4. Pre-Search (5 tests)**
- addPreSearch exactly once when enabled
- NOT called when disabled
- updatePreSearchStatus exactly 2x (STREAMING + COMPLETE)
- tryMarkPreSearchTriggered atomic (once successful, once failed)
- Prevents duplicate execution via atomic flag

**5. Multi-Round Flow (1 test)**
- Tracks action calls across two complete rounds

**6. Error Scenarios (2 tests)**
- Documents validation failure behavior
- Stop button prevents further participant calls

**7. Performance Regression (2 tests)**
- Documents baseline: 107 calls (no web search), 111 calls (with web search)
- Verifies no duplicate setMessages for same content

---

### 6. `render-count-tracking.test.tsx` (12 tests)

Documents render count patterns and optimization opportunities (documentation-only tests).

#### Coverage Areas:

**1. Subscription Patterns (3 tests)**
- Global subscription causes excessive re-renders
- Scoped subscription reduces re-renders
- useShallow batching prevents object reference re-renders

**2. Store Update Simulation (3 tests)**
- Scoped subscription pattern (11 renders vs 14)
- Batched subscription with useShallow (8 renders vs 9+)
- useShallow prevents unnecessary re-renders (20-30% reduction)

**3. Streaming Performance (2 tests)**
- Sequential participant streaming (6 renders)
- Batched state updates (66% reduction)

**4. Message Updates (2 tests)**
- Message update render behavior
- Streaming chunk efficiency (50 chunks = 50 renders, throttle opportunity)

**5. Pre-Search Performance (1 test)**
- Pre-search status transitions (4 renders)

**6. Performance Baselines (1 test)**
- Complete round baseline: ~108 renders

---

## Performance Baselines

### Complete Round 0 (3 participants, no web search)

**State Updates:**
- Submission: 8 updates
- Participants: ~69 updates (23 per participant × 3)
- Council Moderator: ~32 updates
- **Total: ~109 updates**

**Action Calls:**
- Submission: 7 calls
- Streaming: 67 calls
- Moderator: 32 calls
- Cleanup: 1 call
- **Total: 107 calls**

**Component Renders (theoretical):**
- Submission: 8 renders
- Participants: ~69 renders
- Moderator: ~32 renders
- **Total: ~109 renders**

### Optimization Opportunities

1. **Batch Submission State** (8 → 1-2 updates)
   - Current: 8 separate setState calls
   - Optimized: Single batched update
   - Impact: 75% reduction in submission updates

2. **Throttle Streaming Chunks** (20 → 10-15 updates per participant)
   - Current: Every chunk triggers update
   - Optimized: Throttle to 10-20 updates/second
   - Impact: 40-60% reduction in streaming updates

3. **Use useShallow for Batched Selectors**
   - Current: Multiple individual selectors
   - Optimized: Single useShallow selector
   - Impact: 20-30% reduction in component re-renders

---

## Test Count Summary

- **user-message-patch-timing.test.ts:** 29 tests
- **presearch-placeholder-patch-timing.test.ts:** 18 tests
- **submission-performance.test.ts:** 16 tests
- **submission-sanity.test.ts:** 26 tests
- **action-invocation-counts.test.ts:** 21 tests
- **render-count-tracking.test.tsx:** 12 tests
- **Total:** 122 tests

All tests passing ✅
