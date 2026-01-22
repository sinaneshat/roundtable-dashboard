import { SidebarCollapsibles, SidebarVariants } from '@roundtable/shared';

import { NavUserSkeleton, ThreadListItemSkeleton } from '@/components/skeletons';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
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

/**
 * FullSidebarSkeleton - Complete sidebar skeleton with proper wrapper
 *
 * Matches AppSidebar structure: Sidebar wrapper + header + content + footer.
 * Used as Suspense fallback to prevent layout shift during lazy loading.
 */
export function FullSidebarSkeleton() {
  return (
    <Sidebar collapsible={SidebarCollapsibles.ICON} variant={SidebarVariants.FLOATING}>
      <SidebarHeader>
        {/* Logo area skeleton - expanded state */}
        <div className="flex h-9 mb-2 items-center justify-between group-data-[collapsible=icon]:hidden">
          <div className="flex h-9 items-center rounded-md ps-3 pe-2">
            <div className="size-6 rounded bg-accent animate-pulse" />
          </div>
          <div className="min-h-11 min-w-11 shrink-0" />
        </div>

        {/* New chat + search button skeletons */}
        <SidebarMenu className="gap-1">
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuSkeleton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="p-0 w-full min-w-0">
        <div className="flex flex-col w-full px-0.5">
          <ChatSidebarSkeleton count={12} />
        </div>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavUserSkeleton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
