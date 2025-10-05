'use client';

import { Globe, Loader2, Lock, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Chat, ChatGroup } from '@/lib/types/chat';
import { cn } from '@/lib/ui/cn';

type ChatListProps = {
  chatGroups: ChatGroup[];
  favorites: Chat[];
  onDeleteChat: (chatId: string) => void;
  onToggleFavorite: (chatId: string) => void;
  onTogglePublic?: (chatId: string) => void;
  searchTerm: string;
  deletingChatId?: string | null;
  favoritingChatId?: string | null;
  updatingPublicChatId?: string | null;
};

type StickyHeaderProps = {
  children: React.ReactNode;
  zIndex?: number;
};

// Stable default value to avoid infinite render loop
const EMPTY_FAVORITES: Chat[] = [];

// Truncate text based on max width - pure function to avoid Rules of Hooks violations in map()
function truncateText(text: string, maxWidth: number): string {
  // Create a temporary canvas for measuring text (client-side only)
  if (typeof window === 'undefined') {
    return text;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text;
  }

  // Match the font style from sidebar
  context.font = '14px Inter, system-ui, sans-serif';

  const textWidth = context.measureText(text).width;

  if (textWidth <= maxWidth) {
    return text;
  }

  // Binary search for optimal truncation point
  let left = 0;
  let right = text.length;
  let result = text;

  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    const testText = `${text.slice(0, mid)}...`;
    const testWidth = context.measureText(testText).width;

    if (testWidth <= maxWidth) {
      result = testText;
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

function StickyHeader({ children, zIndex = 10 }: StickyHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      ref={headerRef}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 500,
        damping: 40,
      }}
      style={{
        position: 'sticky',
        top: 0,
        zIndex,
      }}
      className="bg-sidebar"
    >
      {children}
    </motion.div>
  );
}

export function ChatList({
  chatGroups,
  favorites = EMPTY_FAVORITES,
  onDeleteChat,
  onToggleFavorite,
  onTogglePublic,
  searchTerm = '',
  deletingChatId,
  favoritingChatId,
  updatingPublicChatId,
}: ChatListProps) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const t = useTranslations('chat');

  const renderChatItem = (chat: Chat) => {
    const chatUrl = `/chat/${chat.slug}`;
    const isActive = pathname === chatUrl;
    const isDeleting = deletingChatId === chat.id;
    const isFavoriting = favoritingChatId === chat.id;
    const isUpdatingPublic = updatingPublicChatId === chat.id;
    const isLoading = isDeleting || isFavoriting || isUpdatingPublic;

    // Truncate text based on sidebar width (16rem = 256px)
    // Account for padding, margins, and action button (~160px available for text)
    const truncatedTitle = truncateText(chat.title, 160);
    const isTruncated = truncatedTitle !== chat.title;

    return (
      <SidebarMenuItem key={chat.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild isActive={isActive} disabled={isLoading}>
              <Link
                href={chatUrl}
                className={cn(
                  isLoading && 'pointer-events-none opacity-60',
                )}
              >
                <span>{truncatedTitle}</span>
              </Link>
            </SidebarMenuButton>
          </TooltipTrigger>
          {isTruncated && (
            <TooltipContent side="right" className="max-w-xs">
              <p>{chat.title}</p>
            </TooltipContent>
          )}
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover disabled={isLoading}>
              {isLoading
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <MoreHorizontal className="size-4" />
                  )}
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-48 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align={isMobile ? 'end' : 'start'}
          >
            <DropdownMenuItem
              onClick={() => onToggleFavorite(chat.id)}
              disabled={isFavoriting}
            >
              {isFavoriting
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Star className={chat.isFavorite ? 'size-4 fill-yellow-500 text-yellow-500' : 'size-4'} />
                  )}
              <span>{chat.isFavorite ? t('removeFromFavorites') : t('addToFavorites')}</span>
            </DropdownMenuItem>
            {onTogglePublic && (
              <DropdownMenuItem
                onClick={() => onTogglePublic(chat.id)}
                disabled={isUpdatingPublic}
              >
                {isUpdatingPublic
                  ? (
                      <Loader2 className="size-4 animate-spin" />
                    )
                  : chat.isPublic
                    ? (
                        <Lock className="size-4" />
                      )
                    : (
                        <Globe className="size-4" />
                      )}
                <span>{chat.isPublic ? t('makePrivate') : t('makePublic')}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteChat(chat.id)}
              variant="destructive"
              disabled={isDeleting}
            >
              {isDeleting
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Trash2 className="size-4" />
                  )}
              <span>{t('deleteChat')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  };

  // Show empty state when no results from search
  if (searchTerm && chatGroups.length === 0 && favorites.length === 0) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('noResults')}</p>
          <p className="text-xs text-muted-foreground">{t('noResultsDescription')}</p>
        </div>
      </SidebarGroup>
    );
  }

  return (
    <TooltipProvider>
      {/* Favorites Section */}
      {favorites.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <StickyHeader zIndex={10}>
            <SidebarGroupLabel className="flex items-center gap-2 py-2.5 px-2">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 40,
                  delay: 0.05,
                }}
              >
                <Star className="size-4 fill-yellow-500 text-yellow-500" />
              </motion.div>
              <motion.span
                initial={{ x: -10, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 40,
                  delay: 0.1,
                }}
              >
                {t('favorites')}
              </motion.span>
            </SidebarGroupLabel>
          </StickyHeader>
          <SidebarMenu>
            {favorites.map(chat => renderChatItem(chat))}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Regular Chat Groups */}
      {chatGroups.map((group, groupIndex) => {
        // Each subsequent section gets a higher z-index
        // This ensures later headers push earlier ones out when scrolling
        const baseZIndex = favorites.length > 0 ? 11 : 10;
        const sectionZIndex = baseZIndex + groupIndex;

        return (
          <SidebarGroup key={group.label} className="group-data-[collapsible=icon]:hidden">
            <StickyHeader zIndex={sectionZIndex}>
              <SidebarGroupLabel className="py-2.5 px-2">
                <motion.span
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 40,
                    delay: (groupIndex * 0.05) + 0.1,
                  }}
                >
                  {group.label}
                </motion.span>
              </SidebarGroupLabel>
            </StickyHeader>
            <SidebarMenu>
              {group.chats.map(chat => renderChatItem(chat))}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </TooltipProvider>
  );
}
