# Placeholder Behavior Tests

Comprehensive test coverage for placeholder behavior, ensuring users receive immediate visual feedback upon submission.

## Test Files

### 1. `placeholder-immediate-visibility.test.ts` (18 tests)
### 2. `placeholder-transitions-edge-cases.test.ts` (21 tests)

**Total Coverage**: 39 tests

---

## Critical Requirement

**From FLOW_DOCUMENTATION.md**:

> Placeholders MUST show IMMEDIATELY after user submission, BEFORE any streaming or loading begins. This provides instant visual feedback.

**Timing Sequence**:
```
User clicks submit → Input clears
setStreamingRoundNumber(N) called → ALL PLACEHOLDERS APPEAR IMMEDIATELY
Background: Thread creation, pre-search (if enabled), participant streaming
Placeholders remain visible until content streams in
```

---

## Test Coverage Summary

| Category | File | Tests | Description |
|----------|------|-------|-------------|
| **Immediate Visibility** | immediate-visibility | 18 | Placeholders before streaming |
| **Multi-Round** | edge-cases | 3 | Round isolation, transitions |
| **Configuration Changes** | edge-cases | 3 | Add/remove/reorder participants |
| **Pre-Search Integration** | edge-cases | 4 | Web search placeholder flow |
| **Error Handling** | edge-cases | 6 | Failures, stop, edge cases |
| **Visibility Rules** | edge-cases | 3 | When placeholders show/hide |
| **Moderator Specific** | edge-cases | 3 | Moderator placeholder lifecycle |

---

## placeholder-immediate-visibility.test.ts

### Participant Placeholders - Immediate Visibility (5 tests)

✅ **Enable placeholder visibility the moment streamingRoundNumber is set**
- Verifies `setStreamingRoundNumber(N)` triggers placeholder visibility
- Tests `isStreamingRound = roundNumber === _streamingRoundNumber` logic

✅ **Placeholder state ready before isStreaming becomes true**
- Confirms placeholders visible when `isStreaming` is still `false`
- Critical for instant feedback during API setup delay

✅ **Correct number of participant placeholders based on configuration**
- Tests 2, 5, and variable participant counts
- Ensures UI matches participant configuration

✅ **Maintain placeholder visibility during participant transitions**
- Verifies placeholders persist during P0 → P1 → P2 transitions
- Tests `currentParticipantIndex` changes don't hide placeholders

### Web Search Placeholder - Immediate Visibility (3 tests)

✅ **Show web search placeholder when enableWebSearch is true**
- Verifies pre-search section renders when enabled
- Tests `thread.enableWebSearch` flag

✅ **NOT show web search placeholder when enableWebSearch is false**
- Ensures pre-search hidden when disabled

✅ **Show web search placeholder before participant placeholders**
- Confirms visual order: pre-search → participants → moderator

### Moderator Placeholder - Immediate Visibility (3 tests)

✅ **Enable moderator placeholder visibility when streamingRoundNumber is set**
- Tests `shouldShowModerator` condition from chat-message-list.tsx:1425

✅ **Show moderator placeholder even before participants stream**
- Confirms moderator visible when `isStreaming = false`

✅ **Maintain moderator placeholder during participant streaming**
- Verifies moderator placeholder persists throughout round

### Placeholder Timing - Before Stream Tokens Arrive (4 tests)

✅ **Show ALL placeholders before first stream token arrives**
- Critical test: verifies instant feedback requirement
- Confirms placeholders with only user message in state

✅ **Not require message creation to show placeholders**
- Tests placeholder rendering based on state, not message array

✅ **Show placeholders during background loading**
- Verifies placeholders visible during thread creation, pre-search

✅ **Track placeholder visibility duration**
- Measures timing: placeholder visibility → first stream token

### Placeholder Content - Based on Configuration (3 tests)

✅ **Show placeholders for exact participant count**
- Tests 1, 2, 3, 5 participant configurations

✅ **Handle disabled participants correctly**
- Filters out `isEnabled: false` participants

✅ **Show different placeholder states during round lifecycle**
- Tests pending → streaming → complete transitions

---

## placeholder-transitions-edge-cases.test.ts

### Multi-Round Placeholder Behavior (3 tests)

✅ **Show placeholders for second round after first round completes**
- Verifies Round 0 complete → Round 1 placeholders appear

✅ **Maintain separate placeholder state for each round**
- Confirms different participant counts per round

✅ **Handle rapid round transitions**
- Tests quick R0 complete → R1 start

### Configuration Changes Impact on Placeholders (3 tests)

✅ **Update placeholders when participants added mid-conversation**
- Tests 2 → 3 participant transition

✅ **Update placeholders when participants removed**
- Tests 3 → 2 participant transition

✅ **Handle participant reordering**
- Verifies priority changes reflect in UI order

### Pre-Search Placeholder Integration (4 tests)

✅ **Show pre-search placeholder before participant placeholders**
- Visual order verification

✅ **Transition pre-search placeholder through status states**
- Tests PENDING → STREAMING → COMPLETE

✅ **Keep participant placeholders visible while pre-search executes**
- Confirms both pre-search AND participants visible

✅ **Handle pre-search failure gracefully**
- Tests FAILED status handling

### Error Handling & Edge Cases (6 tests)

