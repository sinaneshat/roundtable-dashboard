import { ChatSidebarSkeleton } from '@/components/chat/chat-sidebar-skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
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
 * Reusable sidebar loading state for Suspense boundaries.
 * Exact structural match with AppSidebar - same width, spacing, padding.
 */
export function SidebarLoadingFallback({
  count = 10,
  showFavorites = false,
  className,
}: SidebarLoadingFallbackProps) {
  return (
    <Sidebar collapsible="icon" variant="floating" className={className}>
      <SidebarHeader>
        <SidebarMenu className="gap-1">
          {/* Logo - Expanded (matches SidebarMenuButton size="lg" !h-10) */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden mb-2">
            <div className="flex items-center gap-2.5 px-2 h-10">
              <Skeleton className="size-7 rounded-lg shrink-0" />
              <Skeleton className="h-4 w-24" />
            </div>
          </SidebarMenuItem>

          {/* Logo - Collapsed */}
          <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex mb-2 items-center justify-center">
            <Skeleton className="size-8 rounded-lg" />
          </SidebarMenuItem>

          {/* New Chat - Expanded */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>

          {/* Search - Expanded */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>

          {/* New Chat - Collapsed */}
          <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
            <div className="flex size-10 items-center justify-center">
              <Skeleton className="size-4 rounded" />
            </div>
          </SidebarMenuItem>

          {/* Search - Collapsed */}
          <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
            <div className="flex size-10 items-center justify-center">
              <Skeleton className="size-4 rounded" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="p-0 w-full min-w-0">
        <ScrollArea className="w-full h-full">
          <div className="flex flex-col w-full">
            <SidebarGroup className="group-data-[collapsible=icon]:hidden">
              <ChatSidebarSkeleton count={count} showFavorites={showFavorites} />
            </SidebarGroup>
          </div>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="gap-2">
        {/* Plan CTA - Expanded */}
        <div className="group-data-[collapsible=icon]:hidden flex items-center gap-3 rounded-xl bg-accent px-3 py-2.5">
          <Skeleton className="size-8 rounded-full shrink-0" />
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>

        {/* Plan CTA - Collapsed */}
        <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuItem>
            <div className="flex size-10 items-center justify-center">
              <Skeleton className="size-4 rounded" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* NavUser skeleton */}
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5 w-full">
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
