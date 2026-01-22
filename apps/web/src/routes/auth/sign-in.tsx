import { createFileRoute, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import z from 'zod';

import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { AuthLoadingSkeleton } from '@/components/loading';
import { getAppBaseUrl } from '@/lib/config/base-urls';

// Lazy-load AuthForm to defer Zod validation bundle (95KB gzipped)
const AuthForm = lazy(() => import('@/components/auth/auth-form').then(m => ({ default: m.AuthForm })));

const pageTitle = 'Sign In - Roundtable';
const pageDescription = 'Sign in to Roundtable - the collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.';

// Validate search params (redirect for post-auth navigation, toast/message for user feedback)
const signInSearchSchema = z.object({
  redirect: z.string().optional(),
  toast: z.string().optional(),
  message: z.string().optional(),
  action: z.string().optional(),
  from: z.string().optional(),
  // UTM tracking params (passthrough)
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

export const Route = createFileRoute('/auth/sign-in')({
  // Use session from root context - NO duplicate API call
  beforeLoad: async ({ context }) => {
    const { session } = context;

    if (session) {
      // Already authenticated, redirect to chat
      throw redirect({ to: '/chat' });
    }
  },
  validateSearch: signInSearchSchema,
  component: SignInPage,
  pendingComponent: AuthLoadingSkeleton,
  // ✅ ISR: Static shell - cache for 1h at CDN, serve stale for 24h
  // beforeLoad runs server-side so redirects work, but HTML shell is cacheable
  headers: () => ({
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  }),
  head: () => {
    const siteUrl = getAppBaseUrl();
    return {
      meta: [
        { title: pageTitle },
        { name: 'description', content: pageDescription },
        // Open Graph
        { property: 'og:title', content: pageTitle },
        { property: 'og:description', content: pageDescription },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: `${siteUrl}/auth/sign-in` },
        { property: 'og:image', content: `${siteUrl}/static/og-image.png` },
        { property: 'og:site_name', content: 'Roundtable' },
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@roundtablenow' },
        { name: 'twitter:title', content: pageTitle },
        { name: 'twitter:description', content: pageDescription },
        { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
        // SEO
        { name: 'robots', content: 'index, follow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/auth/sign-in` },
        // Preload optimized WebP logo (10KB vs 112KB SVG) for faster LCP
        { rel: 'preload', href: '/static/logo.webp', as: 'image', type: 'image/webp' },
      ],
    };
  },
});

function SignInPage() {
  // Session is guaranteed NOT to exist by beforeLoad
  // If user logs in, they'll be redirected on next navigation
  return (
    <AuthShowcaseLayout>
      <AuthForm />
    </AuthShowcaseLayout>
  );
}
