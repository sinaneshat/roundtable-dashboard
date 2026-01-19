import { createFileRoute } from '@tanstack/react-router';

import { MainContentSkeleton } from '@/components/skeletons';
import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';

export const Route = createFileRoute('/_protected/chat/')({
  // ✅ SSR: Direct import - component renders on server
  // NO dynamic import - React.lazy doesn't work on server, causes skeleton flash
  component: ChatOverviewScreen,
  // pendingComponent shown during route transitions (client-side navigation)
  pendingComponent: MainContentSkeleton,
  // Protected routes should not be indexed
  head: () => ({
    meta: [
      { title: 'Chat - Roundtable' },
      { name: 'description', content: 'Start a new AI conversation with multiple models.' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
});
