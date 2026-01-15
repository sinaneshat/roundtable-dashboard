import bundleAnalyzer from '@next/bundle-analyzer';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'prod';

if (isDev && process.env.CLOUDFLARE_API_TOKEN) {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  output: 'standalone',

  // Required for PostHog reverse proxy - prevents redirect loops on trailing slashes
  // @see https://posthog.com/docs/advanced/proxy/nextjs
  skipTrailingSlashRedirect: true,

  compiler: {
    removeConsole: isProd,
  },

  poweredByHeader: false,
  productionBrowserSourceMaps: !isProd,
  experimental: {
    optimizePackageImports: [
      // Icons
      'lucide-react',
      '@radix-ui/react-icons',
      // UI Libraries
      'recharts',
      'framer-motion',
      'motion',
      // Date/Time
      'date-fns',
      // AI SDK
      'ai',
      '@ai-sdk/react',
      '@ai-sdk/ui-utils',
      // State Management
      'zustand',
      '@tanstack/react-query',
      // NOTE: @tanstack/react-virtual removed - tree-shaking breaks internal module refs
      // Form/Validation
      'zod',
      'react-hook-form',
      '@hookform/resolvers',
      // Radix UI primitives
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-slot',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-label',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-slider',
      '@radix-ui/react-toast',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      // Markdown/Content
      'streamdown',
      'react-markdown',
      'remark-gfm',
      'rehype-raw',
      // Utilities
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      // PostHog
      'posthog-js',
    ],
  },

  reactStrictMode: true,
  // cacheComponents disabled - opennextjs-cloudflare v1.14.7 not fully compatible
  // Causes Math.random() / Suspense boundary issues with client components
  // Using traditional ISR with export const revalidate instead
  // cacheComponents: true,

  serverExternalPackages: [
    // React Email - prevent bundling email rendering (~1.4MB)
    '@react-email/components',
    '@react-email/html',
    '@react-email/render',
    '@react-email/code-block',
    '@react-email/tailwind',
    'react-email',
    // Auth
    'jose',
    // Puppeteer - massive packages (~8MB with typescript)
    // Local dev uses puppeteer, Cloudflare uses Browser binding
    'puppeteer',
    'puppeteer-core',
    '@cloudflare/puppeteer',
    // Puppeteer dependencies that pull in typescript
    'cosmiconfig',
    'cosmiconfig-typescript-loader',
    // Shiki syntax highlighting (~2MB)
    'shiki',
    '@shikijs/core',
    '@shikijs/langs',
    '@shikijs/themes',
    '@shikijs/engine-oniguruma',
    '@shikijs/engine-javascript',
    // Mermaid diagrams (~3MB with deps)
    'mermaid',
    'cytoscape',
    'cytoscape-cose-bilkent',
    'cytoscape-fcose',
    'd3',
    'd3-sankey',
    'dagre-d3-es',
    'elkjs',
    'langium',
    'chevrotain',
    // KaTeX math rendering (~600KB)
    'katex',
    // Heavy unified/remark/rehype plugins
    'unified',
    'remark-math',
    'rehype-katex',
    'marked',
  ],

  async rewrites() {
    // NOTE: PostHog proxy rewrites DO NOT WORK on OpenNext/Cloudflare Workers
    // External proxy rewrites are broken: https://github.com/opennextjs/opennextjs-cloudflare/issues/594
    // PostHog is configured to use direct URL (NEXT_PUBLIC_POSTHOG_HOST) instead
    // Keeping rewrites for local dev where they do work via Next.js dev server

    if (isDev) {
      return {
        beforeFiles: [
          {
            source: '/sw.js',
            destination: '/_dev-sw-blocked',
          },
        ],
        afterFiles: [
          // PostHog proxy - works in local dev only
          {
            source: '/ingest/static/:path*',
            destination: 'https://us-assets.i.posthog.com/static/:path*',
          },
          {
            source: '/ingest/:path*',
            destination: 'https://us.i.posthog.com/:path*',
          },
        ],
        fallback: [],
      };
    }
    return { beforeFiles: [], afterFiles: [], fallback: [] };
  },

  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: isDev
          ? [
              { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
              { key: 'Pragma', value: 'no-cache' },
              { key: 'Expires', value: '0' },
            ]
          : [
              { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
              { key: 'X-Cache-Type', value: 'static-asset' },
            ],
      },
      {
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800' },
          { key: 'X-Cache-Type', value: 'optimized-image' },
          { key: 'Referrer-Policy', value: 'no-referrer-when-downgrade' },
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
      {
        source: '/(robots.txt|sitemap.xml)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      ...(isDev
        ? [
            {
              source: '/sw.js',
              headers: [
                { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
                { key: 'Pragma', value: 'no-cache' },
                { key: 'Expires', value: '0' },
              ],
            },
          ]
        : []),
      {
        source: '/api/:path*',
        headers: [{ key: 'X-API-Cache', value: 'controlled-by-middleware' }],
      },
      {
        // Embed CSP - allows framing from any origin
        source: '/public/chat/:path*/embed',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            // Analytics: PostHog (explicit + wildcard) + Google Tag Manager
            value: [
              'default-src \'self\'',
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://accounts.google.com https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://*.posthog.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com',
              'style-src \'self\' \'unsafe-inline\' https://accounts.google.com https://cdn.jsdelivr.net https://us.posthog.com https://*.posthog.com',
              'img-src * data: blob:',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https://accounts.google.com https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://*.posthog.com https://www.google-analytics.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com`,
              'worker-src \'self\' blob: https://us.posthog.com https://*.posthog.com',
              'font-src \'self\' data: https://cdn.jsdelivr.net',
              'frame-src \'self\' https://accounts.google.com https://us.posthog.com https://*.posthog.com',
              'frame-ancestors *',
              'base-uri \'self\'',
              'form-action \'self\' https://accounts.google.com',
            ].join('; '),
          },
        ],
      },
      {
        // Main app CSP
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            // Analytics: PostHog (explicit + wildcard) + Google Tag Manager
            value: [
              'default-src \'self\'',
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://accounts.google.com https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://*.posthog.com https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com',
              'style-src \'self\' \'unsafe-inline\' https://accounts.google.com https://cdn.jsdelivr.net https://us.posthog.com https://*.posthog.com',
              'img-src * data: blob:',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https://accounts.google.com https://us.posthog.com https://us.i.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://*.posthog.com https://www.google-analytics.com https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com`,
              'worker-src \'self\' blob: https://us.posthog.com https://*.posthog.com',
              'font-src \'self\' data: https://cdn.jsdelivr.net',
              'frame-src \'self\' https://accounts.google.com https://us.posthog.com https://*.posthog.com',
              'frame-ancestors \'none\'',
              'base-uri \'self\'',
              'form-action \'self\' https://accounts.google.com',
            ].join('; '),
          },
        ],
      },
    ];
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? [{
            protocol: new URL(process.env.NEXT_PUBLIC_APP_URL).protocol.slice(0, -1) as 'http' | 'https',
            hostname: new URL(process.env.NEXT_PUBLIC_APP_URL).hostname,
            port: new URL(process.env.NEXT_PUBLIC_APP_URL).port || undefined,
          }]
        : [{
            protocol: 'http' as const,
            hostname: 'localhost',
            port: '3000',
          }]
      ),
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com' },
      { protocol: 'https', hostname: 'googleusercontent.com' },
      { protocol: 'https', hostname: 'www.google.com', pathname: '/s2/favicons**' },
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer && !isProd && process.env.DEBUG_MINIFY === 'true') {
      config.optimization.minimize = false;
      config.optimization.moduleIds = 'named';
      config.optimization.chunkIds = 'named';
    }

    // Client-side optimizations
    if (!isServer) {
      // Better chunk splitting for lazy loading
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Separate vendor chunks for better caching
          framework: {
            name: 'framework',
            test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            priority: 40,
            chunks: 'all',
            enforce: true,
          },
          // Heavy libs in separate chunks
          heavyLibs: {
            name: 'heavy-libs',
            test: /[\\/]node_modules[\\/](framer-motion|recharts|@tanstack)[\\/]/,
            priority: 30,
            chunks: 'all',
          },
          // Radix UI components
          radix: {
            name: 'radix',
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            priority: 25,
            chunks: 'all',
          },
          // AI SDK
          aiSdk: {
            name: 'ai-sdk',
            test: /[\\/]node_modules[\\/](ai|@ai-sdk)[\\/]/,
            priority: 20,
            chunks: 'all',
          },
        },
      };
    }

    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withBundleAnalyzer(withNextIntl(nextConfig));
