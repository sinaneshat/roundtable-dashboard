# Stream Resumption Architecture Plan

## Overview

This plan outlines the implementation of **true background streaming** that continues regardless of HTTP disconnects, page refreshes, or any client-side interruptions. All streams (participants, web search, analysis) will persist to Cloudflare KV and be resumable at any point.

## Current State Analysis

### What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Stream chunk buffering to KV | ✅ Implemented | `stream-buffer.service.ts` |
| Stream metadata tracking | ✅ Implemented | `resumable-stream-kv.service.ts` |
| Live resume polling (100ms) | ✅ Implemented | `createLiveParticipantResumeStream()` |
| Abort error detection | ✅ Implemented | `streaming.handler.ts:771-783` |
| Analysis stream buffering | ✅ Implemented | `analysis-stream-buffer.service.ts` |
| Pre-search stream buffering | ✅ Implemented | `pre-search-stream-buffer.service.ts` |
| `waitUntil()` for async ops | ✅ Implemented | Various handlers |

### The Core Problem

**Streams stop when HTTP disconnects** because:

```typescript
// streaming.handler.ts:502-505
abortSignal: AbortSignal.any([
  c.req.raw.signal,  // ← HTTP connection abort signal - THIS IS THE PROBLEM
  AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
]),
```

When client disconnects:
1. `c.req.raw.signal` fires abort
2. `streamText()` receives abort and stops AI generation
3. Only chunks buffered BEFORE disconnect are preserved
4. Remaining response is lost

### Current Flow (Broken)

```
Client Request → HTTP Connection → AI Streaming → Response
                      ↓
              Client Disconnects
                      ↓
              Abort Signal Fires
                      ↓
              AI Generation STOPS ❌
                      ↓
              Partial Chunks in KV
```

## Solution Architecture

### Target Flow (Fixed)

```
Client Request → Start Background Stream → Return Stream ID Immediately
                      ↓
              AI Streaming (via waitUntil)
                      ↓
              Chunks Buffered to KV (continuous)
                      ↓
              Client Disconnects (doesn't matter)
                      ↓
              AI Generation CONTINUES ✅
                      ↓
              Client Reconnects → Poll KV → Get All Chunks
```

### Key Principles

1. **Never abort AI streams** - Remove HTTP abort signal from AI SDK calls
2. **Background execution via `waitUntil()`** - Streams continue after response sent
3. **KV as source of truth** - All state in Cloudflare KV with TTL
4. **Polling-based resumption** - Frontend polls for new chunks (already implemented)
5. **Idempotent operations** - Safe to retry any operation

---

## Implementation Phases

### Phase 1: Backend Stream Decoupling

**Goal**: AI streams run to completion regardless of HTTP connection state.

#### 1.1 Remove HTTP Abort Signal from Participant Streaming

**File**: `src/api/routes/chat/handlers/streaming.handler.ts`

**Change**:
```typescript
// BEFORE (current)
abortSignal: AbortSignal.any([
  c.req.raw.signal,  // ← REMOVE THIS
  AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
]),

// AFTER (new)
abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
// Only timeout signal - no HTTP abort
```

**Impact**:
- AI generation continues even if client disconnects
- Timeout still prevents runaway streams
- Chunks continue buffering to KV

#### 1.2 Wrap Entire Stream in `waitUntil()`

**File**: `src/api/routes/chat/handlers/streaming.handler.ts`

**Concept**:
```typescript
// Return response immediately, let stream complete in background
const backgroundStream = async () => {
  const result = streamText({ ... });

  // Consume entire stream to KV
  for await (const chunk of result.toTextStreamResponse().body) {
    await appendStreamChunk(streamId, chunk, env);
  }

  await completeStreamBuffer(streamId, env);
  await saveStreamedMessage({ ... });
};

// Start background processing
executionCtx.waitUntil(backgroundStream());

// Return live stream to client (may disconnect anytime)
return result.toUIMessageStreamResponse({ ... });
```

#### 1.3 Create Stream State Machine

