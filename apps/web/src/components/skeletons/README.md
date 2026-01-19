# Unified Skeleton Components Library

This directory contains reusable, server-safe skeleton components that match actual UI structures throughout the application.

## Overview

All skeleton components:
- Use the base `Skeleton` component from `@/components/ui/skeleton`
- Are server-safe (no hooks, no 'use client' directive)
- Match the visual structure and sizing of actual components
- Support configuration via props for different use cases
- Follow consistent naming: `{ComponentName}Skeleton`

## Available Skeletons

### Chat & Messaging

#### `MessageCardSkeleton`
Skeleton for chat message cards with participant header and content.

```tsx
import { MessageCardSkeleton } from '@/components/skeletons';

// User message (right-aligned)
<MessageCardSkeleton variant="user" />

// Assistant message (left-aligned with avatar/name)
<MessageCardSkeleton variant="assistant" />
```

**Matches**: Chat messages in threads, demos, and public chat displays

#### `ParticipantHeaderSkeleton`
Skeleton for participant header with avatar, name, and optional badges.

```tsx
import { ParticipantHeaderSkeleton } from '@/components/skeletons';

<ParticipantHeaderSkeleton showRole={true} showStatus={false} />
```

**Matches**: `ParticipantHeader` component structure

#### `ChatInputSkeleton`
Skeleton for chat input area with textarea and toolbar.

```tsx
import { ChatInputSkeleton } from '@/components/skeletons';

// Sticky footer variant
<ChatInputSkeleton isSticky={true} showToolbar={true} />

// Inline variant
<ChatInputSkeleton isSticky={false} showToolbar={true} />
```

**Matches**: `ChatInput` component with optional toolbar buttons

#### `ModeratorCardSkeleton`
Skeleton for moderator decision cards showing thinking process.

```tsx
import { ModeratorCardSkeleton } from '@/components/skeletons';

<ModeratorCardSkeleton />
```

**Matches**: Moderator cards in chat threads

### Navigation & Lists

#### `ThreadListItemSkeleton`
Skeleton for sidebar thread list items with varying widths.

```tsx
import { ThreadListItemSkeleton } from '@/components/skeletons';

// Single item
<ThreadListItemSkeleton count={1} widthVariant={0} />

// Multiple items with fade-out effect
<ThreadListItemSkeleton count={7} animated={true} />
```

**Matches**: Thread items in chat sidebar

#### `QuickStartSkeleton`
Skeleton for quick start suggestion items with participants.

```tsx
import { QuickStartSkeleton } from '@/components/skeletons';

<QuickStartSkeleton count={4} />
```

**Matches**: Quick start cards on chat overview screen

### Search & Discovery

#### `PreSearchSkeleton`
Full skeleton for pre-search results with queries and results.

```tsx
import { PreSearchSkeleton } from '@/components/skeletons';

<PreSearchSkeleton queryCount={2} resultsPerQuery={3} />
```

**Matches**: Pre-search display during search loading

#### `PreSearchQuerySkeleton`
Single search query block with results.

```tsx
import { PreSearchQuerySkeleton } from '@/components/skeletons';

<PreSearchQuerySkeleton resultsPerQuery={3} showSeparator={true} />
```

**Matches**: Individual search query blocks

#### `PreSearchResultsSkeleton`
Result items for a search query.

```tsx
import { PreSearchResultsSkeleton } from '@/components/skeletons';

<PreSearchResultsSkeleton count={3} />
```

**Matches**: Search result items under queries

### Configuration & Settings

#### `PresetCardSkeleton`
Skeleton for preset configuration cards.

```tsx
import { PresetCardSkeleton } from '@/components/skeletons';

<PresetCardSkeleton />
```

**Matches**: Preset cards showing participant configurations

### Authentication

#### `AuthFormSkeleton`
Skeleton for authentication forms with OAuth buttons.

```tsx
import { AuthFormSkeleton } from '@/components/skeletons';

<AuthFormSkeleton />
```

**Matches**: Sign-in/sign-up forms during loading

## Design Principles

### Visual Matching
Each skeleton should match its corresponding component:
- Same dimensions (height/width)
- Same spacing (padding/margins)
- Same visual hierarchy
- Same border radius and styling

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

## Usage Examples

