# Utility Hooks

Custom React hooks for common patterns and features.

## Organization

Hooks are organized by purpose rather than bundled into large files. Each hook has a single responsibility for better discoverability and maintainability.

**Current Status:** 27 hooks (organized by purpose)

## Categories

### Core Utilities (Highly Reusable)

#### `use-auth-check.ts` (53 lines)
Centralized authentication check hook - SINGLE SOURCE OF TRUTH for query hooks.
- **Usage:** 21+ query hooks across the codebase
- **Example:** Checking auth status before fetching data
- **API:** `{ isAuthenticated, isPending, userId }`
- **Purpose:** Eliminates duplicated `useSession()` + `isAuthenticated` pattern

```typescript
const { isAuthenticated } = useAuthCheck();
return useQuery({
  enabled: isAuthenticated,
  // ...
});
```

#### `use-boolean.ts` (21 lines)
Boolean state management with semantic toggle/on/off methods.
- **Usage:** 21+ occurrences across components
- **Example:** Modal open/close, feature flags, loading states
- **API:** `{ value, onTrue, onFalse, onToggle, setValue }`

```typescript
const dialog = useBoolean();
// dialog.value, dialog.onTrue(), dialog.onFalse(), dialog.onToggle()
```

#### `use-debounced-value.ts` (39 lines)
Debounce any value changes with configurable delay (default: 500ms).
- **Usage:** Search inputs, form validation, expensive operations
- **Example:** Live search, auto-save

```typescript
const [search, setSearch] = useState('');
const debouncedSearch = useDebouncedValue(search, 300);
// API call only happens after 300ms of no changes
```

#### `use-toast.ts` (197 lines)
Base toast notification primitives (internal use by Toaster component).
- **Internal use only:** Provides low-level toast state management
- **For application code, use `@/lib/toast` instead**

```typescript
// For application code - use toastManager from @/lib/toast:
import { toastManager, showApiErrorToast, showApiSuccessToast } from '@/lib/toast';
toastManager.success('Profile updated');
showApiErrorToast('Failed to save', error);

// Internal use only - useToast hook powers the Toaster component:
import { useToast } from '@/hooks/utils';
const { toasts } = useToast(); // Used by Toaster component
```

### Responsive/Browser

#### `use-mobile.ts` (33 lines)
Mobile breakpoint detection (768px via CSS media query).
- **Usage:** Responsive UI, conditional rendering
- **Example:** Show/hide sidebar on mobile
- **Returns:** `boolean` (true if mobile, false otherwise)

```typescript
const isMobile = useIsMobile();
return isMobile ? <MobileNav /> : <DesktopNav />;
```

#### `use-speech-recognition.ts` (163 lines)
Browser Speech Recognition API wrapper with cross-browser support.
- **Usage:** Voice input for chat
- **Features:** Error handling, browser compatibility checks, transcript streaming
- **Options:** `lang`, `continuous`, `interimResults`

```typescript
const {
  isListening,
  transcript,
  error,
  start,
  stop
} = useSpeechRecognition({
  lang: 'en-US',
  continuous: true
});
```

### Message/Chat Processing

**Note:** Message part extraction is handled by `getMessageParts()` in `@/lib/utils/message-status`, not in hooks.

#### `use-model-lookup.ts` (91 lines)
Find AI models by ID or slug with fallback handling.
- **Usage:** 10+ occurrences
- **Features:** Memoized lookup by ID, slug, or fallback to default model
- **Returns:** `{ modelById, modelBySlugOrId, getModelOrDefault }`

```typescript
const { getModelOrDefault } = useModelLookup();
const model = getModelOrDefault(modelId);
```

### Timeline/Virtualization

#### `useThreadTimeline.ts` (178 lines)
Group messages and changelog by round number into timeline items.
- **Returns:** `TimelineItem[]` (discriminated union: messages | changelog)
- **Usage:** Chat history rendering with round-based organization
- **Features:** Automatic round grouping, type-safe timeline items
- **Note:** Moderator messages are included in regular message timeline with `isModerator: true` metadata

```typescript
const timeline = useThreadTimeline({
  messages,  // Includes both participant and moderator messages
  changelog
});
// timeline: Array<{ type: 'messages' | 'changelog', data, roundNumber, key }>
```

#### `useVirtualizedTimeline.ts` (368 lines)
Window-level virtualization with TanStack Virtual for performance.
- **Features:**
  - Dynamic sizing for variable-height timeline items
  - Smooth scrolling with scroll-to-round
  - Streaming protection (prevents auto-scroll during user scroll)
