import type { MetadataRoute } from 'next';

import { BRAND } from '@/constants/brand';

/**
 * PWA Manifest for improved mobile experience and SEO
 * Enhances installability and provides app metadata for search engines
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.fullName,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/',
    display: 'standalone',
    background_color: BRAND.colors.dark,
    theme_color: BRAND.colors.primary,
    orientation: 'portrait-primary',
    categories: ['productivity', 'business', 'education', 'ai'],
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/static/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/static/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    screenshots: [
      {
        src: '/static/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
      },
    ],
    shortcuts: [
      {
        name: 'Start New Chat',
        short_name: 'New Chat',
        description: 'Start a new AI collaboration session',
        url: '/chat',
        icons: [{ src: '/static/logo.png', sizes: '192x192' }],
      },
    ],
    related_applications: [],
    prefer_related_applications: false,
    scope: '/',
    dir: 'ltr',
    lang: 'en-US',
  };
}
