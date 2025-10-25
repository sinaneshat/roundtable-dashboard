'use client';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';

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
