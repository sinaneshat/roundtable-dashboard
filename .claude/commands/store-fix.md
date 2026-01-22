---
description: Fix Zustand v5 store patterns and slice architecture
argument-hint: [file-or-pattern]
---

# Store Fix Command

Target: $ARGUMENTS (or `src/stores/` if not specified)

## Ground Rules (Official Zustand v5 + TanStack Start)

These rules are extracted from official Zustand documentation via Context7 MCP `/pmndrs/zustand`.
**ZERO DEVIATIONS ALLOWED** - Follow patterns exactly as documented.

---

## 🚨 CRITICAL: TanStack Start SSR Rules

### Rule 1: NO Global Stores
```typescript
// ❌ FORBIDDEN - Module-level global store
const useStore = create<Store>()((set) => ({ ... }));
export { useStore };

// ✅ REQUIRED - Factory function for per-request isolation
export function createChatStore() {
  return createStore<ChatStore>()(...);
}
```

**WHY**: TanStack Start SSR handles multiple requests simultaneously. Global stores share state across requests causing data leakage.

### Rule 2: Vanilla Store + Context Provider
```typescript
// ✅ REQUIRED - createStore from zustand/vanilla
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export function createChatStore() {
  return createStore<ChatStore>()(devtools(...));
}

// ✅ REQUIRED - Context provider with useRef for single initialization
export function ChatStoreProvider({ children }: Props) {
  const storeRef = useRef<ChatStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }
  return (
    <ChatStoreContext.Provider value={storeRef.current}>
      {children}
    </ChatStoreContext.Provider>
  );
}

// ✅ REQUIRED - Custom hook with context validation
export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = useContext(ChatStoreContext);
  if (!store) throw new Error('Missing ChatStoreProvider');
  return useStore(store, selector);
}
```

**WHY**: `useRef` ensures store is created once per component instance. Context distributes store without violating React hook rules.

### Rule 3: RSC Cannot Access Store
```typescript
// ❌ FORBIDDEN - Reading store in React Server Component
async function ServerComponent() {
  const data = useChatStore(s => s.data); // BREAKS RSC
}

// ✅ CORRECT - Only Client Components access store
'use client';
function ClientComponent() {
  const data = useChatStore(s => s.data);
}
```

---

## StateCreator Slice Pattern

### Rule 4: Proper Middleware Chain Typing
```typescript
// ✅ REQUIRED - Full generic signature with middleware chain
const createFormSlice: StateCreator<
  ChatStore,                          // 1. Full combined store type
  [['zustand/devtools', never]],      // 2. Input middleware (what this slice receives)
  [],                                 // 3. Output middleware (what this slice adds)
  FormSlice                           // 4. This slice's return type
> = (set, get) => ({
  ...FORM_DEFAULTS,
  setInputValue: (value) => set({ inputValue: value }, undefined, 'form/setInputValue'),
});

// ❌ FORBIDDEN - Missing middleware chain
const createSlice: StateCreator<Store, [], [], Slice> = (set) => ({...});
```

### Rule 5: Middleware Only at Combined Level
```typescript
// ✅ CORRECT - Middleware wraps combined store
const store = createStore<ChatStore>()(
  devtools(
    (...args) => ({
      ...createFormSlice(...args),
      ...createThreadSlice(...args),
      ...createUISlice(...args),
    }),
    { name: 'ChatStore' }
  )
);

// ❌ FORBIDDEN - Middleware inside individual slices
const createSlice = devtools((set) => ({...})); // WRONG
```

---

## Devtools Integration

### Rule 6: ALL set() Calls Must Have Action Names
```typescript
// ✅ REQUIRED - Action name as third parameter
set(
  (state) => ({ bears: state.bears + 1 }),
  undefined,                    // replace: false (default merge)
  'form/setInputValue'          // Action name for DevTools
);

// ✅ REQUIRED - With replace flag
set({ inputValue: '' }, false, 'form/resetInput');

// ❌ FORBIDDEN - Missing action name (shows as 'anonymous' in DevTools)
set((state) => ({ bears: state.bears + 1 }));
set({ inputValue: '' });
```

