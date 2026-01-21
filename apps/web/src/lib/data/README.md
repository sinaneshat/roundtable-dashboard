# Data Fetching Architecture

## Overview

This directory contains utilities for data fetching using TanStack Query with TanStack Start. It provides a unified approach for both server and client-side data fetching.

## Important: Better Auth vs TanStack Query

### Use Better Auth for:
- User authentication (`useSession()`)
- Organization management (`useActiveOrganization()`, `useListOrganizations()`)
- Permissions and access control
- Any auth-related data

### Use TanStack Query for:
- API data fetching (health checks, business data)
- Backend communication (non-auth endpoints)
- Data that needs caching and synchronization
- Optimistic updates for mutations

## Files

### `query-client.ts`
Main QueryClient configuration that works on both server and client:
- Server: Creates new instance per request
- Client: Uses singleton instance
- Provides optimized defaults for caching

### `query-keys.ts`
Centralized query key management for type-safe caching:
```typescript
export const queryKeys = {
  health: {
    all: ['health'] as const,
    check: () => [...queryKeys.health.all, 'check'] as const,
  },
  // Add more keys as needed
};
```

### `stale-times.ts`
Centralized stale time configuration for consistent caching:
```typescript
import { STALE_TIMES } from '@/lib/data/stale-times';

useQuery({
  queryKey: queryKeys.products.list(),
  queryFn: getProductsService,
  staleTime: STALE_TIMES.products,
});
```

## Usage Examples

### TanStack Start Route Loader
```typescript
// routes/chat.tsx
import { createFileRoute } from '@tanstack/react-router';
import { getThreadsService } from '@/services/api';

export const Route = createFileRoute('/chat')({
  loader: async () => ({
    threads: await getThreadsService(),
  }),
  component: ChatPage,
});

function ChatPage() {
  const { threads } = Route.useLoaderData(); // Type-safe, SSR'd
  return <ThreadList threads={threads} />;
}
```

### Client Component with Query
```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';

export function HealthStatus() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.health.check(),
    queryFn: async () => {
      const response = await fetch('/api/v1/health');
      return response.json();
    },
  });

  if (isLoading) return <div>Loading...</div>;
  return <div>Status: {data?.status}</div>;
}
```

### Server Function with Better Auth
```typescript
import { createServerFn } from '@tanstack/react-start';
import { getSession } from '@/server/auth';

export const getUserData = createServerFn({ method: 'GET' })
  .handler(async () => {
    const session = await getSession();
    if (!session) throw new Error('Unauthorized');

    // Direct Better Auth call - no TanStack Query needed
    return { user: session.user };
  });
```

### Client Component with Better Auth
```typescript
import { authClient } from '@/lib/auth/client';

export function UserProfile() {
  // Better Auth's own hooks - no TanStack Query
  const { data: session } = authClient.useSession();
  const { data: org } = authClient.useActiveOrganization();

  return (
    <div>
      User: {session?.user.name}
      Org: {org?.name}
    </div>
  );
}
```

## Best Practices

1. **Never mix Better Auth with TanStack Query** - Better Auth has its own client and caching
2. **Always use query keys** from `query-keys.ts` for consistency
3. **Use route loaders** for SSR data fetching in TanStack Start
4. **Use proper error boundaries** for failed queries
5. **Configure stale times** based on data volatility using `STALE_TIMES`

## TanStack Start Patterns

### Route Loaders vs TanStack Query

| Use Case | Solution |
|----------|----------|
| Initial page data | Route loader |
| Real-time polling | TanStack Query with `refetchInterval` |
| Mutations | TanStack Query mutations |
| Optimistic updates | TanStack Query with `onMutate` |
| Client-only data | TanStack Query hooks |

### Server Functions for Mutations

```typescript
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const createThread = createServerFn({ method: 'POST' })
  .validator(z.object({ title: z.string(), model: z.string() }))
  .handler(async ({ data }) => {
    // Server-side mutation
    const thread = await createThreadService(data);
    return thread;
  });
```
