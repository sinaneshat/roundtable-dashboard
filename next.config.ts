import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Initialize OpenNext Cloudflare for development - must be called before any other code
if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  // Required for OpenNext deployment
  output: 'standalone',

  // Compiler optimizations
  compiler: {
    // Remove console in production
    removeConsole: process.env.NEXT_PUBLIC_WEBAPP_ENV === 'prod',
  },

  // Production optimizations
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  // Stable experimental features (production-ready since Next.js 13.5+)
  experimental: {
    // Optimize package imports for better tree-shaking
    // Battle-tested since 13.5, widely used in production
    // Reduces module loading by 15-70% depending on library
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-icons',
      'motion',
    ],
  },

  // External packages for Server Components bundling
  // Required for React Email to work in edge runtime and Cloudflare Workers
  // @see https://github.com/resend/react-email/issues/977
  serverExternalPackages: [
    '@react-email/components',
    '@react-email/html',
    '@react-email/render',
    'react-email',
  ],

  // Block service worker in development to prevent caching issues
  async rewrites() {
    if (isDev) {
      return {
        beforeFiles: [
          {
            // Block sw.js requests in dev - return 404 via non-existent path
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

  // Cache optimization headers
  async headers() {
    return [
      {
        // Static assets cache optimization
        source: '/_next/static/:path*',
        headers: isDev
          ? [
              {
                key: 'Cache-Control',
                value: 'no-cache, no-store, must-revalidate', // No cache in dev
              },
              {
                key: 'Pragma',
                value: 'no-cache',
              },
              {
                key: 'Expires',
                value: '0',
              },
            ]
          : [
              {
                key: 'Cache-Control',
                value: 'public, max-age=31536000, immutable', // 1 year in prod
              },
              {
                key: 'X-Cache-Type',
                value: 'static-asset',
              },
            ],
      },
      {
        // Image optimization
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800', // 1 day browser, 1 week edge
          },
          {
            key: 'X-Cache-Type',
            value: 'optimized-image',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer-when-downgrade',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
        ],
      },
      {
        // Public assets
        source: '/favicon.ico',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800', // 1 week
          },
        ],
      },
      {
        // Public assets folder (manifest.webmanifest served by Next.js)
        source: '/(robots.txt|sitemap.xml)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400', // 1 day
          },
        ],
      },
      // Block service worker caching in development
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
        // API routes - no cache by default (handled by middleware)
        source: '/api/:path*',
        headers: [
          {
            key: 'X-API-Cache',
            value: 'controlled-by-middleware',
          },
        ],
      },
      {
        // Public chat embed pages - allow iframe embedding
        source: '/public/chat/:path*/embed',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
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
        // Default security headers for all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
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
      // Note: API routes (/api/*) CSP is handled by Hono middleware, not Next.js
      // This is because Hono responses bypass Next.js header processing in Cloudflare Workers
      // See: src/api/index.ts for API-specific CSP configuration
    ];
  },

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      // Dynamic hostname based on environment
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
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh4.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh5.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh6.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons**',
      },
    ],
  },

};

// Configure Serwist PWA
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Disable Serwist in development for faster builds
  disable: process.env.NODE_ENV === 'development',
  // Additional Serwist configuration
  cacheOnNavigation: true,
  reloadOnOnline: true,
  register: true,
  scope: '/',
});

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Chain plugins: Serwist -> NextIntl -> NextConfig
export default withSerwist(withNextIntl(nextConfig));
