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

// Remotion + video packages - dev-only, excluded from production builds
const devOnlyPackages = [
  'remotion',
  '@remotion/bundler',
  '@remotion/cli',
  '@remotion/google-fonts',
  '@remotion/player',
  '@remotion/tailwind',
  '@remotion/three',
  '@remotion/transitions',
  '@remotion/zod-types',
  '@react-three/fiber',
  'three',
  '@ffmpeg/ffmpeg',
  '@ffmpeg/util',
];

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
        // Legal pages - fully static, no dynamic content
        { path: '/legal/terms', prerender: { enabled: true } },
        { path: '/legal/privacy', prerender: { enabled: true } },
        // Auth pages - static shell prerendered, session check runs client-side
        { path: '/auth/sign-in', prerender: { enabled: true } },
        { path: '/auth/error', prerender: { enabled: true } },
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
  build: {
    rollupOptions: {
      // Exclude remotion directory and packages from production bundle
      external: (id) => {
        // Exclude all remotion packages
        if (devOnlyPackages.some(pkg => id === pkg || id.startsWith(`${pkg}/`))) {
          return true;
        }
        // Exclude remotion source directory
        if (id.includes('/remotion/') || id.includes('src/remotion')) {
          return true;
        }
        return false;
      },
    },
  },
  // Fix SSR issues with packages that don't work with dep optimizer
  ssr: {
    optimizeDeps: {
      exclude: ['vaul', 'nuqs'],
    },
  },
  // Let Vite and TanStack Router handle code splitting automatically
  // manualChunks removed to avoid interference with autoCodeSplitting
});
