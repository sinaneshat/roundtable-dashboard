---
name: zustand-tanstack-start
description: Enforce Zustand v5 state management patterns with TanStack Start, including SSR hydration, store factories, Context providers, and React 19 compatibility. Use when implementing stores, fixing hydration issues, or setting up state management.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Zustand v5 + TanStack Start Patterns

## Documentation Links

**Official Documentation:**
- [Zustand Overview](https://zustand.docs.pmnd.rs/) - Primary reference
- [SSR and Hydration](https://zustand.docs.pmnd.rs/guides/ssr-and-hydration)
- [Persist Middleware](https://zustand.docs.pmnd.rs/integrations/persisting-store-data)
- [TypeScript Guide](https://zustand.docs.pmnd.rs/guides/typescript)

**Context7 Library IDs (for up-to-date docs):**
```
/pmndrs/zustand - Official Zustand (version: v5.0.8, score: 81.8)
/websites/zustand_pmnd_rs - Zustand docs site (score: 89.3)
```

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topics like "SSR hydration", "persist", "createStore context"

## Critical Rules for TanStack Start

### 1. NO Global Stores

Global stores cause hydration mismatches. Always use factory + Context pattern.

```tsx
// BAD - module-level global store
import { create } from 'zustand'
export const useStore = create((set) => ({ count: 0 }))

// GOOD - factory function + Context
import { createStore } from 'zustand/vanilla'
export const createCounterStore = () => createStore((set) => ({ count: 0 }))
```

### 2. Use Vanilla Store for SSR

Use `createStore` from `zustand/vanilla`, not `create` hook:

```tsx
// BAD
import { create } from 'zustand'

// GOOD
import { createStore } from 'zustand/vanilla'
```

### 3. Context + useRef for Single Instance

```tsx
'use client'

import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createCounterStore, type CounterStore } from '@/stores/counter-store'

type CounterStoreApi = ReturnType<typeof createCounterStore>

const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

export function CounterStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<CounterStoreApi | null>(null)

  if (storeRef.current === null) {
    storeRef.current = createCounterStore()
  }

  return (
    <CounterStoreContext.Provider value={storeRef.current}>
      {children}
    </CounterStoreContext.Provider>
  )
}

export function useCounterStore<T>(selector: (state: CounterStore) => T): T {
  const store = useContext(CounterStoreContext)

  if (!store) {
    throw new Error('useCounterStore must be used within CounterStoreProvider')
  }

  return useStore(store, selector)
}
```

## Complete Store Setup

### Store Definition

```tsx
// src/stores/counter-store.ts
import { createStore } from 'zustand/vanilla'
import { devtools } from 'zustand/middleware'

export type CounterState = {
  count: number
}

export type CounterActions = {
  increment: () => void
  decrement: () => void
  reset: () => void
}

export type CounterStore = CounterState & CounterActions

const defaultState: CounterState = {
  count: 0,
}

export const createCounterStore = (initState: CounterState = defaultState) => {
  return createStore<CounterStore>()(
    devtools(
      (set) => ({
        ...initState,
        increment: () => set((state) => ({ count: state.count + 1 }), undefined, 'counter/increment'),
        decrement: () => set((state) => ({ count: state.count - 1 }), undefined, 'counter/decrement'),
        reset: () => set(defaultState, undefined, 'counter/reset'),
      }),
      { name: 'counter-store' }
    )
  )
}
```

### Provider with Initial State

```tsx
// src/providers/counter-store-provider.tsx
'use client'

import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { createCounterStore, type CounterStore, type CounterState } from '@/stores/counter-store'

type CounterStoreApi = ReturnType<typeof createCounterStore>

const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

interface CounterStoreProviderProps {
  children: ReactNode
  initialState?: Partial<CounterState>
}

export function CounterStoreProvider({
  children,
  initialState,
}: CounterStoreProviderProps) {
  const storeRef = useRef<CounterStoreApi | null>(null)

  if (storeRef.current === null) {
    storeRef.current = createCounterStore({
      count: 0,
      ...initialState,
    })
  }

  return (
    <CounterStoreContext.Provider value={storeRef.current}>
      {children}
    </CounterStoreContext.Provider>
  )
}

export function useCounterStore<T>(selector: (state: CounterStore) => T): T {
  const store = useContext(CounterStoreContext)

  if (!store) {
    throw new Error('useCounterStore must be used within CounterStoreProvider')
  }

  return useStore(store, selector)
}
```

### Root Route Integration

```tsx
// routes/__root.tsx
import { CounterStoreProvider } from '@/providers/counter-store-provider'
import { Outlet } from '@tanstack/react-router'

export function Route() {
  return (
    <html>
      <body>
        <CounterStoreProvider>
          <Outlet />
        </CounterStoreProvider>
      </body>
    </html>
  )
}
```

## Hydration with Server Data

### Passing Server Data to Store

```tsx
// routes/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'
import { DashboardStoreProvider } from '@/providers/dashboard-store-provider'

export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    const data = await fetch('...')
    return data.json()
  },
  component: DashboardPage,
})

function DashboardPage() {
  const initialData = Route.useLoaderData()

  return (
    <DashboardStoreProvider initialState={initialData}>
      <Dashboard />
    </DashboardStoreProvider>
  )
}
```

### Persist Middleware with SSR

```tsx
// stores/persisted-store.ts
import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'

export const createPersistedStore = () =>
  createStore(
    persist(
      (set) => ({
        theme: 'dark',
        setTheme: (theme: string) => set({ theme }),
      }),
      {
        name: 'app-storage',
        storage: createJSONStorage(() => localStorage),
        skipHydration: true, // IMPORTANT for SSR
      }
    )
  )
```

### Manual Hydration Control

```tsx
// components/hydration-handler.tsx
'use client'

import { useEffect } from 'react'
import { usePersistedStore } from '@/providers/persisted-store-provider'

export function HydrationHandler() {
  useEffect(() => {
    // Hydrate after client mount
    usePersistedStore.persist.rehydrate()
  }, [])

  return null
}
```

### Track Hydration Status

```tsx
// hooks/use-hydration.ts
import { useState, useEffect } from 'react'
import { usePersistedStore } from '@/providers/persisted-store-provider'

export function useHydration() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const unsubHydrate = usePersistedStore.persist.onHydrate(() => {
      setHydrated(false)
    })

    const unsubFinish = usePersistedStore.persist.onFinishHydration(() => {
      setHydrated(true)
    })

    setHydrated(usePersistedStore.persist.hasHydrated())

    return () => {
      unsubHydrate()
      unsubFinish()
    }
  }, [])

  return hydrated
}

// Usage
function Component() {
  const hydrated = useHydration()

  if (!hydrated) {
    return <Skeleton />
  }

  return <Content />
}
```

## Slice Pattern for Large Stores

```tsx
// stores/chat-store/slices/messages-slice.ts
import { StateCreator } from 'zustand'
import { ChatStore } from '../store'

export interface MessagesSlice {
  messages: Message[]
  addMessage: (message: Message) => void
}

export const createMessagesSlice: StateCreator<
  ChatStore,
  [['zustand/devtools', never]],
  [],
  MessagesSlice
> = (set) => ({
  messages: [],
  addMessage: (message) =>
    set(
      (state) => ({ messages: [...state.messages, message] }),
      undefined,
      'messages/addMessage'
    ),
})
```

```tsx
// stores/chat-store/store.ts
import { createStore } from 'zustand/vanilla'
import { devtools } from 'zustand/middleware'
import { createMessagesSlice, MessagesSlice } from './slices/messages-slice'
import { createUISlice, UISlice } from './slices/ui-slice'

export type ChatStore = MessagesSlice & UISlice

export const createChatStore = () =>
  createStore<ChatStore>()(
    devtools(
      (...a) => ({
        ...createMessagesSlice(...a),
        ...createUISlice(...a),
      }),
      { name: 'chat-store' }
    )
  )
```

## Anti-Patterns to Avoid

### 1. Module-Level Global Store

```tsx
// BAD - causes hydration mismatch
export const useStore = create((set) => ({ ... }))

// GOOD - factory pattern
export const createStore = () => createStore((set) => ({ ... }))
```

### 2. Missing Action Names in set()

```tsx
// BAD - no devtools action tracking
set({ count: count + 1 })

// GOOD - named action
set({ count: count + 1 }, undefined, 'counter/increment')
```

### 3. Reading Store in Server Components

```tsx
// BAD - RSC cannot access client store
export default function Page() {
  const count = useCounterStore((s) => s.count) // ERROR
  return <div>{count}</div>
}

// GOOD - use client component
'use client'
export default function Counter() {
  const count = useCounterStore((s) => s.count)
  return <div>{count}</div>
}
```

### 4. Not Using useShallow for Object Selectors

```tsx
// BAD - rerenders on any state change
const { a, b } = useStore((state) => ({ a: state.a, b: state.b }))

// GOOD - only rerenders when a or b change
import { useShallow } from 'zustand/react/shallow'
const { a, b } = useStore(useShallow((state) => ({ a: state.a, b: state.b })))
```

### 5. Creating Store in Component Body

```tsx
// BAD - new store every render
function Provider({ children }) {
  const store = createMyStore()
  return <Context.Provider value={store}>{children}</Context.Provider>
}

// GOOD - stable reference with useRef
function Provider({ children }) {
  const storeRef = useRef<StoreApi | null>(null)
  if (storeRef.current === null) {
    storeRef.current = createMyStore()
  }
  return <Context.Provider value={storeRef.current}>{children}</Context.Provider>
}
```

## Middleware Chain Order

```tsx
// Correct middleware order
createStore(
  devtools(
    persist(
      immer((set) => ({
        // state
      })),
      { name: 'storage-key' }
    ),
    { name: 'store-name' }
  )
)
```

## Project-Specific Notes

This project's store architecture:
- Store factories in `src/stores/{domain}/store.ts`
- Providers in `src/components/providers/{domain}-store-provider/`
- Slices in `src/stores/{domain}/slices/`
- Schemas in `src/stores/{domain}/store-schemas.ts`
- Actions in `src/stores/{domain}/actions/`

Reference existing patterns:
- `src/stores/chat/` - Complex multi-slice store
- `src/components/providers/chat-store-provider/` - Provider pattern
