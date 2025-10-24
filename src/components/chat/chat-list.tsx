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
import { cn } from '@/lib/ui/cn';

// ============================================================================
// Sidebar Types (Inline Component Types)
// ============================================================================

/**
 * Simplified thread representation for sidebar display
 * Transformed from API thread list responses
 */
export type Chat = {
  id: string;
  title: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  messages: never[]; // Always empty in sidebar context - messages loaded separately
  isActive?: boolean;
  isFavorite?: boolean;
  isPublic?: boolean;
};

/**
 * Time-based grouping structure for sidebar organization
 */
export type ChatGroup = {
  label: string;
  chats: Chat[];
};

/**
 * Group chats by time periods for sidebar organization
 * Groups by: Today, Yesterday, X days ago, X weeks ago
 * Max grouping is weeks (no months/years)
 */
export function groupChatsByPeriod(chats: Chat[]): ChatGroup[] {
  const now = Date.now();
  const groups = new Map<string, Chat[]>();

  chats.forEach((chat) => {
    const chatTime = chat.updatedAt.getTime();
    const diffMs = now - chatTime;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let label: string;

    if (diffDays < 1) {
      label = 'chat.today';
    } else if (diffDays === 1) {
      label = 'chat.yesterday';
    } else if (diffDays < 7) {
      label = `chat.daysAgo:${diffDays}`;
    } else {
      const weeks = Math.floor(diffDays / 7);
      label = `chat.weeksAgo:${weeks}`;
    }

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(chat);
  });

  return Array.from(groups.entries()).map(([label, chats]) => ({
    label,
    chats,
  }));
}

// ============================================================================
// Component Props
// ============================================================================

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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} disabled={isDeleting}>
        <Link
          href={chatUrl}
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
 * ChatList - Renders chat items in sidebar
 *
 * Features:
 * - Sticky timestamp headers for scroll visibility
 * - Grouped chats by time period
 * - Favorites section
 * - Delete confirmation dialog
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
