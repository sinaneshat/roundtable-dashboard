import { ChatSidebarSkeleton } from '@/components/chat/chat-sidebar-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

type SidebarLoadingFallbackProps = {
  count?: number;
  showFavorites?: boolean;
  className?: string;
};

/**
 * SidebarLoadingFallback
 *
 * Reusable sidebar loading state for Suspense boundaries
 * Used for chat sidebar and navigation areas
 *
 * Features:
 * - Sidebar-specific styling (width, border, background)
 * - Configurable skeleton count
 * - Optional favorites section
 * - Consistent with sidebar design
 *
 * Usage:
 * ```tsx
 * <Suspense fallback={<SidebarLoadingFallback count={10} />}>
 *   <AppSidebar />
 * </Suspense>
 * ```
 */
export function SidebarLoadingFallback({
  count = 10,
  showFavorites = false,
  className,
}: SidebarLoadingFallbackProps) {
  return (
    <div className={cn('w-[280px] border-r bg-sidebar', className)}>
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <ChatSidebarSkeleton count={count} showFavorites={showFavorites} />
      </div>
    </div>
  );
}
