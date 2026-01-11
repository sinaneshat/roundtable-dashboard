---
name: nextjs-data-fetching
description: Enforce Next.js 15+ App Router data fetching patterns including Server Components, SSG, ISR, and SSR. Use when implementing data fetching, choosing rendering strategies, or fixing anti-patterns with getServerSideProps/getStaticProps.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Next.js 15+ Data Fetching & Rendering Strategies

## Documentation Links

**Official Documentation:**
- [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching) - Primary reference
- [Caching in Next.js](https://nextjs.org/docs/app/building-your-application/caching)
- [Incremental Static Regeneration](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration)
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Static and Dynamic Rendering](https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic-rendering)

**Context7 Library IDs (for up-to-date docs):**
```
/vercel/next.js - Official Next.js (versions: v16.0.3, v15.1.8)
/websites/nextjs - Next.js documentation site
/llmstxt/nextjs_llms_txt - Next.js LLM-optimized docs
```

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topics like "data fetching", "SSG ISR", "server components", "revalidate"

## Core Principle

> Server Components are the default. Fetch data on the server, minimize client JavaScript, and choose the right caching strategy for your content.

## Rendering Strategy Decision Tree

```
Is the content user-specific or request-dependent?
├─ YES → SSR (dynamic rendering)
│   └─ Use: cache: 'no-store' or dynamic = 'force-dynamic'
│
└─ NO → Is the content updated frequently?
    ├─ YES → ISR (incremental static regeneration)
    │   └─ Use: next: { revalidate: N } (seconds)
    │
    └─ NO → SSG (static site generation)
        └─ Use: cache: 'force-cache' (default)
```

## Server Components Data Fetching

### Basic Pattern (SSG - Default)

```tsx
// app/posts/page.tsx - Static by default
export default async function PostsPage() {
  // Cached indefinitely until manual revalidation
  const posts = await fetch('https://api.example.com/posts');
  const data = await posts.json();

  return (
    <ul>
      {data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### ISR (Time-based Revalidation)

```tsx
// app/posts/page.tsx - Revalidate every 60 seconds
export default async function PostsPage() {
  const posts = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 }, // ISR - regenerate after 60 seconds
  });
  const data = await posts.json();

  return <PostList posts={data} />;
}

// Alternative: Route segment config
export const revalidate = 60; // Applies to all fetches in this route
```

### SSR (Dynamic Rendering)

```tsx
// app/dashboard/page.tsx - Always fresh
export default async function DashboardPage() {
  const data = await fetch('https://api.example.com/user/data', {
    cache: 'no-store', // SSR - fetch on every request
  });
  const userData = await data.json();

  return <Dashboard data={userData} />;
}

// Alternative: Route segment config
export const dynamic = 'force-dynamic';
```

## Route Segment Configuration

```tsx
// app/page.tsx

// Force static generation (SSG)
export const dynamic = 'force-static';

// Force dynamic rendering (SSR)
export const dynamic = 'force-dynamic';

// ISR with time-based revalidation
export const revalidate = 3600; // 1 hour

// Disable revalidation (fully static)
export const revalidate = false;
```

## Tag-based Revalidation (On-Demand ISR)

### Tagging Fetch Requests

```tsx
// app/posts/page.tsx
export default async function PostsPage() {
  const posts = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] }, // Tag for on-demand revalidation
  });
  const data = await posts.json();
  return <PostList posts={data} />;
}
```

### Revalidating Tags

```tsx
// app/actions.ts
'use server';

import { revalidateTag, revalidatePath } from 'next/cache';

export async function createPost(formData: FormData) {
  await db.posts.create(/* ... */);

  // Invalidate all data tagged with 'posts'
  revalidateTag('posts');

  // Or invalidate a specific path
  revalidatePath('/posts');
}
```

## Client Components Data Fetching

### When Client Fetching is Needed

- User interactions that fetch data
- Real-time updates (polling, WebSocket)
- Data that changes based on client state

### Using TanStack Query (Recommended)

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';

export function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return <Profile user={data} />;
}
```

### Using SWR

```tsx
'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function BlogPosts() {
  const { data, error, isLoading } = useSWR('/api/posts', fetcher);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <PostList posts={data} />;
}
```

## Anti-Patterns to Avoid

### 1. Using getServerSideProps/getStaticProps in App Router

