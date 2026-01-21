/// <reference types="vitest/config" />
import type { UserConfig } from 'vitest/config';

import { baseConfig } from './base';

/**
 * Node.js Vitest configuration for backend/API packages.
 * Use with vite-tsconfig-paths.
 */
export const nodeConfig: UserConfig['test'] = {
  ...baseConfig,
  environment: 'node',
};
