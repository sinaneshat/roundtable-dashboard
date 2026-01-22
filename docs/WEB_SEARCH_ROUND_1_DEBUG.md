# Web Search Round 1 Debugging Guide

## Issue Summary

**Problem**: Web search works on Round 0 but doesn't trigger on Round 1.

**Expected Behavior**:
- Round 0: PENDING pre-search created → Search executes → Participant streams ✅
- Round 1: PENDING pre-search created → Search executes → Participant streams ❌ **FAILS**

**Your Store State Shows**:
- `preSearches`: Only has Round 0 search
- `thread.enableWebSearch`: `true`
- Messages: Round 1 participant started streaming immediately without search

---

## What We Fixed

### 1. Added Comprehensive Logging (`streaming.handler.ts:146-183`)

The backend now logs **every step** of pre-search creation:

```typescript
// ✅ Success logs
[PreSearch] Attempting to create PENDING record for round X
[PreSearch] ✅ Created PENDING pre-search for round X (ID: xxx)
[PreSearch] ℹ️ Pre-search already exists for round X (status: xxx)

// ⚠️ Skip logs
[PreSearch] ⏭️  Skipping pre-search creation: webSearch=true, firstParticipant=true, notRegeneration=false

// ❌ Error logs
[PreSearch] ❌ Failed to create pre-search for round X: <error details>
```

### 2. Fixed Silent Error Catching

Previously, errors were caught silently. Now they're logged to help debug.

---

## How to Test

### Step 1: Start Your Dev Server with Console Output

```bash
bun run dev
```

Keep the terminal visible to see logs.

### Step 2: Reproduce Your Exact Scenario

1. **Create new thread**:
   - Enable "Web Search" toggle
   - Select 1 participant (e.g., Gemini 2.5 Pro)
   - Submit first message: "Say hi with just one word."

2. **Verify Round 0 logs**:
   ```
   [PreSearch] Attempting to create PENDING record for round 0 (thread: xxx)
   [PreSearch] ✅ Created PENDING pre-search for round 0 (ID: xxx)
   ```

3. **Submit second message** (Round 1):
   - Type: "retry" or any message
   - Click send

4. **Check Round 1 logs** - You should see ONE of these:

   **Option A - Success** ✅:
   ```
   [PreSearch] Attempting to create PENDING record for round 1 (thread: xxx)
   [PreSearch] ✅ Created PENDING pre-search for round 1 (ID: xxx)
   ```

   **Option B - Skipped** ⚠️:
   ```
   [PreSearch] ⏭️  Skipping pre-search creation: webSearch=true, firstParticipant=true, notRegeneration=false
   ```

   **Option C - Already Exists** ℹ️:
   ```
   [PreSearch] ℹ️ Pre-search already exists for round 1 (status: PENDING)
   ```

   **Option D - Failed** ❌:
   ```
   [PreSearch] ❌ Failed to create pre-search for round 1: <error>
   ```

### Step 3: Analyze the Logs

#### If you see Option A (Success):
**Great!** The fix is working. The pre-search should execute before the participant.

Check your browser console for:
1. PreSearchOrchestrator detecting the PENDING record
2. PreSearchStream component mounting
3. POST request to `/api/v1/chat/threads/{id}/rounds/1/pre-search`

#### If you see Option B (Skipped):
**Problem**: One of the conditions is failing.

The log shows which flags are true/false:
- `webSearch=false` → Thread's `enableWebSearch` is false (unexpected!)
- `firstParticipant=false` → `participantIndex` is not 0 (unexpected!)
- `notRegeneration=false` → This IS a regeneration (unexpected for new message!)

**Action**: Check which flag is wrong and investigate why.

#### If you see Option C (Already Exists):
**Possible Race Condition**: The record was created by a different request.

**Action**: Check if there are multiple streaming requests happening simultaneously.

#### If you see Option D (Failed):
**Database or Logic Error**: Something went wrong during insertion.

**Action**: Read the error details. Common causes:
- Database connection issue
- Unique constraint violation (duplicate ID)
- Missing required fields

---

## Expected Flow (What Should Happen)

### Round 1 with Web Search Enabled:

