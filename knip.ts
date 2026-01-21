/**
 * Knip Configuration - TypeScript for type safety
 * TanStack Start + Hono Turborepo Monorepo
 */

const config = {
  // JSON Schema for IDE support
  $schema: 'https://unpkg.com/knip@5/schema.json',

  // Monorepo workspace configuration
  workspaces: {
    // API package (Hono + Cloudflare Workers)
    'apps/api': {
      entry: [
        'src/index.ts',
        'src/worker.ts',
        'drizzle.config.ts',
      ],
      project: [
        'src/**/*.{ts,tsx}',
        '*.{ts,tsx,js,mjs}',
      ],
      ignore: [
        'src/db/migrations/**',
        'dist/**',
      ],
    },

    // Web package (TanStack Start)
    'apps/web': {
      entry: [
        'src/router.tsx',
        'src/routes/**/*.tsx',
        'src/client.tsx',
        'vite.config.ts',
        'tailwind.config.ts',
      ],
      project: [
        'src/**/*.{ts,tsx}',
        '*.{ts,tsx,js,mjs}',
      ],
      ignore: [
        '.output/**',
        'dist/**',
      ],
    },

    // Shared package
    'packages/shared': {
      entry: [
        'src/index.ts',
      ],
      project: [
        'src/**/*.{ts,tsx}',
      ],
    },
  },

  // Root-level configuration
  entry: [
    'scripts/**/*.{ts,js}',
  ],

  project: [
    'scripts/**/*.{ts,js}',
    '*.{ts,tsx,js,mjs}',
  ],

  // Ignore generated and external files
  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.output/**',
    '**/src/db/migrations/**',
    '**/*.generated.{ts,tsx}',
  ],

  // Ignore dependencies that are used indirectly
  ignoreDependencies: [
    // Type-only packages
    '@types/*',
    // Runtime dependencies loaded dynamically
    'better-auth',
    'drizzle-orm',
    '@libsql/client',
  ],

  // Ignore binaries that are used in CI/deployment
  ignoreBinaries: [
    'docker',
    'docker-compose',
    'wrangler',
  ],

  // Plugin configurations for supported tools
  eslint: {
    config: ['eslint.config.js', '.eslintrc.json'],
  },

  prettier: {
    config: ['.prettierrc', 'prettier.config.js'],
  },

  typescript: {
    config: ['tsconfig.json', 'tsconfig.*.json'],
  },
};

export default config;
