/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  css: {
    // Mock CSS imports in tests
    modules: {
      classNameStrategy: 'non-scoped',
    },
  },
  test: {
    // Environment
    environment: 'jsdom',
    globals: true,

    // Setup files
    setupFiles: ['./vitest.setup.ts'],

    // ✅ FIX: Add server-side deps configuration for CSS imports
    server: {
      deps: {
        inline: [/@.*/], // Inline all scoped packages to avoid CSS import issues
      },
    },

    // Test file patterns
    include: [
      'src/**/__tests__/**/*.{spec,test}.{js,jsx,ts,tsx}',
      'src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/__tests__/**/test-helpers.{js,jsx,ts,tsx}',
      '**/__tests__/**/test-types.{js,jsx,ts,tsx}',
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.stories.{js,jsx,ts,tsx}',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        autoUpdate: true, // V4: Automatically maintain coverage standards
      },
    },

    // Execution - V4: Pool options moved to top level
    pool: 'threads',
    // singleThread is deprecated in v4, use isolate instead
    isolate: true, // Each test file runs in isolated environment (default)
    fileParallelism: true, // V4: Run test files in parallel
    maxWorkers: undefined, // V4: Auto-detect based on CPU cores

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Mock behavior
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true, // V4: Auto-restore global stubs between tests
    unstubEnvs: true, // V4: Auto-restore env stubs between tests

    // Reporters - CI-aware configuration
    reporters: process.env.CI ? ['verbose', 'json'] : ['default'],
    outputFile: process.env.CI ? { json: './test-results.json' } : undefined,

    // Test sequencing - V4: Explicit control over test execution order
    sequence: {
      shuffle: false, // Predictable test order
      concurrent: false, // Tests run sequentially by default
      seed: Date.now(), // Randomization seed
      hooks: 'stack', // Hook execution order (stack vs list)
    },
  },
});
