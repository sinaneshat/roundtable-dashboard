import type React from 'react';

import PublicChatLayout from '@/components/layouts/public-chat-layout';
import { getPublicThreadService } from '@/services/api';

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

  // Fetch thread for header - request deduplicated with page.tsx by Next.js
  let thread = null;
  try {
    const threadResult = await getPublicThreadService({ param: { slug } });
    thread = threadResult?.success ? threadResult.data?.thread : null;
  } catch {
    // Layout continues with null thread - page handles redirects
  }

  return (
    <PublicChatLayout thread={thread} slug={slug}>
      {children}
    </PublicChatLayout>
  );
}
