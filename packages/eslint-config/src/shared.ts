/**
 * ESLint configuration for Shared package (types, enums, utilities)
 */
import type { Linter } from 'eslint';

import { createConfig } from './base';

export async function createSharedConfig(): Promise<Linter.Config[]> {
  const configs = await createConfig({
    drizzle: false,
    ignores: [],
    react: false,
  });

  // Relax explicit return type for Zod schema factory functions
  // Their return types are complex and inferred correctly by TypeScript
  configs.push({
    files: ['**/types/**/*.ts', '**/validation/**/*.ts'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  });

  return configs;
}

export default createSharedConfig;
