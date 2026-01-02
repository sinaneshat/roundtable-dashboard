# Testing Setup - Roundtable Project

This document provides a comprehensive overview of the testing infrastructure for the Roundtable project, including unit tests (Vitest), component tests (React Testing Library), and E2E tests (Playwright).

## Setup Summary

The testing infrastructure has been configured following official Next.js, Vitest, React Testing Library, and Playwright best practices.

## Installed Dependencies

### Core Testing Libraries

```json
{
  "devDependencies": {
    "vitest": "^4.0.15",
    "@vitejs/plugin-react": "^4.3.4",
    "vite-tsconfig-paths": "^5.1.4",
    "@testing-library/react": "^16.3.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/user-event": "^14.6.1"
  }
}
```

### ESLint Testing Plugins

```json
{
  "devDependencies": {
    "eslint-plugin-vitest": "latest",
    "eslint-plugin-jest-dom": "^5.5.0",
    "eslint-plugin-testing-library": "^7.13.4"
  }
}
```

### E2E Testing (Playwright)

```json
{
  "devDependencies": {
    "@playwright/test": "^1.57.0"
  }
}
```

## Configuration Files

### 1. `vitest.config.ts`

Vitest v4 configuration optimized for Next.js and React Testing Library:

- **Test Environment**: `jsdom` for DOM-like testing
- **Coverage Provider**: `v8` for fast coverage reports
- **Setup Files**: `vitest.setup.ts` runs before all tests
- **Module Paths**: Configured with `@/` alias support via vite-tsconfig-paths
- **Test Match Patterns**: Finds tests in `__tests__/` directories and `*.test.*` files
- **ESM Support**: Inline scoped packages for proper ESM module handling

### 2. `playwright.config.ts`

Playwright E2E test configuration following Next.js official patterns:

- **Test Directory**: `./e2e` for all E2E test files
- **Base URL**: `http://localhost:3000` configured for local dev server
- **Browser**: Chromium by default (Firefox/WebKit can be enabled)
- **Web Server**: Auto-starts `pnpm dev` before tests (reuses existing in dev)
- **Artifacts**: Screenshots/videos on failure, traces on retry
- **Reporters**: HTML report with GitHub Actions support

### 3. `vitest.setup.ts`

Global test setup file that runs before all tests:

- Imports `@testing-library/jest-dom/vitest` for custom matchers
- Mocks `window.matchMedia` for responsive design testing
- Mocks `IntersectionObserver` for scroll-based components
- Mocks `ResizeObserver` for dynamic sizing components
- Polyfills `TextEncoder`/`TextDecoder` for streaming tests
- Mocks `ReadableStream`, `WritableStream`, `TransformStream` for AI SDK streaming
- Sets up environment variables for testing

### 3. `src/lib/testing/`

Testing utilities organized following project architecture:

**`src/lib/testing/render.tsx`** - Custom render utilities:
- Simplified render function (providers can be added later)
- Re-exports all React Testing Library utilities
- Exports `userEvent` for realistic user interactions
- Documented patterns for provider integration

**`src/lib/testing/helpers.ts`** - Common test utilities:
- `createMockMessages()` - Create mock translation messages
- `waitForAsync()` - Wait for async operations
- `createMockDate()` - Create consistent mock dates
- `mockLocalStorage` - Mock localStorage for testing
- `setupLocalStorageMock()` - Setup localStorage mock

**`src/lib/testing/index.ts`** - Barrel export for all testing utilities

## Available Test Scripts

### Unit & Component Tests (Vitest)

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (auto-rerun on file changes)
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run tests in CI mode (optimized for continuous integration)
pnpm test:ci
```

### E2E Tests (Playwright)

```bash
# Run all E2E tests (starts dev server automatically)
pnpm test:e2e

# Run E2E tests with interactive UI
pnpm test:e2e:ui

# Run E2E tests in headed mode (visible browser)
pnpm test:e2e:headed

# Debug E2E tests with Playwright Inspector
pnpm test:e2e:debug

# View last test report
pnpm test:e2e:report
```

## Writing Tests

### Basic Component Test

```tsx
import { render, screen } from '@/lib/testing';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

### Testing User Interactions

```tsx
import { render, screen } from '@/lib/testing';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';
import { vi } from 'vitest';

describe('Button interactions', () => {
  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Click me</Button>);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Testing Chat Participant Behavior

For testing your chat participants and turn-taking:

```tsx
import { render, screen, waitFor } from '@/lib/testing';

