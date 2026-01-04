import type React from 'react';

import { requireAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';

// ISR: 24 hours (matches page revalidation)
export const revalidate = 86400;

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Auth Required
 * Pricing page requires authentication to show subscription info
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const session = await requireAuth();

  return <ChatLayoutShell session={session}>{children}</ChatLayoutShell>;
}
