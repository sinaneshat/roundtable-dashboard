import '../styles/globals.css';

import { BRAND } from '@roundtable/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { StructuredData } from '@/components/seo';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import type { RouterContext } from '@/router';

/**
 * Root route with QueryClient context
 * TanStack Start pattern: context flows from router to all routes
 */
const siteName = BRAND.name;
const siteDescription = BRAND.description;
const twitterHandle = BRAND.social.twitterHandle;

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: siteName },
        { name: 'description', content: siteDescription },
        // Open Graph
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: siteName },
        { property: 'og:title', content: siteName },
        { property: 'og:description', content: siteDescription },
        { property: 'og:url', content: siteUrl },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: twitterHandle },
        { name: 'twitter:creator', content: twitterHandle },
        { name: 'twitter:title', content: siteName },
        { name: 'twitter:description', content: siteDescription },
        { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
        // Theme
        { name: 'theme-color', content: '#000000' },
        { name: 'color-scheme', content: 'dark' },
        // PWA
        { name: 'application-name', content: siteName },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: siteName },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'format-detection', content: 'telephone=no' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
      links: [
        // PWA Manifest
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // Favicon - default for all browsers (without sizes for maximum compatibility)
        { rel: 'icon', type: 'image/png', href: '/icons/icon-96x96.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/icons/icon-96x96.png' },
        // Sized icons for high-DPI displays and PWA
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/icon-72x72.png' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/icons/icon-96x96.png' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icons/icon-192x192.png' },
        // Apple touch icon for iOS
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'canonical', href: siteUrl },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </QueryClientProvider>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const baseUrl = getAppBaseUrl();

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <StructuredData
          type="WebApplication"
          name={siteName}
          description={siteDescription}
          url={baseUrl}
          baseUrl={baseUrl}
          logo={`${baseUrl}/static/logo.svg`}
          image={`${baseUrl}/static/og-image.png`}
          sameAs={[
            BRAND.social.twitter,
            BRAND.social.linkedin,
            BRAND.social.github,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
