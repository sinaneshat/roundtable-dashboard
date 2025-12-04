# Background Task Processing Guide

**Status**: ✅ Using Cloudflare Queues for async title generation
**Last Updated**: 2025-12-04

## Overview

AI-based title generation uses Cloudflare Queues for guaranteed background processing. This ensures reliable title generation with automatic retries and dead-letter queue support.

## Cloudflare Queues Pattern (Current Implementation)

### ✅ Architecture

```
Thread Created → Queue Producer → Cloudflare Queue → Queue Consumer → Title Updated
                                     ↓
                             (retry on failure)
                                     ↓
                            Dead Letter Queue
```

### Benefits

- **Guaranteed delivery**: Messages persist until processed
- **Automatic retries**: 3x with exponential backoff (60s, 120s, 240s)
- **Dead-letter queue**: Failed messages captured for debugging
- **Non-blocking**: Response returns immediately (~100ms)
- **Production-ready**: Works reliably in preview/prod Cloudflare Workers

### Implementation Files

| File | Purpose |
|------|---------|
| `src/api/services/title-generation-queue.service.ts` | **Entry point** - Environment-aware dispatcher |
| `src/workers/title-generation-queue.ts` | Queue consumer (preview/prod) |
| `src/api/services/title-generator.service.ts` | Title generation logic (reused) |
| `src/api/types/uploads.ts` | Queue message types (with upload types) |
| `src/api/routes/chat/handlers/thread.handler.ts` | Calls queue service |
| `custom-worker.ts` | Exports queue handler |
| `wrangler.jsonc` | Queue configuration |

### Producer (Thread Creation)

**File**: `src/api/routes/chat/handlers/thread.handler.ts`

Uses the service which handles environment detection:

```typescript
await queueTitleGeneration(c, threadId, user.id, body.firstMessage);
```

### Queue Service (Environment-Aware)

**File**: `src/api/services/title-generation-queue.service.ts`

Automatically selects execution strategy based on environment:

```typescript
export async function queueTitleGeneration(
  c: Context<ApiEnv>,
  threadId: string,
  userId: string,
  firstMessage: string,
): Promise<void> {
  // Use queue in deployed environments
  if (isTitleQueueAvailable(c.env)) {
    await c.env.TITLE_GENERATION_QUEUE.send(buildQueueMessage(...));
    return;
  }

  // Fallback to waitUntil for local dev
  await generateTitleWithWaitUntil(...);
}
```

### Consumer (Background Processing)

**File**: `src/workers/title-generation-queue.ts`

```typescript
export async function handleTitleGenerationQueue(
  batch: MessageBatch<TitleGenerationQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  for (const msg of batch.messages) {
    try {
      // Uses existing service functions - no duplicate logic
      const title = await generateTitleFromMessage(msg.body.firstMessage, env);
      await updateThreadTitleAndSlug(msg.body.threadId, title);
      msg.ack();
    } catch (error) {
      // Exponential backoff retry
      msg.retry({ delaySeconds: Math.min(60 * 2 ** msg.attempts, 300) });
    }
  }
}
```

### Queue Configuration

**File**: `wrangler.jsonc`

```jsonc
"queues": {
  "producers": [
    {
      "queue": "title-generation-queue-local",
      "binding": "TITLE_GENERATION_QUEUE"
    }
  ],
  "consumers": [
    {
      "queue": "title-generation-queue-local",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 3,
      "retry_delay": 60
    }
  ]
}
```

## Local Development

### How It Works Locally

Cloudflare Queues are only available in deployed Workers environments.
In local development, the service automatically falls back to `waitUntil()`:

```
Local (pnpm dev):
  Thread Created → queueTitleGeneration()
                → isTitleQueueAvailable() = false
                → generateTitleWithWaitUntil() ✅

Preview/Prod:
  Thread Created → queueTitleGeneration()
                → isTitleQueueAvailable() = true
                → TITLE_GENERATION_QUEUE.send() ✅
```

### Checking Availability

```typescript
// src/api/services/title-generation-queue.service.ts
export function isTitleQueueAvailable(env: CloudflareEnv): boolean {
  return env.TITLE_GENERATION_QUEUE !== undefined;
}
```

## Alternative: waitUntil() Pattern

### When to Use waitUntil() Instead

**Use waitUntil() for**:
- **Non-critical operations** that don't need guaranteed delivery
- **Quick operations** (<1 second)
- **Best-effort execution** where occasional failures are acceptable
- **Simpler deployment** without queue infrastructure

## Monitoring

View title generation logs:
```bash
# Preview
pnpm wrangler tail roundtable-dashboard-preview

# Production
pnpm wrangler tail roundtable-dashboard-production
```

