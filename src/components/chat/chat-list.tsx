'use client';

import { Loader2, Star, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { Chat, ChatGroup } from '@/lib/types/chat';
import { cn } from '@/lib/ui/cn';

type ChatListProps = {
  chatGroups: ChatGroup[];
  favorites: Chat[];
  onDeleteChat: (chatId: string) => void;
  searchTerm: string;
  deletingChatId?: string | null;
  isMobile?: boolean;
  onNavigate?: () => void;
};

type StickyHeaderProps = {
  children: React.ReactNode;
  zIndex?: number;
};

// Stable default value to avoid infinite render loop
const EMPTY_FAVORITES: Chat[] = [];

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
  isMobile = false,
  onNavigate,
}: ChatListProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  const handleDeleteClick = (chat: Chat) => {
    setChatToDelete(chat);
  };

  const handleConfirmDelete = () => {
    if (chatToDelete) {
      onDeleteChat(chatToDelete.id);
      setChatToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setChatToDelete(null);
  };

  // Helper to format group labels (handles dynamic labels like "daysAgo:3")
  const formatGroupLabel = (label: string) => {
    if (label.includes(':')) {
      const [key, value] = label.split(':');
      if (!key || !value) {
        return t(label.replace('chat.', 'chat.'));
      }

      const translationKey = key.replace('chat.', '');

      if (translationKey === 'daysAgo') {
        return `${value} days ago`;
      }
      if (translationKey === 'weeksAgo') {
        const weeks = Number.parseInt(value, 10);
        return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
      }
    }

    return t(label.replace('chat.', 'chat.'));
  };

  const renderChatItem = (chat: Chat, globalIndex: number) => {
    const chatUrl = `/chat/${chat.slug}`;
    const isActive = pathname === chatUrl;
    const isDeleting = deletingChatId === chat.id;
    // Only prefetch first 3 chats to prevent memory leaks
    const shouldPrefetch = globalIndex < 3;

    return (
      <SidebarMenuItem key={chat.id}>
        <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
          <Link
            href={chatUrl}
            prefetch={shouldPrefetch}
            className={cn(
              'min-w-0',
              isDeleting && 'pointer-events-none opacity-60',
            )}
            onClick={() => {
              if (isMobile && onNavigate) {
                onNavigate();
              }
            }}
          >
            <span className="truncate block max-w-[180px]">{chat.title}</span>
          </Link>
        </SidebarMenuButton>
        <SidebarMenuAction
          showOnHover
          disabled={isDeleting}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDeleteClick(chat);
          }}
        >
          {isDeleting
            ? (
                <Loader2 className="size-4 animate-spin" />
              )
            : (
                <Trash2 className="size-4" />
              )}
          <span className="sr-only">{t('chat.deleteChat')}</span>
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  };

  // Show empty state when no results from search
  if (searchTerm && chatGroups.length === 0 && favorites.length === 0) {
    return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('chat.noResults')}</p>
          <p className="text-xs text-muted-foreground">{t('chat.noResultsDescription')}</p>
        </div>
      </SidebarGroup>
    );
  }

  // Track global index for prefetching (only first 3 items total)
  let globalIndex = 0;

  return (
    <>
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
                {t('chat.favorites')}
              </motion.span>
            </SidebarGroupLabel>
          </StickyHeader>
          <SidebarMenu>
            {favorites.map((chat) => {
              const item = renderChatItem(chat, globalIndex);
              globalIndex++;
              return item;
            })}
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
                  {formatGroupLabel(group.label)}
                </motion.span>
              </SidebarGroupLabel>
            </StickyHeader>
            <SidebarMenu>
              {group.chats.map((chat) => {
                const item = renderChatItem(chat, globalIndex);
                globalIndex++;
                return item;
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!chatToDelete} onOpenChange={open => !open && handleCancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.deleteThreadConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.deleteThreadConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('chat.deleteThread')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
