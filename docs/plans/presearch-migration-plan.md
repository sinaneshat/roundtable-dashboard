# Presearch Migration Plan: Server-Side Coordinated Streaming

## Executive Summary

Migrate presearch to follow the same backend-first streaming architecture as participants and moderator. Currently, frontend bypasses queue orchestration by triggering P0 directly, which means presearch is never triggered when web search is enabled.

## Current Architecture Analysis

### What Works (Backend)
1. ✅ `POST /pre-search` handler streams SSE with KV buffering
2. ✅ `TRIGGER_PRE_SEARCH` queue message type exists
3. ✅ `executeRound()` → `executePendingPhase()` queues presearch when `enableWebSearch && userQuery`
4. ✅ `markPreSearchCompletedInExecution()` transitions to PARTICIPANTS phase
5. ✅ `GET /stream/presearch` subscription endpoint works
6. ✅ Frontend `usePreSearchSubscription` hook exists

### What's Broken (Frontend)
1. ❌ `START_ROUND` queue message is **never sent** for manual user submissions
2. ❌ Frontend triggers P0 directly via AI SDK, bypassing queue orchestration
3. ❌ Presearch subscription polls GET /presearch forever (202 waiting)
4. ❌ No integration between presearch completion and P0 trigger

### The Gap
```
CURRENT FLOW (Broken):
User sends → Frontend adds message → Frontend triggers P0 directly
           ↓
           Subscription polls presearch → 202 forever (never triggered)

EXPECTED FLOW (Per FLOW_DOCUMENTATION.md):
User sends → Frontend sends START_ROUND to queue
           → Queue: executePendingPhase()
           → If enableWebSearch: TRIGGER_PRE_SEARCH
           → Pre-search completes → TRIGGER_PARTICIPANT P0
           → Frontend subscribes to all streams
```

## Migration Strategy

### Option A: Full Queue Orchestration (Recommended)
Send `START_ROUND` to queue for all rounds when web search is enabled.

**Pros:**
- Follows documented architecture exactly
- Single source of truth for round orchestration
- Supports complex flows (presearch → P0 → P1 → moderator)

**Cons:**
- Requires frontend changes to use queue instead of direct P0 trigger
- May add latency (queue processing)

### Option B: Frontend Triggers Presearch Before P0
Frontend calls POST /pre-search first, waits for completion, then triggers P0.

**Pros:**
- Minimal backend changes
- Uses existing endpoints

**Cons:**
- Frontend decides orchestration (violates backend-first principle)
- More complex frontend logic
- Race conditions possible

### Option C: Streaming Handler Triggers Presearch
Modify POST /chat to queue presearch when P0 with web search enabled.

**Pros:**
- Minimal frontend changes
- Presearch triggered server-side

**Cons:**
- Complicates streaming handler
- P0 would need to wait for presearch

**Decision: Option A** - Full queue orchestration. This follows the documented architecture and provides the cleanest separation of concerns.

## Implementation Plan

### Phase 1: Backend - Add Start Round Endpoint
**Files:**
- `apps/api/src/routes/chat/route.ts`
- `apps/api/src/routes/chat/handlers/round-start.handler.ts` (new)
- `apps/api/src/routes/chat/schema.ts`

**Tasks:**
1. Create `POST /chat/threads/{threadId}/rounds/{roundNumber}/start` endpoint
2. Handler validates thread, creates user message, queues `START_ROUND`
3. Returns 202 Accepted with round metadata

**Schema:**
```typescript
export const StartRoundRequestSchema = z.object({
  message: z.object({
    id: z.string(),
    content: z.string(),
    parts: z.array(MessagePartSchema),
  }),
  attachmentIds: z.array(z.string()).optional(),
});
```

### Phase 2: Frontend - Integrate Start Round
**Files:**
- `apps/web/src/services/api/chat/index.ts` - add startRound service
- `apps/web/src/components/providers/chat-store-provider/provider.tsx`
- `apps/web/src/stores/chat/store.ts`

**Tasks:**
1. Add `startRoundService()` API function
2. Modify P0 trigger logic:
   - If `enableWebSearch`: call startRound service
   - If NOT `enableWebSearch`: keep existing direct P0 trigger
3. Remove presearch-specific trigger logic (now handled by queue)

### Phase 3: Frontend - Fix Presearch UI Integration
**Files:**
- `apps/web/src/components/chat/pre-search-stream.tsx`
- `apps/web/src/stores/chat/store.ts`

