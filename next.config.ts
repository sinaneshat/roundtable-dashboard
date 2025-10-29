import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Initialize OpenNext Cloudflare for development - must be called before any other code
if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  // Required for OpenNext deployment
  output: 'standalone',

  // Compiler optimizations
  compiler: {
    // Remove console in production
    removeConsole: process.env.NEXT_PUBLIC_WEBAPP_ENV === 'prod',
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

  // Cache optimization headers
  async headers() {
    return [
      {
        // Static assets cache optimization
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable', // 1 year
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
      {
        // Scalar API documentation - needs permissive CSP
        source: '/api/v1/scalar',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              'default-src \'self\' \'unsafe-inline\' \'unsafe-eval\' data: blob:',
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com',
              'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com',
              'font-src \'self\' https://fonts.gstatic.com https://cdn.jsdelivr.net',
              'img-src \'self\' data: blob: https:',
              'connect-src \'self\' https: wss: ws:',
              'worker-src \'self\' blob:',
              'child-src \'self\' blob:',
              'frame-ancestors \'none\'',
              'base-uri \'self\'',
              'form-action \'self\'',
            ].join('; '),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
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
        // Basic security headers for all routes except Scalar
        source: '/((?!api/v1/scalar).*)',
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
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://us-assets.i.posthog.com',
              'style-src \'self\' \'unsafe-inline\'',
              'img-src \'self\' data: https://lh3.googleusercontent.com https://lh4.googleusercontent.com https://lh5.googleusercontent.com https://lh6.googleusercontent.com https://googleusercontent.com',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https://us.i.posthog.com https://us-assets.i.posthog.com`,
              'frame-ancestors \'none\'',
              'base-uri \'self\'',
              'form-action \'self\'',
            ].join('; '),
          },
        ],
      },
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
