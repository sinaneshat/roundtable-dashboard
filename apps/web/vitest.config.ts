/// <reference types="vitest/config" />
import path from 'node:path';

import { reactConfig } from '@roundtable/vitest-config/react';
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
    ...reactConfig,
    setupFiles: ['./vitest.setup.ts'],
  },
});
