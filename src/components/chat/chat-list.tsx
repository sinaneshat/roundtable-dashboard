'use client';

import { Loader2, Trash2 } from 'lucide-react';
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
import { useHoverPrefetch } from '@/hooks/utils';
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

// Stable default value to avoid infinite render loop
const EMPTY_FAVORITES: Chat[] = [];

/**
 * StickyHeader - Timestamp header that stays visible while scrolling
 */
function StickyHeader({ children, zIndex = 10 }: { children: React.ReactNode; zIndex?: number }) {
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

/**
 * ChatItem - Individual chat item component
 * Extracted to properly use React hooks (Rules of Hooks)
 */
function ChatItem({
  chat,
  isActive,
  isDeleting,
  isMobile,
  onNavigate,
  onDeleteClick,
}: {
  chat: Chat;
  isActive: boolean;
  isDeleting: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  onDeleteClick: (chat: Chat) => void;
}) {
  const t = useTranslations();
  const chatUrl = `/chat/${chat.slug}`;

  // ✅ OFFICIAL NEXT.JS PATTERN: Hover-based prefetch
  // Source: https://nextjs.org/docs/app/guides/prefetching
  // Pattern: "Defer Link Prefetching Until Hover in Next.js"
  // Exact implementation from official Next.js documentation with ZERO customizations
  const { prefetch, onMouseEnter } = useHoverPrefetch(chatUrl, {
    enabled: !isActive && !isDeleting,
  });

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
        <Link
          href={chatUrl}
          prefetch={prefetch}
          onMouseEnter={onMouseEnter}
          // ✅ OFFICIAL NEXT.JS PATTERN from documentation:
          // prefetch={false} initially - prevents automatic viewport prefetching
          // prefetch={null} on hover - enables default prefetch behavior
          // Official recommendation: "Use prefetch={false} for large link lists to avoid unnecessary usage of resources"
          // Reference: https://nextjs.org/docs/app/guides/prefetching
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
          onDeleteClick(chat);
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
}

/**
 * ChatList - Renders chat items in sidebar with optimized prefetching
 *
 * ✅ Sticky timestamp headers for scroll visibility
 * ✅ Matches frontend-patterns.md for list rendering
 * ✅ Next.js best practices for large lists: prefetch={false} + hover prefetch
 * ✅ Prevents excessive RSC calls from automatic viewport prefetching
 *
 * Prefetch Strategy (per Next.js docs):
 * - prefetch={false} on Link components (large list optimization)
 * - Manual router.prefetch() on hover (150ms debounced)
 * - Duplicate prevention (won't prefetch same route twice)
 * - Cancellable on mouse leave (prevents accidental prefetches)
 *
 * Reference: https://nextjs.org/docs/app/guides/prefetching
 * "Use prefetch={false} for large link lists to avoid unnecessary usage of resources"
 */
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

  return (
    <>
      {/* Favorites Section - No header, parent provides it */}
      {favorites.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            {favorites.map((chat) => {
              const chatUrl = `/chat/${chat.slug}`;
              const isActive = pathname === chatUrl;
              const isDeleting = deletingChatId === chat.id;

              return (
                <ChatItem
                  key={chat.id}
                  chat={chat}
                  isActive={isActive}
                  isDeleting={isDeleting}
                  isMobile={isMobile}
                  onNavigate={onNavigate}
                  onDeleteClick={handleDeleteClick}
                />
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      )}

      {/* Regular Chat Groups - WITH sticky timestamp headers */}
      {chatGroups.map((group, groupIndex) => {
        // Each subsequent section gets a higher z-index
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
                const chatUrl = `/chat/${chat.slug}`;
                const isActive = pathname === chatUrl;
                const isDeleting = deletingChatId === chat.id;

                return (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    isActive={isActive}
                    isDeleting={isDeleting}
                    isMobile={isMobile}
                    onNavigate={onNavigate}
                    onDeleteClick={handleDeleteClick}
                  />
                );
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
              {t('actions.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