### Rule 7: Action Naming Convention
```
{slice}/{action}           // Standard: 'form/setInputValue'
{namespace}:{slice}/{action}  // Namespaced: 'chat:form/setInputValue'
```

---

## Performance Patterns

### Rule 8: useShallow for Object/Array Selectors
```typescript
// ✅ REQUIRED - Batch related state with useShallow
import { useShallow } from 'zustand/react/shallow';

const { thread, messages, participants } = useChatStore(
  useShallow(s => ({
    thread: s.thread,
    messages: s.messages,
    participants: s.participants,
  }))
);

// ❌ FORBIDDEN - Multiple individual selectors (causes re-renders)
const thread = useChatStore(s => s.thread);
const messages = useChatStore(s => s.messages);
const participants = useChatStore(s => s.participants);
```

**WHY**: Without useShallow, returning new object reference triggers re-render even if values unchanged.

### Rule 9: Stable Action References (No useShallow Needed)
```typescript
// ✅ CORRECT - Actions are stable, individual selection OK
const setInputValue = useChatStore(s => s.setInputValue);
const completeStreaming = useChatStore(s => s.completeStreaming);
```

### Rule 10: Subscribe for Transient/Frequent Updates
```typescript
// ✅ CORRECT - Subscribe for non-React state sync
useEffect(() => {
  const unsub = useChatStore.subscribe(
    (state) => { scratchRef.current = state.scratches }
  );
  return unsub;
}, []);

// Use when: Animation frames, mouse position, scroll position, WebSocket data
```

---

## Type Safety Patterns

### Rule 11: Zod-First Schema Definition
```typescript
// store-schemas.ts
// ✅ REQUIRED - Schema defines shape, type is inferred
export const FormStateSchema = z.object({
  inputValue: z.string(),
  selectedMode: ChatModeSchema.nullable(),
  selectedParticipants: z.array(ParticipantConfigSchema),
});

export type FormState = z.infer<typeof FormStateSchema>;

// ❌ FORBIDDEN - Manual interface (violates single source of truth)
interface FormState {
  inputValue: string;
  selectedMode: ChatMode | null;
}
```

### Rule 12: Explicit Action Type Definitions
```typescript
// store-action-types.ts
export type SetInputValue = (value: string) => void;
export type SetSelectedMode = (mode: ChatModeId | null) => void;
export type PrepareForNewMessage = (
  message: string,
  participantIds: string[],
  attachmentIds?: string[]
) => void;

// store-schemas.ts - Reference action types
export const FormActionsSchema = z.object({
  setInputValue: z.custom<SetInputValue>(),
  setSelectedMode: z.custom<SetSelectedMode>(),
});
```

### Rule 13: Defaults in Separate File with Reset Groups
```typescript
// store-defaults.ts
export const FORM_DEFAULTS: FormState = {
  inputValue: '',
  selectedMode: null,
  selectedParticipants: [],
  enableWebSearch: false,
};

// Reset groups for batch operations
export const STREAMING_STATE_RESET = {
  isStreaming: false,
  currentParticipantIndex: 0,
  streamingRoundNumber: null,
} as const;

export const COMPLETE_RESET_STATE = {
  ...FORM_DEFAULTS,
  ...STREAMING_STATE_RESET,
  ...UI_DEFAULTS,
} as const;

// Usage in actions
completeStreaming: () => set({
  ...STREAMING_STATE_RESET,
  ...ANALYSIS_STATE_RESET,
}, false, 'operations/completeStreaming'),
```

---

## File Structure (MANDATORY)

