/// <reference types="vitest/config" />
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Root Vitest Config
 *
 * This config is for root-level test utilities only.
 * Each app (apps/api, apps/web) has its own vitest.config.ts.
 *
 * Use `pnpm test` with turbo to run tests in all packages,
 * or use `pnpm --filter @roundtable/api test` for specific packages.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,

    // Only include root-level script tests (if any)
    include: ['scripts/**/*.{spec,test}.{js,ts}'],
    exclude: [
      '**/node_modules/**',
      'apps/**',
      'packages/**',
      'e2e/**',
    ],

    testTimeout: 15000,
    clearMocks: true,
    restoreMocks: true,
  },
});
