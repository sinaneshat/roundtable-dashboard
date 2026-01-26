module.exports = {
  'apps/api/**/*.ts': (files) => [
    `cd apps/api && eslint --fix --no-warn-ignored ${files.map(f => f.replace(/^.*apps\/api\//, '')).join(' ')}`,
  ],
  'apps/web/**/*.{ts,tsx}': (files) => [
    `cd apps/web && eslint --fix --no-warn-ignored ${files.map(f => f.replace(/^.*apps\/web\//, '')).join(' ')}`,
  ],
  'packages/shared/**/*.ts': (files) => [
    `cd packages/shared && eslint --fix --no-warn-ignored ${files.map(f => f.replace(/^.*packages\/shared\//, '')).join(' ')}`,
  ],
  '*.{ts,tsx}': () => 'bun run check-types',
};