**New File**: `src/api/services/stream-state-machine.service.ts`

**States**:
```typescript
export const StreamStates = {
  PENDING: 'pending',      // Stream requested, not started
  INITIALIZING: 'initializing', // AI model loading
  STREAMING: 'streaming',  // Actively generating
  COMPLETING: 'completing', // Finishing up, saving to DB
  COMPLETED: 'completed',  // Successfully finished
  FAILED: 'failed',        // Error occurred
  TIMEOUT: 'timeout',      // Exceeded time limit
} as const;
```

**KV Schema**:
```typescript
type StreamState = {
  streamId: string;
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  state: StreamStateValue;
  chunkCount: number;
  lastChunkAt: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  messageId: string | null;
};
```

---

### Phase 2: Background Stream Execution

**Goal**: Streams execute entirely in background, response is just a view.

#### 2.1 Dual-Path Response Pattern

**Concept**:
```typescript
export const streamChatHandler = async (c) => {
  // 1. Initialize stream in KV
  const streamId = await initializeStream(threadId, roundNumber, participantIndex, env);

  // 2. Start background stream (continues regardless of HTTP)
  executionCtx.waitUntil(executeBackgroundStream({
    streamId,
    threadId,
    roundNumber,
    participantIndex,
    modelMessages,
    systemPrompt,
    env,
  }));

  // 3. Return live stream to client (best effort delivery)
  //    If client disconnects, no problem - background continues
  return createLiveStreamResponse(streamId, env);
};
```

#### 2.2 Background Stream Executor

**New Function**: `executeBackgroundStream()`

```typescript
async function executeBackgroundStream(params: BackgroundStreamParams): Promise<void> {
  const { streamId, threadId, roundNumber, participantIndex, env } = params;

  try {
    await updateStreamState(streamId, StreamStates.STREAMING, env);

    const result = streamText({
      model: params.model,
      messages: params.messages,
      // NO abort signal - runs to completion
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
    });

    // Consume stream and buffer ALL chunks
    for await (const chunk of result.textStream) {
      await appendStreamChunk(streamId, chunk, env);
    }

    // Get final result
    const finalResult = await result.response;

    // Save to database
    await updateStreamState(streamId, StreamStates.COMPLETING, env);
    await saveStreamedMessage({ ... });

    // Mark complete
    await updateStreamState(streamId, StreamStates.COMPLETED, env);
    await completeStreamBuffer(streamId, env);

  } catch (error) {
    await failStreamBuffer(streamId, error.message, env);
    await updateStreamState(streamId, StreamStates.FAILED, env);
  }
}
```

#### 2.3 Live Stream Response (Best Effort)

**Concept**: Return a stream that delivers chunks in real-time IF client stays connected.

```typescript
function createLiveStreamResponse(streamId: string, env: ApiEnv): Response {
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial buffered chunks
      const chunks = await getStreamChunks(streamId, env);
      for (const chunk of chunks) {
        controller.enqueue(chunk.data);
      }
    },

    async pull(controller) {
      // Poll for new chunks
      const metadata = await getStreamMetadata(streamId, env);
      const chunks = await getStreamChunks(streamId, env);

      // Send new chunks since last poll
      for (const chunk of chunks.slice(lastIndex)) {
        controller.enqueue(chunk.data);
      }

      // Close if stream completed
      if (metadata.state === StreamStates.COMPLETED) {
        controller.close();
      }
    },

    cancel() {
      // Client disconnected - doesn't matter, background continues
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Stream-Id': streamId,
    },
  });
}
```

---

### Phase 3: Apply to All Stream Types

#### 3.1 Pre-Search Streams

**File**: `src/api/routes/chat/handlers/pre-search.handler.ts`

**Changes**:
- Remove HTTP abort signal from `streamSearchQuery()`
- Wrap SSE streaming in `waitUntil()` for background completion
- Use existing `pre-search-stream-buffer.service.ts` for KV buffering

#### 3.2 Analysis Streams