Look for log entries:
- `✅ Title generated: "..."` - Successful generation
- `Failed to generate title:` - Error occurred

## Implementing Queues (If Needed)

### Step 1: Define Queue Message Type

**File**: `src/api/types/uploads.ts` (add to BACKGROUND WORKER TYPES section)

```typescript
export type YourQueueMessage = {
  // Required fields
  id: string;
  userId: string;
  queuedAt: string;

  // Domain-specific fields
  // ...
};
```

### Step 2: Configure Queue in wrangler.jsonc

**All environments** (local, preview, production):

```jsonc
{
  "queues": {
    "producers": [
      {
        "queue": "your-queue-name",
        "binding": "YOUR_QUEUE_BINDING"
      }
    ],
    "consumers": [
      {
        "queue": "your-queue-name",
        "max_batch_size": 10,
        "max_batch_timeout": 5,
        "max_retries": 3,
        "retry_delay": 60
      }
    ]
  }
}
```

### Step 3: Create Queue Consumer

**File**: `src/workers/your-queue.ts`

```typescript
import type { MessageBatch } from '@cloudflare/workers-types';
import type { YourQueueMessage } from '@/api/types/uploads';

export async function handleYourQueue(
  batch: MessageBatch<YourQueueMessage>,
  env: CloudflareEnv,
): Promise<void> {
  console.error(`📥 Processing ${batch.messages.length} messages`);

  const results = await Promise.allSettled(
    batch.messages.map(async (message) => {
      try {
        // Process message
        await processMessage(message.body, env);

        // Acknowledge success
        message.ack();
      } catch (error) {
        console.error('Message processing failed:', error);

        // Retry with exponential backoff
        const retryDelaySeconds = Math.min(60 * 2 ** message.attempts, 300);
        message.retry({ delaySeconds: retryDelaySeconds });
      }
    }),
  );

  // Log summary
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.error(`✅ ${succeeded} succeeded, ❌ ${failed} failed`);
}

async function processMessage(
  message: YourQueueMessage,
  env: CloudflareEnv,
): Promise<void> {
  // Implement processing logic
}
```

### Step 4: Register Consumer in Custom Worker

**File**: `custom-worker.ts`

```typescript
import { handleYourQueue } from './src/workers/your-queue';

export default {
  fetch: handler.fetch,
  queue: async (batch: MessageBatch<unknown>, env: CloudflareEnv) => {
    if (batch.queue.startsWith('your-queue')) {
      return handleYourQueue(batch as MessageBatch<YourQueueMessage>, env);
    }
    console.error(`[QueueRouter] Unknown queue: ${batch.queue}`);
  },
} satisfies ExportedHandler<CloudflareEnv>;
```

**Note**: For multiple queues, use queue name prefix routing (see title-generation example).

### Step 5: Send Messages to Queue

**Producer code**:

```typescript
try {
  await c.env.YOUR_QUEUE_BINDING.send({
    id: 'unique-id',
    userId: user.id,
    queuedAt: new Date().toISOString(),
    // ... other fields
  });
  console.error('✅ Message queued successfully');
} catch (error) {
  console.error('❌ Failed to queue message:', error);
  // Handle failure (optional fallback logic)
}
```

### Step 6: Generate TypeScript Types

```bash
pnpm cf-typegen
```

Regenerates `cloudflare-env.d.ts` with queue bindings.

### Step 7: Write Unit Tests

**File**: `src/api/queues/__tests__/your-queue.consumer.test.ts`

