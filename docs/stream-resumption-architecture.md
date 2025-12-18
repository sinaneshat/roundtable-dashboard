# Stream Resumption Architecture

Multi-phase stream resumption for Roundtable's collaborative AI chat.

## Overview

Roundtable uses a **custom multi-phase stream resumption system** built on Cloudflare KV instead of the standard AI SDK `resumable-stream` + Redis pattern. This document explains the architecture, how it differs from official patterns, and why.

## Architecture Comparison

### Official AI SDK Pattern (Redis)
```
POST /api/chat → consumeSseStream → createResumableStreamContext → Redis pub/sub
GET /api/chat/{id}/stream → resumeExistingStream → Redis → SSE Response
Client: useChat({ resume: true }) → automatic reconnect on mount
```

### Roundtable Pattern (Cloudflare KV)
```
POST /api/v1/chat → consumeSseStream → KV buffering per phase
GET /api/v1/chat/threads/{id}/stream → Phase detection → KV fetch → SSE or 204
Client: useChat({ resume: !!threadId }) + custom store-based phase resumption
```

## Why Custom Implementation

### 1. Multi-Phase Round Structure
Roundtable's conversation rounds have 3 distinct phases:
1. **Pre-search**: Optional web search before participants respond
2. **Participants**: Sequential streaming from multiple AI models (0..N)
3. **Summarizer**: Object stream that synthesizes participant responses

The AI SDK's single-stream resumption doesn't support phase-aware continuation.

### 2. Cloudflare KV vs Redis
- **No Redis in Cloudflare Workers**: KV is the only durable key-value store
- **No true pub/sub**: KV requires polling instead of subscriptions
- **Eventual consistency**: Requires retry logic for race conditions

### 3. Sequential Participant Streaming
Each participant streams one at a time. If user navigates away mid-participant, we must:
- Resume that participant's stream from KV
- Continue with remaining participants
- Run summarizer after all complete

## Storage Schema

### Stream Buffer Keys
```
stream:buffer:{streamId}:meta    → StreamBufferMetadata
stream:buffer:{streamId}:chunks  → StreamChunk[]
stream:active:{threadId}:r{N}:p{I} → streamId (active stream tracking)
```

### Pre-search Keys
```
presearch:{threadId}:r{N}:meta   → PreSearchStreamMetadata
presearch:{threadId}:r{N}:chunks → PreSearchStreamChunk[]
```

### Summarizer Keys
```
summary:stream:{streamId}:meta   → SummaryStreamBufferMetadata
summary:stream:{streamId}:chunks → SummaryStreamChunk[]
```

### Thread-Level Tracking
```
thread:stream:{threadId}         → ThreadActiveStream (tracks current phase)
```

## TTL Configuration

All KV entries use `STREAM_BUFFER_TTL_SECONDS = 3600` (1 hour):
- Prevents stale data accumulation
- Auto-cleanup for abandoned streams
- Defined in `src/api/types/streaming.ts:31`

## Client-Side Implementation

### AI SDK Configuration
```typescript
// src/hooks/utils/use-multi-participant-chat.ts:678-680
const { ... } = useChat({
  id: useChatId,
  resume: !!useChatId, // Only enable when valid thread ID exists
  transport: new DefaultChatTransport({
    prepareReconnectToStreamRequest: ({ id }) => ({
      api: `/api/v1/chat/threads/${id}/stream`,
    }),
  }),
});
```

### State Corruption Prevention
The `resume: !!useChatId` pattern prevents "Cannot read properties of undefined (reading 'state')" errors that occur when:
- AI SDK tries to resume on new threads without an ID
- Thread ID is empty string instead of undefined
- Chat instance isn't fully initialized

### Custom Phase Resumption Hooks
Located in `src/components/providers/chat-store-provider/hooks/`:

1. **usePreSearchResumption**: Handles web search phase
2. **useRoundResumption**: Handles participant continuation
3. **useIncompleteRoundResumption**: Detects incomplete rounds on mount

## Server-Side Implementation

### POST Handler: consumeSseStream
```typescript
// src/api/routes/chat/handlers/streaming.handler.ts
return result.toUIMessageStreamResponse({
  async consumeSseStream({ stream }) {
    // Initialize KV buffer
    await initializeStreamBuffer(streamId, threadId, roundNumber, participantIndex, env);

    // Buffer chunks as they arrive
    for await (const chunk of stream) {
      await appendStreamChunk(streamId, chunk, env);
    }

    // Mark complete
    await completeStreamBuffer(streamId, env);
  },
});
```

