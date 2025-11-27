import Image from 'next/image';

import { RadialGlow } from '@/components/ui/radial-glow';
import { QuickStartSkeleton, Skeleton, StickyInputSkeleton } from '@/components/ui/skeleton';
import { BRAND } from '@/constants/brand';

/**
 * Loading State for Chat Overview Page
 *
 * Uses reusable skeleton components for consistency:
 * - QuickStartSkeleton: Quick start cards grid
 * - StickyInputSkeleton: Sticky bottom input
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatOverviewLoading() {
  return (
    <div className="relative min-h-svh flex flex-col overflow-x-hidden">
      {/* Main content */}
      <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-12 pb-32 flex-1 relative">
        {/* Hero Section */}
        <div className="py-6 sm:py-8">
          <div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 text-center relative">
            {/* Logo */}
            <div className="relative h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 z-10" style={{ overflow: 'visible' }}>
              <RadialGlow size={800} offsetY={40} duration={15} animate />
              <Image
                src={BRAND.logos.main}
                alt={`${BRAND.displayName} Logo`}
                fill
                sizes="(max-width: 480px) 80px, (max-width: 640px) 96px, (max-width: 768px) 112px, (max-width: 1024px) 128px, 144px"
                className="object-contain drop-shadow-2xl relative z-10"
                priority
              />
            </div>

            {/* Title skeleton */}
            <Skeleton className="h-10 sm:h-12 md:h-14 lg:h-16 w-64 sm:w-80 md:w-96 bg-white/20" />

            {/* Subtitle skeleton */}
            <Skeleton className="h-5 sm:h-6 md:h-7 w-48 sm:w-64 md:w-80 max-w-2xl bg-white/15" />
          </div>
        </div>

        {/* Quick Start Cards */}
        <div className="py-4">
          <QuickStartSkeleton count={3} />
        </div>
      </div>

      {/* Sticky input */}
      <StickyInputSkeleton />
    </div>
  );
}
