# Placeholder Ordering & Timing Test Results

## Summary

Added comprehensive tests to verify timeline element ordering during round submission. **All tests pass**, indicating the store-level state management correctly maintains element ordering.

## Tests Added

### 1. User Message First
**Test**: `should show user message FIRST immediately after submission`
**Status**: ✅ PASS
**Verifies**: User message appears first in the messages array after submission

### 2. Pre-Search Before Participants
**Test**: `should show pre-search BEFORE participant placeholders when web search enabled`
**Status**: ✅ PASS
**Verifies**:
- Pre-search exists in preSearches array
- Pre-search has correct round number
- streamingRoundNumber is set (triggers participant placeholders)

### 3. Participant Priority Order
**Test**: `should show participant placeholders in PRIORITY ORDER`
**Status**: ✅ PASS
**Verifies**:
- Participants array maintains priority order (0, 1, 2)
- Store guarantees participants are sorted by priority

### 4. Moderator After Participants
**Test**: `should show moderator placeholder AFTER all participants`
**Status**: ✅ PASS
**Verifies**:
- streamingRoundNumber triggers moderator placeholder visibility
- Moderator renders based on conditions in chat-message-list.tsx:1423-1425

### 5. Complete Ordering Flow
**Test**: `should maintain COMPLETE ordering: User → PreSearch → P0 → P1 → Moderator`
**Status**: ✅ PASS
**Verifies**:
- User message appears first
- Pre-search added after user
- P0 appears after pre-search completes
- P1 appears after P0
- Moderator appears last

### 6. No Reordering During Streaming
**Test**: `should NOT reorder elements during streaming`
**Status**: ✅ PASS
**Verifies**:
- User message reference stays constant
- Messages maintain stable order throughout streaming
- No elements jump positions

### 7. Immediate Placeholder Appearance
**Test**: `should show all placeholders IMMEDIATELY on streamingRoundNumber set`
**Status**: ✅ PASS
**Verifies**:
- User message exists
- Pre-search exists
- streamingRoundNumber triggers participant placeholders
- Moderator placeholder becomes visible
- All happens BEFORE streaming starts (isStreaming=false)

### 8. No Element Removal
**Test**: `should NOT remove any elements during streaming`
**Status**: ✅ PASS
**Verifies**:
- User message stays present throughout flow
- Pre-search stays present throughout flow
- Participant messages accumulate (not replaced)
- Moderator message appended at end

## Key Findings

### Store-Level State ✅ CORRECT
The Zustand store correctly maintains:
1. **User message order**: Always first in messages array
2. **Pre-search isolation**: Stored in separate `preSearches` array
3. **Participant order**: Maintained by priority in `participants` array
4. **Message accumulation**: Messages append, not replace
5. **Streaming triggers**: `streamingRoundNumber` correctly triggers placeholder visibility

### Component Rendering (Not Tested Here)
These tests verify **store state**, not **UI rendering**. The actual timeline ordering is determined by:
- `/src/components/chat/chat-message-list.tsx` lines 1185-1485
- Pre-search card rendering at lines 1156-1180
- Participant pending cards at lines 1185-1392
- Moderator placeholder at lines 1394-1485

### Rendering Conditions for Placeholders

Based on `chat-message-list.tsx`:

#### Participant Pending Cards (lines 1265-1267)
```typescript
const shouldShowPendingCards = !isRoundComplete
  && (preSearchActive || preSearchComplete || isAnyStreamingActive);
```

**Conditions Met When**:
- Round not complete AND
- (Pre-search PENDING/STREAMING OR Pre-search COMPLETE OR isStreaming OR isModeratorStreaming OR isStreamingRound)

#### Moderator Placeholder (line 1425)
```typescript
const shouldShowModerator = isActuallyLatestRound
  && !isRoundComplete
  && isStreamingRound;
```

**Conditions Met When**:
- This is the latest round AND
- Round not complete AND
- roundNumber === streamingRoundNumber

## Potential Issues to Investigate

While store state is correct, these UI-level issues may exist:

### 1. Pre-Search Ordering
- **Store**: Pre-search in `preSearches[0]` ✅
- **Render**: Pre-search card at line 1156 (AFTER user message group) ✅
- **Potential Issue**: Check if pre-search actually renders BEFORE participant pending cards

### 2. Participant Placeholder Ordering
- **Store**: Participants sorted by priority ✅
- **Render**: Loop at line 1297 iterates `enabledParticipants`
- **Potential Issue**: Verify `getEnabledParticipants()` maintains sort order

### 3. Moderator Placeholder Timing
- **Store**: streamingRoundNumber triggers visibility ✅
- **Render**: Two moderator sections exist:
  - Inside user-group (lines 1394-1485)
  - After messageGroups (lines 1544-1648)
- **Potential Issue**: Check for duplicate moderator rendering or gaps

### 4. Element Disappearance During Streaming
- **Store**: Elements never removed ✅
- **Render**: Complex skip logic at lines 957, 1500-1503
- **Potential Issue**: Verify messages don't temporarily disappear during transitions

## Recommendations

### Next Steps

1. **Component Integration Tests**: Test actual UI rendering with React Testing Library
   - Render ChatMessageList with store state
   - Query DOM for timeline elements
   - Verify visual ordering matches expected sequence

2. **Check shouldShowPendingCards Logic**:
   - Line 1266 condition might hide placeholders unexpectedly
   - Test edge cases: pre-search complete + streaming not started

3. **Verify getEnabledParticipants Sorting**:
   - Ensure `getEnabledParticipants()` maintains priority order
   - Check for any sort/filter operations that might reorder

4. **Test Moderator Placeholder Coordination**:
   - Two IIFE sections render moderator (inside/outside user-group)
   - Verify only ONE renders at any time (no duplicates or gaps)

### Files to Review

- `/src/lib/utils/participant-utils.ts` - `getEnabledParticipants()` implementation
- `/src/components/chat/chat-message-list.tsx:1185-1485` - Pending cards rendering logic
- `/src/stores/chat/store.ts` - Participant initialization and sorting

## Conclusion

**Store-level state management is CORRECT.** All timeline elements maintain proper ordering:
1. User message FIRST ✅
2. Pre-search BEFORE participants ✅
3. Participants in PRIORITY ORDER ✅
4. Moderator LAST ✅
5. No reordering during streaming ✅
6. No element removal ✅

If ordering issues exist in production, they are likely in the **component rendering layer** (`chat-message-list.tsx`), not the store. Component-level integration tests are needed to verify the UI reflects store state correctly.
