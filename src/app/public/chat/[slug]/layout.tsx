import type React from 'react';

import PublicChatLayout from '@/components/layouts/public-chat-layout';
import { getCachedPublicThread } from '@/lib/cache/thread-cache';

// ISR: 1 day cache with on-demand invalidation via revalidateTag
export const revalidate = 86400;

export default async function PublicChatLayoutPage({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let thread = null;
  try {
    const threadResult = await getCachedPublicThread(slug);
    thread = threadResult?.success ? threadResult.data?.thread : null;
  } catch {
  }

  return (
    <PublicChatLayout thread={thread} slug={slug}>
      {children}
    </PublicChatLayout>
  );
}
