# Selector Hooks Migration Guide

Guide for migrating from inline selectors to reusable selector hooks.

## 🎯 Why Migrate?

1. **Reduced Re-renders**: Pre-optimized with `useShallow`
2. **Less Boilerplate**: One line instead of 5-10
3. **Consistent Patterns**: Centralized selector logic
4. **Type Safety**: Fully typed with proper inference
5. **Easier to Maintain**: Change selector logic in one place

## 📊 Before/After Examples

### Example 1: Single Primitive Value

#### Before
```typescript
const isStreaming = useChatStore(s => s.isStreaming);
```

#### After
```typescript
import { useIsStreaming } from '@/stores/chat';

const isStreaming = useIsStreaming();
```

**Benefits**: Same performance, cleaner imports, centralized selectors

---

### Example 2: Multiple Values (Object Selector)

#### Before
```typescript
import { useShallow } from 'zustand/react/shallow';

const { isStreaming, isModeratorStreaming, waitingToStartStreaming } = useChatStore(
  useShallow(s => ({
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
    waitingToStartStreaming: s.waitingToStartStreaming,
  }))
);
```

#### After
```typescript
import { useStreamingState } from '@/stores/chat';

const { isStreaming, isModeratorStreaming, waitingToStartStreaming } = useStreamingState();
```

**Benefits**: 10 lines → 3 lines, no `useShallow` import, pre-optimized

---

### Example 3: Form State + Actions

#### Before
```typescript
import { useShallow } from 'zustand/react/shallow';

const {
  selectedMode,
  selectedParticipants,
  inputValue,
  enableWebSearch,
  modelOrder,
  autoMode,
  setInputValue,
  setSelectedMode,
  setSelectedParticipants,
  setEnableWebSearch,
  setModelOrder,
  setAutoMode,
} = useChatStore(
  useShallow(s => ({
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    inputValue: s.inputValue,
    enableWebSearch: s.enableWebSearch,
    modelOrder: s.modelOrder,
    autoMode: s.autoMode,
    setInputValue: s.setInputValue,
    setSelectedMode: s.setSelectedMode,
    setSelectedParticipants: s.setSelectedParticipants,
    setEnableWebSearch: s.setEnableWebSearch,
    setModelOrder: s.setModelOrder,
    setAutoMode: s.setAutoMode,
  }))
);
```

#### After (Split Approach)
```typescript
import { useFormState, useFormActions } from '@/stores/chat';

const { selectedMode, selectedParticipants, inputValue, enableWebSearch, modelOrder, autoMode } = useFormState();
const { setInputValue, setSelectedMode, setSelectedParticipants, setEnableWebSearch, setModelOrder, setAutoMode } = useFormActions();
```

**Benefits**: 30 lines → 5 lines, better re-render optimization (state/actions separated)

---

### Example 4: Thread Info

#### Before
```typescript
import { useShallow } from 'zustand/react/shallow';

const { storeThreadTitle, storeThreadId, showInitialUI, createdThreadId, thread } = useChatStore(
  useShallow(s => ({
    storeThreadTitle: s.thread?.title ?? null,
    storeThreadId: s.thread?.id ?? null,
    showInitialUI: s.showInitialUI,
    createdThreadId: s.createdThreadId,
    thread: s.thread,
  }))
);
```

#### After
```typescript
import { useHeaderState } from '@/stores/chat';

const { storeThreadTitle, storeThreadId, showInitialUI, createdThreadId, thread } = useHeaderState();
```

**Benefits**: 12 lines → 3 lines, centralized thread info logic

---

### Example 5: Computed State

#### Before
```typescript
import { useShallow } from 'zustand/react/shallow';

const { isStreaming, isModeratorStreaming, pendingMessage, waitingToStartStreaming } = useChatStore(
  useShallow(s => ({
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
    pendingMessage: s.pendingMessage,
    waitingToStartStreaming: s.waitingToStartStreaming,
  }))
);

const isSubmitBlocked = isStreaming || isModeratorStreaming || Boolean(pendingMessage) || waitingToStartStreaming;
```

#### After
```typescript
import { useIsSubmitBlocked } from '@/stores/chat';

const isBlocked = useIsSubmitBlocked();
```

**Benefits**: 13 lines → 3 lines, computation optimized inside hook, single re-render

---

### Example 6: Preferences Store

#### Before
```typescript
import { useShallow } from 'zustand/react/shallow';

const { selectedModelIds, modelOrder, setSelectedModelIds, toggleModel, setModelOrder } =
  useModelPreferencesStore(
    useShallow(s => ({
      selectedModelIds: s.selectedModelIds,
      modelOrder: s.modelOrder,
      setSelectedModelIds: s.setSelectedModelIds,
      toggleModel: s.toggleModel,
      setModelOrder: s.setModelOrder,
    }))
  );
```

#### After
```typescript
import { useModelSelection } from '@/stores/preferences';

const { selectedModelIds, modelOrder, setSelectedModelIds, toggleModel, setModelOrder } = useModelSelection();
```

**Benefits**: 14 lines → 3 lines, pre-optimized with `useShallow`

