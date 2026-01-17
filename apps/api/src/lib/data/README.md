# Data Fetching Architecture

## Overview

This directory contains utilities for data fetching using TanStack Query. It provides a unified approach for both server and client-side data fetching.

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

### `server-prefetch.ts`
Server-side prefetching utilities:
```typescript
// In a server component
import { getQueryClient } from '@/lib/data/query-client';
import { prefetchQuery } from '@/lib/data/server-prefetch';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

export default async function Page() {
  const queryClient = getQueryClient();
  
  await prefetchQuery(queryClient, {
    queryKey: queryKeys.health.check(),
    queryFn: async () => {
      const response = await fetch('/api/v1/health');
      return response.json();
    },
  });
  
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <YourComponent />
    </HydrationBoundary>
  );
}
```

## Usage Examples

### Client Component with Query
```typescript
'use client';

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

### Server Component with Better Auth
```typescript
// DON'T use TanStack Query for auth data!
import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';

export default async function Page() {
  // Direct Better Auth call - no TanStack Query needed
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  
  const orgs = await auth.api.listOrganizations({
    headers: await headers(),
  });
  
  return <div>Welcome {session?.user.name}</div>;
}
```

### Client Component with Better Auth
```typescript
'use client';

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
3. **Prefetch on server** when possible for better performance
4. **Use proper error boundaries** for failed queries
5. **Configure stale times** based on data volatility

## Migration Guide

If you're migrating from the old approach:

### Old (Wrong):
```typescript
// DON'T create separate query clients
const serverQueryClient = createServerQueryClient();
const clientQueryClient = new QueryClient();

// DON'T use TanStack for auth
useQuery({
  queryKey: ['user'],
  queryFn: () => fetch('/api/auth/session'),
});
```

### New (Correct):
```typescript
// DO use shared getQueryClient()
const queryClient = getQueryClient();

// DO use Better Auth directly
const { data: session } = authClient.useSession();
```