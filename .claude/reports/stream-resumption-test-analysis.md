# Stream Resumption E2E Test Analysis

**Date**: 2026-01-04
**File**: `e2e/pro/stream-resumption.spec.ts`
**Status**: Tests being skipped due to missing authentication state

---

## Issue Summary

14 tests reported as skipped, but file contains only 13 tests. All tests are being skipped at runtime due to missing authentication state, not explicit `.skip()` calls.

## Root Cause

**Missing Authentication State File**: `.playwright/auth/pro-user.json`

The Playwright configuration (`playwright.config.ts:98`) requires pro user auth state:
```typescript
{
  name: 'chromium-pro',
  use: {
    ...devices['Desktop Chrome'],
    storageState: '.playwright/auth/pro-user.json', // ❌ Missing
  },
  testMatch: /.*\/pro\/.*\.spec\.ts$/,
}
```

When this file is missing, Playwright skips all tests that depend on it.

## Test Inventory

### 1. Stream Resumption - Initial Round (5 tests)
- Line 53: `refresh immediately after submit recovers conversation state` ⚠️ **Reported as failing**
- Line 81: `refresh during first participant streaming recovers completed messages`
- Line 111: `refresh between participants shows completed participant messages`
- Line 134: `refresh during moderator/summary generation shows participant responses`
- Line 158: `refresh after thread navigation shows complete round`

### 2. Stream Resumption - Second Round (2 tests)
- Line 199: `refresh during second round streaming recovers both rounds`
- Line 241: `refresh between rounds preserves conversation history`

### 3. Stream Resumption - Stop Button Interaction (1 test)
- Line 284: `refresh after clicking stop preserves stopped state`

### 4. Stream Resumption - Edge Cases (3 tests)
- Line 330: `multiple rapid refreshes recover gracefully`
- Line 362: `navigating away and back recovers thread state`
- Line 396: `closing and reopening thread URL loads complete data`

### 5. Stream Resumption - UI State Consistency (2 tests)
- Line 452: `sidebar shows correct thread after refresh during streaming`
- Line 474: `model selector state preserved after refresh`

**Total**: 13 tests

## Why Tests Are Skipped

### Authentication State Requirements

1. **Global Setup** (`e2e/global-setup.ts`) must run first to:
   - Create test users via Better Auth API
   - Authenticate users and save session cookies
   - Set up billing data (stripe_customer, subscription, credits)
   - Generate `.playwright/auth/pro-user.json`

2. **Pro User Requirements**:
   - Email: `e2e-pro@roundtable.com`
   - Subscription: Active pro tier
   - Credits: 50,000 monthly credits
   - Storage state: Session cookies and localStorage

3. **Test User Fixture** (`e2e/fixtures/test-users.ts`):
   ```typescript
   {
     email: 'e2e-pro@roundtable.com',
     password: 'E2ETestProUser123!',
     name: 'E2E Pro User',
     tier: 'pro',
   }
   ```

### Why Authentication Setup Fails

The `.playwright/auth/` directory is gitignored (`.gitignore:14`), so it must be generated locally. If global setup hasn't run or failed, tests are skipped.

## Solution

### Step 1: Generate Authentication State

Run Playwright to trigger global setup:

```bash
bun run exec playwright test e2e/pro/stream-resumption.spec.ts
```

This will:
1. Start dev server (`bun run dev`)
2. Run `e2e/global-setup.ts`
3. Create `.playwright/auth/pro-user.json`
4. Execute tests

### Step 2: Verify Auth State Created

```bash
ls -la .playwright/auth/
# Should show: free-user.json, pro-user.json, admin-user.json
```

### Step 3: Run Tests Independently

Once auth state exists:

```bash
# Run all stream resumption tests
bun run exec playwright test e2e/pro/stream-resumption.spec.ts

# Run specific test
bun run exec playwright test e2e/pro/stream-resumption.spec.ts -g "refresh immediately after submit"

# Debug mode
bun run exec playwright test e2e/pro/stream-resumption.spec.ts --debug
```

## First Test Failure Analysis

You mentioned the first test "refresh immediately after submit recovers conversation state" is **failing** (not skipped).

### Test Behavior (Line 53-79)

```typescript
test('refresh immediately after submit recovers conversation state', async ({ page }) => {
  // 1. Fill message
  await input.fill('Say hello in one word');

  // 2. Click send
  await sendButton.click();

  // 3. Wait 500ms for thread creation to start
  await page.waitForTimeout(500);

  // 4. Refresh immediately - before any visible streaming
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 5. Verify page is functional
  // If thread was created → wait for it to load (120s timeout)
  // If still on /chat → should be able to start new conversation
});
```

