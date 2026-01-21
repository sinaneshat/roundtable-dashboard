---
description: Fix TypeScript, ESLint, and code quality issues
argument-hint: [scope]
---

# Cleanup Command

## Step 1: Ask for Target Path

First, ask the user where they want to run the cleanup. Use the AskUserQuestion tool with these options:

**Question**: "Which path should I target for cleanup?"

**Options**:
1. **Entire codebase (src/)** - Scan all source files
2. **Frontend only (src/components/, src/app/, src/containers/)** - UI components, pages, containers
3. **Backend only (src/api/, src/db/)** - API routes, handlers, database
4. **Stores only (src/stores/)** - Zustand stores and state management
5. **Hooks only (src/hooks/)** - React hooks and data fetching
6. **Specific path** - Let user provide custom path

If user provided scope argument, use that: $ARGUMENTS

## Step 2: Ask for Cleanup Tasks

Ask the user which cleanup tasks they want to run. Present these options:

1. **TypeScript Violations** - Fix type safety issues
2. **ESLint Errors** - Fix linting violations
3. **Test Failures** - Fix and update failing tests
4. **Enum Patterns** - Apply enum-based patterns for reusability
5. **Dead Code** - Remove legacy/backwards-compatible/duplicate code
6. **Anti-Patterns** - Fix anti-patterns by comparing to sibling files
7. **React 19 Patterns** - Fix useEffect anti-patterns, apply callback-based patterns
8. **API Endpoint Cleanup** - Find duplicate/unused endpoints, fix route anti-patterns
9. **Full Cleanup** - Run all of the above

## Parallel Agent Orchestration Strategy

For comprehensive cleanup, use **parallel agent batches** to maximize efficiency.

**IMPORTANT**: Use the path selected in Step 1 for all scans. Replace `{TARGET_PATH}` with the user's selection.

### Batch 1: Discovery (Run in Parallel)
```
- Agent A (Explore): Scan {TARGET_PATH} for endpoint inventory (if includes api/)
- Agent B (Explore): Scan {TARGET_PATH} for TODO/FIXME/deprecated comments
- Agent C (Explore): Scan {TARGET_PATH} for hardcoded strings violating enum patterns
```

### Batch 2: Analysis (Run in Parallel After Batch 1)
```
- Agent A (backend-pattern-expert): Analyze {TARGET_PATH} endpoints vs backend-patterns.md rules (if includes api/)
- Agent B (frontend-ui-expert): Analyze {TARGET_PATH} components vs frontend-patterns.md rules (if includes components/)
- Agent C (research-analyst): Cross-reference imports in {TARGET_PATH} to find unused exports
```

### Batch 3: Fixes (Run Sequentially by Domain within {TARGET_PATH})
```
- Fix backend anti-patterns first (affects types) - if in scope
- Fix frontend anti-patterns second (depends on backend types) - if in scope
- Remove dead code last (after all references updated)
```

## TypeScript Violations Checklist

When fixing TypeScript issues, enforce these rules ruthlessly:

**FORBIDDEN PATTERNS (fix immediately):**
- `any` type usage
- `unknown` type without proper narrowing
- `Record<string, unknown>` - use discriminated unions instead
- Force typecasting with `as Type`
- Inline type extensions `{ ...existingType, newField: string }`
- Hardcoded interfaces not built from existing types
- `// @ts-ignore` or `// @ts-expect-error`
- `// eslint-disable` comments

**REQUIRED PATTERNS:**
- Infer types from Zod schemas: `z.infer<typeof Schema>`
- Use discriminated unions for variant types
- Extend existing types: `BaseSchema.extend({...})`
- Use type guards for narrowing
- Follow enum 5-part pattern from `/docs/type-inference-patterns.md`

## Enum Pattern Application

Apply the 5-part enum pattern to all string literal unions:

```typescript
// 1. ARRAY CONSTANT
export const STATUS_VALUES = ['pending', 'active', 'complete'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_STATUS: Status = 'pending';

// 3. ZOD SCHEMA
export const StatusSchema = z.enum(STATUS_VALUES);

// 4. TYPESCRIPT TYPE
export type Status = z.infer<typeof StatusSchema>;

// 5. CONSTANT OBJECT
export const Statuses = {
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;
```

## Dead Code Removal

Remove without hesitation:
- Unused imports/exports
- Commented-out code
- TODO comments for completed work
- Backwards-compatible shims (`_oldVar` renames)
- Re-exports from multiple locations (consolidate to barrel)
- `// removed` or `// deprecated` markers

## Const Reassignment Violations

