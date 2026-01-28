/**
 * Root ESLint configuration for monorepo
 * Used by lint-staged when running from the root directory
 */
import { createConfig } from './packages/eslint-config/src/base';

export default createConfig({
  drizzle: true,
  react: true,
});
