import type React from 'react';

import { NavigationHeader } from '@/components/chat/chat-header';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import { getPublicThreadService } from '@/services/api';

/**
 * Public Chat Layout
 * Includes NavigationHeader with thread title and actions
 * No authentication required, no sidebar
 */
export default async function PublicChatLayout({
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
    const threadResult = await getPublicThreadService(slug);
    thread = threadResult?.success ? threadResult.data?.thread : null;
  } catch {
    // Expected for unavailable threads - page component handles redirect
    // Layout just won't show thread-specific actions
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header with thread title and actions */}
      <NavigationHeader
        showSidebarTrigger={false}
        showLogo={true}
        maxWidth={true}
        threadTitle={thread?.title}
        threadParent="/"
        threadActions={
          thread
            ? (
                <ChatThreadActions
                  thread={thread}
                  slug={slug}
                  isPublicMode={true}
                />
              )
            : null
        }
      />

      {/* Content area with scroll */}
      <div className="flex flex-1 flex-col w-full min-w-0 relative overflow-y-auto" data-public-content>
        {children}
      </div>
    </div>
  );
}
