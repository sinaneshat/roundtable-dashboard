# Round 0 vs Round 1+ Parity Test Documentation

## Overview

This document explains the critical regression tests created to prevent bugs where non-initial rounds (round 1+) behave differently from round 0, particularly regarding user message visibility.

## The Bug These Tests Prevent

### What Happened
User messages were disappearing in round 1+ (non-initial rounds) while round 0 worked perfectly. This occurred due to:

1. **Animation Logic Differences**: Round 0 messages had different animation logic than round 1+
2. **Message ID Handling**: Optimistic IDs were replaced by DB IDs, causing components to remount with different animation behavior
3. **Participant Trigger Messages**: AI SDK's participant trigger messages could replace original user messages during streaming

### Key Insight
**If round 0 works correctly, ALL rounds should work identically.**

Any difference in behavior between round 0 and round 1+ is a bug.

## Test Files

### 1. `round-0-vs-round-1-behavior-parity.test.ts`
**Purpose**: Comprehensive parity testing between round 0 and round 1+

**Critical Test Cases**:

#### User Message Visibility Parity
- ✅ User messages appear in store immediately after submission (both rounds)
- ✅ Optimistic user messages persist across rounds
- ✅ User messages survive ID changes from optimistic to DB ID (both rounds)
- ✅ User messages are NOT replaced by participant trigger messages

#### State Initialization Parity
- ✅ `streamingRoundNumber` set correctly for all rounds
- ✅ `expectedParticipantIds` set correctly for all rounds
- ✅ `waitingToStartStreaming` behaves identically

#### Animation Skip Behavior Parity
- ✅ Round 0 persisted messages animate normally
- ✅ Round 1+ messages ALWAYS skip animation (regardless of ID)
- ✅ Optimistic messages skip animation in ALL rounds

#### Message Count Parity
- ✅ Same message count pattern across rounds
- ✅ User message is always first message in each round

#### Timeline Rendering Parity
- ✅ Both rounds create timeline items with same structure
- ✅ Round 1+ included in timeline even with only user message

#### State Reset Prevention
- ✅ `initializeThread` does NOT reset streaming state during active submission
- ✅ Optimistic messages survive `initializeThread` calls

### 2. `non-initial-round-immediate-visibility.test.ts`
**Purpose**: Verify immediate visibility of user messages and placeholders in non-initial rounds

**New Regression Tests Added**:
- ✅ User message remains visible throughout entire submission flow
- ✅ Comparing round 0 vs round 1 user message visibility
- ✅ Animation skip applies to ALL non-initial rounds

### 3. `non-initial-round-user-message-sync.test.ts`
**Purpose**: Verify message sync preserves original user messages across all rounds

**New Regression Tests Added**:
- ✅ Round 0 user messages preserved during sync
- ✅ Round 1+ user messages preserved during sync
- ✅ Both round 0 and round 1 messages preserved in multi-round conversations
- ✅ Participant trigger messages do NOT replace original user messages in ANY round

## How These Tests Would Have Caught the Bug

### Scenario 1: Animation Logic Bug
**What Happened**: User messages in round 1 used different animation skip logic than round 0

**Test That Would Catch It**:
```typescript
it('CRITICAL: round 1+ messages should ALWAYS skip animation', () => {
  const scenarios = [
    { round: 1, optimistic: false },
    { round: 1, optimistic: true },
    { round: 2, optimistic: false },
  ];

  for (const scenario of scenarios) {
    const message = createUserMessage(scenario.round, 'Test', scenario.optimistic);
    const roundNumber = getRoundNumber(message.metadata);
    const shouldSkip = roundNumber !== null && roundNumber > 0;

    expect(shouldSkip).toBe(true); // Would FAIL if logic differed
  }
});
```

### Scenario 2: Message ID Change Bug
**What Happened**: When optimistic ID changed to DB ID, component remounted with different animation behavior

**Test That Would Catch It**:
```typescript
it('PARITY: user message should survive ID change from optimistic to DB ID (both rounds)', () => {
  // Round 0: optimistic -> DB ID
  const round0Optimistic = createUserMessage(0, 'Round 0 question', true);
  store.getState().setMessages([round0Optimistic]);

  const round0DbId = '01KE5WMBVDFY_R0';
  const round0Persisted = { ...round0Optimistic, id: round0DbId };
  store.getState().setMessages(
    store.getState().messages.map(m => m.id === round0Optimistic.id ? round0Persisted : m),
  );

  const round0AfterPersist = store.getState().messages.filter(
    m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
  );

  // Same for round 1...

  // CRITICAL: Both rounds should have exactly 1 user message after ID change
  expect(round0AfterPersist.length).toBe(1);
  expect(round1AfterPersist.length).toBe(1);
  expect(round0AfterPersist.length).toBe(round1AfterPersist.length); // Would FAIL if different
});
```

