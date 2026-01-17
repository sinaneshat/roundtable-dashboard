import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { AuthForm } from '@/components/auth/auth-form';
import { AuthShowcaseLayout } from '@/components/auth/auth-showcase-layout';
import { AuthLoadingSkeleton } from '@/components/loading';
import { useSession } from '@/lib/auth/client';

const siteUrl = 'https://roundtable.now';
const pageTitle = 'Sign In - Roundtable';
const pageDescription = 'Sign in to Roundtable - the collaborative AI brainstorming platform where multiple AI models work together to solve problems and generate ideas.';

export const Route = createFileRoute('/auth/sign-in')({
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
  const navigate = useNavigate();
  const { data: session } = useSession();

  useEffect(() => {
    // If already authenticated, redirect to chat
    if (session) {
      navigate({ to: '/chat' });
    }
  }, [session, navigate]);

  // Show nothing while redirecting (prevents flash)
  if (session) {
    return null;
  }

  return (
    <AuthShowcaseLayout>
      <AuthForm />
    </AuthShowcaseLayout>
  );
}
