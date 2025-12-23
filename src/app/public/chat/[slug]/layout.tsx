import type React from 'react';

import PublicChatLayout from '@/components/layouts/public-chat-layout';
import { getPublicThreadService } from '@/services/api';

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
    const threadResult = await getPublicThreadService({ param: { slug } });
    thread = threadResult?.success ? threadResult.data?.thread : null;
  } catch {
  }

  return (
    <PublicChatLayout thread={thread} slug={slug}>
      {children}
    </PublicChatLayout>
  );
}
