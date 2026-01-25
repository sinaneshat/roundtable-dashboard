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
      'apps/api/src/db/migrations/**/*',
      '**/cloudflare-env.d.ts',
      '**/*.md',
      '.claude/**/*',
      '.agents/**/*',
      '.turbo/**/*',
      'scripts/**/*',
      '**/scripts/**/*',
      '**/routeTree.gen.ts',
      '**/dist/**/*',
      '**/dist-test/**/*',
      '**/.output/**/*',
      '**/public/*.js',
    ],
    isInEditor: false,
    lessOpinionated: false,

    react: true,

    stylistic: {
      semi: true,
    },

    typescript: {
      tsconfigPath: './tsconfig.json',
    },
  },

  jsxA11y.flatConfigs.strict,
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
      // Vitest rules - all errors for strict testing
      'test/no-disabled-tests': 'error',
      'test/no-focused-tests': 'error',
      'test/no-identical-title': 'error',
      'test/prefer-to-have-length': 'error',
      'test/valid-expect': 'error',
      'test/no-conditional-expect': 'error',
      'test/consistent-test-it': ['error', { fn: 'it' }],
      'test/no-standalone-expect': 'error',
      'test/prefer-hooks-on-top': 'error',
      'test/require-top-level-describe': 'error',

      // Testing Library rules - all errors
      'testing-library/await-async-queries': 'error',
      'testing-library/no-await-sync-queries': 'error',
      'testing-library/no-debugging-utils': 'error',
      'testing-library/prefer-screen-queries': 'error',
      'testing-library/prefer-user-event': 'error',
      'testing-library/no-container': 'error',
      'testing-library/no-node-access': 'error',
      'testing-library/prefer-find-by': 'error',
      'testing-library/prefer-presence-queries': 'error',
      'testing-library/render-result-naming-convention': 'error',

      // Relax some rules for test files
      'ts/no-explicit-any': 'off',
      'no-console': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    rules: {
      'perfectionist/sort-imports': 'off',
      'import/order': 'off',
      'node/prefer-global/process': 'off',
      'react/prefer-destructuring-assignment': 'off',
      'sort-imports': 'off',
      'style/brace-style': ['error', '1tbs'],

      // TypeScript - maximum strictness
      'ts/consistent-type-definitions': ['error', 'type'],
      'ts/no-unused-vars': ['error', {
        vars: 'all',
        args: 'all',
        ignoreRestSiblings: false,
        argsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'ts/no-explicit-any': 'error',
      'ts/no-non-null-assertion': 'error',
      'ts/no-non-null-asserted-optional-chain': 'error',
      'ts/no-unnecessary-type-assertion': 'error',
      'ts/no-unnecessary-condition': 'error',
      'ts/no-unsafe-argument': 'error',
      'ts/no-unsafe-assignment': 'error',
      'ts/no-unsafe-call': 'error',
      'ts/no-unsafe-member-access': 'error',
      'ts/no-unsafe-return': 'error',
      'ts/no-floating-promises': 'error',
      'ts/no-misused-promises': 'error',
      'ts/await-thenable': 'error',
      'ts/require-await': 'error',
      'ts/no-redundant-type-constituents': 'error',
      'ts/prefer-nullish-coalescing': 'error',
      'ts/prefer-optional-chain': 'error',
      'ts/strict-boolean-expressions': ['error', {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
        allowNullableBoolean: false,
        allowNullableString: false,
        allowNullableNumber: false,
        allowAny: false,
      }],
      'ts/switch-exhaustiveness-check': 'error',
      'ts/ban-ts-comment': ['error', {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
        'ts-nocheck': true,
        'minimumDescriptionLength': 10,
      }],
      'ts/prefer-ts-expect-error': 'error',
      'ts/no-import-type-side-effects': 'error',
      'ts/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'ts/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],

      // General strictness
      'no-console': ['error', { allow: ['error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-param-reassign': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'prefer-promise-reject-errors': 'error',
      'require-atomic-updates': 'error',
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],

      // React strict rules
      'react/no-array-index-key': 'error',
      'react/no-danger': 'error',
      'react/no-unstable-nested-components': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    // Module augmentation files require interface for declaration merging
    files: ['**/*-context.d.ts'],
    rules: {
      'ts/consistent-type-definitions': 'off',
    },
  },
  {
    // Route files need default exports
    files: ['**/routes/**/*.tsx', '**/routes/**/*.ts'],
    rules: {
      'ts/consistent-type-exports': 'off',
    },
  },
);
