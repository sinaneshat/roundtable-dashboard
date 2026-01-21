/// <reference types="vitest/config" />
import type { UserConfig } from 'vitest/config';

/**
 * Base Vitest configuration shared across all packages.
 * Environment-specific configs (react, node) extend this.
 */
export const baseConfig: UserConfig['test'] = {
  globals: true,

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
};
