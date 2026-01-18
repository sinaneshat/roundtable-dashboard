import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Paths for cross-package resolution
const webSrcPath = path.resolve(__dirname, 'src');
const apiSrcPath = path.resolve(__dirname, '../api/src');

/**
 * Custom plugin to resolve @/ paths based on the importing file's location.
 * Files in the API package resolve @/ to API's src.
 * Files in the web package resolve @/ to web's src.
 */
function crossPackageResolver(): Plugin {
  return {
    name: 'cross-package-resolver',
    resolveId(source, importer) {
      if (!source.startsWith('@/') || !importer) {
        return null;
      }

      // Determine which package the importer is from
      const isFromApiPackage = importer.includes('/apps/api/');
      const basePath = isFromApiPackage ? apiSrcPath : webSrcPath;
      const relativePath = source.slice(2); // Remove '@/'

      return path.resolve(basePath, relativePath);
    },
  };
}

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    crossPackageResolver(),
    tsconfigPaths(),
    tanstackStart({
      // SSG: Prerender static pages at build time
      prerender: {
        enabled: true,
        crawlLinks: false, // Don't crawl - explicit routes only
        autoStaticPathsDiscovery: false, // Only prerender explicit pages
      },
      // Specific pages to prerender
      pages: [
        { path: '/', prerender: { enabled: true } },
        { path: '/auth/sign-in', prerender: { enabled: true } },
        { path: '/chat/pricing', prerender: { enabled: true } },
      ],
    }),
    viteReact(),
  ],
  // Proxy API requests in development to avoid cross-origin cookie issues
  // This makes web and API appear as same origin for cookie handling
  server: {
    proxy: {
      // Proxy all /api/* requests to the API server
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        // Required for Better Auth cookies to work
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  resolve: {
    alias: {
      '@': webSrcPath,
    },
    // CRITICAL: Dedupe React to prevent "Invalid hook call" errors during SSR
    // This ensures a single React instance across all packages
    dedupe: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
  },
  // Optimize SSR dependencies to prevent multiple copies
  ssr: {
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    // Don't externalize React - bundle it to ensure single copy
    noExternal: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      external: [
        // Exclude Node.js built-ins that won't be available in Cloudflare Workers
        'crypto',
        'stream',
        'util',
        'events',
        'buffer',
      ],
    },
  },
  define: {
    'process.env': {},
  },
});