```typescript
import type { Message, MessageBatch } from '@cloudflare/workers-types';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { YourQueueMessage } from '@/api/types/uploads';

type QueueMessage<T> = Message<T>;

vi.mock('@/api/services/your-service', () => ({
  yourServiceFunction: vi.fn(),
}));

describe('Your Queue Consumer', () => {
  let mockEnv: CloudflareEnv;

  beforeEach(() => {
    mockEnv = {
      OPENROUTER_API_KEY: 'test-key',
    } as CloudflareEnv;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process single message successfully', async () => {
    const { yourServiceFunction } = vi.mocked(
      await import('@/api/services/your-service'),
    );
    const { handleYourQueue } = await import('../your-queue.consumer');

    yourServiceFunction.mockResolvedValue('success');

    const queueMessage: Partial<QueueMessage<YourQueueMessage>> = {
      id: 'msg-1',
      timestamp: new Date(),
      body: {
        id: 'test-id',
        userId: 'user-123',
        queuedAt: new Date().toISOString(),
      },
      attempts: 0,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    const batch: MessageBatch<YourQueueMessage> = {
      queue: 'your-queue-name',
      messages: [queueMessage as QueueMessage<YourQueueMessage>],
    };

    await handleYourQueue(batch, mockEnv);

    expect(yourServiceFunction).toHaveBeenCalled();
    expect(queueMessage.ack).toHaveBeenCalled();
  });

  it('should retry on failure with exponential backoff', async () => {
    const { yourServiceFunction } = vi.mocked(
      await import('@/api/services/your-service'),
    );
    const { handleYourQueue } = await import('../your-queue.consumer');

    yourServiceFunction.mockRejectedValue(new Error('Failed'));

    const queueMessage: Partial<QueueMessage<YourQueueMessage>> = {
      id: 'msg-1',
      timestamp: new Date(),
      body: {
        id: 'test-id',
        userId: 'user-123',
        queuedAt: new Date().toISOString(),
      },
      attempts: 1,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    const batch: MessageBatch<YourQueueMessage> = {
      queue: 'your-queue-name',
      messages: [queueMessage as QueueMessage<YourQueueMessage>],
    };

    await handleYourQueue(batch, mockEnv);

    expect(queueMessage.ack).not.toHaveBeenCalled();
    expect(queueMessage.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
  });
});
```

## Deployment Instructions

### Local Development

Queue already configured in `wrangler.jsonc` (default environment).

**Start dev server**:
```bash
pnpm dev
```

Queue consumer runs automatically with local worker.

### Preview Environment

**Deploy to preview**:
```bash
pnpm deploy:preview
```

Queue configuration in `wrangler.jsonc` env.preview section automatically applied.

**Verify queue creation**:
```bash
wrangler queues list --env preview
```

### Production Environment

**Deploy to production**:
```bash
pnpm deploy:production
```

Queue configuration in `wrangler.jsonc` env.production section automatically applied.

**Verify queue creation**:
```bash
wrangler queues list --env production
```

### Queue Management Commands

**List queues**:
```bash
wrangler queues list
wrangler queues list --env preview
wrangler queues list --env production
```

**View queue consumer**:
```bash
wrangler queues consumer list title-generation-queue
```

**Monitor queue messages** (development):
```bash
wrangler tail --env local
wrangler tail --env preview
wrangler tail --env production
```

**Delete queue** (if needed):
```bash
wrangler queues delete title-generation-queue --env preview
```

## Error Handling and Retry Strategy

### Exponential Backoff Formula

```typescript
const retryDelaySeconds = Math.min(60 * 2 ** message.attempts, 300);
```

**Retry schedule**:
- Attempt 0 (initial): 60s delay
- Attempt 1: 120s delay (60 * 2^1)
- Attempt 2: 240s delay (60 * 2^2)
- Attempt 3+: 300s delay (capped)

### Dead Letter Queue (DLQ)

After `max_retries` (3), message moves to DLQ automatically.

**Monitor DLQ**:
```bash
wrangler queues consumer dlq list title-generation-queue
```

**Reprocess DLQ messages**:
```bash
wrangler queues consumer dlq reprocess title-generation-queue
```

## Testing

**Run all tests**:
```bash
pnpm test
```

**Run queue tests only**:
```bash
pnpm test src/api/queues/__tests__/
```

**Watch mode**:
```bash
pnpm test:watch src/api/queues/__tests__/
```

**Coverage**:
```bash
pnpm test:coverage
```

## Migration Checklist

When migrating from `waitUntil()` to Queues:

- [ ] Define queue message type in `src/api/types/uploads.ts` (BACKGROUND WORKER TYPES section)
- [ ] Add queue configuration to `wrangler.jsonc` (all environments)
- [ ] Create queue consumer in `src/workers/`
- [ ] Update producer code to send messages to queue
- [ ] Register consumer in `custom-worker.ts`
- [ ] Run `pnpm cf-typegen` to generate types
- [ ] Write comprehensive unit tests
- [ ] Run `pnpm lint && pnpm check-types && pnpm test`
- [ ] Test locally with `pnpm dev`
- [ ] Deploy to preview with `pnpm deploy:preview`
- [ ] Verify queue creation with `wrangler queues list --env preview`
- [ ] Test in preview environment
- [ ] Deploy to production with `pnpm deploy:production`
- [ ] Monitor queue with `wrangler tail --env production`

## Monitoring and Observability

### CloudFlare Dashboard

**Queue Metrics**:
1. Navigate to Workers & Pages → Overview
2. Select your worker
3. Click "Queues" tab
4. View:
   - Messages processed
   - Messages failed
   - Average processing time
   - DLQ message count

### Logs and Debugging

**Real-time logs**:
```bash
wrangler tail --env production
```

