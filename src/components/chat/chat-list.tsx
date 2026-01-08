'use client';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { ChatSidebarItem } from '@/api/routes/chat/schema';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatThreadMenuItems } from '@/components/chat/chat-thread-menu-items';
import { ShareDialog } from '@/components/chat/share-dialog';
import { Icons } from '@/components/icons';
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
} from '@/components/ui/sidebar';
import { useToggleFavoriteMutation, useTogglePublicMutation, useUpdateThreadMutation } from '@/hooks/mutations';
import { useCurrentPathname } from '@/hooks/utils';

function isChatActive(chat: ChatSidebarItem, pathname: string): boolean {
  const currentSlugUrl = `/chat/${chat.slug}`;
  const previousSlugUrl = chat.previousSlug ? `/chat/${chat.previousSlug}` : null;
  return pathname === currentSlugUrl || (previousSlugUrl !== null && pathname === previousSlugUrl);
}

type ChatListProps = {
  chats: ChatSidebarItem[];
  disableAnimations?: boolean;
};

type ChatItemProps = {
  chat: ChatSidebarItem;
  isActive: boolean;
  onDeleteClick: (chat: ChatSidebarItem) => void;
  onPinClick: (chat: ChatSidebarItem) => void;
  onRenameClick: (chat: ChatSidebarItem) => void;
  onShareClick: (chat: ChatSidebarItem) => void;
  isEditing: boolean;
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
  onRenameSubmit,
  onRenameCancel,
  disableAnimation,
}: ChatItemProps) {
  const t = useTranslations();
  const chatUrl = `/chat/${chat.slug}`;
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  const [editValue, setEditValue] = useState(chat.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleMouseEnter = useCallback(() => setShouldPrefetch(true), []);

  useLayoutEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== chat.title) {
        onRenameSubmit(chat, trimmed);
      } else {
        onRenameCancel();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onRenameCancel();
    }
  }, [editValue, chat, onRenameSubmit, onRenameCancel]);

  const handleBlur = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== chat.title) {
      onRenameSubmit(chat, trimmed);
    } else {
      onRenameCancel();
    }
  }, [editValue, chat, onRenameSubmit, onRenameCancel]);

  const content = (
    <SidebarMenuItem>
      {isEditing
        ? (
            <div className="flex h-9 w-full min-w-0 items-center gap-2.5 rounded-full bg-accent px-4 py-2 text-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className="w-full min-w-0 bg-transparent text-sm outline-none border-0 p-0 truncate caret-foreground placeholder:text-muted-foreground"
                style={{ maxWidth: '13rem' }}
                aria-label={t('chat.renameConversation')}
              />
            </div>
          )
        : (
            <SidebarMenuButton
              asChild
              isActive={isActive}
            >
              <Link
                href={chatUrl}
                prefetch={shouldPrefetch ? null : false}
                onMouseEnter={handleMouseEnter}
              >
                <div
                  className="truncate overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ maxWidth: '13rem' }}
                >
                  {chat.title}
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
}: ChatListProps) {
  const t = useTranslations();
  const pathname = useCurrentPathname();
  const [chatToDelete, setChatToDelete] = useState<ChatSidebarItem | null>(null);
  const [chatToShare, setChatToShare] = useState<ChatSidebarItem | null>(null);
  const [chatToMakePublic, setChatToMakePublic] = useState<ChatSidebarItem | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  const hasTriggeredAnimationRef = useRef(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const shouldAnimate = !disableAnimations && !hasAnimated;

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
      slug: chat.slug,
    });
  }, [toggleFavoriteMutation]);

  const handleRenameClick = useCallback((chat: ChatSidebarItem) => {
    setEditingChatId(chat.id);
  }, []);

  const handleRenameSubmit = useCallback((chat: ChatSidebarItem, newTitle: string) => {
    setEditingChatId(null);
    updateThreadMutation.mutate({
      param: { id: chat.id },
      json: { title: newTitle },
    });
  }, [updateThreadMutation]);

  const handleRenameCancel = useCallback(() => {
    setEditingChatId(null);
  }, []);

  const handleShareClick = useCallback((chat: ChatSidebarItem) => {
    if (chat.isPublic) {
      // Already public, open share dialog directly
      setChatToShare(chat);
    } else {
      // Not public, show confirmation first
      setChatToMakePublic(chat);
    }
  }, []);

  const handleDeleteDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setChatToDelete(null);
    }
  }, []);

  const handleShareDialogClose = useCallback((open: boolean) => {
    if (!open && !togglePublicMutation.isPending) {
      setChatToShare(null);
    }
  }, [togglePublicMutation.isPending]);

  const handleMakePublicConfirm = useCallback(() => {
    if (chatToMakePublic) {
      togglePublicMutation.mutate(
        {
          threadId: chatToMakePublic.id,
          isPublic: true,
          slug: chatToMakePublic.slug,
        },
        {
          onSuccess: () => {
            // After making public, open the share dialog
            setChatToShare(chatToMakePublic);
            setChatToMakePublic(null);
          },
        },
      );
    }
  }, [chatToMakePublic, togglePublicMutation]);

  const handleMakePublicDialogClose = useCallback((open: boolean) => {
    if (!open && !togglePublicMutation.isPending) {
      setChatToMakePublic(null);
    }
  }, [togglePublicMutation.isPending]);

  const handleMakePrivate = useCallback(() => {
    if (chatToShare) {
      togglePublicMutation.mutate(
        {
          threadId: chatToShare.id,
          isPublic: false,
          slug: chatToShare.slug,
        },
        {
          onSuccess: () => {
            setChatToShare(null);
          },
        },
      );
    }
  }, [chatToShare, togglePublicMutation]);

  if (chats.length === 0) {
    return null;
  }

  return (
    <>
      {shouldAnimate
        ? (
            <motion.div
              initial="initial"
              animate="animate"
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
                  return (
                    <ChatItem
                      key={editingChatId === chat.id ? `${chat.id}-editing` : chat.id}
                      chat={chat}
                      isActive={isActive}
                      onDeleteClick={handleDeleteClick}
                      onPinClick={handlePinClick}
                      onRenameClick={handleRenameClick}
                      onShareClick={handleShareClick}
                      isEditing={editingChatId === chat.id}
                      onRenameSubmit={handleRenameSubmit}
                      onRenameCancel={handleRenameCancel}
                      disableAnimation={false}
                    />
                  );
                })}
              </SidebarMenu>
            </motion.div>
          )
        : (
            <SidebarMenu>
              {chats.map((chat) => {
                const isActive = isChatActive(chat, pathname);
                return (
                  <ChatItem
                    key={editingChatId === chat.id ? `${chat.id}-editing` : chat.id}
                    chat={chat}
                    isActive={isActive}
                    onDeleteClick={handleDeleteClick}
                    onPinClick={handlePinClick}
                    onRenameClick={handleRenameClick}
                    onShareClick={handleShareClick}
                    isEditing={editingChatId === chat.id}
                    onRenameSubmit={handleRenameSubmit}
                    onRenameCancel={handleRenameCancel}
                    disableAnimation={true}
                  />
                );
              })}
            </SidebarMenu>
          )}
      <ChatDeleteDialog
        isOpen={!!chatToDelete}
        onOpenChange={handleDeleteDialogClose}
        threadId={chatToDelete?.id ?? ''}
        threadSlug={chatToDelete?.slug}
        redirectIfCurrent={true}
      />
      <AlertDialog open={!!chatToMakePublic} onOpenChange={handleMakePublicDialogClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('chat.makePublicConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('chat.makePublicConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={togglePublicMutation.isPending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMakePublicConfirm}
              disabled={togglePublicMutation.isPending}
              className="gap-2"
            >
              {togglePublicMutation.isPending && (
                <Icons.loader className="size-4 animate-spin" />
              )}
              {togglePublicMutation.isPending ? t('chat.makingPublic') : t('chat.makePublicConfirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ShareDialog
        open={!!chatToShare}
        onOpenChange={handleShareDialogClose}
        slug={chatToShare?.slug ?? ''}
        threadTitle={chatToShare?.title ?? ''}
        isPublic={true}
        isLoading={togglePublicMutation.isPending}
        onMakePublic={() => {}}
        onMakePrivate={handleMakePrivate}
      />
    </>
  );
}
