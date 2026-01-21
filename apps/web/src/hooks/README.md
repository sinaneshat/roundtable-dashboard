# Hooks Architecture

This directory contains all custom React hooks for the application, organized by responsibility.

## Directory Structure

```
src/hooks/
├── queries/         # TanStack Query hooks for data fetching (READ)
├── mutations/       # TanStack Query hooks for data updates (CREATE/UPDATE/DELETE)
├── utils/          # Utility hooks for UI state and common patterns
└── index.ts        # Barrel export for convenient imports
```

---

## Query Hooks (`/queries`)

**Purpose**: Encapsulate data fetching with TanStack Query

**Naming Convention**: `use<Resource>Query` or `use<Resource>sQuery`

**When to Create**:
- Fetching data from API endpoints
- Need caching, background refetching, or stale-while-revalidate behavior
- Server state that should be shared across components

**Pattern**:
```typescript
// src/hooks/queries/products.ts
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getProductsService } from '@/services/api';

export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: () => getProductsService(),
    staleTime: STALE_TIMES.products,
    // ... configuration
  });
}

export function useProductQuery(productId: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(productId),
    queryFn: () => getProductService({ param: { id: productId } }),
    staleTime: STALE_TIMES.products,
    enabled: !!productId, // Only fetch when ID available
  });
}
```

**Key Features**:
- Use `queryKeys` from `/src/lib/data/query-keys` for consistent cache keys
- Use `STALE_TIMES` from `/src/lib/data/stale-times` for configuration
- Import service functions from `/src/services/api`
- Configure appropriate `staleTime`, `gcTime`, and refetch behavior

**Available Query Hooks**:
- `useProductsQuery()` - Fetch all products
- `useProductQuery(id)` - Fetch single product
- `useModelsQuery()` - Fetch AI models
- `useSubscriptionsQuery()` - Fetch user subscriptions
- `useUsageStatsQuery()` - Fetch usage statistics
- See `/src/hooks/queries/index.ts` for complete list

---

## Mutation Hooks (`/mutations`)

**Purpose**: Encapsulate data mutations with TanStack Query

**Naming Convention**: `use<Action><Resource>Mutation`

**When to Create**:
- Creating, updating, or deleting resources
- Need optimistic updates or automatic cache invalidation
- Operations that modify server state

**Pattern**:
```typescript
// src/hooks/mutations/subscriptions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService } from '@/services/api';

export function useCreateCheckoutSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCheckoutSessionService,
    onSuccess: () => {
      // Invalidate related queries to refetch fresh data
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptions.all()
      });
    },
    onError: (error) => {
      // Handle errors globally or per-component
      console.error('Checkout session creation failed:', error);
    },
  });
}
```

**Key Features**:
- Automatic cache invalidation on success
- Error handling and retry logic
- Optimistic updates for instant UI feedback
- Type-safe mutation parameters from service functions

**Common Patterns**:

### Cache Invalidation
```typescript
onSuccess: () => {
  // Invalidate all subscription queries
  queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() });

  // Or invalidate specific query
  queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(id) });
}
```

### Optimistic Updates
```typescript
onMutate: async (newData) => {
  // Cancel outgoing refetches
  await queryClient.cancelQueries({ queryKey: queryKeys.items.list() });

  // Snapshot previous value
  const previous = queryClient.getQueryData(queryKeys.items.list());

  // Optimistically update cache
  queryClient.setQueryData(queryKeys.items.list(), (old) => [...old, newData]);

  return { previous };
},
onError: (err, newData, context) => {
  // Rollback on error
  queryClient.setQueryData(queryKeys.items.list(), context.previous);
},
```

**Available Mutation Hooks**:
- `useCreateCheckoutSessionMutation()` - Create Stripe checkout
- `useCancelSubscriptionMutation()` - Cancel subscription
- `useSwitchSubscriptionMutation()` - Switch subscription plan
- See `/src/hooks/mutations/index.ts` for complete list

---

## Utility Hooks (`/utils`)

**Purpose**: Reusable logic for UI state, form handling, and common patterns

**Naming Convention**: `use<Capability>` (e.g., `useBoolean`, `useChatAttachments`)

**When to Create**:
- Managing local component state with common patterns
- Reusable form logic or validation
- UI state management (modals, toggles, menus)
- Custom event handling or DOM manipulation

**NOT for**: API data fetching (use query hooks) or mutations (use mutation hooks)

**Examples**:

### Boolean Toggle Hook
```typescript
// src/hooks/utils/useBoolean.ts
export function useBoolean(defaultValue?: boolean) {
  const [value, setValue] = useState(!!defaultValue);

  const onTrue = useCallback(() => setValue(true), []);
  const onFalse = useCallback(() => setValue(false), []);
  const onToggle = useCallback(() => setValue(prev => !prev), []);

  return { value, onTrue, onFalse, onToggle, setValue };
}

// Usage
function MyComponent() {
  const isOpen = useBoolean(false);

  return (
    <>
      <button onClick={isOpen.onTrue}>Open Modal</button>
      <Modal open={isOpen.value} onClose={isOpen.onFalse} />
    </>
  );
}
```

