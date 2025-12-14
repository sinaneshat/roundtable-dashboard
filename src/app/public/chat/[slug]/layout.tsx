import type React from 'react';

import { PublicChatLayout } from '@/components/layouts';
import { getPublicThreadService } from '@/services/api';

// ============================================================================
// ISR Configuration - Match page.tsx for consistent caching
// ============================================================================

/**
 * ISR Configuration for Layout
 * - Must match page.tsx revalidate value (86400 seconds = 24 hours)
 * - Ensures layout and page are revalidated together
 * - Next.js uses the lowest revalidate value in the tree
 */
export const revalidate = 86400; // 24 hours - sync with page.tsx

/**
 * Public Chat Layout Page
 * Fetches thread data and renders PublicChatLayout component
 * No authentication required, no sidebar
 */
export default async function PublicChatLayoutPage({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch thread data for header - gracefully handle errors (404/410)
  // The page component will handle redirects, layout just shows header
  let thread = null;
  try {
    const threadResult = await getPublicThreadService({ param: { slug } });
    thread = threadResult?.success ? threadResult.data?.thread : null;
  } catch {
    // Expected for unavailable threads - page component handles redirect
    // Layout just won't show thread-specific actions
  }

  return (
    <PublicChatLayout thread={thread} slug={slug}>
      {children}
    </PublicChatLayout>
  );
}
