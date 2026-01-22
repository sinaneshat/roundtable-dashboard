# Changelog Flag Management Test Coverage

## Overview

Comprehensive test suite for the changelog synchronization flag management system. Ensures flags are always in consistent states and never leave the system stuck.

**Flow**: PATCH → changelog → pre-search → streams

**File**: `src/stores/chat/__tests__/changelog-flag-management.test.ts`

## Test Coverage (40 Tests)

### 1. Flag State Management (4 tests)
Tests basic flag initialization and atomic operations:
- ✓ Flags initialize with both false/null
- ✓ Both flags set atomically when preparing for config change
- ✓ Both flags clear atomically after changelog merge
- ✓ Flags can be set for different rounds

### 2. Query Trigger Conditions (3 tests)
Ensures query only runs when both flags are properly set:
- ✓ Requires BOTH flags to be true/non-null for query to run
- ✓ Query triggers immediately when both flags become true
- ✓ Query does NOT trigger if only one flag is set

**Key Logic**: `shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null`

### 3. Flag Clearing Logic (4 tests)
Verifies flags are cleared in all scenarios:
- ✓ Both flags cleared after successful changelog merge
- ✓ Both flags cleared even when changelog is empty
- ✓ Both flags cleared on timeout (30s safety mechanism)
- ✓ Both flags cleared on error

### 4. Multi-Round Scenarios (4 tests)
Tests flag behavior across different conversation rounds:
- ✓ Round 0 with config changes
- ✓ Round 1 with web search enabled mid-conversation
- ✓ Round 2+ with participant changes
- ✓ Multiple config changes across different rounds

### 5. Edge Cases - Preventing Stuck States (5 tests)
Critical tests to ensure system never gets stuck:
- ✓ PATCH failure clears flags on error
- ✓ Changelog query failure clears flags
- ✓ Rapid successive submissions handled correctly
- ✓ Inconsistent state detected: `isWaitingForChangelog=true` but `configChangeRoundNumber=null`
- ✓ Query won't run in inconsistent state

**Critical Bug Fix**: The hook detects and fixes inconsistent state where `isWaitingForChangelog=true` but `configChangeRoundNumber=null`, which would block streaming forever.

### 6. Flag Interaction with Other State (5 tests)
Tests how flags interact with store operations:
- ✓ Flags preserved during `initializeThread` when `hasActiveFormSubmission`
- ✓ Flags reset during `initializeThread` when NO active submission
- ✓ Flags cleared on `completeModeratorStream`
- ✓ Flags set in `prepareForNewMessage` when `hasPendingConfigChanges`
- ✓ Flags NOT set in `prepareForNewMessage` when no config changes

**Preservation Logic**:
```typescript
const hasActiveFormSubmission =
  configChangeRoundNumber !== null || isWaitingForChangelog;
const preserveStreamingState = isResumption || hasActiveFormSubmission;
```

### 7. prepareForNewMessage Flag Setting (3 tests)
Tests flag setting during message preparation:
- ✓ Both flags set when `hasPendingConfigChanges` is true
- ✓ Correct round number calculated for flags
- ✓ Uses `streamingRoundNumber` if already set

### 8. Timeout Safety Mechanism (2 tests)
Verifies 30s timeout prevents permanent stuck states:
- ✓ Flags cleared after timeout if not cleared by normal flow
- ✓ Timeout clearing works when both flags are set

### 9. Flag Consistency Validation (2 tests)
Ensures flags maintain consistent states:
- ✓ Never have `isWaitingForChangelog=false` with non-null `configChangeRoundNumber`
- ✓ Flags can be cleared in different orders without issues

### 10. Integration with hasPendingConfigChanges (2 tests)
Tests interaction with pending config changes flag:
- ✓ Works correctly with `hasPendingConfigChanges` flag
- ✓ Only sets changelog flags when `hasPendingConfigChanges` is true