```
src/stores/{domain}/
├── index.ts              # Public API exports only
├── store.ts              # Slice implementations + createStore factory
├── store-schemas.ts      # Zod schemas + z.infer types (SINGLE SOURCE OF TRUTH)
├── store-action-types.ts # Explicit action function type definitions
├── store-defaults.ts     # Default values + reset state groups
├── store-constants.ts    # Enums, animation indices, magic numbers
├── actions/              # Complex action logic extracted
│   ├── form-actions.ts   # Form submission hooks
│   ├── thread-actions.ts # Thread management hooks
│   └── flow-state-machine.ts  # State machine logic
├── hooks/                # Reusable selector hooks
│   ├── index.ts          # Barrel export
│   └── use-store-selectors.ts  # Predefined batched selectors
└── utils/                # Pure utility functions
    └── placeholder-factories.ts
```

---

## 🚨 CRITICAL: useEffect Anti-Patterns

**useEffect in stores is almost ALWAYS wrong.** Use callback-based patterns instead.

### Rule 14: NO useEffect for State Reactions
```typescript
// ❌ FORBIDDEN - useEffect to react to state changes
useEffect(() => {
  if (prevRef.current !== threadId) {
    prevRef.current = threadId;
    resetState();
  }
}, [threadId, resetState]);

// ✅ CORRECT - Call reset directly in navigation/action
function navigateToThread(newThreadId: string) {
  store.getState().resetForThreadNavigation(); // Direct call
  router.push(`/chat/${newThreadId}`);
}
```

### Rule 15: Use Zustand Subscribe for External Sync
```typescript
// ❌ FORBIDDEN - useEffect to sync state
useEffect(() => {
  if (isStreaming && !prevStreaming) {
    startAnalysis();
  }
}, [isStreaming]);

// ✅ CORRECT - Zustand subscribe (outside React)
const unsubscribe = store.subscribe(
  (state, prevState) => {
    if (state.isStreaming && !prevState.isStreaming) {
      startAnalysis();
    }
  }
);

// ✅ CORRECT - Subscribe with selector (more efficient)
const unsubscribe = store.subscribe(
  (state) => state.isStreaming,
  (isStreaming, wasStreaming) => {
    if (isStreaming && !wasStreaming) startAnalysis();
  },
  { equalityFn: Object.is }
);
```

### Rule 16: Derive State, Don't Sync It
```typescript
// ❌ FORBIDDEN - useEffect to compute derived state
const [isComplete, setIsComplete] = useState(false);
useEffect(() => {
  setIsComplete(messages.length > 0 && !isStreaming);
}, [messages, isStreaming]);

// ✅ CORRECT - Compute inline (no state needed)
const isComplete = messages.length > 0 && !isStreaming;

// ✅ CORRECT - useMemo for expensive computation
const isComplete = useMemo(
  () => computeExpensiveCompletion(messages, participants),
  [messages, participants]
);
```

### Rule 17: Callbacks, Not Effects
```typescript
// ❌ FORBIDDEN - Custom hook wrapping useEffect for callback
export function useResetOnChange<T>(dep: T, callback: () => void) {
  const prevRef = useRef(dep);
  useEffect(() => {
    if (prevRef.current !== dep) {
      prevRef.current = dep;
      callback();
    }
  }, [dep, callback]);
}

// ✅ CORRECT - Delete the hook, call directly from event handler
function handleThreadChange(newThreadId: string) {
  resetRefs();      // Direct call
  clearTracking();  // Direct call
  navigateTo(newThreadId);
}
```

### Valid useEffect Use Cases (RARE)
Only use useEffect for:
- **External subscriptions**: WebSocket, browser APIs, third-party libs
- **Cleanup on unmount**: Remove event listeners, cancel timers
- **Document/window effects**: Title, focus, scroll position

```typescript
// ✅ VALID - External subscription
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
  return () => ws.close();
}, [url]);

// ✅ VALID - Document effect
useEffect(() => {
  document.title = `Chat - ${threadName}`;
}, [threadName]);
```

---

## Forbidden Patterns (IMMEDIATE FIX REQUIRED)

