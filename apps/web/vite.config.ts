import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Read version from root package.json (single source of truth)
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));
const APP_VERSION = rootPkg.version;

export default defineConfig({
  plugins: [
    // Per official Cloudflare docs: cloudflare plugin first
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // TanStack Start framework with prerendering
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
    // React support
    viteReact(),
    // Tailwind CSS v4
    tailwindcss(),
    // TypeScript path aliases
    tsconfigPaths(),
    // Bundle analyzer (only with ANALYZE=true)
    process.env.ANALYZE === 'true' && visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
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
  build: {
    sourcemap: true,
  },
  // Disable esbuild keepNames to prevent __name helper injection
  optimizeDeps: {
    esbuildOptions: {
      keepNames: false,
    },
  },
  esbuild: {
    keepNames: false,
  },
});