**Tasks:**
1. Add `appendPreSearchStreamingData()` store action
2. Wire presearch subscription to update store
3. Render presearch results incrementally

### Phase 4: End-to-End Testing
**Tests:**
- New thread with web search enabled → presearch triggers → P0 triggers
- Existing thread, enable web search mid-conversation → presearch triggers
- Page refresh during presearch → resumes correctly
- Web search disabled → P0 triggers directly (no presearch)

## Detailed File Changes

### 1. `apps/api/src/routes/chat/route.ts`
```typescript
// Add new route
export const startRoundRoute = createRoute({
  description: 'Start a new round with queue orchestration. Handles presearch if web search enabled.',
  method: 'post',
  path: '/chat/threads/{threadId}/rounds/{roundNumber}/start',
  request: {
    body: { content: { 'application/json': { schema: StartRoundRequestSchema } } },
    params: ThreadRoundParamSchema,
  },
  responses: {
    [HttpStatusCodes.ACCEPTED]: { /* Round queued */ },
    [HttpStatusCodes.CONFLICT]: { /* Round already in progress */ },
  },
});
```

### 2. `apps/api/src/routes/chat/handlers/round-start.handler.ts` (NEW)
```typescript
export const startRoundHandler = createHandler({
  auth: 'session',
  operationName: 'startRound',
}, async (c) => {
  const { threadId, roundNumber } = c.validated.params;
  const { message, attachmentIds } = c.validated.body;

  // 1. Verify thread ownership
  // 2. Save user message to D1
  // 3. Queue START_ROUND message
  await c.env.ROUND_ORCHESTRATION_QUEUE.send({
    type: 'start-round',
    threadId,
    roundNumber,
    userId: user.id,
    userQuery: message.content,
    attachmentIds,
    sessionToken,
  });

  // 4. Return 202 Accepted
  return Responses.accepted(c, { roundNumber, status: 'queued' });
});
```

### 3. `apps/web/src/services/api/chat/index.ts`
```typescript
export async function startRoundService(params: {
  threadId: string;
  roundNumber: number;
  message: { id: string; content: string; parts: MessagePart[] };
  attachmentIds?: string[];
}): Promise<Response> {
  const client = createApiClient();
  return client.chatFeature.chat.threads[':threadId'].rounds[':roundNumber'].start.$post({
    param: { threadId: params.threadId, roundNumber: String(params.roundNumber) },
    json: { message: params.message, attachmentIds: params.attachmentIds },
  });
}
```

### 4. `apps/web/src/components/providers/chat-store-provider/provider.tsx`
```typescript
// Modify P0 trigger effect
useEffect(() => {
  if (!waitingToStartStreaming) return;

  const enabledCount = participants.filter(p => p.isEnabled).length;
  const roundNumber = getCurrentRoundNumber(storeMessages);

  if (enableWebSearch) {
    // Queue-orchestrated flow: let backend handle presearch → P0 → P1 → moderator
    startRoundService({
      threadId: effectiveThreadId,
      roundNumber,
      message: lastUserMessage,
      attachmentIds: pendingAttachmentIds,
    }).then(() => {
      store.getState().startRound(roundNumber, enabledCount);
      store.getState().setWaitingToStartStreaming(false);
    });
  } else {
    // Direct P0 trigger (no presearch)
    store.getState().startRound(roundNumber, enabledCount);
    chat.startRound(participants, storeMessages);
    store.getState().setWaitingToStartStreaming(false);
  }
}, [waitingToStartStreaming, ...]);
```

### 5. Store Updates
```typescript
// Add presearch data handling
appendPreSearchStreamingData: (data: PartialPreSearchData, roundNumber: number) => {
  // Update presearch UI state incrementally
}
```

## Testing Checklist

- [ ] New thread with web search → presearch completes → P0 starts
- [ ] Resume after presearch started → continues from KV buffer
- [ ] Resume after presearch complete, P0 not started → P0 triggers
- [ ] Web search disabled → P0 triggers directly
- [ ] Multiple participants → all trigger sequentially after presearch
- [ ] Moderator triggers after all participants complete
- [ ] Error handling: presearch fails → round marked failed

## Rollback Plan

If issues arise:
1. Feature flag `USE_QUEUE_ORCHESTRATION` defaults to `false`
2. Existing direct P0 trigger remains as fallback
3. Gradual rollout via flag

## Timeline

- Phase 1 (Backend): 2 hours
- Phase 2 (Frontend Integration): 2 hours
- Phase 3 (UI Polish): 1 hour
- Phase 4 (Testing): 1 hour

Total: ~6 hours
