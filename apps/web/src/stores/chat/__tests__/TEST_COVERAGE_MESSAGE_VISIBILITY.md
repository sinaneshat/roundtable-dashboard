# Message Visibility Test Coverage

This document explains the comprehensive test coverage for catching message visibility issues during form submission, particularly for non-initial rounds.

## Bug Scenario That Tests Catch

### The Problem
When users submitted a non-initial round (round 1+):
1. Optimistic user message was added correctly ✅
2. PATCH completed and replaced message ID ✅
3. AI SDK streaming started and created a participant trigger message ✅
4. **useMinimalMessageSync synced messages → User message DISAPPEARED** ❌

### Root Cause
AI SDK sync was replacing store messages without preserving the original user message. After deduplication filtered the participant trigger, no user message remained visible.

## Test Files and Coverage

### 1. `/src/stores/chat/__tests__/form-actions-message-persistence.test.ts`

**NEW FILE** - 17 comprehensive tests specifically for message persistence throughout form submission flow.

#### Test Categories

**Optimistic Message Creation (2 tests)**
- ✅ Creates optimistic message with correct metadata (role, roundNumber, isOptimistic)
- ✅ Creates optimistic message with file attachments

**Optimistic Message Addition to Store (2 tests)**
- ✅ Adds optimistic message immediately to store
- ✅ Preserves all previous messages when adding optimistic

**Message ID Replacement After PATCH (2 tests)**
- ✅ Replaces optimistic ID with persisted DB ID
- ✅ Maintains message content during ID replacement

**CRITICAL: Message Persistence During AI SDK Sync (2 tests)**
- ✅ **Preserves user message when AI SDK introduces participant trigger**
- ✅ **Preserves user message throughout entire submission flow (all phases)**

These two tests directly catch the bug where user messages were lost during AI SDK sync.

**StreamingRoundNumber Synchronization (3 tests)**
- ✅ Sets streamingRoundNumber immediately after optimistic add
- ✅ Maintains streamingRoundNumber during message ID replacement
- ✅ Ensures streamingRoundNumber matches user message round

**Config Change Round Number Blocking (2 tests)**
- ✅ Sets configChangeRoundNumber to block streaming before PATCH
- ✅ Prevents initializeThread from resetting state when configChangeRoundNumber set

**Edge Cases: Multiple Rounds (2 tests)**
- ✅ Preserves messages from all rounds during sync
- ✅ Handles ID replacement in rapid succession

**Error Handling: Rollback on PATCH Failure (2 tests)**
- ✅ Removes optimistic message on PATCH error
- ✅ Resets streaming state on PATCH error

### 2. `/src/stores/chat/__tests__/non-initial-round-submission-flow-playwright.test.ts`

**UPDATED** - Added 6 new critical tests (now 56 total tests).

#### New Test Section: "CRITICAL: User message visibility during non-initial round submission"

**Phase-Based Visibility Tests (6 tests)**

1. **Optimistic Add → PATCH Completion**
   - ✅ Maintains visibility from optimistic creation through ID replacement

2. **Streaming State Transitions**
   - ✅ Does NOT lose user message during:
     - waitingToStartStreaming transitions
     - isStreaming start/stop
     - Adding assistant messages

3. **Config Change Blocking**
   - ✅ Preserves user message when configChangeRoundNumber blocks streaming

4. **initializeThread Guard**
   - ✅ Preserves user message through initializeThread calls during active submission
   - This catches the bug where initializeThread would wipe messages if guards failed

5. **Complete Flow Verification**
   - ✅ Maintains user message count = 1 throughout entire flow:
     - Optimistic add
     - ID replacement
     - Streaming start
     - During participant streaming
     - During moderator streaming
     - After completion

6. **Error Rollback**
   - ✅ Properly removes optimistic message on PATCH failure

### 3. `/src/stores/chat/__tests__/non-initial-round-user-message-sync.test.ts`

**EXISTING** - 17 tests focused on useMinimalMessageSync logic.

#### Key Coverage

**Filter Store-Only Messages (4 tests)**
- ✅ Preserves original user message when AI SDK has participant trigger
- ✅ Does NOT preserve participant trigger messages from store
- ✅ Preserves original user messages from multiple rounds
- ✅ Does not duplicate messages already in AI SDK

**Merge Messages (2 tests)**
- ✅ **CRITICAL: Merged result contains original user message after AI SDK sync**
- ✅ Preserves complete conversation history after AI SDK sync

**Edge Cases (3 tests)**
- ✅ Handles empty store/chat messages
- ✅ Handles null metadata gracefully

### 4. `/src/stores/chat/__tests__/non-initial-round-immediate-visibility.test.ts`

**EXISTING** - Tests immediate visibility of messages and placeholders.

#### Key Coverage

**Immediate State Changes (5 tests)**
- ✅ Adds optimistic message immediately
- ✅ Sets streamingRoundNumber immediately
- ✅ Sets configChangeRoundNumber immediately
- ✅ All required flags set in correct order

**Timeline Item Creation (2 tests)**
- ✅ Creates timeline item for optimistic user message
- ✅ Includes round in timeline even with only user message