**FORBIDDEN - No const reassignment without transformation:**
```typescript
// ❌ FORBIDDEN - redundant alias
const NewSchema = ExistingSchema;
export const AliasName = OriginalName;

// ❌ FORBIDDEN - backwards-compatible alias
export const OldName = NewName; // "for backwards compatibility"

// ❌ FORBIDDEN - @deprecated aliases
/** @deprecated */ export const LegacyHook = CurrentHook;
```

**ALLOWED - Legitimate patterns:**
```typescript
// ✅ ALLOWED - Hono route handlers (required by framework)
export const GET = handler;
export const POST = handler;

// ✅ ALLOWED - barrel exports (index.ts re-exporting from modules)
export { useQuery } from './queries';
export type { QueryResult } from './types';

// ✅ ALLOWED - const with literal value assignment
export const DEFAULT_VALUE = 'pending';
export const MAX_RETRIES = 3;
```

**Migration Strategy:**
1. Find all usages of the alias
2. Update all usages to use the original name
3. Delete the alias completely
4. Update barrel exports to use original name

## Test Fixing Strategy

When fixing tests:
1. Match exact UI behavior and store interactions
2. Follow same order as real user flows
3. Mock at API boundaries, not internal functions
4. Use `@/lib/testing` utilities
5. Prefer `getByRole`, `getByLabelText` over test IDs

## Anti-Pattern Detection

Compare each file to its siblings and fix:
- Inconsistent naming conventions
- Different patterns for same operations
- Duplicated logic that should be shared
- Missing error handling present in siblings
- Different import styles

## React 19 + TanStack Start Patterns

**MANDATORY**: Follow React 19 and TanStack Start best practices. Reference official docs via Context7 MCP (`/reactjs/react.dev`, `/tanstack/router`) when uncertain.

### Callback-Over-Effect Rule (CRITICAL)

**You Might Not Need an Effect** - Most side effects belong in callbacks, not useEffect.

**FORBIDDEN - useEffect for user interactions:**
```typescript
// ❌ ANTI-PATTERN: Effect responding to user action
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (submitted) {
    sendAnalytics('form_submitted');
    showNotification('Success!');
  }
}, [submitted]);

// ❌ ANTI-PATTERN: Effect chain for derived state
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ❌ ANTI-PATTERN: Effect to transform data for rendering
useEffect(() => {
  setFilteredItems(items.filter(i => i.active));
}, [items]);
```

**REQUIRED - Callback-based patterns:**
```typescript
// ✅ CORRECT: Logic in event handler
function handleSubmit() {
  sendAnalytics('form_submitted');
  showNotification('Success!');
  submitForm();
}

// ✅ CORRECT: Derive during render
const fullName = `${firstName} ${lastName}`;

// ✅ CORRECT: useMemo for expensive computations
const filteredItems = useMemo(
  () => items.filter(i => i.active),
  [items]
);
```

**When useEffect IS appropriate:**
- Synchronizing with external systems (WebSocket, DOM APIs, third-party widgets)
- Data fetching (but prefer React Query/SWR)
- Setting up subscriptions that need cleanup

### Ref Callback Cleanup (React 19)

**MANDATORY**: All ref callbacks MUST return cleanup functions.

```typescript
// ❌ ANTI-PATTERN: No cleanup (memory leak)
<li ref={(node) => {
  itemsRef.current.push(node);
}} />

// ❌ ANTI-PATTERN: Implicit return (TypeScript error in React 19)
<div ref={current => (instance = current)} />

// ✅ CORRECT: Explicit cleanup function
<li ref={(node) => {
  const list = itemsRef.current;
  const item = { id, node };
  list.push(item);

  return () => {
    list.splice(list.indexOf(item), 1);
  };
}} />

// ✅ CORRECT: Block statement (no implicit return)
<div ref={current => { instance = current }} />
```

### useEffect Cleanup Patterns

**MANDATORY**: Every useEffect with setup MUST have matching cleanup.

```typescript
// ❌ ANTI-PATTERN: Missing cleanup
useEffect(() => {
  const interval = setInterval(tick, 1000);
  // Memory leak: interval never cleared
}, []);

// ❌ ANTI-PATTERN: Stale ref in cleanup
useEffect(() => {
  return () => {
    timeoutsRef.current.forEach(clearTimeout); // May be stale
  };
}, []);

// ✅ CORRECT: Capture refs at effect start
useEffect(() => {
  const timeouts = timeoutsRef.current;
  const intervals = intervalsRef.current;

  return () => {
    timeouts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
  };
}, []);

// ✅ CORRECT: Cleanup matches setup
useEffect(() => {
  const controller = new AbortController();
  fetchData({ signal: controller.signal });

  return () => controller.abort();
}, []);
```

### Race Condition Prevention

