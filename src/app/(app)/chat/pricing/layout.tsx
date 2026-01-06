import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';

// ISR: 24 hours (matches page revalidation)
export const revalidate = 86400;

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Public (No Auth)
 * Public pricing page for product listing - no authentication required
 */
export default function PricingLayout({ children }: PricingLayoutProps) {
  return <ChatLayoutShell>{children}</ChatLayoutShell>;
}
