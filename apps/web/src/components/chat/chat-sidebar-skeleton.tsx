import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/ui/cn';

const SIDEBAR_SKELETON_WIDTHS = ['70%', '55%', '85%', '45%', '65%', '78%', '52%', '62%', '48%', '73%', '58%', '80%', '42%', '67%', '54%'];
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
    <div
      className={cn(
        'flex flex-col gap-3 px-2 pointer-events-none select-none',
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        const widthIndex = i % SIDEBAR_SKELETON_WIDTHS.length;
        const opacity = i < 4 ? 1 : i < 5 ? 0.7 : i < 6 ? 0.5 : 0.3;

        return (
          <div
            key={`thread-skeleton-${i}`}
            className={cn(
              'h-5 rounded-full bg-muted/40',
              animated && 'animate-pulse',
            )}
            style={{
              width: SIDEBAR_SKELETON_WIDTHS[widthIndex],
              opacity,
            }}
          />
        );
      })}
    </div>
  );
}

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