### File Attachments Hook
```typescript
// src/hooks/utils/useChatAttachments.ts
export function useChatAttachments() {
  const [attachments, setAttachments] = useState([]);

  const addAttachment = useCallback((file) => {
    // Validate, generate preview, track upload status
  }, []);

  const removeAttachment = useCallback((id) => {
    // Remove from state
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const allUploaded = attachments.every(a => a.status === 'completed');

  return {
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    allUploaded,
  };
}
```

**Available Utility Hooks**:
- `useBoolean()` - Boolean toggle state
- `useChatAttachments()` - File attachment management
- `useIsMounted()` - Check if component is mounted
- See `/src/hooks/utils/index.ts` for complete list

---

## Import Patterns

### From Components
```typescript
// ✅ CORRECT: Import from hooks barrel
import { useProductsQuery, useCreateCheckoutSessionMutation, useBoolean } from '@/hooks';

// ✅ ALSO CORRECT: Import from specific category
import { useProductsQuery } from '@/hooks/queries';
import { useCreateCheckoutSessionMutation } from '@/hooks/mutations';
import { useBoolean } from '@/hooks/utils';

// ❌ WRONG: Don't import services directly in components
import { getProductsService } from '@/services/api'; // NO!
```

### Components Should Never Import Services Directly

**Rule**: Components must ONLY use hooks for data fetching, never import services directly.

**Why**:
- Ensures consistent error handling and loading states
- Enables proper cache management via TanStack Query
- Prevents duplicate requests and stale data issues
- Simplifies testing by mocking hooks instead of services
- Maintains single source of truth for data fetching logic

**Exception**: Server Components (page.tsx, layout.tsx) can use services for SSR prefetching via `queryClient.prefetchQuery`.

---

## Creating New Hooks

### Query Hook Template
```typescript
// src/hooks/queries/[resource].ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getResourceService } from '@/services/api';

export function useResourceQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.resource.detail(id),
    queryFn: () => getResourceService({ param: { id } }),
    staleTime: STALE_TIMES.resource,
    enabled: !!id,
    retry: false,
    throwOnError: false,
  });
}
```

### Mutation Hook Template
```typescript
// src/hooks/mutations/[resource].ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { createResourceService } from '@/services/api';

export function useCreateResourceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResourceService,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.resource.all()
      });
    },
  });
}
```

### Utility Hook Template
```typescript
// src/hooks/utils/use[capability].ts
'use client';

import { useCallback, useState } from 'react';

export function useCapability(initialValue?: Type) {
  const [state, setState] = useState(initialValue);

  const action = useCallback(() => {
    // Implementation
  }, [/* dependencies */]);

  return { state, action };
}
```

---

## Best Practices

### Query Hooks
1. **Use descriptive query keys** from `/src/lib/data/query-keys`
2. **Configure stale times** via `/src/lib/data/stale-times`
3. **Enable conditionally** when parameters are ready (`enabled: !!id`)
4. **Handle errors gracefully** with `throwOnError: false` and error states
5. **Set appropriate retry logic** (`retry: false` for 404s, `retry: 3` for network errors)

### Mutation Hooks
1. **Always invalidate** related queries on success
2. **Use optimistic updates** for instant UI feedback
3. **Handle errors** with user-friendly messages
4. **Return mutation state** (`isPending`, `isError`, `error`) for UI feedback
5. **Use `mutateAsync`** when you need to await the result

### Utility Hooks
1. **Keep them pure** - no side effects beyond component state
2. **Use `useCallback`** for action functions to prevent re-renders
3. **Memoize derived values** with `useMemo`
4. **Return stable references** - use consistent return object structure
5. **Document complex hooks** with JSDoc comments

---

## Testing

### Query Hook Testing
```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useProductsQuery } from '@/hooks/queries';

test('fetches products successfully', async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const { result } = renderHook(() => useProductsQuery(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toBeDefined();
});
```

### Mutation Hook Testing
```typescript
test('creates checkout session', async () => {
  const { result } = renderHook(() => useCreateCheckoutSessionMutation(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({ json: { priceId: 'price_123' } });
  });

  expect(result.current.isSuccess).toBe(true);
});
```

---

## Related Documentation

- **Query Keys**: `/src/lib/data/query-keys.ts` - Centralized query key factory
- **Stale Times**: `/src/lib/data/stale-times.ts` - Cache duration configuration
- **Services**: `/src/services/api/` - API service functions
- **Frontend Patterns**: `/docs/frontend-patterns.md` - Complete frontend architecture guide

---

**Last Updated**: 2026-01-05
**Architecture**: TanStack Query v5 + Custom Hooks Abstraction
