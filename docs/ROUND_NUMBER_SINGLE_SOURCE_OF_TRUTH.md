# Round Number Single Source of Truth Pattern

## Core Principle

**Backend is the ONLY source of truth for roundNumber in existing messages**
- Backend assigns roundNumber when creating/storing messages
- Frontend TRUSTS backend's roundNumber (never recalculates from existing messages)
- Frontend only calculates roundNumber when CREATING NEW messages to send to backend

## Flow Patterns

### Pattern 1: ChatOverviewScreen (Initial Thread Creation)

**Backend Flow:**
```
1. POST /api/v1/chat/threads
   └─> Creates thread
   └─> Creates user message with roundNumber: 0
   └─> Returns { thread, participants, messages }
```

**Frontend Flow:**
```typescript
// 1. Mutation receives backend data
const { thread, participants, messages } = response.data;

// 2. Initialize store with backend data (TRUST backend roundNumber)
actions.initializeThread(thread, participants, chatMessagesToUIMessages(messages));
// messages[0].metadata.roundNumber = 0 ← From backend ✓

// 3. Trigger participants for existing message
actions.setWaitingToStartStreaming(true);

// 4. Provider effect calls startRound()
// ✅ GUARD: Only for screenMode === 'overview'
if (screenMode === 'overview') {
  chat.startRound(participants);
}

// 5. startRound reads roundNumber from backend message
const roundNumber = getCurrentRoundNumber(messages); // Returns 0 ✓
// Sends trigger message with SAME roundNumber
aiSendMessage({
  text: userText,
  metadata: { role: 'user', roundNumber, isParticipantTrigger: true }
});
```

**Result:** First round uses `r0_p0`, analysis created with `roundNumber: 0` ✓

---

### Pattern 2: ChatThreadScreen (Subsequent Rounds)

**Frontend Flow:**
```typescript
// 1. User submits new message
await handleUpdateThreadAndSend(threadId);

// 2. Calculate NEXT round number (frontend creates new message)
const newRoundNumber = calculateNextRoundNumber(messages);
// messages = [user_r0, assistant_r0_p0, assistant_r0_p1]
// Returns: 1 ✓

// 3. Send message to backend with calculated roundNumber
actions.prepareForNewMessage(trimmed, []);
// Sets: pendingMessage, expectedParticipantIds

// 4. Provider's pendingMessage effect triggers
const roundNumber = calculateNextRoundNumber(storeMessages);
sendMessage(pendingMessage); // Sends with roundNumber: 1 ✓

// 5. Backend processes message
// ✅ Backend TRUSTS frontend's roundNumber for NEW messages
// Creates user message with roundNumber: 1
// Generates participant IDs: r1_p0, r1_p1, etc.
```

**Result:** Second round uses `r1_p0`, analysis created with `roundNumber: 1` ✓

---

## Critical Guards

### Guard 1: Screen Mode Check (Provider)

**Location:** `/src/components/providers/chat-store-provider.tsx:265`

```typescript
// ✅ SINGLE SOURCE OF TRUTH: Only trigger startRound for ChatOverviewScreen
// ChatThreadScreen uses sendMessage flow (pendingMessage effect) instead
const currentScreenMode = store.getState().screenMode;
if (currentScreenMode !== 'overview') {
  store.getState().setWaitingToStartStreaming(false);
  return;
}
```

**Why:** Prevents duplicate message creation on ChatThreadScreen. Only ChatOverviewScreen should use `startRound()`.

### Guard 2: Function Usage Pattern

| Screen | User Action | Function Used | roundNumber Source |
|--------|-------------|---------------|-------------------|
| ChatOverviewScreen | Initial thread | `startRound()` | Backend message metadata |
| ChatThreadScreen | New message | `sendMessage()` | `calculateNextRoundNumber()` |

---

## Backend Trust Pattern

### Backend Assigns roundNumber

**Location:** `/src/api/routes/chat/handlers/thread.handler.ts`

```typescript
// Thread creation - Backend assigns roundNumber: 0
const userMessage = await db.insert(tables.chatMessage).values({
  id: userMessageId,
  threadId: thread.id,
  role: MessageRoles.USER,
  roundNumber: 0, // ← Backend source of truth
  parts: messageParts,
  metadata: { role: MessageRoles.USER, roundNumber: 0 },
});
```

**Location:** `/src/api/services/round.service.ts`

