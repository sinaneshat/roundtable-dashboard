import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { AuthForm } from '@/components/auth/auth-form';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { AuthLoadingSkeleton } from '@/components/loading';
import { getSession } from '@/server/auth';

const siteUrl = 'https://roundtable.now';
const pageTitle = 'Sign In - Roundtable';
const pageDescription = 'Sign in to Roundtable - the collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.';

// Validate redirect search param
const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/auth/sign-in')({
  // Server-side auth check - redirect if already authenticated
  beforeLoad: async () => {
    const session = await getSession();

    if (session) {
      // Already authenticated, redirect to chat
      throw redirect({ to: '/chat' });
    }
  },
  validateSearch: signInSearchSchema,
  component: SignInPage,
  pendingComponent: AuthLoadingSkeleton,
  head: () => ({
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
      { name: 'twitter:title', content: pageTitle },
      { name: 'twitter:description', content: pageDescription },
      { name: 'twitter:image', content: `${siteUrl}/static/og-image.png` },
      // SEO
      { name: 'robots', content: 'index, follow' },
    ],
    links: [
      { rel: 'canonical', href: `${siteUrl}/auth/sign-in` },
    ],
  }),
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
