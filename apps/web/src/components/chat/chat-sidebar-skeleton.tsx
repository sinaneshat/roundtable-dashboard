import { ThreadListItemSkeleton } from '@/components/skeletons';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';

/**
 * SidebarThreadSkeletons - Thread list skeleton items for sidebar
 *
 * Re-exports ThreadListItemSkeleton with sidebar-specific styling.
 * Used in SidebarLoadingFallback for consistent loading states.
 */
export function SidebarThreadSkeletons({
  count = 7,
  animated = false,
  className,
}: {
  count?: number;
  animated?: boolean;
  className?: string;
}) {
  return (
    <ThreadListItemSkeleton
      count={count}
      animated={animated}
      className={className ?? 'px-2'}
    />
  );
}

/**
 * ChatSidebarSkeleton - Full sidebar content skeleton
 *
 * Matches the sidebar structure with optional favorites section.
 */
export function ChatSidebarSkeleton({
  count = 15,
  showFavorites = false,
}: {
  count?: number;
  showFavorites?: boolean;
}) {
  return (
    <>
      {showFavorites && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="flex items-center gap-2 py-2.5 px-2">
            <div className="h-4 w-4 rounded bg-accent animate-pulse" />
            <div className="h-4 w-20 rounded bg-accent animate-pulse" />
          </SidebarGroupLabel>
          <SidebarMenu>
            {Array.from({ length: 3 }, (_, i) => (
              <SidebarMenuItem key={`fav-skeleton-${i}`}>
                <SidebarMenuSkeleton />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="py-2.5 px-2">
          <div className="h-4 w-16 rounded bg-accent animate-pulse" />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: count }, (_, i) => (
            <SidebarMenuItem key={`skeleton-${i}`}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}

/**
 * ChatSidebarPaginationSkeleton - Pagination area skeleton
 */
export function ChatSidebarPaginationSkeleton({ count = 20 }: { count?: number }) {
  return (
    <div className="px-2 my-2">
      <SidebarMenu>
        {Array.from({ length: count }, (_, i) => (
          <SidebarMenuItem key={`pagination-skeleton-${i}`}>
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </div>
  );
}
