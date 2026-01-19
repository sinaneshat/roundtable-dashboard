import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
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
    },
    // Don't externalize React - bundle it to ensure single copy
    noExternal: ['react', 'react-dom'],
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
          // Animation libraries - can be lazy loaded
          'animation-vendor': ['motion', 'embla-carousel-react'],
          // Analytics - defer loading until after interaction
          'analytics-vendor': ['posthog-js'],
          // Forms - used in specific routes
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Utilities - shared utilities
          'utils-vendor': ['clsx', 'tailwind-merge', 'class-variance-authority', 'immer'],
          // Content rendering - markdown and syntax highlighting
          'content-vendor': ['react-markdown', 'shiki', 'streamdown'],
          // Data utilities - date handling, search, etc.
          'data-vendor': ['date-fns', 'fuse.js', 'chroma-js', 'randomcolor'],
          // UI utilities - additional UI libraries
          'ui-utilities': ['cmdk', 'react-day-picker', 'vaul', 'use-stick-to-bottom', '@unpic/react', 'nuqs'],
        },
      },
    },
  },
  define: {
    'process.env': {},
  },
  // Strip console.* and debugger in production builds
  esbuild: isProd
    ? {
        drop: ['console', 'debugger'],
      }
    : undefined,
});