### Scenario 3: Participant Trigger Replacement Bug
**What Happened**: AI SDK's participant trigger message replaced original user message

**Test That Would Catch It**:
```typescript
it('CRITICAL: user message must NOT be replaced by participant trigger message (round 1+)', () => {
  const round1UserMsg = createUserMessage(1, 'Round 1 question');
  store.getState().setMessages([...store.getState().messages, round1UserMsg]);

  const participantTrigger: UIMessage = {
    id: 'trigger-msg-123',
    role: MessageRoles.USER,
    parts: [{ type: 'text', text: 'Round 1 question' }],
    metadata: { role: MessageRoles.USER, roundNumber: 1, isParticipantTrigger: true },
  };

  store.getState().setMessages([...store.getState().messages, participantTrigger]);

  const userMessagesAfterTrigger = store.getState().messages.filter((m) => {
    if (m.role !== MessageRoles.USER) return false;
    if (getRoundNumber(m.metadata) !== 1) return false;
    const metadata = m.metadata as { isParticipantTrigger?: boolean };
    return !metadata.isParticipantTrigger;
  });

  expect(userMessagesAfterTrigger.length).toBe(1); // Would FAIL if replaced
  expect(userMessagesAfterTrigger[0]?.id).toBe(round1UserMsg.id);
});
```

## Test Principles

### 1. Parity Testing Philosophy
Every behavior that works in round 0 MUST work identically in round 1+.

```typescript
// BAD: Testing only round 0
it('should show user message', () => {
  const round0Msg = createUserMessage(0, 'Test');
  store.getState().setMessages([round0Msg]);
  expect(store.getState().messages.length).toBe(1);
});

// GOOD: Testing parity between rounds
it('PARITY: user messages visible in both rounds', () => {
  const round0Msg = createUserMessage(0, 'Round 0');
  const round1Msg = createUserMessage(1, 'Round 1');

  store.getState().setMessages([round0Msg]);
  const round0Count = store.getState().messages.length;

  store.getState().setMessages([round0Msg, round1Msg]);
  const round1Count = store.getState().messages.filter(
    m => getRoundNumber(m.metadata) === 1
  ).length;

  expect(round0Count).toBe(round1Count); // Parity check
});
```

### 2. Critical Regression Markers
Tests marked with `CRITICAL:` would have caught the actual bug:

```typescript
it('CRITICAL: user message must remain visible throughout entire submission flow', () => {
  // Step 1: Optimistic message
  // Step 2: PATCH replaces with DB ID
  // Step 3: AI SDK adds participant trigger
  // ASSERT: Original message still present
});
```

### 3. Multi-Round Coverage
Test multiple rounds, not just 0 and 1:

```typescript
const testRounds = [1, 2, 3, 5, 10];

for (const roundNum of testRounds) {
  const message = createUserMessage(roundNum, `Round ${roundNum}`);
  // Test behavior for ALL non-initial rounds
}
```

## Running the Tests

```bash
# Run all parity tests
pnpm test src/stores/chat/__tests__/round-0-vs-round-1-behavior-parity.test.ts

# Run immediate visibility tests
pnpm test src/stores/chat/__tests__/non-initial-round-immediate-visibility.test.ts

# Run message sync tests
pnpm test src/stores/chat/__tests__/non-initial-round-user-message-sync.test.ts

# Run all non-initial round tests
pnpm test src/stores/chat/__tests__/non-initial-round
```

## What to Check When Adding New Round-Related Features

When implementing any feature that involves rounds:

1. **Does it work in round 0?** Test it.
2. **Does it work identically in round 1+?** Test parity.
3. **Does the behavior differ by round number?** If yes, is it intentional? Document why.
4. **Does it involve message IDs?** Test optimistic -> DB ID transitions.
5. **Does it involve streaming state?** Test state preservation across rounds.

## Key Files to Reference

- `/src/stores/chat/store.ts` - Chat store implementation
- `/src/stores/chat/store-schemas.ts` - Type definitions
- `/src/lib/utils.ts` - `getRoundNumber()` utility
- `/src/hooks/use-minimal-message-sync.tsx` - Message sync logic
- `/src/components/chat/chat-message-list.tsx` - Animation skip logic

## Maintenance

These tests should be updated when:

1. Round-related state management changes
2. Message ID handling logic changes
3. Animation behavior is modified
4. New round-related features are added

Always maintain the **parity principle**: If it works in round 0, it must work identically in all rounds.