**File**: `src/api/routes/chat/handlers/analysis.handler.ts`

**Changes**:
- Use `createBufferedAnalysisResponse()` (already exists)
- Ensure `executionCtx.waitUntil()` is used for completion
- Remove any HTTP abort dependencies

#### 3.3 Unified Stream Management

**New File**: `src/api/services/unified-stream-manager.service.ts`

```typescript
export type StreamType = 'participant' | 'pre-search' | 'analysis';

export async function startBackgroundStream(
  type: StreamType,
  params: StreamParams,
  env: ApiEnv,
  executionCtx: ExecutionContext,
): Promise<string> {
  const streamId = generateStreamId(type, params);

  await initializeStream(streamId, type, params, env);

  executionCtx.waitUntil(
    executeStream(type, streamId, params, env),
  );

  return streamId;
}

export function createResumeStream(
  streamId: string,
  type: StreamType,
  env: ApiEnv,
): ReadableStream {
  switch (type) {
    case 'participant':
      return createLiveParticipantResumeStream(streamId, env);
    case 'pre-search':
      return createLivePreSearchResumeStream(streamId, env);
    case 'analysis':
      return createLiveAnalysisResumeStream(streamId, env);
  }
}
```

---

### Phase 4: Frontend Integration

#### 4.1 Stream Detection on Mount

**File**: `src/hooks/utils/use-multi-participant-chat.ts`

**Current**: Uses AI SDK's `resume: true` which calls `prepareReconnectToStreamRequest`.

**Enhancement**:
```typescript
// On component mount, check for active streams
useEffect(() => {
  const checkActiveStreams = async () => {
    const response = await fetch(`/api/v1/chat/threads/${threadId}/streams/active`);
    const data = await response.json();

    if (data.activeStreams.length > 0) {
      // Resume each active stream
      for (const stream of data.activeStreams) {
        resumeStream(stream.streamId, stream.type);
      }
    }
  };

  checkActiveStreams();
}, [threadId]);
```

#### 4.2 Stream State Subscription

**File**: `src/components/providers/chat-store-provider.tsx`

**Enhancement**: Add effect to poll stream state and update UI.

```typescript
useEffect(() => {
  if (!isStreaming) return;

  const pollInterval = setInterval(async () => {
    const state = await fetchStreamState(activeStreamId);

    if (state.state === 'completed') {
      // Fetch final message from DB
      await refetchMessages();
      setIsStreaming(false);
    } else if (state.state === 'failed') {
      showError(state.error);
      setIsStreaming(false);
    }
  }, 1000);

  return () => clearInterval(pollInterval);
}, [isStreaming, activeStreamId]);
```

#### 4.3 Multi-Stream Tracking

**Store Enhancement**: Track multiple concurrent streams.

```typescript
// In chat store
activeStreams: Map<string, {
  streamId: string;
  type: StreamType;
  roundNumber: number;
  participantIndex: number;
  state: StreamState;
  chunkCount: number;
}>;

// Actions
addActiveStream: (stream) => { ... };
updateStreamState: (streamId, state) => { ... };
removeActiveStream: (streamId) => { ... };
```

---

### Phase 5: Robustness & Edge Cases

#### 5.1 Stream Heartbeat

**Purpose**: Detect truly dead streams vs slow AI responses.

```typescript
// Background stream sends heartbeat every 5s
const heartbeatInterval = setInterval(async () => {
  await updateStreamHeartbeat(streamId, env);
}, 5000);

// Cleanup checks for stale heartbeats
async function cleanupStaleStreams(env: ApiEnv) {
  const activeStreams = await getAllActiveStreams(env);

  for (const stream of activeStreams) {
    const lastHeartbeat = stream.lastHeartbeatAt;
    if (Date.now() - lastHeartbeat > 30000) { // 30s without heartbeat
      await failStreamBuffer(stream.streamId, 'Stream heartbeat timeout', env);
    }
  }
}
```

#### 5.2 Round Integrity Protection

**Existing**: `streaming.handler.ts:147-170` already protects against overwriting completed rounds.

