/// <reference types="vitest/config" />
import type { UserConfig } from 'vitest/config';

import { baseConfig } from './base';

/**
 * React/jsdom Vitest configuration for frontend packages.
 * Use with @vitejs/plugin-react and vite-tsconfig-paths.
 *
 * Includes memory management settings optimized for large test suites.
 */
export const reactConfig: UserConfig['test'] = {
  ...baseConfig,
  environment: 'jsdom',

  // Override pool settings for React tests (heavier memory usage)
  maxWorkers: process.env.CI ? 2 : 4,

  // Memory management - limit each worker to prevent OOM
  vmMemoryLimit: '512Mb',

  // Sequential in CI to avoid memory spikes, parallel locally
  fileParallelism: !process.env.CI,

  // Concurrent tests within a file - limit to prevent memory spikes
  maxConcurrency: 5,
};
