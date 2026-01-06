import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const isDev = process.env.NODE_ENV === 'development';
const isProd = process.env.NEXT_PUBLIC_WEBAPP_ENV === 'prod';

if (isDev && process.env.CLOUDFLARE_API_TOKEN) {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  output: 'standalone',

  compiler: {
    removeConsole: isProd,
  },

  poweredByHeader: false,
  productionBrowserSourceMaps: !isProd,
  experimental: {
    optimizePackageImports: [
      'motion',
      '@radix-ui/react-icons',
      'cmdk',
      'vaul',
      'react-day-picker',
      'react-hook-form',
      '@hookform/resolvers',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'zustand',
      'immer',
      'ai',
      '@ai-sdk/react',
      'chroma-js',
      'clsx',
      'class-variance-authority',
      'tailwind-merge',
      'fuse.js',
      'posthog-js',
      'react-markdown',
      'shiki',
    ],
  },

  cacheComponents: false,

  serverExternalPackages: [
    '@react-email/components',
    '@react-email/html',
    '@react-email/render',
    'react-email',
    'jose',
  ],

  async rewrites() {
    if (isDev) {
      return {
        beforeFiles: [
          {
            source: '/sw.js',
            destination: '/_dev-sw-blocked',
          },
        ],
        afterFiles: [],
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
        source: '/public/chat/:path*/embed',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              'default-src \'self\'',
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'style-src \'self\' \'unsafe-inline\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'img-src * data: blob:',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https: wss://*.posthog.com wss://us.posthog.com wss://eu.posthog.com`,
              'worker-src \'self\' blob: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'font-src \'self\' data: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'frame-src \'self\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'frame-ancestors *',
              'base-uri \'self\'',
              'form-action \'self\' https://accounts.google.com',
            ].join('; '),
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              'default-src \'self\'',
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'style-src \'self\' \'unsafe-inline\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'img-src * data: blob:',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https: wss://*.posthog.com wss://us.posthog.com wss://eu.posthog.com`,
              'worker-src \'self\' blob: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'font-src \'self\' data: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com https://cdn.jsdelivr.net',
              'frame-src \'self\' https://accounts.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
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
    return config;
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
