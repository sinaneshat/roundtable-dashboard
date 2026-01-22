module.exports = {
  '*.{js,jsx,ts,tsx}': ['eslint --fix --no-warn-ignored'],
  '*.{ts,tsx}': () => 'bun run clean && bun run check-types',
};