**Enhancement**: Add KV-based round locking.

```typescript
async function acquireRoundLock(threadId: string, roundNumber: number, env: ApiEnv): Promise<boolean> {
  const lockKey = `lock:round:${threadId}:r${roundNumber}`;
  const existing = await env.KV.get(lockKey);

  if (existing) return false;

  await env.KV.put(lockKey, Date.now().toString(), { expirationTtl: 300 }); // 5min TTL
  return true;
}
```

#### 5.3 Chunk Deduplication

**Purpose**: Prevent duplicate chunks on resume.

```typescript
type StreamChunk = {
  data: string;
  timestamp: number;
  index: number;  // ← ADD: Sequential index for deduplication
  hash: string;   // ← ADD: Content hash for verification
};

// On resume, client sends last received index
// Server only sends chunks with index > lastReceivedIndex
```

---

## API Changes Summary

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat/threads/:threadId/streams/active` | GET | List all active streams for thread |
| `/chat/threads/:threadId/streams/:streamId/state` | GET | Get stream state |
| `/chat/threads/:threadId/streams/:streamId/heartbeat` | POST | Update heartbeat |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /chat` | Returns `X-Stream-Id` header |
| `GET /chat/threads/:threadId/stream` | Enhanced resume logic |

---

## Database Changes

None required. All stream state is in Cloudflare KV with TTL.

---

## KV Key Schema

```
stream:state:{streamId}                    → StreamState JSON
stream:buffer:{streamId}:meta              → StreamBufferMetadata JSON
stream:buffer:{streamId}:chunks            → StreamChunk[] JSON
stream:active:{threadId}:r{round}:p{idx}   → streamId string
stream:thread:{threadId}:active            → ThreadActiveStream JSON
stream:heartbeat:{streamId}                → timestamp string
lock:round:{threadId}:r{round}             → timestamp string
```

---

## Migration Strategy

### Step 1: Backend Changes (No Frontend Changes)
- Remove HTTP abort signal
- Add `waitUntil()` wrapper
- Existing frontend works unchanged (just more resilient)

### Step 2: Frontend Enhancements
- Add stream state polling
- Add multi-stream tracking
- Enhanced error recovery

### Step 3: Full Rollout
- Enable all stream types
- Add heartbeat monitoring
- Add admin dashboard for stream visibility

---

## Testing Strategy

### Unit Tests
- Stream state transitions
- Chunk buffering/retrieval
- Heartbeat detection

### Integration Tests
- Stream survives simulated disconnect
- Resume delivers all chunks
- Multi-participant round completion

### E2E Tests
- Page refresh during streaming
- Tab close during streaming
- Network interruption during streaming

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Runaway streams without timeout | Keep timeout abort signal |
| KV costs from large streams | TTL cleanup, chunk compression |
| Orphaned streams | Heartbeat + cleanup job |
| Race conditions on resume | Idempotent operations, chunk indexing |
| Memory pressure in Workers | Use streaming, don't buffer in memory |

---

## Success Criteria

1. ✅ Page refresh at ANY point during streaming → Resume exactly where left off
2. ✅ Tab close during streaming → Stream completes in background
3. ✅ Network disconnect → Stream continues, reconnect resumes
4. ✅ Multiple participants → Each stream independent, all resumable
5. ✅ Web search/Analysis → Same behavior as participant streams

---

## Estimated Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Backend Decoupling | 2-3 days | P0 |
| Phase 2: Background Execution | 3-4 days | P0 |
| Phase 3: All Stream Types | 2-3 days | P1 |
| Phase 4: Frontend Integration | 2-3 days | P1 |
| Phase 5: Robustness | 2-3 days | P2 |

**Total**: ~2-3 weeks for full implementation

---

## Next Steps

1. Review and approve this plan
2. Start with Phase 1.1 (remove HTTP abort signal) - immediate win
3. Add `waitUntil()` wrapper for background completion
4. Test thoroughly with simulated disconnects
5. Roll out to production behind feature flag
