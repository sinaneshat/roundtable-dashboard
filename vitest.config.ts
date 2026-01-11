/// <reference types="vitest/config" />
import path from 'node:path';

import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],

    server: {
      deps: {
        inline: [/@.*/, 'next-intl'],
      },
    },

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

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{js,jsx,ts,tsx}'],
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
        autoUpdate: true,
      },
    },

    pool: 'forks',
    singleFork: false,
    maxForks: 2,
    minForks: 1,
    execArgv: ['--max-old-space-size=2048', '--expose-gc'],
    isolate: true,
    fileParallelism: true,
    disableConsoleIntercept: true,

    testTimeout: 15000,
    hookTimeout: 15000,
    teardownTimeout: 30000,

    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,

    reporters: process.env.CI ? ['verbose', 'json'] : ['default'],
    outputFile: process.env.CI ? { json: './test-results.json' } : undefined,

    sequence: {
      shuffle: false,
      concurrent: false,
      seed: Date.now(),
      hooks: 'stack',
    },
  },
});
