import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { auth } from '@/lib/auth';

/**
 * HomeScreen Component
 *
 * Root landing page that redirects users based on authentication status:
 * - Authenticated users → /chat (dashboard)
 * - Unauthenticated users → /auth/sign-in
 *
 * This is a Server Component that performs redirect logic
 * No UI is rendered as users are immediately redirected
 *
 * Usage in page.tsx:
 * ```tsx
 * export default async function Home() {
 *   return <HomeScreen />;
 * }
 * ```
 */
export default async function HomeScreen(): Promise<never> {
  // Check if user is authenticated
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (session?.user) {
    // User is authenticated, redirect to chat dashboard
    redirect('/chat');
  } else {
    // Intentionally empty
    // User is not authenticated, redirect to sign-in
    redirect('/auth/sign-in');
  }
}