### Potential Failure Reasons

1. **Thread Creation Race Condition**:
   - 500ms might not be enough for thread creation to complete
   - Database write may not have committed yet
   - Refresh during thread creation causes orphaned state

2. **URL Navigation Uncertainty**:
   - Test checks if URL includes `/chat/` after refresh
   - Thread creation timing is unpredictable
   - Page might be in inconsistent state

3. **Timeout Issues**:
   - 120s timeout for textarea to be enabled might be too short
   - Stream completion detection via KV might be delayed
   - Rate limiting (429) could cause retries to fail

4. **Stream Resumption Logic**:
   - Test relies on Cloudflare KV for stream completion tracking
   - If stream is "active" on reload → shows loading indicator
   - Partial progress is LOST (no mid-stream resumption)
   - If KV state is inconsistent, UI might hang

### Recommended Fixes

#### Option 1: Increase Wait Time Before Refresh

```typescript
// Give thread creation more time to complete
await page.waitForTimeout(2000); // Instead of 500ms
```

#### Option 2: Wait for URL Navigation

```typescript
// Wait for thread creation to complete
await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 10000 }).catch(() => {});
// Then refresh
await page.reload({ waitUntil: 'domcontentloaded' });
```

#### Option 3: Make Assertions More Lenient

```typescript
// After refresh, just verify page is functional
await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });

// Don't assert on enabled state immediately - stream might still be processing
const isEnabled = await page.locator('textarea').isEnabled({ timeout: 5000 }).catch(() => false);
if (!isEnabled) {
  // Wait longer for stream to complete
  await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });
}
```

#### Option 4: Add Rate Limit Recovery

```typescript
// After refresh, check for rate limit errors
await waitForRateLimitRecovery(page);
await expect(page.locator('textarea')).toBeVisible({ timeout: 30000 });
```

## Test Configuration Analysis

### Timeouts

- **Global timeout** (`playwright.config.ts:139`): 60s (too short for these tests)
- **Test-specific timeouts**:
  - Initial Round: 300s (5 min) ✅
  - Second Round: 600s (10 min) ✅
  - Others: 300s (5 min) ✅

**Note**: Test-specific timeouts override global timeout, so this is OK.

### Serial Mode

Tests run serially (`line 24`) to avoid rate limiting:
```typescript
test.describe.configure({ mode: 'serial' });
```

This is correct - parallel execution would cause 429 errors from AI providers.

### Rate Limit Handling

Helper function `waitForRateLimitRecovery` (line 33-41) checks for rate limit messages and waits 5s before retrying. This is used in `beforeEach` hooks.

## Recommendations

### Immediate Actions

1. **Run global setup** to generate auth state files
2. **Fix first test** by adding more robust wait conditions
3. **Add debug logging** to understand stream completion timing
4. **Consider adding explicit waits** for KV state propagation

### Test Improvements

1. **Add stream completion polling**:
   ```typescript
   // Wait for stream to complete by polling KV state
   await waitFor(async () => {
     const streamStatus = await getStreamStatus(threadId);
     return streamStatus === 'completed';
   }, { timeout: 120000 });
   ```

2. **Improve error messages**:
   ```typescript
   await expect(input).toBeEnabled({ timeout: 120000 }).catch((error) => {
     throw new Error(`Input not enabled after 120s. Current URL: ${page.url()}`);
   });
   ```

3. **Add test data cleanup**:
   - Ensure threads created during tests are cleaned up
   - Prevent test pollution across runs
   - Use `global-teardown.ts` for cleanup

### Documentation Updates

1. **Add comments** explaining refresh timing strategy
2. **Document KV stream completion behavior**
3. **Explain why serial mode is required**
4. **Add troubleshooting section** for common failures

## Action Items

- [ ] Generate `.playwright/auth/` files by running global setup
- [ ] Fix first test race condition
- [ ] Add more robust wait conditions for stream completion
- [ ] Add debug logging for stream state transitions
- [ ] Consider adding explicit KV polling utilities
- [ ] Update test documentation with stream completion behavior
- [ ] Add error recovery for rate limiting
- [ ] Verify all 13 tests pass after auth state is generated

## References

- Test file: `/e2e/pro/stream-resumption.spec.ts`
- Config: `/playwright.config.ts`
- Global setup: `/e2e/global-setup.ts`
- Test users: `/e2e/fixtures/test-users.ts`
- Stream completion docs: `/docs/FLOW_DOCUMENTATION.md` (Part 3.5)