- **Performance:** Handles 1000+ timeline items efficiently
- **Returns:** Virtualized items, scroll utilities, refs

```typescript
const {
  virtualItems,
  scrollToRound,
  totalSize,
  parentRef,
  scrollToBottom
} = useVirtualizedTimeline({
  timeline,
  isStreaming,
  latestRound
});
```

#### `useChatScroll.ts` (169 lines)
Manual scroll control for chat interfaces.
- **Features:**
  - Manual scroll to bottom via `scrollToBottom()` function
  - Near-bottom detection (tracks if user is at bottom)
  - NO auto-scroll - user has full control
- **Integration:** Works with TanStack Virtual window scrolling
- **Returns:** `{ isAtBottomRef, scrollToBottom, resetScrollState }`
- **Pattern:** User triggers scroll via ChatScrollButton only

```typescript
const { isAtBottomRef, scrollToBottom } = useChatScroll({
  messages,
  autoScrollThreshold: 100
});
```

### Form/Input

#### `use-auto-resize-textarea.ts` (50 lines)
Auto-resize textarea based on content with min/max height.
- **Usage:** Chat input, multi-line forms
- **Features:** Smooth resize, height constraints
- **Returns:** `textareaRef` to attach to textarea element

```typescript
const textareaRef = useAutoResizeTextarea({
  value: inputValue,
  minHeight: 56,
  maxHeight: 200
});

<textarea ref={textareaRef} value={inputValue} />
```


### Streaming/SSE

#### `use-multi-participant-chat.ts` (936 lines)
Multi-participant chat orchestration with sequential streaming.
- **Features:**
  - Sequential streaming coordination for multiple AI models
  - Error handling and recovery
  - Queue management for participant responses
  - Round number tracking and metadata management
- **Complexity:** High (multi-model coordination)
- **Usage:** Core chat functionality for collaborative AI conversations
- **Returns:** Extended `useChat` return with participant streaming state

```typescript
const {
  messages,
  input,
  handleSubmit,
  participantStreaming,
  currentRound
} = useMultiParticipantChat({
  threadId,
  participants,
  mode: 'sequential'
});
```

### React Patterns

#### `use-synced-refs.ts` (85 lines)
Prevent stale closures in callbacks by synchronizing refs with state.
- **Pattern:** useLayoutEffect for immediate synchronous sync
- **Usage:** AI SDK callbacks, store subscriptions, async callbacks
- **Why:** Callbacks are set once and don't update, creating stale closures
- **Returns:** Object of refs with same keys as input, each synced to corresponding value

```typescript
const refs = useSyncedRefs({ onComplete, onRetry, messages, participants });
// Use: refs.onComplete.current, refs.messages.current
// Refs are updated synchronously before browser paint
```

## Best Practices

### When to Create a New Hook

✅ **Create if:**
- Pattern used in 3+ components
- Complex logic (50+ lines)
- Needs memoization/optimization
- Encapsulates feature (e.g., speech recognition)
- Browser API wrapper (e.g., IntersectionObserver, ResizeObserver)

❌ **Don't create if:**
- One-time use only
- Trivial logic (<10 lines)
- Just wrapping a library function without added value
- Can be achieved with inline code more clearly

### Naming Conventions

- **Files:** `use-kebab-case.ts`
- **Hooks:** `useCamelCase()`
- **Descriptive names:** What it does, not how (e.g., `useAutoResizeTextarea` not `useTextareaEffect`)
- **Prefix with `use`:** React requirement for hooks

### File Size Guidelines

- **Small:** 20-100 lines (utilities, simple patterns)
- **Medium:** 100-300 lines (feature hooks, integrations)
- **Large:** 300+ lines (complex orchestration, acceptable if focused)

**Note:** File size alone doesn't indicate quality. A 936-line hook (`use-multi-participant-chat.ts`) is justified when it handles complex multi-model orchestration. The key is single responsibility.

### Hook Composition

Prefer composing smaller hooks over creating large hooks:

```typescript
// ✅ Good: Composable
function useChat() {
  const scroll = useChatScroll();
  const timeline = useThreadTimeline();
  // ...
}

// ❌ Bad: Monolithic
function useChatWithEverything() {
  // 2000 lines doing scroll + timeline + streaming + ...
}
```

### Performance Considerations

- **Memoization:** Use `useMemo` for expensive computations, not for simple filters
- **Pure Functions:** Export non-hook versions for use in callbacks/loops (see `getMessageParts`)
- **Dependencies:** Be precise with dependency arrays, avoid over-memoization
- **Refs vs State:** Use refs for values that don't trigger re-renders (see `use-synced-refs`)