**Placeholder Visibility (3 tests)**
- ✅ streamingRoundNumber enables placeholder rendering
- ✅ Participants available for placeholder rendering
- ✅ waitingToStartStreaming blocks submission but allows rendering

**initializeThread Guard (3 tests)**
- ✅ Does NOT reset state when configChangeRoundNumber set
- ✅ Does NOT reset state when isWaitingForChangelog true
- ✅ Preserves optimistic user message during initializeThread

**Complete Flow (2 tests)**
- ✅ Correct state immediately after all submission actions
- ✅ Maintains visibility after PATCH response updates

## How Tests Would Catch The Bug

### Bug Reproduction Test Case

```typescript
// This exact scenario would FAIL before the fix:

it('should preserve user message when AI SDK sync introduces participant trigger', () => {
  // 1. User submits round 1 (optimistic message)
  const optimisticMessage = createOptimisticUserMessage({
    roundNumber: 1,
    text: 'Follow-up question',
  });
  store.setMessages(msgs => [...msgs, optimisticMessage]);

  // 2. PATCH completes (ID replaced)
  const persistedId = 'db-user-msg-r1';
  const persistedMessage = { ...optimisticMessage, id: persistedId };
  store.setMessages(msgs =>
    msgs.map(m => m.id === optimisticMessage.id ? persistedMessage : m)
  );

  // 3. AI SDK starts streaming (creates participant trigger)
  const participantTrigger = {
    id: 'ai-sdk-trigger-xyz',
    role: 'user',
    metadata: { roundNumber: 1, isParticipantTrigger: true },
  };
  const chatMessages = [participantTrigger];

  // 4. Simulate message sync
  const mergedMessages = simulateMessageSync(chatMessages, storeMessages);

  // BUG: This assertion would FAIL before the fix
  // Because originalUserMsg would be undefined (lost during sync)
  const originalUserMsg = mergedMessages.find(m => m.id === persistedId);
  expect(originalUserMsg).toBeDefined(); // ❌ FAILS WITHOUT FIX
});
```

### Test Assertions That Catch The Bug

1. **Message Count Assertions**
   ```typescript
   expect(getUserMessageCount(1)).toBe(1);
   // Would be 0 if message lost
   ```

2. **Message Presence Assertions**
   ```typescript
   const userMsg = messages.find(m => m.id === persistedId);
   expect(userMsg).toBeDefined();
   // Would be undefined if lost
   ```

3. **Message Content Assertions**
   ```typescript
   expect(userMsg.parts[0]).toEqual({ type: 'text', text: 'Follow-up' });
   // Would fail if message replaced/lost
   ```

4. **Phase-by-Phase Tracking**
   ```typescript
   // After optimistic add
   expect(getUserMessageCount(1)).toBe(1);
   // After ID replacement
   expect(getUserMessageCount(1)).toBe(1);
   // After AI SDK sync
   expect(getUserMessageCount(1)).toBe(1); // ❌ Would be 0 with bug
   ```

## Test Execution

Run all message visibility tests:

```bash
# Specific test files
pnpm test form-actions-message-persistence
pnpm test non-initial-round-user-message-sync
pnpm test non-initial-round-immediate-visibility
pnpm test non-initial-round-submission-flow-playwright

# All chat store tests
pnpm test src/stores/chat/__tests__/

# Watch mode for development
pnpm test:watch form-actions-message-persistence
```

## Coverage Summary

**Total Tests**: 73+ tests across 4 files
**Direct Bug Detection**: 8 tests specifically catch the message loss bug
**Supporting Coverage**: 65+ tests verify related state management

### Coverage Breakdown

- ✅ Optimistic message creation and addition
- ✅ Message ID replacement after PATCH
- ✅ **AI SDK sync message preservation** (THE BUG)
- ✅ State synchronization (streamingRoundNumber, configChangeRoundNumber)
- ✅ initializeThread guards during active submission
- ✅ Complete flow from submission to completion
- ✅ Error handling and rollback
- ✅ Multiple rounds and edge cases

## Key Patterns Tested

1. **Optimistic UI Updates**
   - Immediate feedback before server confirmation
   - ID replacement without losing message
   - Rollback on error

2. **Message Sync Logic**
   - Preserving store-only messages
   - Filtering participant triggers
   - Merging AI SDK with store messages

3. **State Guards**
   - configChangeRoundNumber blocks streaming
   - isWaitingForChangelog prevents state reset
   - initializeThread respects active submission

4. **Phase Transitions**
   - Optimistic → Persisted
   - Pre-streaming → Streaming
   - Participant streaming → Moderator streaming
   - Streaming → Complete

## Future Maintenance

When modifying form submission or message sync logic:

1. **Run these tests FIRST** to ensure no regressions
2. **Add tests for new edge cases** discovered
3. **Update this document** if new bug patterns found
4. **Keep test coverage** at 100% for message visibility scenarios

## Related Files

- `/src/stores/chat/actions/form-actions.ts` - Form submission logic
- `/src/hooks/chat/use-minimal-message-sync.tsx` - Message sync logic
- `/src/stores/chat/store.ts` - Store implementation
- `/src/stores/chat/utils/placeholder-factories.ts` - Optimistic message creation