describe('Chat Participant Turn-Taking', () => {
  it('should display participants in correct order', () => {
    // Your test implementation
  });

  it('should update UI when participant changes', async () => {
    // Your test implementation
  });
});
```

### Writing E2E Tests

```typescript
import { expect, test } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should perform expected action', async ({ page }) => {
    // Navigate to page
    await page.goto('/some-path');

    // Interact with elements
    await page.getByRole('button', { name: 'Submit' }).click();

    // Assert outcomes
    await expect(page).toHaveURL('/success');
    await expect(page.getByText('Success!')).toBeVisible();
  });
});
```

**Playwright Query Priority** (prefer accessibility-first):
1. `getByRole()` - buttons, links, headings by role
2. `getByLabel()` - form inputs by label
3. `getByPlaceholder()` - inputs by placeholder
4. `getByText()` - elements by text content
5. `getByTestId()` - last resort for complex cases

## File Organization

```
project-root/
├── vitest.config.ts               # Vitest configuration
├── vitest.setup.ts                # Global test setup
├── playwright.config.ts           # Playwright E2E configuration
├── e2e/                           # E2E test files
│   ├── smoke.spec.ts              # Basic smoke tests
│   ├── auth.spec.ts               # Authentication flow tests
│   └── navigation.spec.ts         # Navigation tests
├── src/
│   ├── __tests__/                 # General test files
│   ├── components/
│   │   └── __tests__/             # Component tests
│   ├── stores/
│   │   └── chat/
│   │       └── __tests__/         # Store tests
│   └── lib/
│       └── testing/               # Testing utilities
│           ├── index.ts           # Barrel export
│           ├── render.tsx         # Custom render with providers
│           ├── helpers.ts         # Test helper utilities
│           ├── chat-test-factories.ts  # Chat-specific test factories
│           ├── api-mocks.ts       # API response mocks
│           └── test-providers.tsx # Test provider wrappers
└── package.json                   # Test scripts
```

## Best Practices

1. **Use `render` from `@/lib/testing`** - Ensures consistent test setup
2. **Prefer user-centric queries** - `getByRole`, `getByLabelText` over `getByTestId`
3. **Test behavior, not implementation** - Focus on what users see and do
4. **Use `userEvent` over `fireEvent`** - More realistic user interactions
5. **Wait for async updates** - Use `waitFor`, `findBy*` queries
6. **Keep tests focused** - One assertion per test when possible
7. **Mock external dependencies** - API calls, third-party libraries

## Common Test Matchers

From `@testing-library/jest-dom/vitest`:

- `toBeInTheDocument()` - Element exists in the document
- `toBeVisible()` - Element is visible to users
- `toHaveTextContent(text)` - Element contains specific text
- `toHaveAttribute(attr, value)` - Element has specific attribute
- `toBeDisabled()` - Element is disabled
- `toHaveClass(className)` - Element has CSS class
- `toHaveFormValues(values)` - Form has specific values

From Vitest:

- `vi.fn()` - Create mock function
- `vi.mock()` - Mock module
- `vi.spyOn()` - Spy on method
- `expect.any()` - Match any value of type
- `expect.objectContaining()` - Partial object match

## Next Steps

1. **Write comprehensive tests** - Focus on participant behavior and turn-taking
2. **Maintain test utilities** - Keep `src/lib/testing/` up to date
3. **Monitor coverage** - Aim for 80%+ coverage on critical paths
4. **Update test factories** - Add new factories as domain models evolve
5. **Review test performance** - Keep tests fast and focused

## Resources

### Unit & Component Testing
- [Vitest Documentation](https://vitest.dev/guide/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [User Event Documentation](https://testing-library.com/docs/user-event/intro)

### E2E Testing
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Next.js Playwright Guide](https://nextjs.org/docs/app/guides/testing/playwright)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Locators](https://playwright.dev/docs/locators)

## E2E Testing Architecture

### Test User Setup

Test users are seeded in `src/db/seed-local.sql` for E2E testing:

| User | Email | Tier | Purpose |
|------|-------|------|---------|
| E2E Free User | `e2e-free@test.local` | free | Basic flow testing |
| E2E Pro User | `e2e-pro@test.local` | pro | Premium features |
| E2E Admin User | `e2e-admin@test.local` | admin | Admin flows |

**Password**: `Test123!@#` (all users)

**Reset database and seed**:
```bash
pnpm db:full-reset:local
```

### Project Configuration

The Playwright config defines multiple projects for different test scenarios:

| Project | Auth State | Test Pattern | Description |
|---------|------------|--------------|-------------|
| `chromium-no-auth` | None | `auth.spec.ts`, `smoke.spec.ts` | Unauthenticated tests |
| `chromium` | Free user | `flows/**/*.spec.ts` | Authenticated tests |
| `chromium-pro` | Pro user | `pro/**/*.spec.ts` | Pro tier tests |
| `chromium-admin` | Admin user | `admin/**/*.spec.ts` | Admin tests |

