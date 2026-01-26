/**
 * lint-staged configuration
 * Uses turbo for parallel lint and type-check across all packages
 */
module.exports = {
  '*.{ts,tsx}': () => [
    'bun run lint:fix',
    'bun run check-types',
  ],
};