| Pattern | Why Forbidden | Fix |
|---------|---------------|-----|
| `create()` hook | SSR issues, global state | Use `createStore()` vanilla |
| `set()` without action name | Anonymous in DevTools | Add `'slice/action'` third param |
| `StateCreator<Store>` | Missing middleware chain | Add `[['zustand/devtools', never]]` |
| Multiple individual selectors | Excessive re-renders | Batch with `useShallow` |
| Manual interfaces | Violates single source | Use Zod `z.infer<>` |
| `any` in store code | Type safety violation | Explicit types or Zod |
| `as Type` casts | Unsafe type coercion | Use type guards |
| Middleware in slices | Unexpected behavior | Apply at combined level only |
| Global module store | Request data leakage | Factory function + Context |
| RSC store access | Breaks server rendering | Client components only |
| **useEffect for state sync** | **Buggy, expensive, race conditions** | **Zustand subscribe or callbacks** |
| **Custom "onChange" hooks** | **Wrapper around anti-pattern** | **Direct function calls** |
| **useEffect with refs** | **Tracking previous state** | **Subscribe with selector** |

---

## Slice Organization Pattern

```typescript
// store.ts

// 1. STATE SLICES (data)
const createFormSlice: StateCreator<...> = ...;      // Form input, mode, participants
const createUISlice: StateCreator<...> = ...;        // Loading states, UI flags
const createThreadSlice: StateCreator<...> = ...;    // Thread data, messages
const createFlagsSlice: StateCreator<...> = ...;     // Boolean flags for re-renders
const createDataSlice: StateCreator<...> = ...;      // Transient data (round numbers)
const createTrackingSlice: StateCreator<...> = ...;  // Deduplication Sets

// 2. CALLBACK SLICES (functions)
const createCallbacksSlice: StateCreator<...> = ...; // onComplete, onError

// 3. OPERATIONS SLICE (composite actions)
const createOperationsSlice: StateCreator<...> = (set, get) => ({
  resetToOverview: () => {
    get().chatSetMessages?.([]);  // Clear AI SDK state
    set({ ...COMPLETE_RESET_STATE }, false, 'operations/resetToOverview');
  },
  completeStreaming: () => set({
    ...STREAMING_STATE_RESET,
    ...ANALYSIS_STATE_RESET,
  }, false, 'operations/completeStreaming'),
});

// 4. COMBINE WITH DEVTOOLS
export function createChatStore() {
  return createStore<ChatStore>()(
    devtools(
      (...args) => ({
        ...createFormSlice(...args),
        ...createUISlice(...args),
        ...createThreadSlice(...args),
        ...createFlagsSlice(...args),
        ...createDataSlice(...args),
        ...createTrackingSlice(...args),
        ...createCallbacksSlice(...args),
        ...createOperationsSlice(...args),
      }),
      { name: 'ChatStore', enabled: true }
    )
  );
}
```

---

## Selector Hook Pattern

```typescript
// hooks/use-store-selectors.ts
'use client';

import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '@/components/providers/chat-store-provider';

// Predefined batched selectors reduce boilerplate
export function useThreadState() {
  return useChatStore(useShallow(s => ({
    thread: s.thread,
    createdThreadId: s.createdThreadId,
    messages: s.messages,
    participants: s.participants,
  })));
}

export function useStreamingState() {
  return useChatStore(useShallow(s => ({
    isStreaming: s.isStreaming,
    streamingRoundNumber: s.streamingRoundNumber,
    currentParticipantIndex: s.currentParticipantIndex,
  })));
}

export function useFormState() {
  return useChatStore(useShallow(s => ({
    inputValue: s.inputValue,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
  })));
}
```

---

## Execution Checklist

1. **Scan** target files for forbidden patterns
2. **Verify** vanilla store factory (`createStore` not `create`)
3. **Check** Context provider uses `useRef` for initialization
4. **Confirm** StateCreator has middleware chain typing
5. **Audit** ALL `set()` calls have action names
6. **Ensure** schemas in store-schemas.ts, types inferred with `z.infer`
7. **Validate** defaults in store-defaults.ts with reset groups
8. **Review** selectors use `useShallow` for object returns
9. **Verify** middleware applied only at combined store level
10. **Run** `bun run check-types && bun run lint` to validate