### Auth Fixtures

Custom fixtures in `e2e/fixtures/auth.ts` provide:

```typescript
import { test, expect } from '../fixtures';

test('authenticated test', async ({ authenticatedPage }) => {
  // Pre-authenticated page for free user
  await authenticatedPage.goto('/chat');
});

test('pro user test', async ({ proUserPage }) => {
  // Pre-authenticated page for pro user
  await proUserPage.goto('/chat');
});

test('custom login', async ({ loginAs }) => {
  // Login as any test user
  const page = await loginAs(TEST_USER_ADMIN);
  await page.goto('/admin');
});
```

### Global Setup

The global setup (`e2e/global-setup.ts`) runs before all tests to:
1. Authenticate all test users
2. Save auth state to `.playwright/auth/`
3. Enable fast test execution with stored sessions

### Running E2E Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run specific project
pnpm test:e2e --project=chromium-no-auth

# Run specific test file
pnpm test:e2e e2e/flows/chat-overview.spec.ts

# Debug mode
pnpm test:e2e:debug

# View report
pnpm test:e2e:report
```

### E2E Test Structure

```
e2e/
├── fixtures/                    # Test fixtures and helpers
│   ├── index.ts                 # Barrel export
│   ├── auth.ts                  # Auth fixtures (loginAs, authenticatedPage)
│   └── test-users.ts            # Test user credentials
├── flows/                       # Authenticated flow tests
│   ├── chat-overview.spec.ts    # Chat overview screen
│   ├── chat-first-round.spec.ts # First round journey
│   └── authenticated-routes.spec.ts # Protected routes
├── auth.spec.ts                 # Authentication flows
├── smoke.spec.ts                # Smoke tests
├── navigation.spec.ts           # Navigation tests
└── global-setup.ts              # Auth setup before tests
```

## ESLint Configuration

ESLint rules for testing are configured in `eslint.config.mjs`:

```js
// Example ESLint configuration for Vitest tests
import vitest from 'eslint-plugin-vitest';
import jestDom from 'eslint-plugin-jest-dom';
import testingLibrary from 'eslint-plugin-testing-library';

export default [
  // ... your existing config
  {
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*'],
    plugins: {
      vitest,
      'jest-dom': jestDom,
      'testing-library': testingLibrary,
    },
    rules: {
      'vitest/no-disabled-tests': 'warn',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/prefer-to-have-length': 'warn',
      'vitest/valid-expect': 'error',
      'testing-library/await-async-queries': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-debugging-utils': 'warn',
      'testing-library/prefer-screen-queries': 'warn',
    },
  },
];
```

## Troubleshooting

### ESM Module Errors

If you encounter errors with ESM modules:

1. Check `vitest.config.ts` server.deps.inline configuration
2. ESM packages like `next-intl` are configured to be inlined
3. The test setup includes proper provider wrappers in `src/lib/testing/test-providers.tsx`

### Type Errors

- Ensure Vitest types are properly configured in `tsconfig.json`
- Add `/// <reference types="vitest" />` to test files if needed
- Check that `vitest.config.ts` has the reference comment at the top
- Restart TypeScript server in your IDE

### Coverage Not Generated

- Install `@vitest/coverage-v8` package: `pnpm add -D @vitest/coverage-v8`
- Run `pnpm test:coverage` instead of `pnpm test`
- Check `coverage` configuration in `vitest.config.ts`
- Coverage reports are saved to `/coverage` directory

### Streaming/TextEncoder Errors

- `vitest.setup.ts` includes polyfills for TextEncoder/TextDecoder
- Mock ReadableStream/WritableStream/TransformStream are configured
- These are required for AI SDK streaming tests

### E2E Test Failures

**Auth state not found**:
```bash
# Regenerate auth state
rm -rf .playwright/auth
pnpm test:e2e
```

**Test users not in database**:
```bash
# Reset and seed database
pnpm db:full-reset:local
```

**Dev server not starting**:
```bash
# Ensure dev server works
pnpm dev
# Then run tests with existing server
pnpm test:e2e --project=chromium-no-auth
```

**Selector not found**:
- Check the UI has loaded (`waitForLoadState('networkidle')`)
- Use flexible selectors (`.or()` pattern)
- Check if element is inside shadow DOM

---

**Setup completed**: All configurations are in place with Vitest v4, React Testing Library, Playwright E2E, and comprehensive test utilities for chat participants and store testing!
