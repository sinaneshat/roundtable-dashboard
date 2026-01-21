'use client';

import dynamic from '@/lib/utils/dynamic';

import { LiveChatDemoSkeleton } from './live-chat-demo-skeleton';

/**
 * Lazy-loaded LiveChatDemo with skeleton fallback
 * Shows skeleton during SSR and while JavaScript loads
 */
export const LiveChatDemoLazy = dynamic(
  () => import('./live-chat-demo').then(m => ({ default: m.LiveChatDemo })),
  {
    loading: () => <LiveChatDemoSkeleton />,
    ssr: false,
  },
);
