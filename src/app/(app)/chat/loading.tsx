import Image from 'next/image';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WavyBackground } from '@/components/ui/wavy-background';
import { BRAND } from '@/constants/brand';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

/**
 * Loading State for Chat Overview Page
 *
 * Matches ChatOverviewScreen.tsx:400-598 EXACTLY:
 * - WavyBackground included
 * - Actual logo shown
 * - Simple white/transparent skeletons (no heavy borders)
 * - Glass variant cards with border-0
 * - chatGlass.inputBox for input (not heavy card)
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatOverviewLoading() {
  return (
    <div className="absolute inset-0">
      {/* Background - fixed to viewport */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <WavyBackground containerClassName="h-full w-full" />
      </div>

      {/* Main content - scrollable with padding */}
      <div className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-6 pb-[180px]">
          {/* Hero Section */}
          <div className="py-6 sm:py-8">
            <div className="flex flex-col items-center gap-4 sm:gap-5 md:gap-6 text-center">
              {/* Logo - EXACT match to ChatOverviewScreen.tsx:427 */}
              <div className="relative h-20 w-20 xs:h-24 xs:w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36">
                <Image
                  src={BRAND.logos.main}
                  alt={`${BRAND.displayName} Logo`}
                  fill
                  sizes="(max-width: 480px) 80px, (max-width: 640px) 96px, (max-width: 768px) 112px, (max-width: 1024px) 128px, 144px"
                  className="object-contain drop-shadow-2xl"
                  priority
                />
              </div>

              {/* Title - White skeleton matching h1 text-white */}
              <Skeleton className="h-10 sm:h-12 md:h-14 lg:h-16 w-64 sm:w-80 md:w-96 bg-white/20" />

              {/* Subtitle - White skeleton matching p text-white/90 */}
              <Skeleton className="h-5 sm:h-6 md:h-7 w-48 sm:w-64 md:w-80 max-w-2xl bg-white/15" />
            </div>
          </div>

          {/* Quick Start Cards */}
          <div className="py-4">
            <div className="w-full relative z-20">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex min-w-0">
                    <Card
                      variant="glass"
                      className="p-3 sm:p-4 flex-1 flex flex-col min-w-0 gap-2 sm:gap-3 border-0"
                    >
                      {/* Title skeleton */}
                      <Skeleton className="h-4 sm:h-5 w-full bg-white/20" />

                      {/* Participants */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Skeleton className="size-4 rounded-full bg-white/15" />
                        <Skeleton className="h-3 w-16 bg-white/15" />
                        <Skeleton className="size-4 rounded-full bg-white/15" />
                        <Skeleton className="h-3 w-20 bg-white/15" />
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed input at bottom - matches content width */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-6 md:pb-8 w-full pointer-events-none">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 pointer-events-auto">
          <div className={cn(chatGlass.inputBox, 'rounded-lg shadow-2xl p-4')}>
            <Skeleton className="h-20 w-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
