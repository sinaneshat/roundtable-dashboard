import type React from 'react';

import type { ChatThread } from '@/api/routes/chat/schema';
import { NavigationHeader } from '@/components/chat/chat-header';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';

type PublicChatLayoutProps = {
  children: React.ReactNode;
  thread: ChatThread | null;
  slug: string;
};

/**
 * Public Chat Layout Component
 *
 * Reusable layout for public chat threads
 * Includes NavigationHeader with thread title and actions
 *
 * Features:
 * - No authentication required
 * - No sidebar (public view)
 * - Thread-specific header with title and actions
 * - Full-height scrollable content area
 *
 * Usage:
 * ```tsx
 * <PublicChatLayout thread={thread} slug={slug}>
 *   <PublicChatThreadScreen slug={slug} />
 * </PublicChatLayout>
 * ```
 */
export default function PublicChatLayout({ children, thread, slug }: PublicChatLayoutProps) {
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
