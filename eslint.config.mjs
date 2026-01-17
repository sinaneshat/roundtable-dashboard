import antfu from '@antfu/eslint-config';
import pluginQuery from '@tanstack/eslint-plugin-query';
import drizzlePlugin from 'eslint-plugin-drizzle';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import testingLibraryPlugin from 'eslint-plugin-testing-library';

export default antfu(
  {
    formatters: {
      css: true,
    },
    ignores: [
      'migrations/**/*',
      'apps/web/src/components/ui/*',
      'apps/api/src/db/migrations/meta/*',
      '**/cloudflare-env.d.ts',
      '**/*.md',
      '.claude/**/*',
      '.turbo/**/*',
      'scripts/**/*',
      '**/routeTree.gen.ts',
      '**/dist/**/*',
      '**/.output/**/*',
    ],
    isInEditor: false,
    lessOpinionated: false,

    react: true,

    stylistic: {
      semi: true,
    },

    typescript: true,
  },

  jsxA11y.flatConfigs.recommended,
  ...pluginQuery.configs['flat/recommended'],
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    plugins: {
      drizzle: drizzlePlugin,
    },
    rules: {
      'drizzle/enforce-delete-with-where': [
        'error',
        { drizzleObjectName: ['db', 'batch'] },
      ],
      'drizzle/enforce-update-with-where': [
        'error',
        { drizzleObjectName: ['db', 'batch'] },
      ],
    },
  },
  {
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*', '**/test-*.{ts,tsx}', 'src/lib/testing/**/*', 'vitest.setup.ts'],
    ignores: ['e2e/**/*'],
    plugins: {
      'testing-library': testingLibraryPlugin,
    },
    rules: {
      // Vitest rules (plugin provided by antfu config as 'test')
      'test/no-disabled-tests': 'warn',
      'test/no-focused-tests': 'error',
      'test/no-identical-title': 'error',
      'test/prefer-to-have-length': 'warn',
      'test/valid-expect': 'error',
      'test/no-conditional-expect': 'error',

      // Testing Library rules
      'testing-library/await-async-queries': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-debugging-utils': 'warn',
      'testing-library/prefer-screen-queries': 'warn',
      'testing-library/prefer-user-event': 'warn',

      // Relax some rules for test files
      'ts/no-explicit-any': 'off',
      'no-console': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    rules: {
      'perfectionist/sort-imports': 'off',
      'import/order': 'off', // Avoid conflicts with `simple-import-sort` plugin
      'node/prefer-global/process': 'off', // Allow using `process.env`
      'react/prefer-destructuring-assignment': 'off', // Vscode doesn't support automatically destructuring, it's a pain to add a new variable
      'sort-imports': 'off', // Avoid conflicts with `simple-import-sort` plugin
      'style/brace-style': ['error', '1tbs'], // Use the default brace style
      'ts/consistent-type-definitions': ['error', 'type'], // Use `type` instead of `interface`,
      'ts/no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'ts/no-explicit-any': 'error',
      'ts/explicit-function-return-type': 'off',
      'no-console': ['error', { allow: ['error'] }],

      // // Prevent re-exports and enforce better export patterns
      // 'import/no-namespace': ['error', { ignore: ['*.css', '*.scss', '*.less'] }], // Prevents export * from './module'
      // 'import/group-exports': 'error', // Forces all exports to be grouped in a single export declaration
      // 'import/export': 'error', // Reports duplicate exports of the same name
      // 'import/no-duplicates': 'error', // Prevents importing the same module in multiple places
      // 'import/prefer-default-export': 'off', // Don't force default exports
      // 'import/no-default-export': 'off', // Allow default exports where needed
    },
  },
  // Migration: Relax no-explicit-any for files with migration-related type inference issues
  // These files use `any` types due to Hono client inference and TanStack Start migration
  // TODO: Remove this override when proper type inference is restored
  {
    files: [
      'apps/web/src/services/api/**/*.ts',
      'apps/web/src/lib/api/client.ts',
      'apps/web/src/types/stubs/**/*.ts',
      'apps/web/src/hooks/**/*.ts',
      'apps/web/src/db/**/*.ts',
      'apps/web/src/lib/compat/**/*.tsx',
      'apps/web/src/lib/utils/**/*.ts',
      'apps/web/src/components/**/*.tsx',
      'apps/web/src/components/**/*.ts',
      'apps/web/src/stores/**/*.ts',
      'apps/web/src/containers/**/*.tsx',
      'apps/web/src/router.tsx',
    ],
    rules: {
      'ts/no-explicit-any': 'off',
    },
  },
  // Migration: Allow @ts-expect-error for cross-package imports in auth/email
  // These files import from API package at runtime, requiring type suppression
  {
    files: [
      'apps/web/src/lib/auth/**/*.ts',
      'apps/web/src/lib/email/**/*.ts',
      'apps/web/src/db/**/*.ts',
    ],
    rules: {
      'ts/no-explicit-any': 'off',
      'ts/ban-ts-comment': 'off',
    },
  },
  {
    // Module augmentation files require interface for declaration merging (TypeScript requirement)
    files: ['**/*-context.d.ts'],
    rules: {
      'ts/consistent-type-definitions': 'off',
    },
  },
);
