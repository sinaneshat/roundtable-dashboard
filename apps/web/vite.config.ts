import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
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
    react(),
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
  // Fix SSR issues with packages that don't work with dep optimizer
  ssr: {
    optimizeDeps: {
      exclude: ['vaul', 'nuqs'],
    },
  },
  // Manual chunk splitting for large vendor libraries
  // Split main bundle to reduce initial load size
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

              // Let Vite handle React core, React Query, and TanStack Router automatically
              // Manual chunking these causes "Cannot access before initialization" errors
              if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/') || id.includes('@tanstack/react-query') || id.includes('@tanstack/query') || id.includes('@tanstack/react-router') || id.includes('@tanstack/router'))
                return undefined;

              // Radix UI - split by component group for better caching
              // Dialog primitives (dialog, alert-dialog, sheet)
              if (id.includes('@radix-ui/react-dialog') || id.includes('@radix-ui/react-alert-dialog') || id.includes('vaul'))
                return 'radix-dialog';

              // Dropdown primitives (dropdown-menu, select, popover, tooltip)
              if (id.includes('@radix-ui/react-dropdown-menu') || id.includes('@radix-ui/react-select') || id.includes('@radix-ui/react-popover') || id.includes('@radix-ui/react-tooltip'))
                return 'radix-dropdown';

              // Form primitives (checkbox, radio, switch, label)
              if (id.includes('@radix-ui/react-checkbox') || id.includes('@radix-ui/react-radio-group') || id.includes('@radix-ui/react-switch') || id.includes('@radix-ui/react-label'))
                return 'radix-form';

              // Other Radix primitives
              if (id.includes('@radix-ui/'))
                return 'radix-misc';

              // React Hook Form ecosystem
              if (id.includes('react-hook-form') || id.includes('@hookform/resolvers'))
                return 'react-forms';

              // Other heavy utilities
              if (id.includes('fuse.js') || id.includes('chroma-js') || id.includes('randomcolor'))
                return 'utils';

              // Let Vite handle remaining dependencies
              return undefined;
            },
          },
        },
      },
    },
  },
});
