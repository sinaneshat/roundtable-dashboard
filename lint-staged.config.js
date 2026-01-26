/**
 * lint-staged configuration
 *
 * Best practices:
 * 1. ESLint --fix on staged files only (fast, auto-fixes get staged)
 * 2. Only fail on errors, not warnings
 * 3. Fixes are automatically re-staged by lint-staged
 *
 * Note: Type-checking is NOT run per-file since one file can break
 * types elsewhere. Run `bun run check-types` separately or in CI.
 */
module.exports = {
  // TypeScript/JavaScript files: lint and auto-fix
  // ESLint handles both linting AND formatting (via style rules)
  '*.{ts,tsx,js,jsx}': (filenames) => [
    `eslint --fix --no-warn-ignored ${filenames.join(' ')}`,
  ],
};