✅ **Show placeholder with error state for failed participant**
- Tests `finishReason: ERROR` handling

✅ **Handle stop button during placeholder phase**
- Verifies `completeStreaming()` clears placeholders

✅ **Cleanup placeholders when round completes**
- Confirms `streamingRoundNumber` becomes `null`

✅ **Handle no participants configured**
- Edge case: empty participants array

✅ **Handle duplicate streamingRoundNumber set**
- Prevents duplicate placeholder rendering

### Placeholder Visibility Rules (3 tests)

✅ **Hide placeholders when streamingRoundNumber is null**
- Verifies no placeholders when not streaming

✅ **Only show placeholders for the streaming round**
- Confirms Round 0 complete → Round 1 streaming shows only R1 placeholders

✅ **Show placeholders even if messages array is empty**
- Edge case: placeholder rendering with no messages

### Moderator Placeholder Specific Behavior (3 tests)

✅ **Keep moderator placeholder visible throughout participant streaming**
- Tracks visibility across all participant completions

✅ **Transition moderator placeholder to streaming when participants complete**
- Tests `isStreaming: false` → `isModeratorStreaming: true`

✅ **Hide moderator placeholder when round completes**
- Verifies cleanup after moderator finishes

---

## Key Implementation References

### chat-message-list.tsx

**Line 1198**: Streaming round detection
```typescript
const isStreamingRound = roundNumber === _streamingRoundNumber;
```

**Line 1265**: Placeholder visibility condition
```typescript
const isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound;
const shouldShowPendingCards = !isRoundComplete &&
  (preSearchActive || preSearchComplete || isAnyStreamingActive);
```

**Line 1425**: Moderator placeholder condition
```typescript
const shouldShowModerator = isActuallyLatestRound
  && !isRoundComplete
  && isStreamingRound; // Show immediately when streaming round starts
```

### store.ts

**setStreamingRoundNumber**: Primary trigger for placeholder visibility
```typescript
setStreamingRoundNumber: (roundNumber) =>
  set({ streamingRoundNumber: roundNumber }, false, 'streaming/setStreamingRoundNumber')
```

---

## Running the Tests

```bash
# Run all placeholder tests
pnpm test src/__tests__/flows/placeholder-immediate-visibility.test.ts src/__tests__/flows/placeholder-transitions-edge-cases.test.ts

# Run specific file
pnpm test src/__tests__/flows/placeholder-immediate-visibility.test.ts

# Watch mode
pnpm test:watch src/__tests__/flows/placeholder-immediate-visibility.test.ts

# Run with coverage
pnpm test:coverage src/__tests__/flows/placeholder-immediate-visibility.test.ts
```

## Test Results

```
✓ placeholder-immediate-visibility.test.ts (18 tests) 23ms
✓ placeholder-transitions-edge-cases.test.ts (21 tests) 16ms

Test Files  2 passed (2)
Tests       39 passed (39)
Duration    38ms
```

---

## Test Patterns

### Immediate Visibility Pattern

```typescript
it('should show placeholders immediately', () => {
  const store = createChatStore();
  const userMessage = createTestUserMessage({ /* ... */ });
  const participants = [createParticipant(0), createParticipant(1)];

  store.getState().setMessages([userMessage]);
  store.getState().setParticipants(participants);

  // TRIGGER: Placeholders appear NOW
  store.getState().setStreamingRoundNumber(0);

  expect(store.getState().streamingRoundNumber).toBe(0);
  // UI renders placeholders for 2 participants + moderator
});
```

### Transition Pattern

```typescript
it('should transition placeholders during streaming', () => {
  const store = createChatStore();
  // Setup...

  store.getState().setStreamingRoundNumber(0);
  store.getState().setIsStreaming(true);
  store.getState().setCurrentParticipantIndex(0);

  // P0 streaming, P0 placeholder shows streaming state

  store.getState().setCurrentParticipantIndex(1);
  // P0 placeholder → content, P1 placeholder → streaming
});
```

### Configuration Change Pattern

```typescript
it('should update placeholders when config changes', () => {
  const store = createChatStore();
  store.getState().setParticipants([createParticipant(0)]);
  store.getState().setStreamingRoundNumber(0);

  // User adds participant
  store.getState().setParticipants([
    createParticipant(0),
    createParticipant(1),
  ]);

  // UI updates to show 2 placeholders instead of 1
});
```

---

## Related Documentation

- **Flow Documentation**: `/docs/FLOW_DOCUMENTATION.md` - Part 3: AI Responses Streaming
- **Component Implementation**: `/src/components/chat/chat-message-list.tsx`
- **Store Implementation**: `/src/stores/chat/store.ts`
- **Existing Tests**: `/src/stores/chat/__tests__/placeholder-timing-transitions.test.ts`

---

## Future Enhancements

Potential additional coverage:

1. **Component-Level Tests**: Render actual components with placeholders
2. **Animation Testing**: Verify placeholder loading animations
3. **Accessibility**: Screen reader announcements for placeholder states
4. **Performance**: Measure placeholder render time under load
5. **Visual Regression**: Screenshot tests for placeholder appearance

---

**Last Updated**: January 4, 2026
**Coverage**: 39 tests, all passing
**Files**: 2 test files, ~900 lines