```typescript
// Backend trusts frontend's roundNumber for NEW messages
if (typeof frontendRoundNumber === 'number' && frontendRoundNumber >= 0) {
  return {
    roundNumber: frontendRoundNumber, // ← Trust frontend for new messages
    isRegeneration: false,
    isTriggerMessage: isParticipantTrigger,
  };
}
```

### Frontend Trusts Backend

**Location:** `/src/lib/utils/message-transforms.ts`

```typescript
// ✅ CRITICAL FIX: Always preserve roundNumber from database column
const metadata = message.roundNumber !== null && message.roundNumber !== undefined
  ? {
      ...(message.metadata || {}),
      role: message.role,
      roundNumber: message.roundNumber, // ← Database column is source of truth
    }
  : null;
```

---

## Analysis Creation Pattern

**Location:** `/src/components/providers/chat-store-provider.tsx:107`

```typescript
const roundNumber = getCurrentRoundNumber(sdkMessages);
// ✅ Reads from LAST user message's metadata.roundNumber
// ✅ Backend assigned this value - frontend trusts it

currentState.createPendingAnalysis({
  threadId,
  roundNumber, // ← Uses backend's roundNumber
  mode,
  userQuestion,
  sdkMessages,
});
```

**Result:** Analysis roundNumber matches participant message IDs ✓

---

## Message ID Format

**Pattern:** `{threadId}_r{roundNumber}_p{participantIndex}`

**Examples:**
- Round 0, Participant 0: `01KA1KY3S74ZWZ5W2S6Q0847QZ_r0_p0`
- Round 0, Participant 1: `01KA1KY3S74ZWZ5W2S6Q0847QZ_r0_p1`
- Round 1, Participant 0: `01KA1KY3S74ZWZ5W2S6Q0847QZ_r1_p0`
- Round 1, Participant 1: `01KA1KY3S74ZWZ5W2S6Q0847QZ_r1_p1`

**Backend Generation:** `/src/api/routes/chat/handlers/streaming.handler.ts:476`

```typescript
const streamMessageId = `${threadId}_r${currentRoundNumber}_p${participantIndex}`;
```

---

## Utility Functions

### `getCurrentRoundNumber(messages)`
**Use:** Read roundNumber from existing messages
**Returns:** roundNumber from LAST user message's metadata
**Source:** Backend-assigned value
**Location:** `/src/lib/utils/round-utils.ts:133`

### `calculateNextRoundNumber(messages)`
**Use:** Calculate roundNumber for NEW message to send
**Returns:** max(existingRoundNumbers) + 1
**Source:** Frontend calculation for NEW messages
**Location:** `/src/lib/utils/round-utils.ts:48`

---

## Common Bugs and Fixes

### Bug: Round 1 uses `r0_p0` instead of `r1_p0`

**Cause:** `startRound()` being called on ChatThreadScreen

**Fix:** Add screen mode guard (line 265)
```typescript
if (currentScreenMode !== 'overview') {
  store.getState().setWaitingToStartStreaming(false);
  return;
}
```

### Bug: First round uses `r1_p0` instead of `r0_p0`

**Cause:** Using `calculateNextRoundNumber()` instead of `getCurrentRoundNumber()` in `startRound()`

**Fix:** Use `getCurrentRoundNumber()` to read backend's roundNumber
```typescript
const roundNumber = getCurrentRoundNumber(messages); // ✓ Reads backend value
```

### Bug: Analysis created with wrong roundNumber

**Cause:** `getCurrentRoundNumber()` reading from trigger message instead of backend message

**Fix:** Ensure `startRound()` only runs on ChatOverviewScreen (guard at line 265)

---

## Testing

**Test Location:** `/src/stores/chat/__tests__/multi-round-flow.test.ts`

```typescript
it('should NOT create r0_p0 for second round (should be r1_p0)', () => {
  const round1Assistant = messages.find(m => m.id.includes('r1_p0'));

  expect(round1Assistant?.id).toBe(`${THREAD_ID}_r1_p0`);
  expect(round1Assistant?.id).not.toBe(`${THREAD_ID}_r0_p0`);
  expect(round1Assistant?.metadata.roundNumber).toBe(1);
});
```

**Result:** 99 passing tests ✓

---

## Summary

**Single Source of Truth:**
- **Existing messages:** Backend roundNumber (frontend trusts it)
- **New messages:** Frontend calculates, backend trusts it
- **Screen separation:** Overview uses `startRound()`, Thread uses `sendMessage()`
- **Guard protection:** Screen mode check prevents duplicate flows

This unifies backend and frontend to follow consistent roundNumber rules.
