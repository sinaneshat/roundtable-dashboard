'use client';

import { Plus, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import { UsageMetrics } from '@/components/chat/usage-metrics';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useDeleteThreadMutation, useToggleFavoriteMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadsQuery } from '@/hooks/queries/chat-threads';
import { toastManager } from '@/lib/toast/toast-manager';
import type { Chat } from '@/lib/types/chat';
import { groupChatsByPeriod } from '@/lib/types/chat';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const router = useRouter();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Fetch real threads from API
  const { data: threadsData } = useThreadsQuery();

  // Mutations
  const deleteThreadMutation = useDeleteThreadMutation();
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  // Transform threads to Chat type
  const chats: Chat[] = useMemo(() => {
    if (!threadsData?.pages)
      return [];

    const threads = threadsData.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    );

    return threads.map(thread => ({
      id: thread.id,
      title: thread.title,
      slug: thread.slug,
      createdAt: new Date(thread.createdAt),
      updatedAt: new Date(thread.updatedAt),
      messages: [], // Messages loaded separately when viewing thread
      isFavorite: thread.isFavorite ?? false,
      isPublic: thread.isPublic ?? false,
    }));
  }, [threadsData]);

  // Keyboard shortcut to open search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleDeleteChat = (chatId: string) => {
    deleteThreadMutation.mutate(chatId, {
      onSuccess: () => {
        toastManager.success(
          t('chat.threadDeleted'),
          t('chat.threadDeletedDescription'),
        );
      },
      onError: () => {
        toastManager.error(
          t('chat.threadDeleteFailed'),
          t('chat.threadDeleteFailedDescription'),
        );
      },
    });
  };

  const handleToggleFavorite = (chatId: string) => {
    // Find the current favorite status
    const chat = chats.find(c => c.id === chatId);
    const currentFavoriteStatus = chat?.isFavorite ?? false;
    const newFavoriteStatus = !currentFavoriteStatus;

    toggleFavoriteMutation.mutate(
      { threadId: chatId, isFavorite: newFavoriteStatus },
      {
        onSuccess: () => {
          toastManager.success(
            newFavoriteStatus
              ? t('chat.addedToFavorites')
              : t('chat.removedFromFavorites'),
            newFavoriteStatus
              ? t('chat.addedToFavoritesDescription')
              : t('chat.removedFromFavoritesDescription'),
          );
        },
        onError: () => {
          toastManager.error(
            t('chat.favoriteFailed'),
            t('chat.favoriteFailedDescription'),
          );
        },
      },
    );
  };

  const handleTogglePublic = (chatId: string) => {
    // Find the current public status
    const chat = chats.find(c => c.id === chatId);
    const currentPublicStatus = chat?.isPublic ?? false;
    const newPublicStatus = !currentPublicStatus;

    updateThreadMutation.mutate(
      {
        threadId: chatId,
        data: { json: { isPublic: newPublicStatus } },
      },
      {
        onSuccess: () => {
          toastManager.success(
            newPublicStatus
              ? t('chat.madePublic')
              : t('chat.madePrivate'),
            newPublicStatus
              ? t('chat.madePublicDescription')
              : t('chat.madePrivateDescription'),
          );
        },
        onError: () => {
          toastManager.error(
            t('chat.updateFailed'),
            t('chat.updateFailedDescription'),
          );
        },
      },
    );
  };

  // Get favorites from chats
  const favorites = useMemo(() =>
    chats.filter(chat => chat.isFavorite), [chats]);

  // Get non-favorite chats for grouping
  const nonFavoriteChats = useMemo(() =>
    chats.filter(chat => !chat.isFavorite), [chats]);

  const chatGroups = groupChatsByPeriod(nonFavoriteChats);

  // Extract loading states from mutations
  const deletingChatId = deleteThreadMutation.isPending ? deleteThreadMutation.variables : null;
  const favoritingChatId = toggleFavoriteMutation.isPending ? toggleFavoriteMutation.variables?.threadId : null;
  const updatingPublicChatId = updateThreadMutation.isPending ? updateThreadMutation.variables?.threadId : null;

  return (
    <>
      <TooltipProvider>
        <Sidebar collapsible="icon" {...props}>
          <SidebarHeader>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link href="/chat">
                    <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
                      <Image
                        src="/static/logo.png"
                        alt={t('brand.logoAlt')}
                        width={32}
                        height={32}
                        className="size-6 object-contain"
                      />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">{BRAND.name}</span>
                      <span className="truncate text-xs">{BRAND.tagline}</span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* New Chat Button - Visible in both expanded and collapsed states */}
              <SidebarMenuItem>
                <SidebarMenuButton onClick={handleNewChat} tooltip={t('navigation.newChat')}>
                  <Plus className="size-4" />
                  <span>{t('navigation.newChat')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            {/* Search Button - Only visible when expanded */}
            <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
              <Button
                variant="outline"
                className="w-full justify-start text-sm text-muted-foreground h-9"
                onClick={() => setIsSearchOpen(true)}
              >
                <Search className="size-4 mr-2" />
                <span className="flex-1 text-left">{t('chat.searchChats')}</span>
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>
                  K
                </kbd>
              </Button>
            </SidebarGroup>
          </SidebarHeader>

          <SidebarContent className="p-0">
            <ScrollArea className="h-full w-full">
              <div className="px-2 py-2">
                <ChatList
                  chatGroups={chatGroups}
                  favorites={favorites}
                  onDeleteChat={handleDeleteChat}
                  onToggleFavorite={handleToggleFavorite}
                  onTogglePublic={handleTogglePublic}
                  searchTerm=""
                  deletingChatId={deletingChatId}
                  favoritingChatId={favoritingChatId}
                  updatingPublicChatId={updatingPublicChatId}
                />
              </div>
            </ScrollArea>
          </SidebarContent>

          <SidebarFooter>
            <UsageMetrics />
            <NavUser />
          </SidebarFooter>

          <SidebarRail />
        </Sidebar>

        {/* Command Search Modal */}
        <CommandSearch
          chats={chats}
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      </TooltipProvider>
    </>
  );
}
