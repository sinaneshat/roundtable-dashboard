import type { ReactNode } from 'react';

import { ChatStoreProvider } from './chat-store-provider';

type ChatLayoutProvidersProps = {
  children: ReactNode;
};

/**
 * Chat Layout Providers
 *
 * Wraps chat routes with ChatStoreProvider.
 * Separated from root AppProviders to avoid heavy initialization
 * on non-chat routes (auth, public, static pages).
 */
export function ChatLayoutProviders({ children }: ChatLayoutProvidersProps) {
  return <ChatStoreProvider>{children}</ChatStoreProvider>;
}
