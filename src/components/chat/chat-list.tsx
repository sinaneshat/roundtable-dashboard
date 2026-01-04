'use client';
import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';

import type { ChatSidebarItem } from '@/api/routes/chat/schema';
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StaggerItem } from '@/components/ui/motion';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { TypewriterTitle } from '@/components/ui/typewriter-title';
import { useToggleFavoriteMutation, useTogglePublicMutation, useUpdateThreadMutation } from '@/hooks/mutations';
import { useCurrentPathname } from '@/hooks/utils';

// Lazy-loaded - only shown when user starts editing a chat name
const ChatRenameForm = dynamic(
  () => import('@/components/chat/chat-rename-form').then(m => ({ default: m.ChatRenameForm })),
  { ssr: false },
);

// Lazy-loaded - only shown when user clicks delete
const ChatDeleteDialog = dynamic(
  () => import('@/components/chat/chat-delete-dialog').then(m => m.ChatDeleteDialog),
  { ssr: false },
);

// Lazy-loaded - ShareDialog contains heavy next-share library (~200KB)
const ShareDialog = dynamic(
  () => import('@/components/chat/share-dialog').then(m => m.ShareDialog),
  { ssr: false },
);

/**
 * Check if a chat is active by comparing pathname against both current slug and previousSlug
 */
function isChatActive(chat: ChatSidebarItem, pathname: string): boolean {
  const currentSlugUrl = `/chat/${chat.slug}`;
  const previousSlugUrl = chat.previousSlug ? `/chat/${chat.previousSlug}` : null;
  return pathname === currentSlugUrl || (previousSlugUrl !== null && pathname === previousSlugUrl);
}

type ChatListProps = {
  chats: ChatSidebarItem[];
  isMobile?: boolean;
  onNavigate?: () => void;
  disableAnimations?: boolean;
};

type ChatItemProps = {
  chat: ChatSidebarItem;
  isActive: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  onDeleteClick: (chat: ChatSidebarItem) => void;
  onPinClick: (chat: ChatSidebarItem) => void;
  onRenameClick: (chat: ChatSidebarItem) => void;
  onShareClick: (chat: ChatSidebarItem) => void;
  isEditing: boolean;
  isRenamePending: boolean;
  onRenameSubmit: (chat: ChatSidebarItem, newTitle: string) => void;
  onRenameCancel: () => void;
  disableAnimation?: boolean;
};

function ChatItem({
  chat,
  isActive,
  isMobile,
  onNavigate,
  onDeleteClick,
  onPinClick,
  onRenameClick,
  onShareClick,
  isEditing,
  isRenamePending,
  onRenameSubmit,
  onRenameCancel,
  disableAnimation,
}: ChatItemProps) {
  const t = useTranslations();
  const router = useRouter();
  // Store slug in ref to avoid callback recreation on slug changes
  // This prevents re-renders when slug updates (e.g., AI title generation)
  const slugRef = useRef(chat.slug);
  slugRef.current = chat.slug;

  const handleRenameSubmit = useCallback((title: string) => {
    onRenameSubmit(chat, title);
  }, [chat, onRenameSubmit]);

  // Prefetch on hover - uses ref to avoid callback recreation
  const handleMouseEnter = useCallback(() => {
    router.prefetch(`/chat/${slugRef.current}`);
  }, [router]);

  // Navigate on click - uses ref for stable callback across slug changes
  // Avoids React 19 + Radix asChild compose-refs infinite loop
  const handleClick = useCallback(() => {
    router.push(`/chat/${slugRef.current}`);
    if (isMobile && onNavigate) {
      onNavigate();
    }
  }, [router, isMobile, onNavigate]);

  const content = (
    <SidebarMenuItem>
      {isEditing
        ? (
            <ChatRenameForm
              initialTitle={chat.title}
              onSubmit={handleRenameSubmit}
              onCancel={onRenameCancel}
              isPending={isRenamePending}
              isMobile={isMobile}
            />
          )
        : (
            <SidebarMenuButton
              isActive={isActive}
              onClick={handleClick}
              onMouseEnter={handleMouseEnter}
            >
              <TypewriterTitle
                title={chat.title}
                className="max-w-52"
              />
            </SidebarMenuButton>
          )}
      {!isEditing && (
        <DropdownMenu>
          {/* Remove asChild to avoid React 19 + Radix compose-refs infinite loop */}
          <DropdownMenuTrigger
            className="absolute end-2 flex size-6 items-center justify-center p-0 outline-hidden cursor-pointer text-sidebar-foreground/60 ring-sidebar-ring hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring transition-all duration-150 ease-out [&>svg]:size-4 [&>svg]:shrink-0 after:absolute after:-inset-2 md:after:hidden peer-data-[size=default]/menu-button:top-1.5 group-data-[collapsible=icon]:hidden group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0"
          >
            <Icons.moreHorizontal className="size-4" />
            <span className="sr-only">{t('actions.more')}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem onClick={() => onRenameClick(chat)}>
              <Icons.pencil className="size-4" />
              {t('chat.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPinClick(chat)}>
              <Icons.pin className="size-4" />
              {chat.isFavorite ? t('chat.unpin') : t('chat.pin')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onShareClick(chat)}>
              <Icons.share className="size-4" />
              {t('chat.share')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDeleteClick(chat)}
            >
              <Icons.trash className="size-4" />
              {t('chat.delete')}
            </DropdownMenuItem>
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
  isMobile = false,
  onNavigate,
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
    if (!open) {
      setChatToShare(null);
    }
  }, []);

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
    if (!open) {
      setChatToMakePublic(null);
    }
  }, []);

  const handleMakePrivate = useCallback(() => {
    if (chatToShare) {
      togglePublicMutation.mutate({
        threadId: chatToShare.id,
        isPublic: false,
        slug: chatToShare.slug,
      });
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
                      key={chat.id}
                      chat={chat}
                      isActive={isActive}
                      isMobile={isMobile}
                      onNavigate={onNavigate}
                      onDeleteClick={handleDeleteClick}
                      onPinClick={handlePinClick}
                      onRenameClick={handleRenameClick}
                      onShareClick={handleShareClick}
                      isEditing={editingChatId === chat.id}
                      isRenamePending={updateThreadMutation.isPending}
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
                    key={chat.id}
                    chat={chat}
                    isActive={isActive}
                    isMobile={isMobile}
                    onNavigate={onNavigate}
                    onDeleteClick={handleDeleteClick}
                    onPinClick={handlePinClick}
                    onRenameClick={handleRenameClick}
                    onShareClick={handleShareClick}
                    isEditing={editingChatId === chat.id}
                    isRenamePending={updateThreadMutation.isPending}
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
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMakePublicConfirm}
              disabled={togglePublicMutation.isPending}
            >
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
