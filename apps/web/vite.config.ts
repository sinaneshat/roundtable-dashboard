import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Read version from root package.json
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));
const APP_VERSION = rootPkg.version;

export default defineConfig({
  plugins: [
    // Official order per Cloudflare + TanStack docs
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoStaticPathsDiscovery: false,
      },
      pages: [
        { path: '/legal/terms', prerender: { enabled: true } },
        { path: '/legal/privacy', prerender: { enabled: true } },
      ],
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  // Manual chunk splitting for large vendor libraries
  // Only splits truly independent libraries to avoid circular deps
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              if (!id.includes('node_modules'))
                return undefined;

              // Shiki - code highlighting (1.3MB), fully independent
              if (id.includes('shiki') || id.includes('@shikijs'))
                return 'shiki';

              // Markdown processing chain - independent of React
              if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('unified') || id.includes('micromark') || id.includes('mdast'))
                return 'markdown';

              // PostHog analytics - independent
              if (id.includes('posthog'))
                return 'analytics';

              // Motion library - independent
              if (id.includes('motion'))
                return 'motion';

              // Date utilities - independent
              if (id.includes('date-fns'))
                return 'date-fns';

              // Zod - validation library, independent
              if (id.includes('zod'))
                return 'zod';

              // Let Vite handle React, TanStack, Radix - they have interdependencies
              return undefined;
            },
          },
        },
      },
    },
  },
});
