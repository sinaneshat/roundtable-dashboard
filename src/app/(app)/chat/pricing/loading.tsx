import { PricingContentSkeleton } from '@/components/pricing';

export default function PricingLoading() {
  return (
    <div className="h-full min-h-[calc(100vh-4rem)]">
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <PricingContentSkeleton />
      </div>
    </div>
  );
}
