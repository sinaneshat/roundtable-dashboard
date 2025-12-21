---
name: react-19-patterns
description: Enforce React 19 best practices and useEffect alternatives. Use when writing React components, reviewing code patterns, or fixing anti-patterns involving useEffect, state management, or data fetching.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# React 19 Patterns & useEffect Alternatives

## Documentation Links

**Official Documentation:**
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) - Primary reference
- [useEffect Reference](https://react.dev/reference/react/useEffect)
- [React 19 Blog](https://react.dev/blog)
- [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects)

**Context7 Library IDs (for up-to-date docs):**
```
/reactjs/react.dev - Official React documentation
/websites/react_dev - React.dev mirror
/websites/react_dev_learn - React learning guides
```

**Fetch latest docs:** Use `mcp__context7__get-library-docs` with topic "useEffect alternatives" or "you might not need effect"

## Core Principle

> If something can be calculated from existing props or state during render, don't store it in state or use an Effect.

## When NOT to Use useEffect

### 1. Transforming Data for Rendering

```tsx
// BAD - unnecessary state and effect
function Form() {
  const [firstName, setFirstName] = useState('Taylor');
  const [lastName, setLastName] = useState('Swift');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    setFullName(firstName + ' ' + lastName);
  }, [firstName, lastName]);
}

// GOOD - calculate during render
function Form() {
  const [firstName, setFirstName] = useState('Taylor');
  const [lastName, setLastName] = useState('Swift');
  const fullName = firstName + ' ' + lastName;
}
```

### 2. Caching Expensive Calculations

```tsx
// BAD - effect for caching
function TodoList({ todos, filter }) {
  const [visibleTodos, setVisibleTodos] = useState([]);
  useEffect(() => {
    setVisibleTodos(getFilteredTodos(todos, filter));
  }, [todos, filter]);
}

// GOOD - useMemo
function TodoList({ todos, filter }) {
  const visibleTodos = useMemo(
    () => getFilteredTodos(todos, filter),
    [todos, filter]
  );
}
```

### 3. Resetting State When Props Change

```tsx
// BAD - effect to reset state
export default function ProfilePage({ userId }) {
  const [comment, setComment] = useState('');
  useEffect(() => {
    setComment('');
  }, [userId]);
}

// GOOD - use key prop
export default function ProfilePage({ userId }) {
  return <Profile userId={userId} key={userId} />;
}

function Profile({ userId }) {
  const [comment, setComment] = useState('');
}
```

### 4. Adjusting State Based on Props

```tsx
// BAD - effect chain
function List({ items }) {
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    setSelection(null);
  }, [items]);
}

// GOOD - derive during render
function List({ items }) {
  const [selectedId, setSelectedId] = useState(null);
  const selection = items.find(item => item.id === selectedId) ?? null;
}
```

### 5. User Event Logic

```tsx
// BAD - event logic in effect
function ProductPage({ product, addToCart }) {
  useEffect(() => {
    if (product.isInCart) {
      showNotification(`Added ${product.name} to cart!`);
    }
  }, [product]);

  function handleBuyClick() {
    addToCart(product);
  }
}

// GOOD - handle in event handler
function ProductPage({ product, addToCart }) {
  function handleBuyClick() {
    addToCart(product);
    showNotification(`Added ${product.name} to cart!`);
  }
}
```

### 6. POST Requests

```tsx
// BAD - effect for submission
function Form() {
  const [jsonToSubmit, setJsonToSubmit] = useState(null);
  useEffect(() => {
    if (jsonToSubmit !== null) {
      post('/api/register', jsonToSubmit);
    }
  }, [jsonToSubmit]);
}

// GOOD - event handler
function Form() {
  async function handleSubmit(e) {
    e.preventDefault();
    await post('/api/register', { firstName, lastName });
  }
}
```

### 7. Notifying Parent Components

```tsx
// BAD - effect to notify parent
function Toggle({ onChange }) {
  const [isOn, setIsOn] = useState(false);
  useEffect(() => {
    onChange(isOn);
  }, [isOn, onChange]);
}

// GOOD - call in event handler
function Toggle({ onChange }) {
  const [isOn, setIsOn] = useState(false);

  function handleClick() {
    const nextIsOn = !isOn;
    setIsOn(nextIsOn);
    onChange(nextIsOn);
  }
}

// BEST - lift state up
function Toggle({ isOn, onChange }) {
  return <button onClick={() => onChange(!isOn)} />;
}
```

### 8. External Store Subscriptions

```tsx
// BAD - manual subscription in effect
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  return isOnline;
}

// GOOD - useSyncExternalStore
function useOnlineStatus() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => navigator.onLine,
    () => true // SSR fallback
  );
}
```

## React 19 New Patterns

### use() Hook for Data Fetching

```tsx
// React 19 - use() with Suspense
import { use, Suspense } from 'react';

function Comments({ commentsPromise }) {
  const comments = use(commentsPromise);
  return comments.map(c => <p key={c.id}>{c.text}</p>);
}

function Page({ commentsPromise }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}
```

### useActionState for Forms

```tsx
// React 19 - useActionState
import { useActionState } from 'react';

function Form() {
  const [state, formAction, isPending] = useActionState(
    async (prevState, formData) => {
      const result = await submitForm(formData);
      return result;
    },
    { error: null }
  );

  return (
    <form action={formAction}>
      <input name="email" />
      <button disabled={isPending}>Submit</button>
      {state.error && <p>{state.error}</p>}
    </form>
  );
}
```

### useOptimistic for UI Updates

```tsx
// React 19 - useOptimistic
import { useOptimistic } from 'react';

function TodoList({ todos, onAdd }) {
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo) => [...state, { ...newTodo, pending: true }]
  );

  async function handleAdd(text) {
    addOptimisticTodo({ id: Date.now(), text });
    await onAdd(text);
  }
}
```

## When useEffect IS Appropriate

- Synchronizing with external systems (WebSocket, browser APIs)
- Setting up subscriptions (with proper cleanup)
- Fetching data on mount (consider Server Components first)
- Analytics/logging on page display
- DOM measurements/mutations after render

## Decision Rule

> **Ask: WHY does this code need to run?**
> - Because component was **displayed** → useEffect
> - Because user **interaction** occurred → event handler
> - Because value **changed** → calculate during render

## Anti-Pattern Checklist

When reviewing code, flag these patterns:

- [ ] Effect that only sets state based on other state/props
- [ ] Effect with setState inside that mirrors props
- [ ] Effect chains (Effect A → setState → Effect B)
- [ ] Effect for form submissions
- [ ] Effect to notify parent of state changes
- [ ] Manual subscription management (use useSyncExternalStore)
- [ ] Data transformation in effects (do in render or useMemo)
