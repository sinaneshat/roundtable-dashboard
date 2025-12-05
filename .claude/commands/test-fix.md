---
description: Fix failing tests to match actual UI behavior
argument-hint: [test-file-pattern]
---

# Test Fix Command

Target: $ARGUMENTS (or run all tests if not specified)

## Strategy:
Tests must simulate exact UI behavior and store interactions in the same order as real usage.

## Steps:

### 1. Run tests to identify failures
```bash
pnpm test $ARGUMENTS
```

### 2. For each failing test:

**Analyze the failure:**
- Is the test outdated (code changed)?
- Is the test wrong (incorrect expectation)?
- Is the code wrong (test found a bug)?

**Fix approach:**
1. Read the component/store being tested
2. Trace the actual data flow
3. Update test to match real behavior
4. Mock only at API boundaries

### 3. Testing patterns to follow:

**Use testing utilities:**
```typescript
import { render, screen } from '@/lib/testing';
import { userEvent } from '@testing-library/user-event';
```

**Query priority (most to least preferred):**
1. `getByRole` - accessible elements
2. `getByLabelText` - form fields
3. `getByText` - visible text
4. `getByTestId` - last resort

**Async handling:**
```typescript
await waitFor(() => {
  expect(screen.getByRole('button')).toBeEnabled();
});
```

**User interactions:**
```typescript
const user = userEvent.setup();
await user.click(screen.getByRole('button'));
await user.type(screen.getByRole('textbox'), 'text');
```

### 4. Store testing pattern:
```typescript
// Test exact sequence as UI would trigger
act(() => {
  store.getState().startOperation();
});

await waitFor(() => {
  expect(store.getState().status).toBe('complete');
});
```

### 5. Verify fixes:
```bash
pnpm test $ARGUMENTS
pnpm test:coverage  # if needed
```

## Reference:
- Testing docs: `/docs/TESTING_SETUP.md`
- Test utilities: `/src/lib/testing/`
- Example tests: `/src/__tests__/`
