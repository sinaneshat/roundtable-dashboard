---
name: tanstack-virtualizer
description: Enforce TanStack Virtual patterns for efficiently rendering large lists and grids. Use when implementing virtualized lists, infinite scroll, or optimizing performance for large data sets.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# TanStack Virtual Patterns

## Documentation Links

**Official Documentation:**
- [TanStack Virtual Overview](https://tanstack.com/virtual/latest/docs/introduction) - Primary reference
- [useVirtualizer Hook](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)
- [Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)
- [Examples](https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic)

**Context7 Library IDs (for up-to-date docs):**
```
/websites/tanstack_virtual - TanStack Virtual docs (score: 90.9, 297 snippets)
/tanstack/virtual - GitHub repo (versions: v3.0.0-beta.26)
```

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topics like "useVirtualizer", "virtual list", "infinite scroll"

## Core Concepts

### What is Virtualization?

Virtualization renders only visible items in a list, dramatically improving performance for large datasets. Instead of rendering 10,000 items, only ~20 visible items are in the DOM.

**When to use:**
- Lists with 100+ items
- Complex item components
- Infinite scroll implementations
- Performance-critical UIs

## Basic useVirtualizer Pattern

```tsx
'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

export function VirtualList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated item height in px
    overscan: 5, // Render 5 items outside viewport
  })

  return (
    <div
      ref={parentRef}
      style={{
        height: '400px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Variable Size Items

```tsx
export function VariableSizeList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    // Return estimated size based on item
    estimateSize: (index) => items[index].height ?? 50,
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ItemComponent item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Dynamic Measurement

For items with unknown heights, use `measureElement`:

```tsx
export function DynamicList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Initial estimate
    overscan: 5,
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement} // Measures actual size
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ItemComponent item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Horizontal Virtualization

```tsx
export function HorizontalList({ items }: { items: Item[] }) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    horizontal: true,
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120, // Estimated item width
    overscan: 3,
  })

  return (
    <div
      ref={parentRef}
      style={{
        width: '100%',
        height: '150px',
        overflow: 'auto',
      }}
    >
      <div
        style={{
          width: `${virtualizer.getTotalSize()}px`,
          height: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: `${virtualItem.size}px`,
              transform: `translateX(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Infinite Scroll with TanStack Query

```tsx
'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

export function InfiniteList() {
  const parentRef = useRef<HTMLDivElement>(null)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['items'],
    queryFn: ({ pageParam = 0 }) => fetchItems(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
  })

  const allItems = data?.pages.flatMap((page) => page.items) ?? []

  const virtualizer = useVirtualizer({
    count: hasNextPage ? allItems.length + 1 : allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // Fetch more when approaching end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]

    if (!lastItem) return

    if (
      lastItem.index >= allItems.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [virtualItems, allItems.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div ref={parentRef} style={{ height: '500px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const isLoader = virtualItem.index > allItems.length - 1

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {isLoader ? (
                <div>Loading more...</div>
              ) : (
                <ItemComponent item={allItems[virtualItem.index]} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

## Window Scrolling

For lists that scroll with the window instead of a container:

```tsx
import { useWindowVirtualizer } from '@tanstack/react-virtual'

export function WindowScrollList({ items }: { items: Item[] }) {
  const listRef = useRef<HTMLDivElement>(null)

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 50,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  return (
    <div ref={listRef}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${
                virtualItem.start - virtualizer.options.scrollMargin
              }px)`,
            }}
          >
            {items[virtualItem.index].content}
          </div>
        ))}
      </div>
    </div>
  )
}
```

## Programmatic Scrolling

```tsx
const virtualizer = useVirtualizer({ ... })

// Scroll to specific index
virtualizer.scrollToIndex(50, { align: 'center', behavior: 'smooth' })

// Scroll to offset
virtualizer.scrollToOffset(1000, { behavior: 'smooth' })

// Available alignments: 'start' | 'center' | 'end' | 'auto'
```

## Virtualizer Options Reference

```tsx
useVirtualizer({
  // Required
  count: 1000,
  getScrollElement: () => parentRef.current,
  estimateSize: (index) => 50,

  // Optional
  horizontal: false, // Horizontal scrolling
  overscan: 5, // Items to render outside viewport
  paddingStart: 0, // Padding before first item
  paddingEnd: 0, // Padding after last item
  scrollPaddingStart: 0, // Scroll padding
  scrollPaddingEnd: 0,
  initialOffset: 0, // Initial scroll position
  getItemKey: (index) => items[index].id, // Stable keys
  rangeExtractor: defaultRangeExtractor, // Custom range calculation
  onChange: (instance) => {}, // Called on scroll
  measureElement: (element) => element.getBoundingClientRect().height,
})
```

## Performance Tips

1. **Use stable keys**: Pass `getItemKey` to prevent unnecessary re-renders
2. **Set correct overscan**: Higher values = smoother scroll, more memory
3. **Measure sparingly**: Only use `measureElement` when heights vary significantly
4. **Avoid inline styles**: Use CSS classes when possible
5. **Memoize items**: Use `React.memo` for complex item components

## Anti-Patterns

```tsx
// BAD - creating ref inside render
function List() {
  return <div ref={useRef(null)}>...</div> // New ref every render
}

// GOOD
function List() {
  const ref = useRef(null)
  return <div ref={ref}>...</div>
}

// BAD - not using position absolute
<div style={{ transform: `translateY(${start}px)` }}>

// GOOD
<div style={{
  position: 'absolute',
  top: 0,
  transform: `translateY(${start}px)`
}}>
```

## Project-Specific Notes

This project uses TanStack Virtual in:
- `src/hooks/utils/useVirtualizedTimeline.ts`
- Timeline components for chat messages
