# Store Selector Hooks - Zustand v5 Best Practices

Reusable, optimized selector hooks for Chat and Preferences stores following official Zustand v5 patterns.

## 📋 Quick Reference

### Chat Store Selectors

```typescript
import {
  // Atomic selectors (single values)
  useInputValue,
  useIsStreaming,
  useIsModeratorStreaming,
  useShowInitialUI,

  // Batch selectors (multiple values with useShallow)
  useThreadInfo,
  useStreamingState,
  useFormState,
  useFormActions,

  // Computed selectors (derived state)
  useIsSubmitBlocked,
  useHasActiveThread,
} from '@/stores/chat';
```

### Preferences Store Selectors

```typescript
import {
  // Atomic selectors
  useSelectedModelIds,
  useModelOrder,
  useSelectedMode,

  // Batch selectors
  useAllPreferences,
  usePreferenceActions,
  useModelSelection,
} from '@/stores/preferences';
```

## 🎯 When to Use What

### Atomic Selectors (No useShallow)

Use for **single primitive values** (string, number, boolean, null):

```typescript
// ✅ GOOD - Single primitive value
const isStreaming = useIsStreaming();
const inputValue = useInputValue();
```

**Why no useShallow?** Zustand's default shallow comparison is sufficient for primitives.

### Batch Selectors (useShallow Required)

Use for **multiple values** or **objects/arrays**:

```typescript
// ✅ GOOD - Multiple values with useShallow (inside hook implementation)
const { isStreaming, isModeratorStreaming } = useStreamingState();

// ❌ BAD - Direct object selector without useShallow
const state = useChatStore(s => ({
  isStreaming: s.isStreaming,
  isModeratorStreaming: s.isModeratorStreaming
})); // Re-renders on EVERY state change!
```

**Why useShallow?** Without it, a new object is created on every render, causing unnecessary re-renders even when values haven't changed.

### Computed Selectors

Use for **derived state** that combines multiple values:

```typescript
// ✅ GOOD - Computed value with optimization
const isBlocked = useIsSubmitBlocked(); // Already optimized internally

// ❌ BAD - Computing in component
const { isStreaming, pendingMessage } = useStreamingState();
const isBlocked = isStreaming || Boolean(pendingMessage); // Recomputes on every render
```

## 📚 Available Selectors

### Chat Store

#### Atomic Selectors (Primitives)
- `useInputValue()` - Current input text
- `useIsStreaming()` - Participant streaming state
- `useIsModeratorStreaming()` - Moderator streaming state
- `useIsCreatingThread()` - Thread creation state
- `useWaitingToStartStreaming()` - Waiting state
- `useShowInitialUI()` - Initial UI visibility
- `usePendingMessage()` - Pending message object
- `useCreatedThreadId()` - Created thread ID
- `useCurrentParticipantIndex()` - Active participant index
- `useStreamingRoundNumber()` - Current streaming round
- `useAutoMode()` - Auto mode state
- `useIsAnalyzingPrompt()` - Prompt analysis state
- `useIsRegenerating()` - Regeneration state
- `useRegeneratingRoundNumber()` - Regenerating round number
- `useFormEnableWebSearch()` - Web search enabled (current form state)
- `useHasPendingConfigChanges()` - Config changes pending
- `useScreenMode()` - Screen mode (overview/thread)

#### Batch Selectors (useShallow)
- `useThreadInfo()` - Thread object, ID, title, slug
- `useStreamingState()` - All streaming flags
- `useIsBusy()` - Computed busy state
- `useFormState()` - Form values (mode, participants, input, etc.)
- `useFormActions()` - Form setters
- `useMessagesAndParticipants()` - Messages and participants arrays
- `useHeaderState()` - Navigation header state
- `useActiveThreadState()` - Active thread detection
- `useRegenerationState()` - Regeneration flags
- `useResumptionState()` - Resumption state
- `usePreSearchState()` - Pre-search state
- `useAnimationState()` - Animation flags
- `useAllFeedback()` - Feedback state

#### Computed Selectors
- `useIsSubmitBlocked()` - Computed submit blocking state
- `useCurrentStreamingParticipant()` - Active streaming participant
- `useHasActiveThread()` - Active thread detection (computed)
- `useFeedbackForRound(roundNumber)` - Feedback for specific round

### Preferences Store

