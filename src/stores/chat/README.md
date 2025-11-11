# Chat Store Architecture

**Zustand v5 Pattern Implementation**

Following official Zustand v5 best practices for Next.js App Router.

## Structure

```
src/stores/chat/
├── index.ts                     # Public API - all exports
├── store.ts                     # Store factory with slices + automatic subscriptions
└── actions/                     # Store-specific action hooks
    ├── form-actions.ts          # Form submission orchestration
    ├── feedback-actions.ts      # Round feedback management
    ├── recommended-actions.ts   # Recommended action handling
    ├── analysis-orchestrator.ts # Analysis server sync
    ├── analysis-deduplication.ts # Analysis deduplication logic
    └── chat-analysis.ts         # Analysis cache management
```

## Architecture Principles

### 1. Feature Co-location
Store-specific actions live with the store they operate on, following Zustand v5's feature-based organization pattern.

### 2. Store Factory Pattern
```typescript
// store.ts - Vanilla store factory
export function createChatStore() {
  return createStore<ChatStore>()(
    devtools((...args) => ({
      ...createChatFormSlice(...args),
      ...createFeedbackSlice(...args),
      // ... other slices
    }))
  );
}
```

### 3. Context Provider Pattern
```typescript
// components/providers/chat-store-provider.tsx
const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export function ChatStoreProvider({ children }) {
  const storeRef = useRef<ChatStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }
  // ... provider implementation
}
```

### 4. Action Hooks Pattern
Action hooks bridge store state with external concerns (API mutations, routing, etc.):

```typescript
// actions/form-actions.ts
export function useChatFormActions() {
  // Store selectors
  const inputValue = useChatStore(s => s.inputValue);

  // Store actions
  const setInputValue = useChatStore(s => s.setInputValue);

  // External dependencies
  const createThreadMutation = useCreateThreadMutation();

  // Orchestration logic
  const handleCreateThread = useCallback(async () => {
    // Complex logic combining store + mutations + routing
  }, [/* deps */]);

  return { handleCreateThread };
}
```

## Usage

### In Components

```typescript
import { useChatFormActions, useFeedbackActions, useRecommendedActions } from '@/stores/chat';

function ChatScreen() {
  const formActions = useChatFormActions();
  const feedbackActions = useFeedbackActions({ threadId });
  const recommendedActions = useRecommendedActions({
    inputContainerRef,
    enableScroll: true,
    markConfigChanged: true,
  });

  return (
    <form onSubmit={formActions.handleCreateThread}>
      <RoundAnalysisCard onActionClick={recommendedActions.handleActionClick} />
    </form>
  );
}
```

### Direct Store Access

```typescript
import { useChatStore } from '@/components/providers/chat-store-provider';

function Component() {
  const inputValue = useChatStore(s => s.inputValue);
  const setInputValue = useChatStore(s => s.setInputValue);

  return <input value={inputValue} onChange={e => setInputValue(e.target.value)} />;
}
```

## Benefits

1. **Co-location**: Store actions live with the store they operate on
2. **Separation of Concerns**: Pure state in store, orchestration in action hooks
3. **Type Safety**: Full TypeScript inference throughout
4. **Reusability**: Action hooks encapsulate complex logic for reuse across components
5. **Testability**: Action hooks can be tested independently
6. **Official Pattern**: Follows Zustand v5 and Next.js App Router best practices

## Migration Notes

Moved from `hooks/utils/` to `stores/chat/actions/`:
- `use-chat-form-actions.ts` → `actions/form-actions.ts`
- `use-feedback-actions.ts` → `actions/feedback-actions.ts`
- `use-analysis-orchestrator.ts` → `actions/analysis-orchestrator.ts`
- `use-analysis-deduplication.ts` → `actions/analysis-deduplication.ts`
- `use-chat-analysis.ts` → `actions/chat-analysis.ts`

Consolidated to store subscriptions (deleted):
- `use-analysis-creation.ts` → Automatic analysis triggering in store.ts
- Streaming trigger effect → Automatic streaming trigger in store.ts
- Pending message orchestration → Automatic message sending in store.ts

New action hooks following the same pattern:
- `actions/recommended-actions.ts` - Recommended action handling with form state integration

True utility hooks remain in `hooks/utils/`:
- `use-boolean`, `use-mobile`, `use-toast`, etc. (general purpose utilities)
- `use-multi-participant-chat` (AI SDK integration, not store-specific)
