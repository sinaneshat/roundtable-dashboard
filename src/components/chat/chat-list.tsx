'use client';
import { Loader2, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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
import { StaggerItem } from '@/components/ui/motion';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { StickyHeader } from '@/components/ui/sticky-header';

export type Chat = {
  id: string;
  title: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  messages: never[];
  isActive?: boolean;
  isFavorite?: boolean;
  isPublic?: boolean;
};
export type ChatGroup = {
  label: string;
  chats: Chat[];
};
// eslint-disable-next-line react-refresh/only-export-components -- Utility function closely related to ChatList component
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
type ChatListProps = {
  chatGroups: ChatGroup[];
  favorites: Chat[];
  onDeleteChat: (chatId: string) => void;
  searchTerm: string;
  deletingChatId?: string | null;
  isMobile?: boolean;
  onNavigate?: () => void;
  disableAnimations?: boolean;
};
const EMPTY_FAVORITES: Chat[] = [];

function ChatItem({
  chat,
  isActive,
  isDeleting,
  isMobile,
  onNavigate,
  onDeleteClick,
  disableAnimation,
}: {
  chat: Chat;
  isActive: boolean;
  isDeleting: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  onDeleteClick: (chat: Chat) => void;
  disableAnimation?: boolean;
}) {
  const t = useTranslations();
  const chatUrl = `/chat/${chat.slug}`;

  const content = (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        disabled={isDeleting}
      >
        <Link
          href={chatUrl}
          onClick={() => {
            if (isMobile && onNavigate) {
              onNavigate();
            }
          }}
        >
          <div
            className="truncate overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ maxWidth: '11rem' }}
          >
            {chat.title}
          </div>
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
        {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        <span className="sr-only">{t('chat.deleteChat')}</span>
      </SidebarMenuAction>
    </SidebarMenuItem>
  );

  if (disableAnimation) {
    return content;
  }

  return <StaggerItem>{content}</StaggerItem>;
}
export function ChatList({
  chatGroups,
  favorites = EMPTY_FAVORITES,
  onDeleteChat,
  searchTerm = '',
  deletingChatId,
  isMobile = false,
  onNavigate,
  disableAnimations = false,
}: ChatListProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  // Only animate on first render, then disable forever
  const shouldAnimate = !disableAnimations && !hasAnimated;

  useEffect(() => {
    if (!disableAnimations && !hasAnimated) {
      // Mark as animated after mount to prevent future animations
      // This intentional one-time state update controls animation behavior
      // Wrapped in queueMicrotask to defer state update after render
      queueMicrotask(() => {
        setHasAnimated(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount
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
      {favorites.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          {shouldAnimate
            ? (
                <motion.div
                  initial="initial"
                  animate="animate"
                  variants={{
                    initial: {},
                    animate: {
                      transition: {
                        staggerChildren: 0.03,
                        delayChildren: 0.1,
                      },
                    },
                  }}
                >
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
                          disableAnimation={false}
                        />
                      );
                    })}
                  </SidebarMenu>
                </motion.div>
              )
            : (
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
                        disableAnimation={true}
                      />
                    );
                  })}
                </SidebarMenu>
              )}
        </SidebarGroup>
      )}
      {chatGroups.map((group, groupIndex) => {
        const baseZIndex = favorites.length > 0 ? 11 : 10;
        const sectionZIndex = baseZIndex + groupIndex;
        return (
          <SidebarGroup key={group.label} className="group-data-[collapsible=icon]:hidden">
            <StickyHeader zIndex={sectionZIndex} className="pb-1">
              <SidebarGroupLabel className="h-9 px-2 text-xs uppercase tracking-wider font-medium text-muted-foreground">
                {shouldAnimate
                  ? (
                      <motion.span
                        className="truncate block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{ maxWidth: '13rem' }}
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
                    )
                  : (
                      <span
                        className="truncate block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                        style={{ maxWidth: '13rem' }}
                      >
                        {formatGroupLabel(group.label)}
                      </span>
                    )}
              </SidebarGroupLabel>
            </StickyHeader>
            {shouldAnimate
              ? (
                  <motion.div
                    initial="initial"
                    animate="animate"
                    variants={{
                      initial: {},
                      animate: {
                        transition: {
                          staggerChildren: 0.03,
                          delayChildren: (groupIndex * 0.05) + 0.15,
                        },
                      },
                    }}
                  >
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
                            disableAnimation={false}
                          />
                        );
                      })}
                    </SidebarMenu>
                  </motion.div>
                )
              : (
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
                          disableAnimation={true}
                        />
                      );
                    })}
                  </SidebarMenu>
                )}
          </SidebarGroup>
        );
      })}
      <AlertDialog open={!!chatToDelete} onOpenChange={open => !open && handleCancelDelete()}>
        <AlertDialogContent glass={true}>
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