**Filter for queue logs**:
```bash
wrangler tail --env production | grep "📥 Processing"
```

**Consumer logging pattern** (from title-generation.consumer.ts):
```typescript
console.error(`📥 Processing ${batch.messages.length} title generation messages`);
console.error(`✅ ${succeeded} succeeded, ❌ ${failed} failed`);
console.error(`⏱️ Total batch processing time: ${elapsedMs}ms`);
```

## Performance Considerations

### Batch Size Tuning

**Current**: `max_batch_size: 10`

- **Smaller batches** (1-5): Lower latency, higher invocation cost
- **Larger batches** (10-100): Higher throughput, potential timeout risk

**Recommendation**: Start with 10, increase if processing is fast (<1s per message).

### Timeout Configuration

**Current**: `max_batch_timeout: 5` (seconds)

Queue consumer invoked when:
- Batch reaches `max_batch_size`, OR
- `max_batch_timeout` seconds elapsed since first message

**Recommendation**: 5s for balanced latency/throughput.

### Retry Strategy

**Current**: `max_retries: 3`, `retry_delay: 60`

- Exponential backoff prevents thundering herd
- 300s cap prevents infinite delays
- 3 retries = 4 total attempts (initial + 3 retries)

## Troubleshooting

### Messages Not Processing

**Check queue consumer is registered**:
```typescript
// src/api/index.ts should export queue handler
export default {
  fetch: appRoutes.fetch,
  queue: handleTitleGenerationQueue,
};
```

**Verify queue binding exists**:
```bash
wrangler queues list
```

**Check CloudFlare dashboard for errors**:
Workers & Pages → Your Worker → Logs

### Messages Stuck in DLQ

**View DLQ messages**:
```bash
wrangler queues consumer dlq list title-generation-queue
```

**Common causes**:
- Persistent service failures (API down, invalid credentials)
- Data validation errors
- Code bugs in consumer

**Fix and reprocess**:
1. Fix root cause
2. Deploy fixed consumer
3. Reprocess DLQ:
   ```bash
   wrangler queues consumer dlq reprocess title-generation-queue
   ```

### Type Errors After Adding Queue

**Regenerate CloudFlare types**:
```bash
pnpm cf-typegen
```

**Verify binding in cloudflare-env.d.ts**:
```typescript
interface CloudflareEnv {
  TITLE_GENERATION_QUEUE: Queue<TitleGenerationQueueMessage>;
}
```

## Best Practices

### ✅ Do:

- Use Queues for long-running tasks (>1s)
- Implement idempotency in consumers (handle duplicate messages)
- Log batch processing metrics
- Use exponential backoff for retries
- Test queue consumers with unit tests
- Monitor DLQ regularly
- Set appropriate `max_batch_size` based on processing time

### ❌ Don't:

- Use Queues for quick operations (<300ms) - use `waitUntil()` instead
- Block on external API calls without timeout
- Forget to call `message.ack()` on success
- Use unlimited retry delays (cap at reasonable limit like 300s)
- Ignore DLQ messages - investigate and fix root causes
- Send sensitive data in queue messages (use IDs, fetch from DB in consumer)

## References

- **Cloudflare Queues Docs**: https://developers.cloudflare.com/queues/
- **Hono + Cloudflare Workers**: https://hono.dev/docs/getting-started/cloudflare-workers
- **Title Generation Consumer**: `src/workers/title-generation-queue.ts`
- **Queue Types**: `src/api/types/uploads.ts` (BACKGROUND WORKER TYPES section)
- **Queue Service**: `src/api/services/title-generation-queue.service.ts`

## Example: Stripe Webhooks (NOT Using Queues)

Stripe webhooks process quickly (~100-300ms) and use `waitUntil()` pattern:

**File**: `src/api/routes/billing/handler.ts:871-894`

```typescript
// Async webhook processing pattern for Cloudflare Workers
const processAsync = async () => {
  try {
    await processWebhookEvent(event, batch.db, {});
    await batch.db.update(tables.stripeWebhookEvent)
      .set({ processed: true })
      .where(eq(tables.stripeWebhookEvent.id, event.id));
  } catch { }
};

if (c.executionCtx) {
  c.executionCtx.waitUntil(processAsync());
} else {
  await processAsync();
}
```

**Why NOT use Queues**:
- Fast execution (<300ms)
- Stripe handles retries with webhook retry logic
- "Stay Sane with Stripe" pattern: always return 200, fetch fresh data

## Support

For issues or questions about queue implementation:
1. Check CloudFlare dashboard logs
2. Review this documentation
3. Examine existing queue consumer implementation
4. Run unit tests to verify behavior
