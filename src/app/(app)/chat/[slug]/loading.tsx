import { Card } from '@/components/ui/card';
import { AssistantMessageSkeleton, Skeleton, UserMessageSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

/**
 * Loading State for Chat Thread Page
 *
 * ✅ SERVER-SIDE RENDERING: Page loads with data, this skeleton shows during navigation/refresh
 * ✅ MATCHES ChatThreadScreen.tsx EXACTLY:
 *   - User message (right-aligned with avatar)
 *   - AI participant messages (left-aligned with avatars, roles, content cards)
 *   - Actions (retry button)
 *   - Analysis card skeleton (ChainOfThought accordion style)
 *   - Fixed input at bottom
 *
 * ✅ NO COMPONENT-LEVEL LOADING: All loading happens here, components render immediately with data
 * ✅ CLEAN SKELETONS: Simple white/transparent skeletons matching overview screen style
 */
export default function ChatThreadLoading() {
  return (
    <div className="relative min-h-svh flex flex-col">
      {/* Main content - window-level scrolling with dynamic padding for fixed input */}
      {/* ✅ MATCHES ChatThreadScreen.tsx:1053 - pb-32 for consistent spacing */}
      <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-0 pb-32 flex-1">
        <div className="space-y-6">
          {/* Round 1 */}
          <div className="space-y-3">
            {/* User Message - with header inside box */}
            <UserMessageSkeleton />

            {/* AI Participant Messages - with headers inside boxes */}
            {Array.from({ length: 2 }, (_, i) => (
              <AssistantMessageSkeleton key={i} />
            ))}

            {/* Analysis Card Skeleton - matches RoundAnalysisCard ChainOfThought style */}
            <div className="mt-6">
              <Card variant="glass" className="p-4 space-y-4 border-0">
                {/* Analysis header */}
                <div className="flex items-center gap-2">
                  <Skeleton className="size-4 rounded bg-white/15" />
                  <Skeleton className="h-4 w-32 bg-white/15" />
                  <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
                </div>

                {/* Leaderboard skeleton */}
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24 bg-white/15" />
                  <div className="space-y-1.5">
                    {Array.from({ length: 2 }, (_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Skeleton className="h-3 w-6 bg-white/10" />
                        <Skeleton className="h-3 w-full bg-white/10" />
                        <Skeleton className="h-3 w-12 bg-white/10" />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky input container - stays at bottom within content flow */}
      {/* ✅ MATCHES ChatThreadScreen.tsx:1262 - pt-6 pb-4 for consistent spacing */}
      <div className="sticky bottom-0 z-50 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-4 mt-auto">
        <div className="container max-w-3xl mx-auto px-4 sm:px-6">
          <div className={cn(chatGlass.inputBox, 'rounded-lg shadow-2xl p-4')}>
            <Skeleton className="h-20 w-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
