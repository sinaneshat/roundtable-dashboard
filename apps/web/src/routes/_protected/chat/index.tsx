import { createFileRoute } from '@tanstack/react-router';

import { MainContentSkeleton } from '@/components/layouts/chat-layout-shell';
import dynamic from '@/lib/utils/dynamic';

// Dynamic import with ssr:false - shows skeleton during SSR and until component loads
const DynamicChatOverviewScreen = dynamic(
  () => import('@/containers/screens/chat/ChatOverviewScreen'),
  { ssr: false, loading: () => <MainContentSkeleton /> },
);

export const Route = createFileRoute('/_protected/chat/')({
  component: ChatOverviewRoute,
  // Protected routes should not be indexed
  head: () => ({
    meta: [
      { title: 'Chat - Roundtable' },
      { name: 'description', content: 'Start a new AI conversation with multiple models.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
});

function ChatOverviewRoute() {
  return <DynamicChatOverviewScreen />;
}