```typescript
// ❌ ANTI-PATTERN: Race condition in fetch
useEffect(() => {
  fetchUser(userId).then(setUser);
}, [userId]);

// ✅ CORRECT: Ignore stale responses
useEffect(() => {
  let ignore = false;

  fetchUser(userId).then(user => {
    if (!ignore) setUser(user);
  });

  return () => { ignore = true };
}, [userId]);

// ✅ PREFERRED: Use React Query with automatic cancellation
const { data: user } = useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
});
```

### Render Optimization Patterns

**MANDATORY**: Prevent unnecessary re-renders with proper memoization.

```typescript
// ❌ ANTI-PATTERN: New object/function every render
<Form onSubmit={(data) => handleSubmit(data)} />
<List items={items.filter(i => i.active)} />

// ✅ CORRECT: useCallback for stable function refs
const handleSubmit = useCallback((data) => {
  post('/api/submit', { productId, data });
}, [productId]);

// ✅ CORRECT: useMemo for derived data
const activeItems = useMemo(
  () => items.filter(i => i.active),
  [items]
);

// ✅ CORRECT: memo for expensive child components
const ExpensiveList = memo(function ExpensiveList({ items }) {
  return items.map(item => <ExpensiveItem key={item.id} {...item} />);
});
```

### Context Optimization

```typescript
// ❌ ANTI-PATTERN: New object every render causes all consumers to re-render
function Provider({ children }) {
  const [user, setUser] = useState(null);
  return (
    <AuthContext value={{ user, setUser }}>
      {children}
    </AuthContext>
  );
}

// ✅ CORRECT: Memoize context value
function Provider({ children }) {
  const [user, setUser] = useState(null);

  const contextValue = useMemo(() => ({
    user,
    setUser,
  }), [user]);

  return (
    <AuthContext value={contextValue}>
      {children}
    </AuthContext>
  );
}
```

### Form Actions (React 19 + TanStack Start)

**PREFERRED**: Use TanStack Start server functions with useActionState for form handling.

```typescript
// ❌ ANTI-PATTERN: useEffect for form submission state
const [error, setError] = useState(null);
const [pending, setPending] = useState(false);

async function handleSubmit(e) {
  e.preventDefault();
  setPending(true);
  const result = await submitForm(new FormData(e.target));
  setPending(false);
  if (result.error) setError(result.error);
}

// ✅ CORRECT: TanStack Start server function with useActionState (React 19)
const [error, submitAction, isPending] = useActionState(
  async (prevState, formData) => {
    const result = await updateName(formData.get('name'));
    if (result.error) return result.error;
    redirect('/success');
    return null;
  },
  null
);

return (
  <form action={submitAction}>
    <input name="name" />
    <button disabled={isPending}>Submit</button>
    {error && <p>{error}</p>}
  </form>
);
```

### TanStack Start Server Functions & Route Loaders

```typescript
// ✅ CORRECT: Route loader for SSR data fetching
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params }) => {
    const user = await fetchUser(params.userId);
    return { user };
  },
})

// ✅ CORRECT: Parallel data fetching in loader
export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    const [user, posts, notifications] = await Promise.all([
      fetchUser(),
      fetchPosts(),
      fetchNotifications(),
    ]);
    return { user, posts, notifications };
  },
})

// ✅ CORRECT: Server function for mutations
import { createServerFn } from '@tanstack/start'

const updateUser = createServerFn('POST', async (data: FormData) => {
  const result = await updateUserData(data);
  return result;
});
```

### React 19 Cleanup Checklist

When auditing components for React 19 compliance:

1. **Ref callbacks**: Return cleanup functions, use block statements
2. **useEffect**: Match every setup with cleanup, capture refs at start
3. **Event handlers**: Move user interaction logic out of effects
4. **Derived state**: Calculate during render or useMemo, not useEffect
5. **Data transforms**: useMemo, not useEffect + setState
6. **Form state**: useActionState over manual state + effects
7. **Context values**: useMemo to prevent cascading re-renders
8. **Callback props**: useCallback for stable references
9. **Expensive children**: memo() wrapper
10. **Strict Mode**: Ensure effects handle double-mount gracefully

## API Endpoint Cleanup

### Endpoint Anti-Patterns to Fix

**1. TanStack Start Routes That Should Be Hono (CRITICAL)**
Scan route files for business logic that should be in Hono:
- ❌ Business logic in route loaders beyond simple data fetching (move to `src/api/routes/`)
- ❌ Database operations outside Hono middleware chain
- ✅ ALLOWED: Route loaders calling Hono API endpoints
- ✅ ALLOWED: Server functions for simple mutations
- ✅ ALLOWED: Better Auth integration routes

**2. Duplicate/Overlapping Endpoints**
Find endpoints that do the same thing:
```bash
# Search for similar route paths
grep -rn "path: '/" src/api/routes/ --include="route.ts"
```
Fix by: Consolidating into single endpoint, removing redundant ones