```
1. User submits "retry" message
2. Frontend calls /api/v1/chat/threads/{id}/participants/stream
3. streaming.handler.ts runs:
   ┌─────────────────────────────────────────────────────────┐
   │ STEP 3: Calculate round number = 1                     │
   └─────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │ STEP 3.5: Create PENDING pre-search for round 1        │
   │  ✅ Check: thread.enableWebSearch = true                 │
   │  ✅ Check: participantIndex = 0                          │
   │  ✅ Check: !regenerateRound = true                       │
   │  → Insert PENDING record into database                 │
   └─────────────────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────────────────┐
   │ STEP 4+: Start participant streaming                   │
   └─────────────────────────────────────────────────────────┘
4. Frontend PreSearchOrchestrator detects PENDING record (polls every 3s)
5. PreSearchStream component mounts and triggers POST
6. Search executes → STREAMING → COMPLETE
7. Participant continues streaming with search context
```

---

## Debugging the Actual Backend Issue

Based on your store state, the PENDING record was **NOT created** for Round 1. Let's find out why:

### Check 1: Is `thread.enableWebSearch` Actually True?

Add a temporary console log in `streaming.handler.ts:144`:

```typescript
const effectiveWebSearchEnabled = providedEnableWebSearch ?? thread.enableWebSearch;
console.log('[PreSearch DEBUG] thread.enableWebSearch:', thread.enableWebSearch);
console.log('[PreSearch DEBUG] providedEnableWebSearch:', providedEnableWebSearch);
console.log('[PreSearch DEBUG] effectiveWebSearchEnabled:', effectiveWebSearchEnabled);
```

**Expected**: All should be `true` for Round 1.

### Check 2: Is `participantIndex` Actually 0?

Add a temporary console log:

```typescript
const isFirstParticipant = (participantIndex ?? DEFAULT_PARTICIPANT_INDEX) === DEFAULT_PARTICIPANT_INDEX;
console.log('[PreSearch DEBUG] participantIndex:', participantIndex);
console.log('[PreSearch DEBUG] DEFAULT_PARTICIPANT_INDEX:', DEFAULT_PARTICIPANT_INDEX);
console.log('[PreSearch DEBUG] isFirstParticipant:', isFirstParticipant);
```

**Expected**: `participantIndex` should be `0` or `undefined` (defaults to 0).

### Check 3: Is This a Regeneration?

Add a temporary console log:

```typescript
console.log('[PreSearch DEBUG] regenerateRound:', regenerateRound);
console.log('[PreSearch DEBUG] !regenerateRound:', !regenerateRound);
```

**Expected**: `regenerateRound` should be `undefined` or `null` for a new message (not a retry).

---

## Common Issues & Solutions

### Issue: `webSearch=false` in logs but `thread.enableWebSearch=true` in store

**Cause**: The thread object in the backend might be stale or not refreshed.

**Solution**: Check if the thread is being refetched before creating pre-search. The thread should be loaded fresh in `streaming.handler.ts`.

### Issue: `notRegeneration=false` for a new message

**Cause**: The `regenerateRound` parameter is being passed incorrectly.

**Solution**: Check the frontend code that calls the streaming endpoint. It should NOT pass `regenerateRound` for a new message, only for actual regenerations.

### Issue: Record exists but frontend doesn't show it

**Cause**: PreSearchOrchestrator might not be polling or syncing correctly.

**Solution**: Check browser console for:
1. PreSearchOrchestrator mounting
2. TanStack Query polling `/api/v1/chat/threads/{id}/pre-searches`
3. Store update actions being called

---

## Next Steps

1. **Run your application** and submit Round 1 message
2. **Check the logs** in your terminal
3. **Report back** which log message you see (Option A/B/C/D)
4. **Share the exact log output** including all flag values

This will help us pinpoint exactly where the issue is occurring!

---

## Test Coverage

We've added comprehensive tests in `/src/stores/chat/__tests__/web-search-round-1-bug.test.ts`:

✅ **4/4 tests passing**:
1. Should track pre-searches for multiple rounds independently
2. Should verify web search is enabled in thread state during Round 1
3. Should track triggered pre-search rounds correctly for Round 0 and Round 1
4. Should handle web search being disabled mid-conversation

These tests verify the **store-level** behavior is correct. The backend behavior needs to be verified via the logs above.
