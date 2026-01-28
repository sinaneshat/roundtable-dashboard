import type { Linter } from 'eslint';
/**
 * ESLint configuration for API package (Hono + Cloudflare Workers + Drizzle)
 * Includes strict backend rules and Drizzle ORM safety
 */
import vitestPlugin from 'eslint-plugin-vitest';

import { createConfig } from './base';

export async function createApiConfig(): Promise<Linter.Config[]> {
  const configs = await createConfig({
    drizzle: true,
    ignores: [
      '**/cloudflare-env.d.ts',
      'src/db/migrations/**/*',
      'drizzle.config.ts',
      'vitest.config.ts',
      'vitest.setup.ts',
    ],
    react: false,
  });

  // API-specific rules
  configs.push({
    files: ['**/*.ts'],
    rules: {
      'no-async-promise-executor': 'error',
      'no-console': ['error', { allow: ['error', 'info', 'warn'] }],
      'require-atomic-updates': 'off',
    },
  });

  // Route handlers - Hono specific
  configs.push({
    files: ['**/routes/**/*.ts', '**/routes/**/handler.ts'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  });

  // Service layer and shared operations - complex return types inferred by TS
  configs.push({
    files: ['**/services/**/*.ts', '**/shared-operations/**/*.ts'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  });

  // Test files
  configs.push({
    files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*'],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: {
      'no-console': 'off',
      'ts/no-explicit-any': 'off',
      'vitest/consistent-test-it': ['error', { fn: 'it' }],
      'vitest/expect-expect': 'error',
      'vitest/no-conditional-expect': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/no-standalone-expect': 'error',
      'vitest/no-test-return-statement': 'error',
      'vitest/prefer-called-with': 'warn',
      'vitest/prefer-hooks-on-top': 'error',
      'vitest/prefer-spy-on': 'warn',
      'vitest/prefer-to-be': 'warn',
      'vitest/prefer-to-contain': 'warn',
      'vitest/prefer-to-have-length': 'error',
      'vitest/require-top-level-describe': 'off',
      'vitest/valid-expect': 'off',
    },
  });

  return configs;
}

export default createApiConfig;
