import { ChatPageHeaderSkeleton } from '@/components/chat/chat-header';
import { PricingContentSkeleton } from '@/components/pricing/pricing-content-skeleton';

/**
 * Pricing Page Loading Skeleton
 * Reuses PricingContentSkeleton for consistent loading states
 */
export default function PricingLoading() {
  return (
    <div className="flex flex-1 min-h-0 w-full flex-col">
      <ChatPageHeaderSkeleton />
      <div className="flex-1 overflow-y-auto py-6">
        <PricingContentSkeleton />
      </div>
    </div>
  );
}
