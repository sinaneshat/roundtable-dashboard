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
  environments: {
    client: {
      build: {
        rollupOptions: {
          output: {
            manualChunks: (id) => {
              // Vendor chunk splitting for better caching and parallel loading
              if (id.includes('node_modules')) {
                // React core - separate chunk for framework (required everywhere)
                if (id.includes('react-dom') || id.includes('/react/')) {
                  return 'react';
                }
                // TanStack libraries - commonly used together
                if (id.includes('@tanstack')) {
                  return 'tanstack';
                }
                // Animation library - large, lazy load where possible
                if (id.includes('motion')) {
                  return 'motion';
                }
                // State management - core state libs
                if (id.includes('zustand') || id.includes('immer')) {
                  return 'state';
                }
                // Radix UI primitives - used across app
                if (id.includes('@radix-ui')) {
                  return 'radix';
                }
                // Zod validation - used widely
                if (id.includes('zod')) {
                  return 'zod';
                }
                // Hono client
                if (id.includes('hono')) {
                  return 'hono';
                }
                // Analytics (lazy loaded)
                if (id.includes('posthog')) {
                  return 'analytics';
                }
                // Markdown rendering - only needed on chat pages
                if (id.includes('react-markdown') || id.includes('remark') || id.includes('rehype') || id.includes('unified') || id.includes('mdast') || id.includes('micromark')) {
                  return 'markdown';
                }
                // Shiki code highlighting - lazy loaded
                if (id.includes('shiki') || id.includes('@shikijs')) {
                  return 'shiki';
                }
                // Three.js / 3D - should be lazy loaded
                if (id.includes('three') || id.includes('@react-three')) {
                  return 'three';
                }
                // Date utilities
                if (id.includes('date-fns')) {
                  return 'date-fns';
                }
                // Form handling
                if (id.includes('react-hook-form') || id.includes('@hookform')) {
                  return 'forms';
                }
                // Don't use catch-all vendor - let Vite handle optimal splitting
              }
              // Let Vite handle non-vendor modules automatically
              return undefined;
            },
          },
        },
      },
    },
  },
});