**3. Unused Endpoints**
Find endpoints not referenced anywhere:
```bash
# Cross-reference route paths with frontend usage
# Check src/services/api/, src/hooks/, and components
```
Fix by: Removing unused endpoints and their handlers/schemas

**4. Handler Pattern Violations**
Check handlers against `createHandler` factory pattern:
- ❌ Direct `c.req.json()` without validation schema
- ❌ Missing `operationName` in handler config
- ❌ Missing structured logging with `c.logger`
- ❌ Using `db.transaction()` instead of `db.batch()`

**5. Schema Pattern Violations**
- ❌ Missing `.openapi()` metadata on schemas
- ❌ Hardcoded types instead of `z.infer<typeof Schema>`
- ❌ Missing response wrapper `createApiResponseSchema()`

### Endpoint Cleanup Commands
```bash
# Find all route definitions
grep -rn "createRoute" src/api/routes/ --include="*.ts"

# Find handler registrations
grep -rn "\.route\(" src/api/index.ts

# Find frontend API calls
grep -rn "api\." src/services/api/ src/hooks/
```

## TODO/Legacy/Deprecated Code Removal

### Patterns to Search and Remove (within `{TARGET_PATH}`)

**1. TODO/FIXME Comments**
```bash
grep -rn "TODO\|FIXME\|XXX\|HACK" {TARGET_PATH} --include="*.ts" --include="*.tsx"
```
- Evaluate each: complete or remove
- If blocked, create GitHub issue and remove comment

**2. Deprecated Markers**
```bash
grep -rn "@deprecated\|DEPRECATED\|deprecated" {TARGET_PATH} --include="*.ts" --include="*.tsx"
```
- Update all usages to new API
- Remove deprecated code entirely

**3. Legacy/Backwards Compatibility Shims**
```bash
grep -rn "backwards\|legacy\|compat\|old\|_old\|Old" {TARGET_PATH} --include="*.ts" --include="*.tsx"
```
Patterns to remove:
- `export const OldName = NewName; // backwards compatibility`
- `const _oldVar = newVar; // renamed for compatibility`
- Re-exports that exist only for backwards compatibility

**4. Commented-Out Code**
```bash
# Find multi-line comments that look like code
grep -rn "// \(const\|let\|function\|export\|import\|return\|if\|for\|while\)" {TARGET_PATH}
```
Remove all commented-out code - use git history instead

**5. Dead Imports/Exports**
- Run `pnpm lint` to find unused imports (filter to target path)
- Search for exports not imported anywhere in `{TARGET_PATH}`

**6. Console.log Statements**
```bash
grep -rn "console\.\(log\|debug\|info\|warn\|error\)" {TARGET_PATH} --include="*.ts" --include="*.tsx"
```
- Replace with structured logging (`c.logger` in API, remove in frontend)

## Execution

After user selects path and cleanup options:
1. Confirm the target path: `{TARGET_PATH}`
2. Run `pnpm lint` to identify ESLint issues (filter to target path)
3. Run `pnpm check-types` to identify TypeScript issues (filter to target path)
4. Search for forbidden patterns in `{TARGET_PATH}` only
5. Fix issues following established patterns in `/docs/type-inference-patterns.md`
6. Run `pnpm test` to verify fixes don't break tests
7. Report summary of changes made with file paths

### React 19 Pattern Search Commands

When running React 19 cleanup, search for these patterns in `{TARGET_PATH}`:

```bash
# Find useEffect with setState (potential anti-pattern)
grep -rn "useEffect.*setState\|useEffect.*set[A-Z]" {TARGET_PATH}

# Find ref callbacks without cleanup
grep -rn "ref={(node)\|ref={node =>" {TARGET_PATH} | grep -v "return"

# Find inline functions in JSX props
grep -rn "onClick={() =>\|onSubmit={() =>\|onChange={() =>" {TARGET_PATH}

# Find effects without cleanup return
grep -rn "useEffect(() => {" {TARGET_PATH} -A 10 | grep -v "return"

# Find context providers without useMemo
grep -rn "Context.Provider value={{" {TARGET_PATH}
```

### Context7 MCP Reference

For official React 19 and TanStack Start documentation, use Context7:

```
Library IDs:
- React 19: /reactjs/react.dev or /websites/react_dev_reference
- TanStack Start: /tanstack/start
- TanStack Router: /tanstack/router

Topics to query:
- "useEffect cleanup best practices"
- "ref callback cleanup function"
- "useActionState form handling"
- "useMemo useCallback optimization"
- "you might not need an effect"
- "route loaders SSR data fetching"
- "createServerFn mutations"
```
