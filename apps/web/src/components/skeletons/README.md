# Unified Skeleton Components Library

This directory contains **ALL** reusable, server-safe skeleton components that match actual UI structures throughout the application.

## Architecture

```
/components/ui/skeleton.tsx      → Base Skeleton primitive ONLY
/components/skeletons/           → All composed skeletons (THIS folder)
/components/loading/             → Full-page loading compositions (use skeletons from here)
```

## Design Principles

### Visual Matching
Each skeleton matches its corresponding component:
- Same dimensions (height/width)
- Same spacing (padding/margins)
- Same visual hierarchy
- Same border radius and styling
- Subtle borders (`border-border/50`, `border-border/30`)

### Server Safety
All skeletons are server-safe:
- No React hooks (`useState`, `useEffect`, etc.)
- No client-only APIs
- No 'use client' directive needed
- Can be used in Server Components and SSR

### Consistency
All skeletons follow the same patterns:
- Use `ComponentProps<'div'>` for base props
- Spread `className` and other props to root element
- Use `cn()` utility for className merging
- Export as named function (not default)

## Available Skeletons

### Page Content
| Skeleton | Description |
|----------|-------------|
| `MainContentSkeleton` | Chat overview/new chat loading (matches ChatOverviewScreen) |
| `ThreadContentSkeleton` | Chat thread view loading (matches ChatThreadScreen) |

### Chat & Messaging
| Skeleton | Description |
|----------|-------------|
| `MessageCardSkeleton` | Chat message cards (user/assistant variants) |
| `ModeratorCardSkeleton` | Moderator decision cards |
| `ChatInputSkeleton` | Inline chat input (simple version) |
| `StickyInputSkeleton` | Sticky chat input with header (full version) |
| `ThreadMessagesSkeleton` | Full thread with messages + moderator + input |
| `ParticipantHeaderSkeleton` | Participant header with avatar/name |

### Navigation & Lists
| Skeleton | Description |
|----------|-------------|
| `QuickStartSkeleton` | Quick start suggestion items |
| `ThreadListItemSkeleton` | Sidebar thread list items |

### Search & Discovery
| Skeleton | Description |
|----------|-------------|
| `PreSearchSkeleton` | Full pre-search results |
| `PreSearchQuerySkeleton` | Single search query block |
| `PreSearchResultsSkeleton` | Search result items |

### Configuration & Settings
| Skeleton | Description |
|----------|-------------|
| `PresetCardSkeleton` | Preset configuration cards |

### Data Display
| Skeleton | Description |
|----------|-------------|
| `CardSkeleton` | Generic card |
| `ChartSkeleton` | Chart/graph container |
| `StatCardSkeleton` | Statistics metric card |
| `TableRowSkeleton` | Table row |

### Billing & Subscriptions
| Skeleton | Description |
|----------|-------------|
| `PaymentMethodSkeleton` | Payment method card |
| `SubscriptionSkeleton` | Subscription card |

### Authentication
| Skeleton | Description |
|----------|-------------|
| `AuthFormSkeleton` | Auth form with OAuth buttons |

## Usage Examples

### Route Loading State
```tsx
import { MainContentSkeleton, ThreadContentSkeleton } from '@/components/skeletons';
import dynamic from '@/lib/utils/dynamic';

// Dynamic import with skeleton fallback
const ChatOverviewScreen = dynamic(
  () => import('@/containers/screens/chat/ChatOverviewScreen'),
  { ssr: false, loading: () => <MainContentSkeleton /> },
);
```

### Suspense Boundary
```tsx
import { Suspense } from 'react';
import { QuickStartSkeleton } from '@/components/skeletons';

<Suspense fallback={<QuickStartSkeleton count={3} />}>
  <QuickStartList />
</Suspense>
```

### Composing Skeletons
```tsx
import { MessageCardSkeleton, StickyInputSkeleton } from '@/components/skeletons';

function ChatThreadLoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col">
      <div className="space-y-4 p-6">
        <MessageCardSkeleton variant="user" />
        <MessageCardSkeleton variant="assistant" />
        <MessageCardSkeleton variant="assistant" />
      </div>
      <StickyInputSkeleton />
    </div>
  );
}
```

## Creating New Skeletons

1. **Match the actual component structure** - Count elements, spacing, sizes
2. **Use the base Skeleton component** - `import { Skeleton } from '@/components/ui/skeleton'`
3. **Use subtle borders** - `border-border/50` or `border-border/30`
4. **Support configuration via props** - Allow customization for different use cases
5. **Keep it server-safe** - No hooks, no client-only code
6. **Export from barrel** - Add to `index.ts` for easy imports

Example template:
```tsx
import type { ComponentProps } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type MyComponentSkeletonProps = {
  variant?: 'default' | 'compact';
} & ComponentProps<'div'>;

export function MyComponentSkeleton({
  variant = 'default',
  className,
  ...props
}: MyComponentSkeletonProps) {
  return (
    <div className={cn('rounded-2xl border border-border/50 bg-card p-4', className)} {...props}>
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
```

## Related Files

- **Base component**: `/components/ui/skeleton.tsx` (Skeleton primitive only)
- **Loading compositions**: `/components/loading/` (full-page loading states)
- **Route usage**: Various `dynamic()` imports in routes
