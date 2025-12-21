---
name: tanstack-query
description: Enforce TanStack Query (React Query) v5 best practices for data fetching, caching, mutations, and SSR/hydration with Next.js. Use when implementing useQuery, useMutation, prefetching, or server-side data fetching.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# TanStack Query v5 Patterns

## Documentation Links

**Official Documentation:**
- [TanStack Query Overview](https://tanstack.com/query/latest/docs/overview) - Primary reference
- [useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
- [useMutation](https://tanstack.com/query/latest/docs/framework/react/reference/useMutation)
- [SSR & Hydration](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
- [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- [Prefetching](https://tanstack.com/query/latest/docs/framework/react/guides/prefetching)
- [Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)

**Context7 Library IDs (for up-to-date docs):**
```
/websites/tanstack_query - TanStack Query docs (score: 89.9, 2156 snippets)
/tanstack/query - GitHub repo (versions: v5.60.5, v5.71.10, v5_84_1)
/websites/tanstack_query_v5 - v5 specific docs
```

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topics like "useQuery", "prefetch SSR", "mutation", "hydration"

## Core Concepts

### Query Setup with QueryClientProvider

```tsx
// app/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

### Basic useQuery Pattern

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'

export function Posts() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const res = await fetch('/api/posts')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  if (isPending) return <div>Loading...</div>
  if (isError) return <div>Error: {error.message}</div>

  return <PostList posts={data} />
}
```

### Query Keys Best Practices

```tsx
// Query key factory pattern
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: Filters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
}

// Usage
useQuery({ queryKey: postKeys.detail(postId), queryFn: ... })
queryClient.invalidateQueries({ queryKey: postKeys.lists() })
```

### useMutation Pattern

```tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

export function CreatePost() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newPost: NewPost) =>
      fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(newPost),
      }).then(res => res.json()),
    onSuccess: () => {
      // Invalidate and refetch posts
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
    onError: (error) => {
      console.error('Failed to create post:', error)
    },
  })

  return (
    <button
      onClick={() => mutation.mutate({ title: 'New Post' })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Creating...' : 'Create Post'}
    </button>
  )
}
```

### Optimistic Updates

```tsx
const mutation = useMutation({
  mutationFn: updatePost,
  onMutate: async (newPost) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['posts', newPost.id] })

    // Snapshot previous value
    const previousPost = queryClient.getQueryData(['posts', newPost.id])

    // Optimistically update
    queryClient.setQueryData(['posts', newPost.id], newPost)

    return { previousPost }
  },
  onError: (err, newPost, context) => {
    // Rollback on error
    queryClient.setQueryData(['posts', newPost.id], context?.previousPost)
  },
  onSettled: () => {
    // Always refetch after error or success
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```

## Next.js App Router SSR Patterns

### Server Component Prefetching (Recommended)

```tsx
// app/posts/page.tsx (Server Component)
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { Posts } from './posts'

export default async function PostsPage() {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: getPosts,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Posts />
    </HydrationBoundary>
  )
}
```

```tsx
// app/posts/posts.tsx (Client Component)
'use client'

import { useQuery } from '@tanstack/react-query'

export function Posts() {
  // Data is immediately available from prefetch
  const { data } = useQuery({
    queryKey: ['posts'],
    queryFn: getPosts,
  })

  return <PostList posts={data} />
}
```

### Streaming with Suspense (No await)

```tsx
// app/posts/page.tsx - Streaming pattern
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient } from './get-query-client'
import Posts from './posts'

export default function PostsPage() {
  const queryClient = getQueryClient()

  // No await - enables streaming
  queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: getPosts,
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Posts />
    </HydrationBoundary>
  )
}
```

### Singleton QueryClient for Server

```tsx
// app/get-query-client.ts
import { QueryClient } from '@tanstack/react-query'
import { cache } from 'react'

// Create singleton per request
export const getQueryClient = cache(() => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
    },
  },
}))
```

## Anti-Patterns to Avoid

### 1. Creating QueryClient in Component Body

```tsx
// BAD - creates new client on every render
function App() {
  const queryClient = new QueryClient()
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}

// GOOD - stable reference
function App() {
  const [queryClient] = useState(() => new QueryClient())
  return <QueryClientProvider client={queryClient}>...</QueryClientProvider>
}
```

### 2. Missing Query Keys

```tsx
// BAD - no dependency tracking
useQuery({ queryKey: ['posts'], queryFn: () => getPost(id) })

// GOOD - include all dependencies
useQuery({ queryKey: ['posts', id], queryFn: () => getPost(id) })
```

### 3. Fetching in useEffect Instead of useQuery

```tsx
// BAD - manual fetching
const [data, setData] = useState(null)
useEffect(() => {
  fetch('/api/posts').then(r => r.json()).then(setData)
}, [])

// GOOD - useQuery handles caching, refetching, errors
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: () => fetch('/api/posts').then(r => r.json()),
})
```

### 4. Not Using Prefetch with SSR

```tsx
// BAD - client-side fetch causes loading flash
export default function Page() {
  return <Posts /> // useQuery inside fetches on client
}

// GOOD - prefetch on server
export default async function Page() {
  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: getPosts })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Posts />
    </HydrationBoundary>
  )
}
```

## Important Options Reference

```tsx
useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,

  // Timing
  staleTime: 5 * 60 * 1000, // 5 min before considered stale
  gcTime: 10 * 60 * 1000, // 10 min before garbage collected
  refetchInterval: 30000, // Poll every 30s

  // Behavior
  enabled: !!userId, // Conditional fetching
  retry: 3, // Retry failed requests
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),

  // Data handling
  select: (data) => data.posts, // Transform response
  placeholderData: previousData, // Show stale while fetching
  initialData: cachedPosts, // Seed cache
})
```

## Project-Specific Notes

This project uses TanStack Query with:
- Hooks defined in `src/hooks/queries/`
- API services in `src/services/api/`
- QueryClientProvider in `src/components/providers/`
