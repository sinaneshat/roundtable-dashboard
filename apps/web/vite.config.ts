import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Read version from root package.json (single source of truth)
const rootPkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf-8'));
const APP_VERSION = rootPkg.version;

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

// Determine if production build (used by deploy scripts with --env production)
const isProd = process.env.CF_PAGES_BRANCH === 'main' || process.env.VITE_WEBAPP_ENV === 'prod';

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    crossPackageResolver(),
    tsconfigPaths(),
    tanstackStart({
      // SSG: Prerender static pages at build time
      // NOTE: Pages with beforeLoad that call server functions CANNOT be prerendered
      // - / redirects in beforeLoad (skip)
      // - /auth/sign-in calls getSession() in beforeLoad (skip)
      // - /public/pricing has loader but no beforeLoad (ok)
      // - /legal/* are pure static with no loaders (ok)
      prerender: {
        enabled: true,
        crawlLinks: false, // Don't crawl - explicit routes only
        autoStaticPathsDiscovery: false, // Only prerender explicit pages
      },
      pages: [
        // Static pages with no loaders or beforeLoad server calls
        // Note: /chat/pricing has a loader (products) so it uses ISR caching instead
        { path: '/legal/terms', prerender: { enabled: true } },
        { path: '/legal/privacy', prerender: { enabled: true } },
      ],
    }),
    viteReact(),
    // Bundle analyzer - only runs during production builds with ANALYZE=true
    process.env.ANALYZE === 'true'
    && visualizer({
      filename: 'stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ].filter(Boolean),
  // Proxy ALL /api/* requests to backend - frontend becomes the single origin
  // This avoids CORS issues and makes cookies work seamlessly
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
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
      // CRITICAL: Disable keepNames to prevent __name helper injection in SSR
      esbuildOptions: {
        keepNames: false,
      },
    },
    // Don't externalize React - bundle it to ensure single copy
    noExternal: ['react', 'react-dom'],
  },
  // Client-side dependency optimization
  optimizeDeps: {
    esbuildOptions: {
      keepNames: false,
    },
  },
  build: {
    // Source maps only for local/preview, not production
    sourcemap: !isProd,
    rollupOptions: {
      external: [
        // Exclude Node.js built-ins that won't be available in Cloudflare Workers
        'crypto',
        'stream',
        'util',
        'events',
        'buffer',
      ],
      output: {
        manualChunks: {
          // Core React - critical for initial render
          'react-vendor': ['react', 'react-dom'],
          // TanStack ecosystem - routing and data fetching
          'tanstack-vendor': ['@tanstack/react-router', '@tanstack/react-query', '@tanstack/react-start', '@tanstack/react-virtual'],
          // Radix UI primitives - large set of UI components
          'radix-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-select',
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-tabs',
            '@radix-ui/react-scroll-area',
          ],
          // Radix UI secondary - less frequently used components
          'radix-secondary': [
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-label',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-toggle',
            '@radix-ui/react-visually-hidden',
          ],
          // Animation - motion used in chat, load on demand
          'animation-vendor': ['motion'],
          // Chat-specific - carousel and fuzzy search only needed in chat
          'chat-vendor': ['embla-carousel-react', 'fuse.js'],
          // Analytics - defer loading until after interaction
          'analytics-vendor': ['posthog-js'],
          // Forms - used in specific routes
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Utilities - shared utilities
          'utils-vendor': ['clsx', 'tailwind-merge', 'class-variance-authority', 'immer'],
          // Markdown rendering - lightweight, no heavy dependencies
          'markdown-vendor': ['react-markdown'],
          // Mermaid diagrams - lazy loaded only when mermaid blocks detected
          // Note: mermaid is dynamically imported, not bundled upfront
          // Syntax highlighting - dynamically imported by code-block-highlighter
          // Note: shiki core + selected languages loaded on demand
          // Data utilities - date handling, colors
          'data-vendor': ['date-fns', 'chroma-js', 'randomcolor'],
          // UI utilities - additional UI libraries
          'ui-utilities': ['cmdk', 'react-day-picker', 'vaul', 'use-stick-to-bottom', '@unpic/react', 'nuqs'],
        },
      },
    },
  },
  define: {
    'process.env': {},
    '__APP_VERSION__': JSON.stringify(APP_VERSION),
  },
  // CRITICAL: keepNames: false prevents __name helper injection that breaks Cloudflare SSR hydration
  // Applied globally to both client and SSR builds
  esbuild: isProd
    ? {
        drop: ['console', 'debugger'],
        keepNames: false,
      }
    : { keepNames: false },
});
