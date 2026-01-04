import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';

// ISR: 24 hours (matches page revalidation)
export const revalidate = 86400;

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Shell wrapper only
 * Data prefetching handled in page.tsx with HydrationBoundary
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  return <ChatLayoutShell>{children}</ChatLayoutShell>;
}