### Route Loading State
```tsx
// apps/web/src/routes/_protected/chat/$slug.tsx
import { MessageCardSkeleton, ChatInputSkeleton } from '@/components/skeletons';

export const Route = createFileRoute('/_protected/chat/$slug')({
  pendingComponent: () => (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-hidden">
        <div className="w-full max-w-4xl mx-auto px-5 md:px-6 py-6">
          <MessageCardSkeleton variant="user" />
          <MessageCardSkeleton variant="assistant" />
          <MessageCardSkeleton variant="assistant" />
        </div>
      </div>
      <ChatInputSkeleton isSticky={true} />
    </div>
  ),
});
```

### Suspense Boundary
```tsx
import { Suspense } from 'react';
import { QuickStartSkeleton } from '@/components/skeletons';

<Suspense fallback={<QuickStartSkeleton count={3} />}>
  <QuickStartList />
</Suspense>
```

### Loading Screen Component
```tsx
import { ParticipantHeaderSkeleton, MessageCardSkeleton } from '@/components/skeletons';

export function ChatThreadLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i}>
          <ParticipantHeaderSkeleton />
          <MessageCardSkeleton variant="assistant" />
        </div>
      ))}
    </div>
  );
}
```

## Migration Guide

### From `@/components/ui/skeleton`
Many skeletons previously lived in the base skeleton file. They should now be imported from this directory:

```tsx
// Before
import { UserMessageSkeleton, AssistantMessageSkeleton } from '@/components/ui/skeleton';

// After
import { MessageCardSkeleton } from '@/components/skeletons';
<MessageCardSkeleton variant="user" />
<MessageCardSkeleton variant="assistant" />
```

### From Domain-Specific Files
Some skeletons were duplicated across domain folders:

```tsx
// Before
import { LiveChatDemoSkeleton } from '@/components/auth/live-chat-demo-skeleton';

// After - Use the reusable primitives
import { MessageCardSkeleton, ParticipantHeaderSkeleton } from '@/components/skeletons';
```

### From Loading Folders
Loading-specific skeletons should use these primitives:

```tsx
// Before - Custom implementation
export function ChatThreadSkeleton() {
  return <div>...custom skeleton...</div>;
}

// After - Compose from primitives
import { MessageCardSkeleton, ChatInputSkeleton } from '@/components/skeletons';

export function ChatThreadSkeleton() {
  return (
    <div>
      <MessageCardSkeleton variant="user" />
      <MessageCardSkeleton variant="assistant" />
      <ChatInputSkeleton isSticky />
    </div>
  );
}
```

## Extending Skeletons

When creating new skeletons, follow these guidelines:

1. **Match the actual component structure** - Count elements, spacing, sizes
2. **Use the base Skeleton component** - `import { Skeleton } from '@/components/ui/skeleton'`
3. **Support configuration via props** - Allow customization for different use cases
4. **Keep it server-safe** - No hooks, no client-only code
5. **Document usage** - Add JSDoc comments and examples
6. **Export from barrel** - Add to `index.ts` for easy imports

Example template:
```tsx
import type { ComponentProps } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type MyComponentSkeletonProps = {
  variant?: 'default' | 'compact';
} & ComponentProps<'div'>;

/**
 * MyComponentSkeleton - Description
 *
 * Matches MyComponent structure with [describe elements].
 * Used in [list use cases].
 *
 * @param variant - Configuration option description
 */
export function MyComponentSkeleton({
  variant = 'default',
  className,
  ...props
}: MyComponentSkeletonProps) {
  return (
    <div className={cn('base-classes', className)} {...props}>
      <Skeleton className="h-4 w-32" />
      {/* More skeleton elements */}
    </div>
  );
}
```

## Testing Skeletons

Skeletons should visually match their actual components. To test:

1. **Visual comparison**: Place skeleton next to actual component
2. **Measure dimensions**: Ensure heights/widths match
3. **Check spacing**: Verify padding/margins are identical
4. **Test responsiveness**: Ensure skeletons work across breakpoints
5. **Verify server-safety**: Ensure no 'use client' needed

## Related Files

- **Base component**: `/apps/web/src/components/ui/skeleton.tsx`
- **Legacy skeletons**: `/apps/web/src/components/ui/skeleton.tsx` (many should migrate to this directory)
- **Loading states**: `/apps/web/src/components/loading/` (should use these primitives)
- **Route loaders**: Various `pendingComponent` implementations in routes
