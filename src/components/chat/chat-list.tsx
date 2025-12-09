'use client';
import { MoreHorizontal, Pencil, Pin, Share, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { startTransition, useCallback, useLayoutEffect, useRef, useState } from 'react';

import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ShareDialog } from '@/components/chat/share-dialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
import { useCurrentPathname } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

export type Chat = {
  id: string;
  title: string;
  slug: string;
  previousSlug?: string | null; // ✅ BACKWARDS COMPATIBLE: Original slug before AI title generation
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

/**
 * Check if a chat is active by comparing pathname against both current slug and previousSlug
 * ✅ BACKWARDS COMPATIBLE: Supports both AI-generated and original slugs
 */
function isChatActive(chat: Chat, pathname: string): boolean {
  const currentSlugUrl = `/chat/${chat.slug}`;
  const previousSlugUrl = chat.previousSlug ? `/chat/${chat.previousSlug}` : null;
  return pathname === currentSlugUrl || (previousSlugUrl !== null && pathname === previousSlugUrl);
}

// eslint-disable-next-line react-refresh/only-export-components -- Utility function closely related to ChatList component
export function groupChatsByPeriod(chats: Chat[]): ChatGroup[] {
  const now = Date.now();
  const groups = new Map<string, Chat[]>();
  chats.forEach((chat) => {
    const chatTime = chat.updatedAt?.getTime?.();
    // ✅ FIX: Handle invalid dates gracefully - default to "today" if date is NaN/invalid
    const diffMs = (chatTime && !Number.isNaN(chatTime)) ? now - chatTime : 0;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let label: string;
    if (diffDays < 1 || Number.isNaN(diffDays)) {
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
  searchTerm: string;
  isMobile?: boolean;
  onNavigate?: () => void;
  disableAnimations?: boolean;
};
const EMPTY_FAVORITES: Chat[] = [];

function ChatItem({
  chat,
  isActive,
  isMobile,
  onNavigate,
  onDeleteClick,
  disableAnimation,
}: {
  chat: Chat;
  isActive: boolean;
  isMobile: boolean;
  onNavigate?: () => void;
  onDeleteClick: (chat: Chat) => void;
  disableAnimation?: boolean;
}) {
  const t = useTranslations('chat');
  const chatUrl = `/chat/${chat.slug}`;
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();

  // Hover-based prefetch: only prefetch when user hovers (Next.js optimization for large lists)
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const handleMouseEnter = useCallback(() => setShouldPrefetch(true), []);

  // Optimistic public display
  const displayIsPublic = togglePublicMutation.isPending && togglePublicMutation.variables?.threadId === chat.id
    ? togglePublicMutation.variables.isPublic
    : chat.isPublic ?? false;

  // Optimistic pin display (internally still using isFavorite)
  const displayIsPinned = toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables?.threadId === chat.id
    ? toggleFavoriteMutation.variables.isFavorite
    : chat.isFavorite;

  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavoriteMutation.mutate({
      threadId: chat.id,
      isFavorite: !displayIsPinned,
      slug: chat.slug,
    });
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsShareDialogOpen(true);
  };

  const handleMakePublic = () => {
    togglePublicMutation.mutate({
      threadId: chat.id,
      isPublic: true,
      slug: chat.slug,
    });
  };

  const handleMakePrivate = () => {
    togglePublicMutation.mutate({
      threadId: chat.id,
      isPublic: false,
      slug: chat.slug,
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(chat);
  };

  const content = (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="px-3"
      >
        <Link
          href={chatUrl}
          prefetch={shouldPrefetch ? null : false}
          onMouseEnter={handleMouseEnter}
          onClick={() => {
            if (isMobile && onNavigate) {
              onNavigate();
            }
          }}
        >
          <div
            className="truncate overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ maxWidth: '10rem' }}
          >
            {chat.title}
          </div>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t('moreActions')}</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-48">
          <DropdownMenuItem onClick={handleTogglePin}>
            <Pin className={cn('size-4', displayIsPinned && 'fill-current')} />
            {displayIsPinned ? t('unpin') : t('pin')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleShare}>
            <Share className="size-4" />
            {t('share')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="opacity-50">
            <Pencil className="size-4" />
            {t('rename')}
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">{t('comingSoon')}</Badge>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            <Trash2 className="size-4" />
            {t('deleteChat')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareDialog
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        slug={chat.slug}
        threadTitle={chat.title}
        isPublic={displayIsPublic}
        isLoading={togglePublicMutation.isPending}
        onMakePublic={handleMakePublic}
        onMakePrivate={handleMakePrivate}
      />
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
  searchTerm = '',
  isMobile = false,
  onNavigate,
  disableAnimations = false,
}: ChatListProps) {
  // Use custom hook that reacts to history.replaceState/pushState URL changes
  // Unlike usePathname(), this updates when URL changes via History API
  const pathname = useCurrentPathname();
  const t = useTranslations();
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  // ✅ REACT 19: First-mount animation tracking with ref guard
  // Uses ref to prevent duplicate triggers, state for render logic
  // Ref guards the effect, state controls shouldAnimate during render
  const hasTriggeredAnimationRef = useRef(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const shouldAnimate = !disableAnimations && !hasAnimated;

  // ✅ REACT 19: useLayoutEffect runs once, ref prevents duplicate triggers
  // Effect only depends on disableAnimations (stable prop), not on hasAnimated
  useLayoutEffect(() => {
    if (!disableAnimations && !hasTriggeredAnimationRef.current) {
      hasTriggeredAnimationRef.current = true;
      startTransition(() => setHasAnimated(true));
    }
  }, [disableAnimations]);

  const handleDeleteClick = (chat: Chat) => {
    setChatToDelete(chat);
  };

  const handleDeleteDialogClose = (open: boolean) => {
    if (!open) {
      setChatToDelete(null);
    }
  };
  // Always show "Chats" as section header (no time-based grouping in UI)
  const formatGroupLabel = (_label: string) => {
    return t('chat.chats');
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
                      const isActive = isChatActive(chat, pathname);
                      return (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={isActive}
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
                    const isActive = isChatActive(chat, pathname);
                    return (
                      <ChatItem
                        key={chat.id}
                        chat={chat}
                        isActive={isActive}
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
        // Only show "CHATS" header on first group (not repeated for each time period)
        const showHeader = groupIndex === 0;
        return (
          <SidebarGroup key={group.label} className="group-data-[collapsible=icon]:hidden">
            {showHeader && (
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
                            delay: 0.1,
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
            )}
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
                        const isActive = isChatActive(chat, pathname);
                        return (
                          <ChatItem
                            key={chat.id}
                            chat={chat}
                            isActive={isActive}
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
                      const isActive = isChatActive(chat, pathname);
                      return (
                        <ChatItem
                          key={chat.id}
                          chat={chat}
                          isActive={isActive}
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
      {/* ✅ REUSABLE: Uses same ChatDeleteDialog as thread header actions */}
      <ChatDeleteDialog
        isOpen={!!chatToDelete}
        onOpenChange={handleDeleteDialogClose}
        threadId={chatToDelete?.id ?? ''}
        threadSlug={chatToDelete?.slug}
        redirectIfCurrent={true}
      />
    </>
  );
}
