# Deduplication Simplification Plan

## Analysis Summary

### Current Architecture Problems

**Three Layers of Deduplication:**

1. **Backend** (correctly implemented):
   - `streaming.handler.ts:1233` - Uses `originalMessages`
   - `streaming.handler.ts:1239` - Uses deterministic `generateMessageId`
   - Format: `{threadId}_r{roundNumber}_p{participantIndex}`

2. **Frontend - Sync Layer** (`use-message-sync.ts` - 965 lines):
   - Synchronizes AI SDK `useChat` hook ↔ Zustand store
   - Throttles streaming updates
   - Handles optimistic message replacement
   - Round-based deduplication
   - Part-level deduplication (reasoning parts)
   - Moderator message preservation

3. **Frontend - Hook Layer** (`use-multi-participant-chat.ts:1168-1315`):
   - Part deduplication on stream finish
   - ID correction when AI SDK sends wrong ID
   - Multiple messages with same ID handling

4. **Frontend - Render Layer** (`chat-message-list.tsx:618-763`):
   - User message by round deduplication
   - Assistant message by (round, participantIndex) deduplication
   - Moderator message by round deduplication

### Why This Happened

The AI SDK v6 `originalMessages` + `generateMessageId` pattern was designed for **single-stream** scenarios. In this multi-participant architecture:

- Multiple AI participants respond **concurrently** in each round
- Each participant has its own stream
- The frontend must merge messages from multiple sources
- Optimistic UI creates temporary messages that need replacement

### Root Cause

**Two sources of truth:**
1. AI SDK `useChat` hook manages internal `messages` state
2. Zustand store also manages `messages` state
3. `use-message-sync.ts` reconciles between them bidirectionally

This dual-state architecture creates:
- Expensive sync operations on every message update
- Race conditions between concurrent streams
- Complex deduplication logic at multiple layers

## Proposed Solution

### Single Source of Truth Architecture

**Principle:** Make Zustand store the ONLY source of truth for messages.

**Changes:**

1. **Remove `use-message-sync.ts` entirely**
   - Stop syncing AI SDK hook state → Zustand store
   - AI SDK hook is used only for streaming transport

2. **Modify `use-multi-participant-chat.ts`**
   - Write directly to Zustand store in `onMessage` callbacks
   - Don't rely on AI SDK's internal messages for rendering
   - Use deterministic IDs from backend metadata

3. **Simplify `chat-message-list.tsx` deduplication**
   - Keep only edge case handling (stream resumption)
   - Trust that Zustand store has deduplicated data

### Implementation Steps

#### Phase 1: Add Safety Tests ✅
- [x] Create `message-flow-e2e.test.ts` with invariant tests
- [x] Verify all tests pass (18/18 passing)

#### Phase 2: Store-First Message Updates ✅
- [x] Create new store action: `upsertStreamingMessage` (insert/update with smart merging)
- [x] Create new store action: `finalizeMessageId` (replace temp ID with deterministic ID)
- [x] Create new store action: `deduplicateMessages` (clean up duplicates by round/participant)
- [x] Add type definitions in `store-action-types.ts`
- [x] Add schemas in `store-schemas.ts`

#### Phase 3: Update Activity Tracking ✅
- [x] Create `useStreamActivityTracker` hook (simpler than useMessageSync)
- [x] Update `ChatStoreProvider` to use new activity tracker
- [x] Keep `useMessageSync` for now (incremental approach)

#### Phase 4: Remove Sync Layer ✅
- [x] Create `use-minimal-message-sync.ts` (117 lines, replaces 965 lines)
- [x] Update provider to use minimal sync
- [x] Delete `use-message-sync.ts` (965 lines removed!)
- [x] Verify all tests still pass (2716 tests, 118 files)

#### Phase 5: Store-Level Deduplication ✅
- [x] Add `deduplicateMessages()` call in `completeStreaming` action
- [x] Store now automatically cleans up duplicates after streaming
- [x] Render-level deduplication still serves as real-time filter

### Risk Mitigation

1. **Feature Flags:** Implement behind feature flag to allow rollback
2. **Gradual Rollout:** Test in development/preview before production
3. **Comprehensive Tests:** E2E tests catch regressions
4. **Monitoring:** Add metrics for duplicate detection in production

### Achieved Benefits ✅

1. **Performance:** Removed 965 lines of sync logic, replaced with 117 lines
2. **Simplicity:** Store handles deduplication via `deduplicateMessages()`
3. **Reliability:** Automatic deduplication on `completeStreaming`
4. **Maintainability:** ~850 fewer lines to maintain

### Files Changed (FINAL)

| File | Change | Lines |
|------|--------|-------|
| `use-message-sync.ts` | DELETED | -965 |
| `use-minimal-message-sync.ts` | CREATED | +117 |
| `use-stream-activity-tracker.ts` | CREATED | +67 |
| `store.ts` | ADD ACTIONS | +150 |
| `store-action-types.ts` | ADD TYPES | +60 |
| `store-schemas.ts` | ADD SCHEMAS | +5 |
| `provider.tsx` | MODIFY | ~10 |
| **NET CHANGE** | | **~-570 lines**

### Migration Timeline

1. **Day 1:** Implement new store actions (Phase 2)
2. **Day 2:** Update multi-participant hook (Phase 3)
3. **Day 3:** Remove sync layer (Phase 4)
4. **Day 4:** Simplify render deduplication (Phase 5)
5. **Day 5:** Testing and verification

## Alternative Approaches Considered

### Option A: AI SDK as Single Source of Truth
- Use `useChat` for all message state
- Remove Zustand message storage
- **Rejected:** Loses persistence across page refreshes, harder to coordinate multi-participant

### Option B: Backend-Driven Deduplication
- Move ALL deduplication logic to the backend
- Frontend just renders what backend sends
- **Rejected:** More network traffic, latency, harder to implement optimistic UI

### Option C: Keep Current Architecture (Status Quo)
- Continue with three deduplication layers
- **Rejected:** Performance overhead, complexity, maintenance burden

## Metrics to Track

1. **Time to First Paint:** Measure message rendering latency
2. **CPU Usage:** Profile deduplication overhead
3. **Duplicate Detection:** Log any duplicates that slip through
4. **Stream Resumption Success Rate:** Ensure resumption still works

## Rollback Plan

If issues arise:
1. Restore `use-message-sync.ts` from git
2. Revert changes to `use-multi-participant-chat.ts`
3. Revert changes to `chat-message-list.tsx`
4. All changes are behind feature flag, so can be disabled instantly
