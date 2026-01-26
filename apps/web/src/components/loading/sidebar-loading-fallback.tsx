import { SidebarThreadSkeletons } from '@/components/chat/chat-sidebar-skeleton';
import { NavUserSkeleton } from '@/components/skeletons';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

type SidebarLoadingFallbackProps = {
  count?: number;
  className?: string;
};

/**
 * SSR-first sidebar loading skeleton - matches AppSidebar structure exactly.
 * NO 'use client' directive - renders during SSR immediately.
 *
 * Uses shared skeleton components for consistency:
 * - NavUserSkeleton for footer user area
 * - SidebarThreadSkeletons for thread list
 */
export function SidebarLoadingFallback({
  className,
  count = 10,
}: SidebarLoadingFallbackProps) {
  return (
    <Sidebar collapsible="icon" variant="floating" className={className}>
      <SidebarHeader>
        {/* Logo + Trigger - Expanded (matches chat-nav.tsx:178-194) */}
        <div className="flex h-9 mb-2 items-center justify-between group-data-[collapsible=icon]:hidden">
          <div className="flex h-9 items-center rounded-md ps-3 pe-2">
            <Skeleton className="size-6 rounded-lg shrink-0" />
          </div>
          <Skeleton className="size-9 rounded-lg shrink-0" />
        </div>

        {/* Logo + Trigger - Collapsed (matches chat-nav.tsx:196-215) */}
        <div className="hidden h-10 mb-2 group-data-[collapsible=icon]:flex items-center justify-center relative">
          <Skeleton className="size-6 rounded-lg" />
        </div>

        {/* Action buttons (matches chat-nav.tsx:217-272) */}
        <SidebarMenu className="gap-1">
          {/* New Chat - Expanded */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex h-9 items-center gap-2.5 rounded-lg px-4 py-2">
              <Skeleton className="size-4 rounded shrink-0" />
              <Skeleton className="h-4 w-20" />
            </div>
          </SidebarMenuItem>

          {/* Search - Expanded */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex h-9 items-center gap-2.5 rounded-lg px-4 py-2">
              <Skeleton className="size-4 rounded shrink-0" />
              <Skeleton className="h-4 w-24" />
            </div>
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

      {/* Content area (matches chat-nav.tsx:274-369) */}
      <SidebarContent className="p-0 w-full min-w-0">
        <ScrollArea className="w-full h-full">
          <div className="flex flex-col w-full px-0.5">
            {/* Main chat list skeleton (matches loading state at chat-nav.tsx:299-308) */}
            <SidebarGroup className="pt-4 group-data-[collapsible=icon]:hidden">
              <SidebarGroupLabel className="px-4">
                <Skeleton className="h-4 w-16" />
              </SidebarGroupLabel>
              <SidebarThreadSkeletons count={count} animated />
            </SidebarGroup>
          </div>
        </ScrollArea>
      </SidebarContent>

      {/* Footer - NavUser (matches chat-nav.tsx:371-377) */}
      <SidebarFooter className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Use consolidated NavUserSkeleton */}
            <NavUserSkeleton className="group-data-[collapsible=icon]:hidden" />
            {/* Collapsed state */}
            <NavUserSkeleton collapsed className="hidden group-data-[collapsible=icon]:flex" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
