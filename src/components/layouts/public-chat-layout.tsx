import type React from 'react';

import { NavigationHeader } from '@/components/chat/chat-header';
import { ChatThreadActions } from '@/components/chat/chat-thread-actions';
import type { GetPublicThreadResponse } from '@/services/api';

// RPC-inferred type: Extract PublicThread from service response
type PublicThread = NonNullable<Extract<GetPublicThreadResponse, { success: true }>['data']>['thread'];

type PublicChatLayoutProps = {
  children: React.ReactNode;
  thread: PublicThread | null;
  slug: string;
};

export default function PublicChatLayout({ children, thread, slug }: PublicChatLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <NavigationHeader
        showSidebarTrigger={false}
        showLogo={true}
        maxWidth={true}
        threadTitle={thread?.title}
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

      <div className="flex flex-1 flex-col w-full min-w-0 relative" data-public-content>
        {children}
      </div>
    </div>
  );
}
