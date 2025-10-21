import { ChatSidebarSkeleton } from '@/components/chat/chat-sidebar-skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

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
 * - Exact structural match with AppSidebar using shadcn Sidebar components
 * - Matches actual spacing: SidebarHeader with menu items, SidebarContent with px-2 py-2
 * - Uses actual Sidebar component (auto-handles width via CSS variables)
 * - Configurable skeleton count
 * - Optional favorites section
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
    <Sidebar collapsible="icon" className={className}>
      {/* ✅ EXACT MATCH: SidebarHeader with SidebarMenu structure */}
      <SidebarHeader>
        <SidebarMenu>
          {/* Brand logo skeleton - matches SidebarMenuItem with size="lg" button */}
          <SidebarMenuItem>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>

          {/* New Chat button skeleton */}
          <SidebarMenuItem>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Search bar skeleton - matches the actual search button structure */}
        <div className="px-2 py-2">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </SidebarHeader>

      {/* ✅ EXACT MATCH: SidebarContent with p-0 className */}
      <SidebarContent className="p-0">
        <ScrollArea className="h-full w-full">
          {/* ✅ EXACT MATCH: px-2 py-2 space-y-2 container */}
          <div className="px-2 py-2 space-y-2">
            {/* Chat list skeletons */}
            <ChatSidebarSkeleton count={count} showFavorites={showFavorites} />
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}
