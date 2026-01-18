/// <reference types="vitest/config" />
import type { UserConfig } from 'vitest/config';

import { baseConfig } from './base';

/**
 * React/jsdom Vitest configuration for frontend packages.
 * Use with @vitejs/plugin-react and vite-tsconfig-paths.
 */
export const reactConfig: UserConfig['test'] = {
  ...baseConfig,
  environment: 'jsdom',
};