### GET Handler: Stream Resume
```typescript
// src/api/routes/chat/handlers/stream-resume.handler.ts
export async function resumeThreadStreamHandler(c: Context) {
  const threadId = c.req.param('threadId');

  // Check for active streams across all phases
  const activeStream = await getThreadActiveStream(threadId, env);

  if (!activeStream) {
    return c.body(null, 204); // No active stream
  }

  // Determine phase and return appropriate response
  const phase = detectStreamPhase(activeStream);

  if (phase === 'participant') {
    // Return live SSE stream from KV
    return streamResponse(createLiveParticipantResumeStream(streamId, env));
  }

  // For pre-search/summarizer, return 204 with metadata
  // Frontend handles these phases via store-based resumption
  return c.body(null, 204, { 'X-Resume-Phase': phase });
}
```

## Stream Lifecycle

### New Round Flow
```
1. User sends message
2. Check if web search enabled → Start pre-search stream
3. Pre-search complete → Start participant 0 stream
4. Participant 0 complete → Start participant 1 stream
5. ... repeat for all participants
6. All participants complete → Start summarizer object stream
7. Summarizer complete → Round complete
```

### Resume Flow (Page Reload)
```
1. useChat mounts with resume: true
2. AI SDK calls GET /stream endpoint
3. Server checks KV for active streams:
   a. Pre-search active → Return 204, set X-Resume-Phase: presearch
   b. Participant active → Return live SSE stream from KV
   c. Summarizer active → Return 204, set X-Resume-Phase: summarizer
   d. No active → Return 204 (no content)
4. Frontend store detects phase and triggers appropriate resumption hook
5. Resume stream or restart phase as needed
```

## Stale Stream Detection

### Server-Side
```typescript
// createLiveParticipantResumeStream in stream-buffer.service.ts
const noNewDataTimeoutMs = 30 * 1000; // 30s for reasoning models

if (timeSinceLastNewData > noNewDataTimeoutMs) {
  // Send synthetic finish event
  const syntheticFinish = `data: {"type":"finish","finishReason":"unknown"}\n\n`;
  controller.enqueue(syntheticFinish);
  controller.close();
}
```

### Client-Side
```typescript
// Phantom resume detection in use-multi-participant-chat.ts
const PHANTOM_RESUME_TIMEOUT = 5000; // 5 seconds

// If AI SDK status is 'streaming' but no new messages arrive,
// clear isExplicitlyStreaming and let incomplete-round-resumption take over
```

## Error Handling

### Stream Failure
```typescript
// failStreamBuffer appends error chunk for frontend
const errorChunk = `3:${JSON.stringify({ error: errorMessage })}`;
await appendStreamChunk(streamId, errorChunk, env);
```

### Recovery
Frontend detects failed/stale streams and:
1. Clears streaming state
2. Shows retry UI
3. On retry, deletes failed messages and re-triggers round

## File Reference

| File | Purpose |
|------|---------|
| `src/api/services/stream-buffer.service.ts` | Participant stream KV buffering |
| `src/api/services/pre-search-stream-buffer.service.ts` | Pre-search stream KV buffering |
| `src/api/services/summary-stream-buffer.service.ts` | Summarizer stream KV buffering |
| `src/api/services/resumable-stream-kv.service.ts` | Thread-level stream tracking |
| `src/api/types/streaming.ts` | All streaming types, schemas, constants |
| `src/api/routes/chat/handlers/stream-resume.handler.ts` | GET /stream endpoint |
| `src/api/routes/chat/handlers/streaming.handler.ts` | POST handler with consumeSseStream |
| `src/hooks/utils/use-multi-participant-chat.ts` | AI SDK useChat configuration |
| `src/stores/chat/actions/incomplete-round-resumption.ts` | Store action for round detection |
| `src/components/providers/chat-store-provider/hooks/` | Phase-specific resumption hooks |

## Known Limitations

1. **No abort compatibility**: Stream resumption breaks if abort is used (AI SDK limitation)
2. **Polling overhead**: KV polling every 100ms vs Redis pub/sub
3. **30s stale timeout**: May be too short for very slow reasoning models
4. **No multi-client sync**: Each client maintains independent resume state

## Configuration

```typescript
// src/api/types/streaming.ts
export const STREAM_BUFFER_TTL_SECONDS = 60 * 60; // 1 hour

// src/api/services/stream-buffer.service.ts
pollIntervalMs = 100           // KV poll frequency
maxPollDurationMs = 5 * 60 * 1000  // 5 minute max poll
noNewDataTimeoutMs = 30 * 1000     // Stale detection threshold
```
