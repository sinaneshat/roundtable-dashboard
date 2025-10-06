'use client';

import { Loader2, Star, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
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
  searchTerm: string;
  deletingChatId?: string | null;
};

type StickyHeaderProps = {
  children: React.ReactNode;
  zIndex?: number;
};

// Stable default value to avoid infinite render loop
const EMPTY_FAVORITES: Chat[] = [];

// Helper to check if text would overflow (for tooltip)
// This is only used for determining if tooltip is needed, not for rendering
function wouldTextOverflow(text: string, maxWidth: number): boolean {
  // Always show tooltip on server-side to avoid hydration mismatch
  if (typeof window === 'undefined') {
    return true;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return true;
  }

  context.font = '14px Inter, system-ui, sans-serif';
  const textWidth = context.measureText(text).width;

  return textWidth > maxWidth;
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
  searchTerm = '',
  deletingChatId,
}: ChatListProps) {
  const pathname = usePathname();
  const t = useTranslations('chat');

  const renderChatItem = (chat: Chat) => {
    const chatUrl = `/chat/${chat.slug}`;
    const isActive = pathname === chatUrl;
    const isDeleting = deletingChatId === chat.id;

    // Check if text would overflow for tooltip (approximate check)
    // We use hardcoded max-width (11.5rem = 184px) for consistent truncation
    const isTruncated = chat.title.length > 25 || wouldTextOverflow(chat.title, 184);

    return (
      <SidebarMenuItem key={chat.id}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
              <Link
                href={chatUrl}
                className={cn(
                  'min-w-0',
                  isDeleting && 'pointer-events-none opacity-60',
                )}
              >
                <span className="truncate block max-w-[11.5rem]">{chat.title}</span>
              </Link>
            </SidebarMenuButton>
          </TooltipTrigger>
          {isTruncated && (
            <TooltipContent side="right" className="max-w-xs">
              <p className="break-words">{chat.title}</p>
            </TooltipContent>
          )}
        </Tooltip>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <SidebarMenuAction
              showOnHover
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDeleteChat(chat.id);
              }}
            >
              {isDeleting
                ? (
                    <Loader2 className="size-4 animate-spin" />
                  )
                : (
                    <Trash2 className="size-4" />
                  )}
              <span className="sr-only">{t('deleteChat')}</span>
            </SidebarMenuAction>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{t('deleteChat')}</p>
          </TooltipContent>
        </Tooltip>
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
                  {t(group.label.replace('chat.', ''))}
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