---

## 🚀 Migration Steps

### Step 1: Identify Pattern

Determine which pattern your current code matches:

- **Atomic**: Single primitive value (string, number, boolean)
- **Batch**: Multiple values or objects
- **Computed**: Derived state from multiple values

### Step 2: Find Matching Selector

Check available selectors in:
- `/apps/web/src/stores/chat/hooks/use-chat-selectors.ts`
- `/apps/web/src/stores/preferences/hooks/use-preferences-selectors.ts`
- `/apps/web/src/stores/README-SELECTORS.md` (documentation)

### Step 3: Update Import

```typescript
// Before
import { useChatStore } from '@/components/providers';
import { useShallow } from 'zustand/react/shallow';

// After
import { useStreamingState } from '@/stores/chat';
```

### Step 4: Replace Selector Code

```typescript
// Before
const { isStreaming, isModeratorStreaming } = useChatStore(
  useShallow(s => ({
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
  }))
);

// After
const { isStreaming, isModeratorStreaming } = useStreamingState();
```

### Step 5: Remove Unused Imports

```typescript
// Remove if no longer needed
import { useShallow } from 'zustand/react/shallow';
```

---

## 📝 Real Component Examples

### Example: ChatThreadScreen.tsx

#### Before (Lines 108-134)
```typescript
const { setSelectedModelIds } = useModelPreferencesStore(useShallow(s => ({
  setSelectedModelIds: s.setSelectedModelIds,
})));

const {
  isStreaming,
  isModeratorStreaming,
  pendingMessage,
  selectedMode,
  inputValue,
  selectedParticipants,
  messages,
  setSelectedParticipants,
  waitingToStartStreaming,
} = useChatStore(
  useShallow(s => ({
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
    pendingMessage: s.pendingMessage,
    selectedMode: s.selectedMode,
    inputValue: s.inputValue,
    selectedParticipants: s.selectedParticipants,
    messages: s.messages,
    setSelectedParticipants: s.setSelectedParticipants,
    waitingToStartStreaming: s.waitingToStartStreaming,
  })),
);
```

#### After (Optimized)
```typescript
import {
  useIsStreaming,
  useIsModeratorStreaming,
  usePendingMessage,
  useWaitingToStartStreaming,
  useMessagesAndParticipants,
  useFormState,
  useFormActions,
} from '@/stores/chat';
import { usePreferenceActions } from '@/stores/preferences';

const { setSelectedModelIds } = usePreferenceActions();
const isStreaming = useIsStreaming();
const isModeratorStreaming = useIsModeratorStreaming();
const pendingMessage = usePendingMessage();
const waitingToStartStreaming = useWaitingToStartStreaming();
const { messages, participants } = useMessagesAndParticipants();
const { selectedMode, inputValue, selectedParticipants } = useFormState();
const { setSelectedParticipants } = useFormActions();
```

**Benefits**: Granular selectors, only re-renders when specific values change

---

### Example: ChatHeaderSwitch.tsx

#### Before (Lines 13-19)
```typescript
const { showInitialUI, createdThreadId, thread } = useChatStore(
  useShallow(s => ({
    showInitialUI: s.showInitialUI,
    createdThreadId: s.createdThreadId,
    thread: s.thread,
  })),
);
```

#### After (Optimized)
```typescript
import { useActiveThreadState } from '@/stores/chat';

const { showInitialUI, createdThreadId, thread } = useActiveThreadState();
```

**Benefits**: 7 lines → 3 lines, same optimization

---

### Example: ChatView.tsx

#### Before (Lines 126-157)
```typescript
const {
  messages,
  isStreaming,
  currentParticipantIndex,
  contextParticipants,
  preSearches,
  thread,
  createdThreadId,
  isModeratorStreaming,
  streamingRoundNumber,
  waitingToStartStreaming,
  isCreatingThread,
  pendingMessage,
  hasInitiallyLoaded,
  preSearchResumption,
  moderatorResumption,
  selectedMode,
  selectedParticipants,
  inputValue,
  setInputValue,
  setSelectedParticipants,
  enableWebSearch,
  modelOrder,
  setModelOrder,
  autoMode,
  setAutoMode,
  isAnalyzingPrompt,
  currentResumptionPhase,
  resumptionRoundNumber,
} = useChatStore(
  useShallow(s => ({
    messages: s.messages,
    isStreaming: s.isStreaming,
    currentParticipantIndex: s.currentParticipantIndex,
    contextParticipants: s.participants,
    preSearches: s.preSearches,
    thread: s.thread,
    createdThreadId: s.createdThreadId,
    isModeratorStreaming: s.isModeratorStreaming,
    streamingRoundNumber: s.streamingRoundNumber,
    waitingToStartStreaming: s.waitingToStartStreaming,
    isCreatingThread: s.isCreatingThread,
    pendingMessage: s.pendingMessage,
    hasInitiallyLoaded: s.hasInitiallyLoaded,
    preSearchResumption: s.preSearchResumption,
    moderatorResumption: s.moderatorResumption,
    selectedMode: s.selectedMode,
    selectedParticipants: s.selectedParticipants,
    inputValue: s.inputValue,
    setInputValue: s.setInputValue,
    setSelectedParticipants: s.setSelectedParticipants,
    enableWebSearch: s.enableWebSearch,
    modelOrder: s.modelOrder,
    setModelOrder: s.setModelOrder,
    autoMode: s.autoMode,
    setAutoMode: s.setAutoMode,
    isAnalyzingPrompt: s.isAnalyzingPrompt,
    currentResumptionPhase: s.currentResumptionPhase,
    resumptionRoundNumber: s.resumptionRoundNumber,
  })),
);
```

