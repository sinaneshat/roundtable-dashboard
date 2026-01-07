'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import type { ThreadPublishAction } from '@/api/core/enums/chat';
import { ThreadPublishActions } from '@/api/core/enums/chat';
import { auth } from '@/lib/auth';
import { THREAD_CACHE_TAGS } from '@/lib/cache/thread-cache';

/**
 * Server action to handle post-authentication redirect
 * Simplified version without organization handling
 */
export async function handlePostAuthRedirect(returnUrl?: string) {
  // 1. Get session or redirect to sign-in
  await getSessionOrRedirect();

  // 2. If returnUrl is valid, redirect to it
  if (returnUrl && returnUrl.startsWith('/')) {
    redirect(returnUrl);
  }

  // 3. Redirect to chat
  redirect('/chat');
}

/**
 * Get the current session or redirect to sign-in
 * @returns The authenticated session
 */
export async function getSessionOrRedirect() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    redirect('/auth/sign-in');
  }

  return session;
}

/**
 * Simple auth check for pages that require authentication
 * @returns The authenticated session
 */
export async function requireAuth() {
  return getSessionOrRedirect();
}

/**
 * Optional auth check - returns session if authenticated, null otherwise
 * Used for public pages that show different content based on auth state
 */
export async function getOptionalAuth() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  return session ?? null;
}

/**
 * Redirect authenticated users away from auth pages (sign-in, sign-up)
 * This prevents logged-in users from accessing authentication pages
 */
export async function redirectIfAuthenticated() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (session?.user) {
    redirect('/chat');
  }
}

// ============================================================================
// ISR Revalidation Actions
// ============================================================================

/**
 * Revalidate public chat thread page
 * Used when a thread's public status changes
 *
 * Server Action pattern for Next.js-specific features (revalidatePath)
 * All business logic remains in Hono API (/src/api/routes/)
 *
 * @param slug - Thread slug to revalidate
 * @param action - Thread publish action
 * @returns Success status
 */
export async function revalidatePublicThread(
  slug: string,
  action: ThreadPublishAction,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify authentication
    const headersList = await headers();
    const session = await auth.api.getSession({ headers: headersList });

    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' };
    }

    // Validate inputs
    if (!slug || typeof slug !== 'string') {
      return { success: false, error: 'Invalid slug' };
    }

    if (action !== ThreadPublishActions.PUBLISH && action !== ThreadPublishActions.UNPUBLISH) {
      return { success: false, error: 'Invalid action' };
    }

    // Invalidate the unstable_cache for this thread's data
    // This ensures fresh data is fetched on next request
    // Profile 'max' uses stale-while-revalidate semantics
    revalidateTag(THREAD_CACHE_TAGS.publicThread(slug), 'max');

    // Invalidate all public threads cache (for sitemap regeneration)
    revalidateTag(THREAD_CACHE_TAGS.allPublicThreads, 'max');

    // Revalidate the public chat page path (triggers ISR regeneration)
    const publicPath = `/public/chat/${slug}`;
    revalidatePath(publicPath);

    // Also revalidate the sitemap to include/exclude this thread
    revalidatePath('/sitemap.xml');

    return { success: true };
  } catch (error) {
    console.error('[revalidatePublicThread] Revalidation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Revalidation failed',
    };
  }
}
