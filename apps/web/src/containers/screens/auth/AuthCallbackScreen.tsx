// TODO: This component needs migration to TanStack Router patterns
// getSessionOrRedirect doesn't exist yet - needs to be implemented for TanStack Start
// @ts-expect-error - Function not yet implemented; component needs TanStack Router migration
import { getSessionOrRedirect } from '@/app/auth/actions';
import { redirect } from '@/lib/compat';

type AuthCallbackScreenProps = {
  returnUrl?: string;
};

/**
 * Auth Callback Screen - Server Component
 *
 * Handles OAuth callback flow with server-side redirects:
 * 1. Verifies session exists (redirects to sign-in if not)
 * 2. Redirects to returnUrl if provided and valid
 * 3. Defaults to /chat for successful authentication
 *
 * No UI is rendered - only server-side redirects for security.
 */
export default async function AuthCallbackScreen({
  returnUrl,
}: AuthCallbackScreenProps): Promise<never> {
  // 1. Verify session exists
  await getSessionOrRedirect();

  // 2. If valid return URL is provided, redirect to it
  if (returnUrl && returnUrl.startsWith('/')) {
    redirect(returnUrl);
  }

  // 3. Redirect to chat
  redirect('/chat');
}
