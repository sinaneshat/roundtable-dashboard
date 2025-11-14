# Testing Setup - Roundtable Project

This document provides a comprehensive overview of the Jest and React Testing Library setup for the Roundtable project.

## Setup Summary

The testing infrastructure has been configured following official Next.js, Jest, and React Testing Library best practices from Context7 MCP documentation.

## Installed Dependencies

### Core Testing Libraries

```json
{
  "devDependencies": {
    "jest": "^30.2.0",
    "jest-environment-jsdom": "^30.2.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/user-event": "^14.6.1",
    "@types/jest": "^30.0.0",
    "ts-node": "^10.9.2"
  }
}
```

### ESLint Testing Plugins

```json
{
  "devDependencies": {
    "eslint-plugin-jest": "^29.1.0",
    "eslint-plugin-jest-dom": "^5.5.0",
    "eslint-plugin-testing-library": "^7.13.4"
  }
}
```

## Configuration Files

### 1. `jest.config.ts`

Next.js-optimized Jest configuration using `next/jest` for automatic setup:

- **Test Environment**: `jsdom` for DOM-like testing
- **Coverage Provider**: `v8` for fast coverage reports
- **Setup Files**: `jest.setup.ts` runs before all tests
- **Module Paths**: Configured with `@/` alias support
- **Test Match Patterns**: Finds tests in `__tests__/` directories and `*.test.*` files
- **Transform Ignore Patterns**: Configured to transform ESM-only modules

### 2. `jest.setup.ts`

Global test setup file that runs before all tests:

- Imports `@testing-library/jest-dom` for custom matchers
- Mocks `window.matchMedia` for responsive design testing
- Mocks `IntersectionObserver` for scroll-based components
- Mocks `ResizeObserver` for dynamic sizing components
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
import { render, screen, userEvent } from '@/lib/testing';
import { Button } from '@/components/ui/button';

describe('Button interactions', () => {
  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = jest.fn();

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

## File Organization

```
project-root/
├── jest.config.ts                 # Jest configuration
├── jest.setup.ts                  # Global test setup
├── src/
│   ├── __tests__/                 # General test files
│   │   ├── example.test.tsx       # Example tests
│   │   └── README.md              # Testing guide
│   ├── components/
│   │   └── __tests__/             # Component tests
│   ├── stores/
│   │   └── chat/
│   │       └── __tests__/         # Store tests
│   └── lib/
│       └── testing/               # Testing utilities
│           ├── index.ts           # Barrel export
│           ├── render.tsx         # Custom render with providers
│           └── helpers.ts         # Test helper utilities
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

## Common Jest Matchers

From `@testing-library/jest-dom`:

- `toBeInTheDocument()` - Element exists in the document
- `toBeVisible()` - Element is visible to users
- `toHaveTextContent(text)` - Element contains specific text
- `toHaveAttribute(attr, value)` - Element has specific attribute
- `toBeDisabled()` - Element is disabled
- `toHaveClass(className)` - Element has CSS class
- `toHaveFormValues(values)` - Form has specific values

## Next Steps

1. **Configure ESLint** - Add testing plugins to `eslint.config.mjs`
2. **Write Chat Tests** - Focus on participant behavior and turn-taking
3. **Add Provider Support** - Uncomment provider code in `src/lib/testing/render.tsx` when needed
4. **Configure Coverage Thresholds** - Add to `jest.config.ts` as needed
5. **Add Pre-commit Hook** - Run tests before commits

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Next.js Testing Guide](https://nextjs.org/docs/app/guides/testing/jest)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [User Event Documentation](https://testing-library.com/docs/user-event/intro)

## ESLint Configuration (TODO)

To enable ESLint rules for testing, add these to your `eslint.config.mjs`:

```js
// Add to your eslint.config.mjs file
import jest from 'eslint-plugin-jest';
import jestDom from 'eslint-plugin-jest-dom';
import testingLibrary from 'eslint-plugin-testing-library';

export default [
  // ... your existing config
  {
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*'],
    plugins: {
      jest,
      'jest-dom': jestDom,
      'testing-library': testingLibrary,
    },
    rules: {
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'error',
      'jest/no-identical-title': 'error',
      'jest/prefer-to-have-length': 'warn',
      'jest/valid-expect': 'error',
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

If you encounter errors with ESM modules (like `next-intl`, `nuqs`):

1. The current setup uses a simplified render without providers
2. To add full provider support, configure ESM transformation in `jest.config.ts`
3. Uncomment provider code in `src/lib/testing/render.tsx`
4. See comments in those files for guidance

### Type Errors

- Ensure `@types/jest` is installed
- Check `tsconfig.json` includes test files
- Restart TypeScript server in your IDE

### Coverage Not Generated

- Run `pnpm test:coverage` instead of `pnpm test`
- Check `collectCoverageFrom` patterns in `jest.config.ts`
- Coverage reports are saved to `/coverage` directory

---

**Setup completed**: All boilerplate and configurations are in place. You can now begin writing unit tests for your chat participants and other components!
