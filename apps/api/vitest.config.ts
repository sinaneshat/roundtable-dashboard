/// <reference types="vitest/config" />
import path from 'node:path';

import { nodeConfig } from '@roundtable/vitest-config/node';
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
    ...nodeConfig,
    setupFiles: ['./vitest.setup.ts'],
  },
});