```tsx
// BAD - Pages Router patterns
export async function getServerSideProps() {
  const data = await fetchData();
  return { props: { data } };
}

// GOOD - App Router pattern
export default async function Page() {
  const data = await fetchData();
  return <Component data={data} />;
}
```

### 2. Fetching in Client Components When Server Would Work

```tsx
// BAD - unnecessary client-side fetching
'use client';
export function PostList() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts);
  }, []);
  return <ul>{posts.map(/* ... */)}</ul>;
}

// GOOD - Server Component
export default async function PostList() {
  const posts = await fetch('https://api.example.com/posts');
  const data = await posts.json();
  return <ul>{data.map(/* ... */)}</ul>;
}
```

### 3. Not Specifying Cache Strategy

```tsx
// BAD - unclear caching behavior
const data = await fetch('https://api.example.com/data');

// GOOD - explicit cache strategy
const staticData = await fetch('https://api.example.com/data', {
  cache: 'force-cache', // SSG
});

const dynamicData = await fetch('https://api.example.com/data', {
  cache: 'no-store', // SSR
});

const isrData = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 }, // ISR
});
```

### 4. Prop Drilling Instead of Server Fetching

```tsx
// BAD - fetching at root and prop drilling
async function Layout({ children }) {
  const user = await getUser();
  return <>{cloneElement(children, { user })}</>;
}

// GOOD - fetch where needed (requests are deduped)
async function Header() {
  const user = await getUser(); // Deduped with other getUser() calls
  return <nav>{user.name}</nav>;
}

async function Sidebar() {
  const user = await getUser(); // Same request, deduped
  return <aside>{user.email}</aside>;
}
```

## Fetch Options Reference

```tsx
// SSG - Static (default)
fetch(url, { cache: 'force-cache' });

// SSR - Dynamic
fetch(url, { cache: 'no-store' });
fetch(url, { next: { revalidate: 0 } });

// ISR - Time-based
fetch(url, { next: { revalidate: 60 } }); // Seconds
fetch(url, { next: { revalidate: 3600 } }); // 1 hour
fetch(url, { next: { revalidate: false } }); // Never (fully static)

// Tagged for on-demand revalidation
fetch(url, { next: { tags: ['posts', 'featured'] } });

// Combined
fetch(url, {
  next: {
    revalidate: 3600,
    tags: ['posts'],
  },
});
```

## Parallel Data Fetching

```tsx
// GOOD - parallel fetches
async function Page() {
  // Start all fetches simultaneously
  const [posts, comments, user] = await Promise.all([
    fetch('https://api.example.com/posts').then(r => r.json()),
    fetch('https://api.example.com/comments').then(r => r.json()),
    fetch('https://api.example.com/user').then(r => r.json()),
  ]);

  return <Content posts={posts} comments={comments} user={user} />;
}
```

## Streaming with Suspense

```tsx
// app/posts/page.tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <main>
      <h1>Posts</h1>
      <Suspense fallback={<PostsSkeleton />}>
        <Posts /> {/* Async Server Component */}
      </Suspense>
      <Suspense fallback={<CommentsSkeleton />}>
        <Comments /> {/* Async Server Component */}
      </Suspense>
    </main>
  );
}

async function Posts() {
  const posts = await fetch('https://api.example.com/posts', {
    next: { revalidate: 60 },
  }).then(r => r.json());

  return <PostList posts={posts} />;
}
```

## Server Actions for Mutations

```tsx
// app/posts/actions.ts
'use server';

import { revalidateTag } from 'next/cache';

export async function createPost(formData: FormData) {
  const title = formData.get('title');
  await db.posts.create({ title });
  revalidateTag('posts');
}

// app/posts/new/page.tsx
import { createPost } from '../actions';

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <button type="submit">Create Post</button>
    </form>
  );
}
```

## Strategy Selection Checklist

| Content Type | Strategy | Cache Option |
|--------------|----------|--------------|
| Marketing pages | SSG | `force-cache` |
| Blog posts | ISR | `revalidate: 3600` |
| Product catalog | ISR | `revalidate: 60` + tags |
| User dashboard | SSR | `no-store` |
| Search results | SSR | `no-store` |
| Auth-protected | SSR | `no-store` |
| Comments/reviews | ISR | `revalidate: 60` |
| Real-time data | Client | SWR/TanStack Query |

## Project-Specific Notes

This project uses:
- **TanStack Query** for client-side data fetching
- **Hono API routes** at `/api/v1/`
- **Server Components** by default in `app/` directory
- **Cloudflare Workers** runtime (edge functions)
