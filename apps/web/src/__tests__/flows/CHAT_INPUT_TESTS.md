# Chat Input Flow Tests

Comprehensive tests for chat input box behavior across initial and follow-up rounds.

## Test Files

### `/src/__tests__/flows/chat-input-round-behavior.test.ts`

Tests that verify the chat input box behaves **identically** between initial rounds (Round 1) and follow-up rounds (Round 2+).

**Test Coverage (35 tests):**

1. **Initial Round (Round 1) Behavior** - 11 tests
   - Input disable/enable timing
   - Loading spinner visibility
   - Thread creation blocking
   - Participant streaming states
   - Moderator streaming states
   - Web search (pre-search) execution blocking
   - Error recovery

2. **Follow-up Round (Round 2+) Behavior** - 10 tests
   - Identical disable/enable timing to Round 1
   - Identical loading states
   - Identical participant streaming
   - Identical moderator streaming
   - Identical web search blocking
   - Identical error recovery

3. **Cross-Round Consistency** - 6 tests
   - Exact state sequence matching
   - Loading spinner timing consistency
   - Web search behavior consistency
   - Error recovery consistency

4. **Edge Cases** - 5 tests
   - Round-in-progress blocking (streamingRoundNumber)
   - Pending message blocking
   - Multiple blocking flags interaction

5. **Documentation Compliance** - 4 tests
   - Verifies behavior matches FLOW_DOCUMENTATION.md
   - Input clearing on submit
   - Stop button during streaming
   - Input re-enablement after completion

### `/src/__tests__/flows/chat-input-event-sequence.test.ts`

Tests the **exact sequence of events** when user submits a message, ensuring the sequence is identical between initial and follow-up rounds.

**Test Coverage (22 tests):**

1. **Initial Round Event Sequence** - 3 tests
   - Complete event sequence without web search
   - Complete event sequence WITH web search
   - Flag transition ordering

2. **Follow-up Round Event Sequence** - 3 tests
   - Identical sequence to Round 1 (no web search)
   - Identical sequence to Round 1 (with web search)
   - Absence of thread creation step in Round 2+

3. **Loading Spinner Timing** - 4 tests
   - Spinner from submit to first stream chunk (Round 1)
   - Spinner from submit to first stream chunk (Round 2)
   - Spinner during pre-search → participant stream (Round 1)
   - Spinner during pre-search → participant stream (Round 2)

4. **Input Blocking Timing** - 6 tests
   - Continuous blocking from submit to completion (Round 1)
   - Continuous blocking from submit to completion (Round 2)
   - Blocking between pre-search and participants (Round 1)
   - Blocking between pre-search and participants (Round 2)
   - Blocking between participants and moderator (Round 1)
   - Blocking between participants and moderator (Round 2)

5. **Stop Button Behavior** - 4 tests
   - Stop button during participant streaming (Round 1)
   - Stop button during participant streaming (Round 2)
   - Stop button during moderator streaming (Round 1)
   - Stop button during moderator streaming (Round 2)

6. **Comprehensive Round Comparison** - 2 tests
   - Checkpoint matching at equivalent positions (no web search)
   - Checkpoint matching at equivalent positions (with web search)

## Key Behaviors Tested

### Input Disabled States

The tests verify that input is disabled at the SAME points in both Round 1 and Round 2+:

1. **Immediately on submit** - `waitingToStartStreaming = true`
2. **During thread creation** - `isCreatingThread = true` (Round 1 only)
3. **During pre-search execution** - Pre-search STREAMING or PENDING
4. **During participant streaming** - `isStreaming = true`
5. **Between phases** - `streamingRoundNumber !== null` (covers gaps)
6. **During moderator streaming** - `isModeratorStreaming = true`

### Loading States

The tests verify loading spinner behavior:

1. **Spinner shows:** From submit until first stream chunk arrives
2. **Spinner stops:** When first participant OR pre-search starts streaming
3. **Button disabled (no spinner):** During active streaming (participant/moderator)

### Event Sequence

The tests capture and compare checkpoints at each phase:

```
Submit clicked
  ↓
Thread creation (Round 1 only)
  ↓
Pre-search execution (if enabled)
  ↓
First participant streaming (spinner stops here)
  ↓
Participants complete
  ↓
Moderator streaming
  ↓
Round complete (input re-enables)
```

### Critical Assertions

1. **Input blocking is IDENTICAL** - Same blocking conditions in Round 1 and Round 2+
2. **Loading spinner timing is IDENTICAL** - Appears/disappears at same checkpoints
3. **No gaps in blocking** - `streamingRoundNumber` ensures continuous blocking between phases
4. **Proper re-enablement** - Input only re-enables after complete round finish

## Running the Tests

```bash
# Run all chat input flow tests
bun run test src/__tests__/flows/chat-input

# Run specific test file
bun run test src/__tests__/flows/chat-input-round-behavior.test.ts
bun run test src/__tests__/flows/chat-input-event-sequence.test.ts

# Run in watch mode
bun run test:watch src/__tests__/flows/chat-input
```

## Test Results

```
✓ src/__tests__/flows/chat-input-round-behavior.test.ts (35 tests)
✓ src/__tests__/flows/chat-input-event-sequence.test.ts (22 tests)

Test Files  2 passed (2)
Tests       57 passed (57)
```

## Related Documentation

- `/docs/FLOW_DOCUMENTATION.md` - Complete chat journey documentation
- `/docs/TESTING_SETUP.md` - Testing infrastructure setup
- `/src/components/chat/chat-input.tsx` - Chat input component implementation
- `/src/stores/chat/store.ts` - Chat store state management

## Testing Patterns Used

1. **Store-based testing** - Tests use `createChatStore()` directly to verify state logic
2. **Checkpoint comparison** - Captures state at each event and compares across rounds
3. **Helper functions** - `calculateIsInputBlocked()` mirrors actual UI logic
4. **Enum usage** - Uses `MessageStatuses`, `RoundPhases` for type-safe state
5. **Pre-fill pattern** - Uses `prefillStreamResumptionState()` for pre-search states

## Maintenance Notes

### When to Update These Tests

Update these tests when:

1. **Input blocking logic changes** - Update `calculateIsInputBlocked()` helper
2. **New blocking states added** - Add tests for new conditions
3. **Event sequence changes** - Update checkpoint sequence in event tests
4. **New phases added** - Add checkpoint capture for new phases

### Common Test Failures

**"preSearchResumption.status is undefined"**
- Ensure using `RoundPhases.PRE_SEARCH` enum, not string
- Ensure calling `prefillStreamResumptionState()` with correct structure

**"Input not blocked when expected"**
- Check if `streamingRoundNumber` is set during the round
- Verify all blocking flags are included in helper function

**"Checkpoint mismatch between rounds"**
- Ensure Round 2+ sequence excludes thread creation step
- Verify flag states are reset between test runs
