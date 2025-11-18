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
      'framer-motion',
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

  // Cache optimization headers
  async headers() {
    // In development, disable all caching for fresh updates
    const isDevelopment = process.env.NODE_ENV === 'development';

    return [
      // Development: Disable caching for HTML pages only (not static assets)
      ...(isDevelopment
        ? [
            {
              source: '/:path((?!_next/static|_next/image|favicon\\.ico|icons).*)',
              headers: [
                {
                  key: 'Cache-Control',
                  value: 'no-store, must-revalidate',
                },
                {
                  key: 'X-Development-Mode',
                  value: 'true',
                },
              ],
            },
          ]
        : []),
      {
        // Static assets - allow browser caching even in dev for performance
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: isDevelopment
              ? 'public, max-age=31536000, immutable' // Same as production for performance
              : 'public, max-age=31536000, immutable',
          },
          {
            key: 'X-Cache-Type',
            value: isDevelopment ? 'development-no-cache' : 'static-asset',
          },
        ],
      },
      {
        // Image optimization - cache in both dev and prod
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, s-maxage=604800', // 1 day browser, 1 week edge
          },
          {
            key: 'X-Cache-Type',
            value: isDevelopment ? 'dev-optimized-image' : 'optimized-image',
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
              'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'style-src \'self\' \'unsafe-inline\' https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'img-src * data: blob:',
              `connect-src 'self' ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'} https://*.googleusercontent.com https://www.google.com https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com wss://*.posthog.com wss://us.posthog.com wss://eu.posthog.com`,
              'worker-src \'self\' blob: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'font-src \'self\' data: https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
              'frame-src \'self\' https://*.posthog.com https://us.posthog.com https://eu.posthog.com https://us-assets.i.posthog.com https://internal-j.posthog.com',
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
      {
        protocol: 'https',
        hostname: 'www.google.com',
        pathname: '/s2/favicons**',
      },
    ],
  },

};

// Configure Serwist PWA with environment-aware cache invalidation
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Disable in development - only enable in production builds
  disable: process.env.NODE_ENV === 'development',
  // Additional Serwist configuration
  cacheOnNavigation: false, // Disable navigation caching in all environments
  reloadOnOnline: process.env.NODE_ENV === 'production',
  // Only auto-register in production builds
  register: process.env.NODE_ENV === 'production',
  scope: '/',
  // Inject build metadata to force SW updates on new deployments
  // This ensures the service worker file content changes on every build
  additionalPrecacheEntries: process.env.NODE_ENV === 'production'
    ? [
        {
          url: '/__BUILD_MANIFEST__',
          revision: process.env.NEXT_PUBLIC_SW_VERSION || Date.now().toString(),
        },
      ]
    : undefined,
});

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Chain plugins: Serwist -> NextIntl -> NextConfig
export default withSerwist(withNextIntl(nextConfig));
