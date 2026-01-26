/**
 * Root ESLint configuration
 *
 * This is a minimal config for tools that run eslint from the root.
 * The actual linting happens in package-specific configs via `turbo run lint`.
 * lint-staged is configured to cd into each package before running eslint.
 */
import type { Linter } from 'eslint';

const config: Linter.Config[] = [
  {
    // Ignore all files - actual linting happens in package configs
    ignores: ['**/*'],
  },
];

export default config;
