/**
 * ESLint configuration for Web package (TanStack Start + React + shadcn)
 *
 * React-related rules are handled by antfu's react: true option in base config,
 * which includes: @eslint-react, react-hooks, and react-refresh plugins.
 *
 * This config adds TanStack-specific, Tailwind, Playwright, and vitest plugins.
 */
import pluginQuery from '@tanstack/eslint-plugin-query';
import pluginRouter from '@tanstack/eslint-plugin-router';
import type { Linter } from 'eslint';
import playwrightPlugin from 'eslint-plugin-playwright';
import tailwindPlugin from 'eslint-plugin-tailwindcss';
import testingLibraryPlugin from 'eslint-plugin-testing-library';
import vitestPlugin from 'eslint-plugin-vitest';

import { createConfig } from './base';

export async function createWebConfig(): Promise<Linter.Config[]> {
  const configs = await createConfig({
    drizzle: false,
    ignores: [
      '**/routeTree.gen.ts',
      '**/cloudflare-env.d.ts',
      'src/components/ui/*',
      '**/public/**',
      'vitest.config.ts',
      'vitest.setup.ts',
      'src/remotion/**/*',
    ],
    react: true,
  });

  // TanStack Query v5 - All recommended rules
  configs.push(...(pluginQuery.configs['flat/recommended'] as Linter.Config[]));

  // TanStack Router - All recommended rules
  configs.push(...(pluginRouter.configs['flat/recommended'] as Linter.Config[]));

  // Tailwind CSS v4 - plugin disabled until full v4 support is released
  // See: https://github.com/francoismassart/eslint-plugin-tailwindcss/issues/325
  // Class ordering is handled by Prettier's tailwindcss plugin instead
  // TODO: Re-enable when eslint-plugin-tailwindcss has stable v4 support
  void tailwindPlugin; // Keep import for when v4 support is ready

  // React-specific rules overrides and TanStack strict rules
  configs.push({
    files: ['**/*.tsx', '**/*.jsx'],
    rules: {
      // Disable require-atomic-updates for React - false positives with refs
      // @see https://github.com/eslint/eslint/issues/11899
      'require-atomic-updates': 'off',
      // TanStack Query strict rules
      '@tanstack/query/exhaustive-deps': 'error',
      '@tanstack/query/infinite-query-property-order': 'error',
      '@tanstack/query/mutation-property-order': 'error',
      '@tanstack/query/no-rest-destructuring': 'error',
      '@tanstack/query/no-unstable-deps': 'error',
      '@tanstack/query/no-void-query-fn': 'error',
      '@tanstack/query/stable-query-client': 'error',
      // TanStack Router strict rules
      '@tanstack/router/create-route-property-order': 'error',
      // React hooks - stricter than antfu default
      'react-hooks/exhaustive-deps': 'error',
      // Disable for TanStack Start routes
      'ts/only-throw-error': 'off',
    },
  });

  // Route files - TanStack Start specific
  configs.push({
    files: ['**/routes/**/*.tsx', '**/routes/**/*.ts'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  });

  // React hooks in .ts files - same false positives with refs
  configs.push({
    files: ['**/hooks/**/*.ts', '**/providers/**/*.ts'],
    rules: {
      'require-atomic-updates': 'off',
    },
  });

  // Test files - strict rules per official docs
  configs.push({
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*'],
    plugins: {
      'testing-library': testingLibraryPlugin,
      'vitest': vitestPlugin,
    },
    rules: {
      // Relaxed for tests only
      '@eslint-react/naming-convention/ref-name': 'off',
      'no-console': 'off',
      'require-atomic-updates': 'off',
      'ts/no-explicit-any': 'off',

      // Testing Library - following recommended config with practical adjustments
      // @see https://github.com/testing-library/eslint-plugin-testing-library
      // Error level: rules that catch real bugs
      'testing-library/await-async-events': ['error', { eventModule: 'userEvent' }],
      'testing-library/await-async-queries': 'error',
      'testing-library/await-async-utils': 'error',
      'testing-library/no-await-sync-events': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-debugging-utils': 'error',
      'testing-library/no-dom-import': ['error', 'react'],
      'testing-library/no-global-regexp-flag-in-query': 'error',
      'testing-library/no-promise-in-fire-event': 'error',
      'testing-library/no-wait-for-multiple-assertions': 'error',
      'testing-library/no-wait-for-side-effects': 'error',
      'testing-library/no-wait-for-snapshot': 'error',
      'testing-library/prefer-find-by': 'error',
      // Warn level: best practices that may have legitimate exceptions
      'testing-library/no-container': 'warn',
      'testing-library/no-manual-cleanup': 'warn',
      'testing-library/no-node-access': 'warn',
      'testing-library/no-render-in-lifecycle': 'warn',
      'testing-library/no-unnecessary-act': 'warn',
      'testing-library/prefer-presence-queries': 'warn',
      'testing-library/prefer-query-by-disappearance': 'warn',
      'testing-library/prefer-screen-queries': 'warn',
      'testing-library/render-result-naming-convention': 'warn',

      // Vitest - following official recommended config levels
      // @see https://github.com/vitest-dev/eslint-plugin-vitest#rules
      // Error level: rules from recommended preset + important bug-catching rules
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/no-commented-out-tests': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-duplicate-hooks': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/no-interpolation-in-snapshots': 'error',
      'vitest/valid-describe-callback': 'error',
      'vitest/valid-expect': 'error',
      'vitest/valid-title': 'error',
      // Warn level: rules that can have legitimate exceptions
      'vitest/expect-expect': 'warn',
      'vitest/no-standalone-expect': 'warn',
      'vitest/no-test-return-statement': 'warn',
      // Warn level: stylistic preferences (good practices but not essential)
      'vitest/no-alias-methods': 'warn',
      'vitest/prefer-called-with': 'warn',
      'vitest/prefer-comparison-matcher': 'warn',
      'vitest/prefer-each': 'warn',
      'vitest/prefer-equality-matcher': 'warn',
      'vitest/prefer-expect-resolves': 'warn',
      'vitest/prefer-hooks-in-order': 'warn',
      'vitest/prefer-hooks-on-top': 'warn',
      'vitest/prefer-lowercase-title': 'warn',
      'vitest/prefer-mock-promise-shorthand': 'warn',
      'vitest/prefer-spy-on': 'warn',
      'vitest/prefer-to-be': 'warn',
      'vitest/prefer-to-be-object': 'warn',
      'vitest/prefer-to-contain': 'warn',
      'vitest/prefer-to-have-length': 'warn',
      'vitest/prefer-todo': 'warn',
      'vitest/require-to-throw-message': 'warn',
      // Off: stylistic rules that cause mass changes without improving quality
      'vitest/no-conditional-in-test': 'off',
      'vitest/prefer-strict-equal': 'off',
      'vitest/prefer-to-be-falsy': 'off',
      'vitest/prefer-to-be-truthy': 'off',
      'vitest/require-hook': 'off',
      'vitest/require-top-level-describe': 'off',
    },
  });

  // Playwright e2e tests - strict rules per official docs
  // @see https://github.com/playwright-community/eslint-plugin-playwright
  configs.push({
    files: ['**/e2e/**/*.ts', '**/e2e/**/*.tsx', '**/*.e2e.ts', '**/*.e2e.tsx'],
    ...playwrightPlugin.configs['flat/recommended'],
    rules: {
      ...playwrightPlugin.configs['flat/recommended'].rules,
      // All rules at error level for strict enforcement
      'playwright/expect-expect': 'error',
      'playwright/max-expects': ['error', { max: 5 }],
      'playwright/max-nested-describe': ['error', { max: 3 }],
      'playwright/missing-playwright-await': 'error',
      'playwright/no-commented-out-tests': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-duplicate-hooks': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/no-eval': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/no-force-option': 'error',
      'playwright/no-get-by-title': 'error',
      'playwright/no-hooks': 'off', // hooks are fine when used properly
      'playwright/no-nested-step': 'error',
      'playwright/no-networkidle': 'error',
      'playwright/no-nth-methods': 'error',
      'playwright/no-page-pause': 'error',
      'playwright/no-raw-locators': 'error',
      'playwright/no-restricted-matchers': 'off',
      'playwright/no-skipped-test': 'error',
      'playwright/no-standalone-expect': 'error',
      'playwright/no-unsafe-references': 'error',
      'playwright/no-useless-await': 'error',
      'playwright/no-useless-not': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/prefer-comparison-matcher': 'error',
      'playwright/prefer-equality-matcher': 'error',
      'playwright/prefer-hooks-in-order': 'error',
      'playwright/prefer-hooks-on-top': 'error',
      'playwright/prefer-lowercase-title': 'error',
      'playwright/prefer-strict-equal': 'error',
      'playwright/prefer-to-be': 'error',
      'playwright/prefer-to-contain': 'error',
      'playwright/prefer-to-have-count': 'error',
      'playwright/prefer-to-have-length': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/require-hook': 'error',
      'playwright/require-soft-assertions': 'off', // soft assertions are optional
      'playwright/require-to-throw-message': 'error',
      'playwright/require-top-level-describe': 'error',
      'playwright/valid-describe-callback': 'error',
      'playwright/valid-expect': 'error',
      'playwright/valid-expect-in-promise': 'error',
      'playwright/valid-title': 'error',
    },
  });

  return configs;
}

export default createWebConfig;