### 11. Round Number Tracking (2 tests)
Validates round number management:
- ✓ Tracks different round numbers correctly (0, 1, 2, 5, 10)
- ✓ Allows updating `configChangeRoundNumber` while waiting

### 12. Reset Operations (4 tests)
Ensures flags are cleared during various reset operations:
- ✓ Flags cleared on `resetToNewChat`
- ✓ Flags cleared on `resetForThreadNavigation`
- ✓ Flags cleared on `resetToOverview`
- ✓ Flags cleared on `completeStreaming`

## Key Components Tested

### Store Actions
- `setIsWaitingForChangelog(boolean)`
- `setConfigChangeRoundNumber(number | null)`
- `prepareForNewMessage(...)`
- `initializeThread(...)`
- `completeModeratorStream()`
- `completeStreaming()`
- `resetToNewChat()`
- `resetForThreadNavigation()`
- `resetToOverview()`

### Hooks Covered
- `use-changelog-sync.ts`: Fetches changelog when flags set
- `thread-actions.ts`: Also has changelog logic for thread screen

### Critical Conditions

**Query Execution**:
```typescript
const shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null;
```

**Active Form Submission Detection**:
```typescript
const hasActiveFormSubmission =
  configChangeRoundNumber !== null || isWaitingForChangelog;
```

**Inconsistent State Detection** (Bug Fix):
```typescript
if (isWaitingForChangelog && configChangeRoundNumber === null) {
  // Clear isWaitingForChangelog to prevent infinite blocking
  setIsWaitingForChangelog(false);
}
```

## Test Scenarios Covered

### Happy Path
1. User makes config change
2. Both flags set atomically
3. Query fetches changelog
4. Both flags cleared after merge
5. Streaming proceeds

### Empty Changelog
1. Flags set
2. Query returns empty result
3. Both flags still cleared
4. System continues normally

### Error Scenarios
1. PATCH fails → flags cleared
2. Query fails → flags cleared
3. Timeout (30s) → flags cleared

### Multi-Round
1. Round 0 with initial config
2. Round 1 with web search enabled
3. Round 2+ with participant changes
4. Each round has independent flag lifecycle

### Edge Cases
1. Rapid successive submissions
2. Inconsistent state detection and repair
3. Flags preserved during PATCH response
4. Flags reset during thread navigation

## Success Criteria

All tests verify:
1. ✅ Flags are always in consistent states
2. ✅ Query only runs when both flags are properly set
3. ✅ Flags are cleared after successful merge
4. ✅ Flags are cleared on error/timeout
5. ✅ System never gets stuck waiting for changelog
6. ✅ Multi-round scenarios work correctly
7. ✅ Edge cases are handled gracefully

## Running the Tests

```bash
# Run all changelog flag tests
bun run test src/stores/chat/__tests__/changelog-flag-management.test.ts

# Run in watch mode
bun run test:watch src/stores/chat/__tests__/changelog-flag-management.test.ts

# Run with verbose output
bun run test src/stores/chat/__tests__/changelog-flag-management.test.ts --reporter=verbose
```

## Related Files

- `/src/stores/chat/store.ts` - Flag state management
- `/src/components/providers/chat-store-provider/hooks/use-changelog-sync.ts` - Changelog sync hook
- `/src/stores/chat/actions/thread-actions.ts` - Thread screen changelog logic
- `/src/hooks/queries/chat/changelog.ts` - useThreadRoundChangelogQuery
- `/src/stores/chat/store-defaults.ts` - Default flag values

## Key Learnings

1. **Atomic Operations**: Both flags must be set/cleared together to maintain consistency
2. **Query Gating**: Query requires BOTH flags to be true/non-null
3. **Timeout Safety**: 30s timeout prevents permanent stuck states
4. **Inconsistent State Detection**: Hook detects and fixes `isWaitingForChangelog=true` with `configChangeRoundNumber=null`
5. **Preservation During PATCH**: Flags preserved during `initializeThread` when active submission is in progress
6. **Reset Operations**: All reset operations properly clear changelog flags
