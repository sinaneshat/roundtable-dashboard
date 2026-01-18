/// <reference types="vitest/config" />
import path from 'node:path';

import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    include: [
      'src/**/__tests__/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/__tests__/**/test-helpers.{js,jsx,ts,tsx}',
      '**/__tests__/**/test-types.{js,jsx,ts,tsx}',
    ],

    pool: 'forks',
    maxForks: 2,
    minForks: 1,
    isolate: true,
    fileParallelism: true,

    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 30000,

    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,

    reporters: process.env.CI ? ['verbose', 'json'] : ['default'],
    outputFile: process.env.CI ? { json: './test-results.json' } : undefined,
  },
});