## Architecture Patterns

### Dual Export Pattern (Hook + Pure Function)

Some hooks export both a hook and a pure function variant:

```typescript
// Pure function for callbacks/loops
export function getMessageParts(options) { /* ... */ }

// Hook with memoization for components
export function useMessageParts(options) {
  return useMemo(() => getMessageParts(options), [options]);
}
```

**Use Cases:**
- **Pure function:** Inside callbacks, loops, or when you need immediate computation
- **Hook:** In component scope for automatic memoization and re-computation on deps change

### Ref Synchronization Pattern

Prevent stale closures in async callbacks:

```typescript
// ❌ Problem: Stale closure
const onComplete = useCallback(() => {
  console.log(messages); // This is stale!
}, []); // Empty deps = messages never update

// ✅ Solution: Synced refs
const refs = useSyncedRefs({ messages });
const onComplete = useCallback(() => {
  console.log(refs.messages.current); // Always current!
}, []); // Empty deps OK, ref is mutable
```


## Maintenance

### Before Deleting a Hook

1. Search for imports: `grep -r "from '@/hooks/utils/use-xxx'" src`
2. Check re-exports in `index.ts`
3. Verify no dynamic imports: `grep -r "import('@/hooks/utils/use-xxx')" src`
4. Consider deprecation period for widely-used hooks

### Before Consolidating Hooks

Only consolidate if:
- Clear category emerges (5+ related hooks)
- Shared dependencies/patterns
- No loss of discoverability
- File size remains reasonable (<500 lines)
- Improves maintainability without reducing clarity

**Current Recommendation:** Maintain current structure. Organization by purpose is working well.

## Export Structure

All hooks are re-exported from `index.ts` for clean imports:

```typescript
// ✅ Clean import
import { useBoolean, useDebouncedValue } from '@/hooks/utils';

// ❌ Avoid direct imports
import { useBoolean } from '@/hooks/utils/use-boolean';
```

### Type Exports

Hooks that define types export them alongside:

```typescript
export type { UseBooleanReturn } from './use-boolean';
export { useBoolean } from './use-boolean';
```

## Testing Recommendations

When adding tests for hooks:
- Use `@testing-library/react-hooks` for pure hook testing
- Test both hook and pure function variants (if dual export)
- Mock browser APIs (Speech Recognition, Resize Observer, etc.)
- Test async behavior with `waitFor` and `act`
- Verify ref synchronization in callback tests

## Common Pitfalls

### Stale Closures

```typescript
// ❌ Stale closure in callback
const onClick = () => console.log(value); // Captures value at creation time

// ✅ Use synced ref
const { valueRef } = useSyncedRefs({ value });
const onClick = () => console.log(valueRef.current); // Always current
```

### Over-Memoization

```typescript
// ❌ Over-memoized
const filtered = useMemo(
  () => items.filter(i => i.enabled),
  [items]
); // Simple filter, useMemo overhead not worth it

// ✅ Only memoize expensive operations
const sorted = useMemo(
  () => items.sort(complexSortFn),
  [items]
); // Sorting is expensive, memoization justified
```

### Missing Dependencies

```typescript
// ❌ Missing dependency
useEffect(() => {
  fetchData(userId); // userId not in deps
}, []); // Empty deps = runs once with initial userId

// ✅ Complete dependencies
useEffect(() => {
  fetchData(userId);
}, [userId]); // Runs whenever userId changes
```

## Hook Categories Summary

| Category | Hooks | Total Lines | Reusability |
|----------|-------|-------------|-------------|
| Core Utilities | 4 | 310 | Very High |
| Responsive/Browser | 2 | 196 | High |
| Message/Chat Processing | 1 | 91 | Medium (domain-specific) |
| Timeline/Virtualization | 4 | 807 | Medium |
| Form/Input | 1 | 50 | High |
| Streaming/SSE | 1 | 936 | Low (app-specific) |
| React Patterns | 1 | 85 | Very High |

## Contributing

When adding new hooks:

1. **Check existing hooks first** - Can an existing hook be extended?
2. **Follow naming conventions** - `use-kebab-case.ts` for files, `useCamelCase` for hooks
3. **Add JSDoc documentation** - Explain purpose, parameters, return values, examples
4. **Export from index.ts** - Add to the main export file
5. **Update this README** - Add to appropriate category with description
6. **Consider dual export** - Pure function + hook if used in callbacks/loops
7. **Add TypeScript types** - Export all option/return types
8. **Test edge cases** - Browser compatibility, async behavior, error states