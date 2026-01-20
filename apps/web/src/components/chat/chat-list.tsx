import { Link } from '@tanstack/react-router';
import { motion } from 'motion/react';
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatRenameForm } from '@/components/chat/chat-rename-form';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import { TypewriterTitle } from '@/components/chat/typewriter-title';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StaggerItem } from '@/components/ui/motion';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useToggleFavoriteMutation, useUpdateThreadMutation } from '@/hooks/mutations';
import { useCurrentPathname } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import type { ChatSidebarItem } from '@/services/api';

function isChatActive(chat: ChatSidebarItem, pathname: string): boolean {
  const currentSlugUrl = `/chat/${chat.slug}`;
  const previousSlugUrl = chat.previousSlug ? `/chat/${chat.previousSlug}` : null;
  return pathname === currentSlugUrl || (previousSlugUrl !== null && pathname === previousSlugUrl);
}

type ChatListProps = {
  chats: ChatSidebarItem[];
  disableAnimations?: boolean;
  /** Share click handler - lifted to parent to survive remounts */
  onShareClick: (chat: ChatSidebarItem) => void;
};

type ChatItemProps = {
  chat: ChatSidebarItem;
  isActive: boolean;
  onDeleteClick: (chat: ChatSidebarItem) => void;
  onPinClick: (chat: ChatSidebarItem) => void;
  onRenameClick: (chat: ChatSidebarItem) => void;
  onShareClick: (chat: ChatSidebarItem) => void;
  isEditing: boolean;
  isRenaming: boolean;
  onRenameSubmit: (chat: ChatSidebarItem, newTitle: string) => void;
  onRenameCancel: () => void;
  disableAnimation?: boolean;
};

function ChatItem({
  chat,
  isActive,
  onDeleteClick,
  onPinClick,
  onRenameClick,
  onShareClick,
  isEditing,
  isRenaming,
  onRenameSubmit,
  onRenameCancel,
  disableAnimation,
}: ChatItemProps) {
  const t = useTranslations();
  const chatUrl = `/chat/${chat.slug}`;

  const handleRenameFormSubmit = useCallback((title: string) => {
    onRenameSubmit(chat, title);
  }, [chat, onRenameSubmit]);

  const content = (
    <SidebarMenuItem>
      {isEditing
        ? (
            <ChatRenameForm
              initialTitle={chat.title ?? ''}
              onSubmit={handleRenameFormSubmit}
              onCancel={onRenameCancel}
              isPending={isRenaming}
            />
          )
        : (
            <SidebarMenuButton
              asChild
              isActive={isActive}
            >
              <Link
                to={chatUrl}
                preload="intent"
              >
                <div
                  className="truncate overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ maxWidth: '13rem' }}
                >
                  <TypewriterTitle threadId={chat.id} currentTitle={chat.title ?? ''} />
                </div>
              </Link>
            </SidebarMenuButton>
          )}
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover>
              <Icons.moreHorizontal className="size-4" />
              <span className="sr-only">{t('actions.more')}</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <ChatThreadMenuItems
              onRename={() => onRenameClick(chat)}
              onPin={() => onPinClick(chat)}
              onShare={() => onShareClick(chat)}
              onDelete={() => onDeleteClick(chat)}
              isFavorite={!!chat.isFavorite}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </SidebarMenuItem>
  );

  if (disableAnimation) {
    return content;
  }

  return <StaggerItem>{content}</StaggerItem>;
}

export function ChatList({
  chats,
  disableAnimations = false,
  onShareClick,
}: ChatListProps) {
  const pathname = useCurrentPathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const [chatToDelete, setChatToDelete] = useState<ChatSidebarItem | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  const hasTriggeredAnimationRef = useRef(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  // Disable stagger animations on SSR - StaggerItem uses opacity:0 initial state
  // which makes items invisible until client-side animation runs
  const isServer = typeof window === 'undefined';
  const shouldAnimate = !isServer && !disableAnimations && !hasAnimated;

  // Auto-close sidebar on mobile when navigating to a thread
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (isMobile && pathname !== prevPathnameRef.current) {
      setOpenMobile(false);
    }
    prevPathnameRef.current = pathname;
  }, [pathname, isMobile, setOpenMobile]);

  useLayoutEffect(() => {
    if (!disableAnimations && !hasTriggeredAnimationRef.current) {
      hasTriggeredAnimationRef.current = true;
      startTransition(() => setHasAnimated(true));
    }
  }, [disableAnimations]);

  const handleDeleteClick = useCallback((chat: ChatSidebarItem) => {
    setChatToDelete(chat);
  }, []);

  const handlePinClick = useCallback((chat: ChatSidebarItem) => {
    toggleFavoriteMutation.mutate({
      threadId: chat.id,
      isFavorite: !chat.isFavorite,
      slug: chat.slug ?? undefined,
    });
  }, [toggleFavoriteMutation]);

  const handleRenameClick = useCallback((chat: ChatSidebarItem) => {
    setEditingChatId(chat.id);
  }, []);

  const handleRenameSubmit = useCallback((chat: ChatSidebarItem, newTitle: string) => {
    // Don't exit edit mode yet - stay in edit mode with loading state
    updateThreadMutation.mutate(
      {
        param: { id: chat.id },
        json: { title: newTitle },
      },
      {
        onSettled: () => {
          // Exit edit mode after mutation completes (success or error)
          setEditingChatId(null);
        },
      },
    );
  }, [updateThreadMutation]);

  const handleRenameCancel = useCallback(() => {
    // Only allow cancel if not currently renaming
    if (!updateThreadMutation.isPending) {
      setEditingChatId(null);
    }
  }, [updateThreadMutation.isPending]);

  const handleDeleteDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setChatToDelete(null);
    }
  }, []);

  if (chats.length === 0) {
    return null;
  }

  // Unified structure to prevent hydration mismatch
  // Animation is controlled via variants, not conditional wrapper
  return (
    <>
      <motion.div
        initial={shouldAnimate ? 'initial' : false}
        animate={shouldAnimate ? 'animate' : false}
        variants={{
          initial: {},
          animate: {
            transition: {
              staggerChildren: 0.02,
              delayChildren: 0.05,
            },
          },
        }}
      >
        <SidebarMenu>
          {chats.map((chat) => {
            const isActive = isChatActive(chat, pathname);
            const isThisChatEditing = editingChatId === chat.id;
            return (
              <ChatItem
                key={isThisChatEditing ? `${chat.id}-editing` : chat.id}
                chat={chat}
                isActive={isActive}
                onDeleteClick={handleDeleteClick}
                onPinClick={handlePinClick}
                onRenameClick={handleRenameClick}
                onShareClick={onShareClick}
                isEditing={isThisChatEditing}
                isRenaming={isThisChatEditing && updateThreadMutation.isPending}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
                disableAnimation={!shouldAnimate}
              />
            );
          })}
        </SidebarMenu>
      </motion.div>
      <ChatDeleteDialog
        isOpen={!!chatToDelete}
        onOpenChange={handleDeleteDialogClose}
        threadId={chatToDelete?.id ?? ''}
        threadSlug={chatToDelete?.slug ?? undefined}
        redirectIfCurrent={true}
      />
    </>
  );
}
