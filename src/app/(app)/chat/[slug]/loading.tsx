import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

/**
 * Loading State for Chat Thread Page
 *
 * Matches ChatThreadScreen.tsx:322-500 EXACTLY:
 * - Simple message layout (no WavyBackground here)
 * - User message on right
 * - Assistant messages on left with avatars
 * - chatGlass.inputBox for input
 *
 * Pattern: Next.js App Router loading.tsx convention
 */
export default function ChatThreadLoading() {
  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      {/* Content - EXACT match to ChatThreadScreen.tsx:700 */}
      <div className="mx-auto max-w-3xl px-4 pt-20 pb-32 space-y-4">
        {/* User Message Skeleton - matches Message from="user" layout */}
        <div className="flex items-start gap-3 justify-end">
          <div className="flex flex-col gap-2 max-w-[80%]">
            {/* User message bubble - simple, no heavy styling */}
            <div className="rounded-2xl bg-primary/10 p-4 space-y-2">
              <Skeleton className="h-4 w-full bg-white/20" />
              <Skeleton className="h-4 w-3/4 bg-white/20" />
            </div>
          </div>
          {/* User avatar */}
          <Avatar className="size-10 shrink-0">
            <AvatarFallback>
              <Skeleton className="size-10 rounded-full bg-white/10" />
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Assistant Message Skeletons - matches ModelMessageCard layout */}
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-start gap-3">
            {/* Model avatar */}
            <Avatar className="size-10 shrink-0">
              <AvatarFallback>
                <Skeleton className="size-10 rounded-full bg-white/10" />
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {/* Model name and role */}
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-32 bg-white/15" />
                <Skeleton className="h-4 w-20 bg-white/15" />
              </div>

              {/* Message content - simple card without heavy borders */}
              <div className="rounded-2xl bg-card/50 backdrop-blur-sm border border-white/10 p-4 space-y-3">
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-full bg-white/10" />
                <Skeleton className="h-4 w-5/6 bg-white/10" />
                <Skeleton className="h-4 w-4/6 bg-white/10" />
              </div>

              {/* Message actions */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded bg-white/10" />
                <Skeleton className="size-6 rounded bg-white/10" />
                <Skeleton className="size-6 rounded bg-white/10" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chat Input - EXACT match to ChatThreadScreen.tsx:840 using chatGlass.inputBox */}
      <div className="fixed bottom-0 left-0 right-0 z-20 pb-6 md:left-[var(--sidebar-width-icon)] md:pr-2 md:pb-8">
        <div className="mx-auto max-w-3xl px-4">
          {/* Using chatGlass.inputBox from chat-input.tsx:87 */}
          <div className={cn(chatGlass.inputBox, 'rounded-lg shadow-2xl p-4')}>
            <Skeleton className="h-20 w-full bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
