import type { ComponentProps } from 'react';

import { cn } from '@/lib/ui/cn';

import { ChatInputSkeleton } from './chat-input-skeleton';
import { LogoAreaSkeleton } from './logo-area-skeleton';
import { QuickStartSkeleton } from './quick-start-skeleton';

/**
 * MainContentSkeleton - Chat overview/new chat loading skeleton
 *
 * Matches ChatOverviewScreen initial UI layout EXACTLY for seamless transition.
 * Container max-w-4xl matches actual content for consistent width.
 *
 * Uses shared skeleton components for maximum reusability and single source of truth.
 */
export function MainContentSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-col relative flex-1', className)} {...props}>
      <div className="flex-1 relative">
        {/* Match: container max-w-4xl mx-auto px-5 md:px-6 pt-6 sm:pt-8 pb-4 */}
        <div className="container max-w-4xl mx-auto px-5 md:px-6 relative flex flex-col items-center pt-6 sm:pt-8 pb-4">
          <div className="w-full">
            <div className="flex flex-col items-center gap-4 sm:gap-6 text-center relative">
              {/* Logo area - uses shared LogoAreaSkeleton */}
              <LogoAreaSkeleton size="large" showTitle showTagline />

              {/* Quick start: w-full mt-6 sm:mt-8 */}
              <div className="w-full mt-6 sm:mt-8">
                <div className="rounded-2xl bg-card/50 overflow-hidden">
                  <QuickStartSkeleton count={4} />
                </div>
              </div>

              {/* Input container: w-full mt-14 - uses shared ChatInputSkeleton */}
              <div className="w-full mt-14">
                <ChatInputSkeleton showHeader showToolbar />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
