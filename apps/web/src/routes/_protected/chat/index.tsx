import { createFileRoute } from '@tanstack/react-router';

import { ChatOverviewSkeleton } from '@/components/loading';
import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';

export const Route = createFileRoute('/_protected/chat/')({
  component: ChatOverviewScreen,
  pendingComponent: ChatOverviewSkeleton,
  // Protected routes should not be indexed
  head: () => ({
    meta: [
      { title: 'Chat - Roundtable' },
      { name: 'description', content: 'Start a new AI conversation with multiple models.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
});
