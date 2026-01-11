import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { createMetadata } from '@/utils';

export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Chat - ${BRAND.name}`,
    description: 'Start a new AI conversation or continue your existing chats with multiple AI models collaborating together.',
    robots: 'noindex, nofollow',
    url: '/chat',
    canonicalUrl: '/chat',
    image: '/chat/opengraph-image',
    keywords: [
      'AI chat',
      'chat overview',
      'AI conversations',
      'collaborative AI',
      'multiple AI models',
    ],
  });
}

export default function ChatOverviewPage() {
  return <ChatOverviewScreen />;
}
