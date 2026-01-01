import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Dashboard - ${BRAND.fullName}`,
    description: 'Start a new AI conversation or continue your existing chats with multiple AI models collaborating together.',
    robots: 'noindex, nofollow',
    url: '/chat',
    canonicalUrl: '/chat',
    image: '/chat/opengraph-image',
    keywords: [
      'AI dashboard',
      'chat overview',
      'AI conversations',
      'collaborative AI',
      'multiple AI models',
    ],
  });
}

// No HydrationBoundary needed - layout already hydrates threads, subscriptions, usage
export default function ChatOverviewPage() {
  return <ChatOverviewScreen />;
}
