import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { ChatOverviewScreen } from '@/containers/screens/chat';
import { createMetadata } from '@/utils/metadata';

/**
 * Generate metadata for chat overview page
 */
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Dashboard - ${BRAND.fullName}`,
    description: 'Start a new AI conversation or continue your existing chats with multiple AI models collaborating together.',
    robots: 'noindex, nofollow', // Private dashboard - don't index
    keywords: [
      'AI dashboard',
      'chat overview',
      'AI conversations',
      'collaborative AI',
      'multiple AI models',
    ],
  });
}

/**
 * Chat Overview Page - Server Component
 *
 * Landing page for authenticated users showing:
 * - Quick access to start new conversations
 * - Recent chat history
 * - Favorite conversations
 */
export default async function ChatOverviewPage() {
  return <ChatOverviewScreen />;
}
