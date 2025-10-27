import antfu from '@antfu/eslint-config';
import nextPlugin from '@next/eslint-plugin-next';
import pluginQuery from '@tanstack/eslint-plugin-query';
import drizzlePlugin from 'eslint-plugin-drizzle';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default antfu(
  {
    formatters: {
      css: true,
    },
    ignores: [
      'migrations/**/*',
      'next-env.d.ts',
      'src/components/ui/*',
      'src/db/migrations/meta/*',
      'cloudflare-env.d.ts',
      '**/*.md',
      '.claude/**/*',
      'scripts/**/*',
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
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
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
      'no-console': 'error',

      // // Prevent re-exports and enforce better export patterns
      // 'import/no-namespace': ['error', { ignore: ['*.css', '*.scss', '*.less'] }], // Prevents export * from './module'
      // 'import/group-exports': 'error', // Forces all exports to be grouped in a single export declaration
      // 'import/export': 'error', // Reports duplicate exports of the same name
      // 'import/no-duplicates': 'error', // Prevents importing the same module in multiple places
      // 'import/prefer-default-export': 'off', // Don't force default exports
      // 'import/no-default-export': 'off', // Allow default exports where needed
    },
  },
);