#### After (Optimized with Multiple Selectors)
```typescript
import {
  useMessagesAndParticipants,
  useStreamingState,
  useThreadInfo,
  useCreatedThreadId,
  useIsCreatingThread,
  usePendingMessage,
  useResumptionState,
  useFormState,
  useFormActions,
  useIsAnalyzingPrompt,
  usePreSearchState,
} from '@/stores/chat';

const { messages, participants: contextParticipants } = useMessagesAndParticipants();
const { isStreaming, isModeratorStreaming, streamingRoundNumber, waitingToStartStreaming, currentParticipantIndex } = useStreamingState();
const { thread } = useThreadInfo();
const createdThreadId = useCreatedThreadId();
const isCreatingThread = useIsCreatingThread();
const pendingMessage = usePendingMessage();
const { preSearchResumption, moderatorResumption, currentResumptionPhase, resumptionRoundNumber } = useResumptionState();
const { selectedMode, selectedParticipants, inputValue, enableWebSearch, modelOrder, autoMode } = useFormState();
const { setInputValue, setSelectedParticipants, setModelOrder, setAutoMode } = useFormActions();
const isAnalyzingPrompt = useIsAnalyzingPrompt();
const { preSearches } = usePreSearchState();
const hasInitiallyLoaded = useChatStore(s => s.hasInitiallyLoaded);
```

**Benefits**:
- 58 lines → 16 lines (72% reduction)
- Granular re-renders (only affected selectors trigger re-render)
- Better performance due to split state/actions

---

## 🎯 Component-Specific Patterns

### Pattern: Navigation Headers

```typescript
// Use specialized header selector
import { useHeaderState } from '@/stores/chat';

const { storeThreadTitle, storeThreadId, showInitialUI, createdThreadId, thread } = useHeaderState();
```

### Pattern: Active Thread Detection

```typescript
// Use computed selector for active thread
import { useHasActiveThread } from '@/stores/chat';

const hasActiveThread = useHasActiveThread();
// or
const { hasActiveThread } = useActiveThreadState();
```

### Pattern: Submit Blocking

```typescript
// Use pre-computed blocked state
import { useIsSubmitBlocked } from '@/stores/chat';

const isBlocked = useIsSubmitBlocked();
```

### Pattern: Streaming State Checks

```typescript
// Use batch streaming state
import { useStreamingState } from '@/stores/chat';

const { isStreaming, isModeratorStreaming, waitingToStartStreaming } = useStreamingState();
```

---

## ✅ Checklist for Each Component

- [ ] Identify all `useChatStore()` and `useModelPreferencesStore()` calls
- [ ] Check if matching selector hooks exist
- [ ] Replace with appropriate selector hooks
- [ ] Remove unused `useShallow` imports
- [ ] Test component renders correctly
- [ ] Verify no unnecessary re-renders (use React DevTools Profiler)

---

## 🚫 Common Mistakes

### Mistake 1: Mixing Direct Store Access with Selectors

```typescript
// ❌ DON'T MIX
const isStreaming = useIsStreaming();
const { inputValue } = useChatStore(useShallow(s => ({ inputValue: s.inputValue })));

// ✅ USE CONSISTENT PATTERN
const isStreaming = useIsStreaming();
const inputValue = useInputValue();
```

### Mistake 2: Not Using useShallow When Creating Custom Selectors

```typescript
// ❌ WRONG - Will re-render on every state change
const state = useChatStore(s => ({ isStreaming: s.isStreaming, inputValue: s.inputValue }));

// ✅ CORRECT - Use existing selector
const { isStreaming, inputValue } = useFormState(); // Already optimized

// ✅ OR - Use useShallow if creating new selector
import { useShallow } from 'zustand/react/shallow';
const state = useChatStore(useShallow(s => ({ isStreaming: s.isStreaming, inputValue: s.inputValue })));
```

### Mistake 3: Over-selecting

```typescript
// ❌ DON'T SELECT EVERYTHING
const allFormState = useFormState(); // 6 values
// Component only uses inputValue

// ✅ SELECT ONLY WHAT YOU NEED
const inputValue = useInputValue(); // 1 value
```

---

## 📚 Additional Resources

- [README-SELECTORS.md](/apps/web/src/stores/README-SELECTORS.md) - Complete selector documentation
- [Zustand useShallow Docs](https://docs.pmnd.rs/zustand/guides/prevent-rerenders-with-use-shallow)
- [React DevTools Profiler](https://react.dev/learn/react-developer-tools) - Measure re-renders