#### Atomic Selectors
- `useSelectedModelIds()` - Selected model IDs array
- `useModelOrder()` - Model display order array
- `useSelectedMode()` - Selected chat mode
- `useEnableWebSearch()` - Web search preference (user's persisted preference)
- `useHasHydrated()` - Hydration state

#### Batch Selectors (useShallow)
- `useAllPreferences()` - All preference values
- `usePreferenceActions()` - All preference setters
- `useModelSelection()` - Model selection state + actions
- `useModePreferences()` - Mode and web search state + actions

## 🚀 Migration Guide

### Before (Inline selectors)

```typescript
// ❌ OLD - Verbose, error-prone, easy to forget useShallow
const { isStreaming, isModeratorStreaming, waitingToStartStreaming } = useChatStore(
  useShallow(s => ({
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
    waitingToStartStreaming: s.waitingToStartStreaming,
  }))
);
```

### After (Reusable selectors)

```typescript
// ✅ NEW - Concise, optimized, reusable
const { isStreaming, isModeratorStreaming, waitingToStartStreaming } = useStreamingState();
```

## 🎨 Patterns

### Pattern 1: Single Primitive Value

```typescript
// Component needs one primitive value
const isStreaming = useIsStreaming();
```

**Implementation:**
```typescript
export const useIsStreaming = () => useChatStore(s => s.isStreaming);
```

### Pattern 2: Multiple Values (Object)

```typescript
// Component needs multiple related values
const { isStreaming, isModeratorStreaming } = useStreamingState();
```

**Implementation:**
```typescript
export const useStreamingState = () =>
  useChatStore(
    useShallow(s => ({
      isStreaming: s.isStreaming,
      isModeratorStreaming: s.isModeratorStreaming,
    }))
  );
```

### Pattern 3: Computed Value

```typescript
// Component needs derived state
const isBlocked = useIsSubmitBlocked();
```

**Implementation:**
```typescript
export const useIsSubmitBlocked = () =>
  useChatStore(
    useShallow(s => ({
      isBlocked: s.isStreaming || s.isModeratorStreaming || Boolean(s.pendingMessage),
    }))
  ).isBlocked;
```

### Pattern 4: Parameterized Selector

```typescript
// Component needs state for specific parameter
const feedback = useFeedbackForRound(2);
```

**Implementation:**
```typescript
export const useFeedbackForRound = (roundNumber: number) =>
  useChatStore(s => s.feedbackByRound.get(roundNumber));
```

## ⚡ Performance Benefits

### Re-render Prevention

**Without useShallow:**
```typescript
// ❌ Re-renders on EVERY state change
const state = useChatStore(s => ({ isStreaming: s.isStreaming }));
```

**With useShallow (in selector hook):**
```typescript
// ✅ Only re-renders when isStreaming changes
const { isStreaming } = useStreamingState();
```

### Measurement Example

```typescript
// Before optimization (inline selectors)
// Component re-renders: 47 times during streaming

// After optimization (reusable selectors with useShallow)
// Component re-renders: 12 times during streaming (74% reduction)
```

## 🔍 Debugging Tips

### Check Re-renders

```typescript
import { useEffect } from 'react';

function MyComponent() {
  const streamingState = useStreamingState();

  useEffect(() => {
    console.log('Component re-rendered', streamingState);
  });

  // Component renders only when streamingState values actually change
}
```

### Verify useShallow is Working

```typescript
// This should log the SAME object reference if values haven't changed
const state1 = useStreamingState();
const state2 = useStreamingState();
console.log(state1 === state2); // Should be true if no changes
```

## 📖 Best Practices

### DO ✅

1. **Use atomic selectors for single primitives**
   ```typescript
   const isStreaming = useIsStreaming();
   ```

2. **Use batch selectors for multiple values**
   ```typescript
   const { isStreaming, inputValue } = useFormState();
   ```

3. **Create reusable selectors for common patterns**
   ```typescript
   // In hooks file
   export const useMyCommonPattern = () => useChatStore(useShallow(s => ({ ... })));
   ```

### DON'T ❌

1. **Don't select objects without useShallow**
   ```typescript
   // ❌ BAD
   const state = useChatStore(s => ({ value: s.value }));
   ```

2. **Don't create new objects in components**
   ```typescript
   // ❌ BAD - Creates new object on every render
   const config = { mode: useSelectedMode(), enabled: useFormEnableWebSearch() };

   // ✅ GOOD - Use batch selector (from chat store)
   const formState = useFormState(); // includes enableWebSearch

   // OR use preferences store batch selector
   const config = useModePreferences(); // includes enableWebSearch from preferences
   ```

3. **Don't select entire store**
   ```typescript
   // ❌ BAD - Re-renders on ANY change
   const store = useChatStore(s => s);

   // ✅ GOOD - Select only what you need
   const isStreaming = useIsStreaming();
   ```

## 🧪 Testing

Selector hooks are pure functions and easy to test:

```typescript
import { renderHook } from '@testing-library/react';
import { useStreamingState } from '@/stores/chat';

it('returns streaming state', () => {
  const { result } = renderHook(() => useStreamingState());

  expect(result.current).toEqual({
    isStreaming: expect.any(Boolean),
    isModeratorStreaming: expect.any(Boolean),
    // ...
  });
});
```

## 📝 Adding New Selectors

### Steps:

1. **Identify the pattern** (atomic, batch, or computed)
2. **Add to appropriate section** in `use-chat-selectors.ts` or `use-preferences-selectors.ts`
3. **Follow naming convention**: `use[Name]` for single value, `use[Name]State` for batch
4. **Add JSDoc comment** describing what it returns
5. **Export from index.ts** (already done via wildcard export)

### Example:

```typescript
// In use-chat-selectors.ts

/**
 * Get model compatibility state
 * Returns incompatible model IDs and reason flags
 */
export const useModelCompatibility = () =>
  useChatStore(
    useShallow(s => ({
      incompatibleModelIds: s.incompatibleModelIds,
      visionIncompatibleIds: s.visionIncompatibleIds,
      fileIncompatibleIds: s.fileIncompatibleIds,
    }))
  );
```

## 🔗 References

- [Zustand v5 Documentation](https://github.com/pmndrs/zustand)
- [useShallow Hook](https://docs.pmnd.rs/zustand/guides/prevent-rerenders-with-use-shallow)
- [Project Type Inference Patterns](/docs/type-inference-patterns.md)
- [Store Fix Command](/.claude/skills/store-fix.md)
